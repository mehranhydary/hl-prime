import type { PrivyInterface } from "@privy-io/react-auth";
import type { Network } from "@shared/types";
import { getActiveWalletSnapshot } from "./active-wallet.js";

const SESSION_AUTH_ENABLED = (import.meta.env.VITE_TRADER_AUTH_ENABLED ?? "true").toLowerCase() !== "false";

export interface AuthSnapshot {
  address: `0x${string}` | null;
  isAuthenticated: boolean;
  expiresAt: number;
  authRequired: boolean;
}

type AuthListener = (snapshot: AuthSnapshot) => void;

interface PrivyAuthBindings {
  ready: boolean;
  authenticated: boolean;
  login: PrivyInterface["login"] | null;
  logout: PrivyInterface["logout"] | null;
  getAccessToken: PrivyInterface["getAccessToken"] | null;
}

let currentAddress: `0x${string}` | null = null;
let authRequired = false;
let authNetwork: Network = "mainnet";
let signInInFlight: Promise<boolean> | null = null;
let privyBindings: PrivyAuthBindings = {
  ready: false,
  authenticated: false,
  login: null,
  logout: null,
  getAccessToken: null,
};

const listeners = new Set<AuthListener>();

function isEmbeddedWallet(walletClientType: string | undefined): boolean {
  return walletClientType === "privy" || walletClientType === "privy-v2";
}

function getPreferredSignInWallet() {
  const { activeWallet, wallets } = getActiveWalletSnapshot();
  if (activeWallet && !isEmbeddedWallet(activeWallet.walletClientType)) {
    return activeWallet;
  }

  return wallets.find((wallet) => !isEmbeddedWallet(wallet.walletClientType)) ?? null;
}

function snapshot(): AuthSnapshot {
  return {
    address: currentAddress,
    isAuthenticated: SESSION_AUTH_ENABLED ? privyBindings.authenticated : Boolean(currentAddress),
    expiresAt: 0,
    authRequired,
  };
}

function emit(): void {
  const next = snapshot();
  for (const listener of listeners) {
    listener(next);
  }
}

async function waitForAuthReady(timeoutMs = 3_000): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (privyBindings.authenticated) return true;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  return privyBindings.authenticated;
}

export function subscribeAuth(listener: AuthListener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}

export function getAuthSnapshot(): AuthSnapshot {
  return snapshot();
}

export function setAuthNetwork(network: Network): void {
  authNetwork = network;
}

export function configureAuth(address: `0x${string}` | null): void {
  currentAddress = address;
  authRequired = SESSION_AUTH_ENABLED ? Boolean(address) && !privyBindings.authenticated : false;
  emit();
}

export function syncPrivyAuth(bindings: PrivyAuthBindings): void {
  privyBindings = bindings;
  authRequired = SESSION_AUTH_ENABLED ? Boolean(currentAddress) && !bindings.authenticated : false;
  emit();
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!SESSION_AUTH_ENABLED || !privyBindings.authenticated || !privyBindings.getAccessToken) {
    return {};
  }

  const token = await privyBindings.getAccessToken();
  if (!token) {
    markAuthRequired();
    return {};
  }

  return {
    Authorization: `Bearer ${token}`,
    "x-trader-auth-network": authNetwork,
  };
}

export function hasActiveSession(): boolean {
  if (!SESSION_AUTH_ENABLED) return Boolean(currentAddress);
  return privyBindings.authenticated;
}

export function markAuthRequired(): void {
  if (!SESSION_AUTH_ENABLED) return;
  authRequired = true;
  emit();
}

export function clearAuthSession(): void {
  authRequired = SESSION_AUTH_ENABLED ? Boolean(currentAddress) : false;
  emit();
}

export async function signIn(): Promise<boolean> {
  if (signInInFlight) return signInInFlight;

  signInInFlight = (async (): Promise<boolean> => {
    if (!SESSION_AUTH_ENABLED) {
      authRequired = false;
      emit();
      return true;
    }

    if (privyBindings.authenticated) {
      authRequired = false;
      emit();
      return true;
    }

    const activeWallet = getPreferredSignInWallet();
    if (activeWallet) {
      await activeWallet.loginOrLink();
      const authenticated = await waitForAuthReady();
      authRequired = !authenticated;
      emit();
      return authenticated;
    }

    if (privyBindings.login) {
      privyBindings.login({ loginMethods: ["wallet"] });
    }

    authRequired = Boolean(currentAddress);
    emit();
    return false;
  })().finally(() => {
    signInInFlight = null;
  });

  return signInInFlight;
}

export async function signOut(): Promise<void> {
  const logout = privyBindings.logout;

  privyBindings = {
    ...privyBindings,
    authenticated: false,
  };
  authRequired = SESSION_AUTH_ENABLED ? Boolean(currentAddress) : false;
  emit();

  try {
    await logout?.();
  } catch {}
}
