import type { ConnectedWallet } from "@privy-io/react-auth";

export interface ActiveWalletSnapshot {
  activeWallet: ConnectedWallet | null;
  wallets: ConnectedWallet[];
  ready: boolean;
}

type Listener = (snapshot: ActiveWalletSnapshot) => void;

let snapshot: ActiveWalletSnapshot = {
  activeWallet: null,
  wallets: [],
  ready: false,
};

const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function setActiveWalletSnapshot(next: ActiveWalletSnapshot): void {
  snapshot = next;
  emit();
}

export function getActiveWalletSnapshot(): ActiveWalletSnapshot {
  return snapshot;
}

export function getActiveWallet(): ConnectedWallet | null {
  return snapshot.activeWallet;
}

export function subscribeActiveWallet(listener: Listener): () => void {
  listeners.add(listener);
  listener(snapshot);
  return () => listeners.delete(listener);
}
