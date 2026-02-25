/**
 * Frontend session-based auth.
 *
 * getAuthHeaders() NEVER triggers MetaMask — it only returns a cached token.
 * Session creation must be triggered explicitly via signIn().
 * Cached tokens persist in localStorage across page refreshes.
 */

import { AUTH_DOMAIN, AUTH_TYPES, type SessionResponse } from "@shared/auth";
import { getAddress } from "viem";
import { getAccessHeaders } from "./access-gate.js";

const STORAGE_KEY = "hl-prime:auth-session:v1";
const SESSION_AUTH_ENABLED = (import.meta.env.VITE_TRADER_AUTH_ENABLED ?? "true").toLowerCase() !== "false";

interface StoredSession {
  address: string;
  token: string;
  expiresAt: number;
}

export interface AuthSnapshot {
  address: `0x${string}` | null;
  isAuthenticated: boolean;
  expiresAt: number;
  authRequired: boolean;
}

type AuthListener = (snapshot: AuthSnapshot) => void;

let sessionToken: string | null = null;
let sessionExpiresAt = 0;
let currentAddress: `0x${string}` | null = null;
let authRequired = false;
const listeners = new Set<AuthListener>();

// ── localStorage helpers ───────────────────────────────────────────────

function loadStoredSession(address: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredSession;
    if (stored.address.toLowerCase() !== address.toLowerCase()) return null;
    if (stored.expiresAt <= Date.now() + 60_000) return null;
    return stored;
  } catch {
    return null;
  }
}

function persistSession(address: string, token: string, expiresAt: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ address, token, expiresAt } satisfies StoredSession));
  } catch {}
}

function isSessionValid(): boolean {
  return Boolean(sessionToken) && sessionExpiresAt > Date.now() + 60_000;
}

function snapshot(): AuthSnapshot {
  return {
    address: currentAddress,
    isAuthenticated: SESSION_AUTH_ENABLED ? isSessionValid() : Boolean(currentAddress),
    expiresAt: sessionExpiresAt,
    authRequired,
  };
}

function emit(): void {
  const next = snapshot();
  for (const listener of listeners) {
    listener(next);
  }
}

export function subscribeAuth(listener: AuthListener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}

export function getAuthSnapshot(): AuthSnapshot {
  return snapshot();
}

// ── Public API ─────────────────────────────────────────────────────────

/** Sync auth state when wallet connects/disconnects. Never triggers MetaMask. */
export function configureAuth(address: `0x${string}` | null): void {
  if (address === currentAddress) return;
  currentAddress = address;

  if (!SESSION_AUTH_ENABLED) {
    sessionToken = null;
    sessionExpiresAt = 0;
    authRequired = false;
    emit();
    return;
  }

  if (address) {
    const stored = loadStoredSession(address);
    if (stored) {
      sessionToken = stored.token;
      sessionExpiresAt = stored.expiresAt;
      authRequired = false;
      emit();
      return;
    }
  }

  sessionToken = null;
  sessionExpiresAt = 0;
  authRequired = Boolean(address);
  emit();
}

/**
 * Returns auth headers if a valid session exists. Never triggers MetaMask.
 * Returns empty object when unauthenticated — server decides whether to allow or reject.
 */
export function getAuthHeaders(): Record<string, string> {
  if (!SESSION_AUTH_ENABLED) return {};
  if (!isSessionValid()) return {};
  return { Authorization: `Bearer ${sessionToken}` };
}

export function hasActiveSession(): boolean {
  if (!SESSION_AUTH_ENABLED) return Boolean(currentAddress);
  return isSessionValid();
}

export function markAuthRequired(): void {
  if (!SESSION_AUTH_ENABLED) return;
  authRequired = true;
  emit();
}

export function clearAuthSession(): void {
  sessionToken = null;
  sessionExpiresAt = 0;
  authRequired = SESSION_AUTH_ENABLED ? Boolean(currentAddress) : false;
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  emit();
}

/**
 * Explicitly create an authenticated session. Usually triggers one wallet popup
 * (and may retry once for providers with reversed param ordering).
 * Call this from a user-initiated action (e.g. "Sign In" button), never automatically.
 */
export async function signIn(): Promise<boolean> {
  if (!SESSION_AUTH_ENABLED) {
    authRequired = false;
    emit();
    return true;
  }
  if (!currentAddress || typeof window.ethereum === "undefined") return false;

  let address: `0x${string}`;
  try {
    address = getAddress(currentAddress);
  } catch {
    return false;
  }
  const timestamp = Date.now();
  const nonce = crypto.randomUUID();

  const serializableData = {
    types: AUTH_TYPES,
    domain: AUTH_DOMAIN,
    primaryType: "Auth" as const,
    message: {
      address,
      timestamp,
      nonce,
    },
  };

  try {
    const serializedData = JSON.stringify(serializableData);
    let signature = await window.ethereum.request({
      method: "eth_signTypedData_v4",
      params: [address, serializedData],
    });

    // Non-MetaMask providers may require reversed parameter ordering.
    const provider = window.ethereum as { isMetaMask?: boolean };
    if (typeof signature !== "string" && !provider.isMetaMask) {
      signature = await window.ethereum.request({
        method: "eth_signTypedData_v4",
        params: [serializedData, address],
      });
    }

    if (typeof signature !== "string") throw new Error("Wallet did not return a signature");

    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAccessHeaders(),
      },
      body: JSON.stringify({ address, timestamp, nonce, signature }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error("[auth] Session creation rejected:", (data as Record<string, string>).error);
      return false;
    }

    const data = (await res.json()) as SessionResponse;
    sessionToken = data.token;
    sessionExpiresAt = data.expiresAt;
    authRequired = false;
    persistSession(address, data.token, data.expiresAt);
    emit();
    return true;
  } catch (err) {
    console.error("[auth] Sign-in failed:", err instanceof Error ? err.message : err);
    authRequired = true;
    emit();
    return false;
  }
}

/** Clear the current session. */
export function signOut(): void {
  clearAuthSession();
}
