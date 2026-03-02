/**
 * Frontend session-based auth.
 *
 * getAuthHeaders() NEVER triggers MetaMask.
 * Session creation must be triggered explicitly via signIn().
 * Only non-sensitive session metadata persists in localStorage.
 */

import {
  AUTH_AUDIENCE,
  AUTH_DOMAIN,
  AUTH_TYPES,
  type SessionChallengeResponse,
  type SessionResponse,
} from "@shared/auth";
import { getAddress } from "viem";
import { getAccessHeaders } from "./access-gate.js";

const STORAGE_KEY = "hl-prime:auth-session:v1";
const SESSION_AUTH_ENABLED = (import.meta.env.VITE_TRADER_AUTH_ENABLED ?? "true").toLowerCase() !== "false";

interface StoredSession {
  address: string;
  expiresAt: number;
}

export interface AuthSnapshot {
  address: `0x${string}` | null;
  isAuthenticated: boolean;
  expiresAt: number;
  authRequired: boolean;
}

type AuthListener = (snapshot: AuthSnapshot) => void;

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
    if (!Number.isFinite(stored.expiresAt)) return null;
    if (stored.expiresAt <= Date.now() + 60_000) return null;
    return stored;
  } catch {
    return null;
  }
}

function persistSession(address: string, expiresAt: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ address, expiresAt } satisfies StoredSession));
  } catch {}
}

function isSessionValid(): boolean {
  return Boolean(currentAddress) && sessionExpiresAt > Date.now() + 60_000;
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
    sessionExpiresAt = 0;
    authRequired = false;
    emit();
    return;
  }

  if (address) {
    const stored = loadStoredSession(address);
    if (stored) {
      sessionExpiresAt = stored.expiresAt;
      authRequired = false;
      emit();
      return;
    }
  }

  sessionExpiresAt = 0;
  authRequired = Boolean(address);
  emit();
}

/**
 * Returns auth headers if a valid session exists. Never triggers MetaMask.
 * Returns empty object when unauthenticated — server decides whether to allow or reject.
 */
export function getAuthHeaders(): Record<string, string> {
  return {};
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
  try {
    const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
    if (typeof chainIdHex !== "string") throw new Error("Wallet returned invalid chainId");
    const chainId = parseInt(chainIdHex, 16);
    if (!Number.isInteger(chainId)) throw new Error("Unable to parse wallet chainId");

    const challengeRes = await fetch("/api/auth/challenge", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...getAccessHeaders(),
      },
      body: JSON.stringify({ address, chainId }),
    });
    if (!challengeRes.ok) {
      const data = await challengeRes.json().catch(() => ({}));
      console.error("[auth] Challenge creation rejected:", (data as Record<string, string>).error);
      return false;
    }

    const challenge = (await challengeRes.json()) as SessionChallengeResponse;
    if (
      typeof challenge.nonce !== "string"
      || typeof challenge.issuedAt !== "number"
      || typeof challenge.chainId !== "number"
      || typeof challenge.audience !== "string"
      || challenge.address.toLowerCase() !== address.toLowerCase()
      || challenge.audience !== AUTH_AUDIENCE
    ) {
      throw new Error("Challenge response malformed");
    }

    const serializableData = {
      types: AUTH_TYPES,
      domain: {
        ...AUTH_DOMAIN,
        chainId: challenge.chainId,
      },
      primaryType: "Auth" as const,
      message: {
        address,
        nonce: challenge.nonce,
        issuedAt: challenge.issuedAt,
        audience: challenge.audience,
      },
    };

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
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...getAccessHeaders(),
      },
      body: JSON.stringify({
        address,
        chainId: challenge.chainId,
        nonce: challenge.nonce,
        signature,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error("[auth] Session creation rejected:", (data as Record<string, string>).error);
      return false;
    }

    const data = (await res.json()) as Partial<SessionResponse>;
    if (typeof data.expiresAt !== "number" || !Number.isFinite(data.expiresAt)) {
      throw new Error("Invalid session response");
    }
    sessionExpiresAt = data.expiresAt;
    authRequired = false;
    persistSession(address, data.expiresAt);
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
  void fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      ...getAccessHeaders(),
    },
  }).catch(() => {});
}
