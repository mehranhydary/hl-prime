import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  useConnectWallet,
  useLinkAccount,
  usePrivy,
  useWallets,
  type ConnectedWallet,
} from "@privy-io/react-auth";
import { configureAuth, signOut } from "../lib/auth.js";
import { setActiveWalletSnapshot } from "../lib/active-wallet.js";

const STORAGE_KEY = "hl-prime:active-wallet-address:v1";
const SUPPRESSED_STORAGE_KEY = "hl-prime:wallets-suppressed:v1";

interface WalletState {
  address: `0x${string}` | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  wallets: ConnectedWallet[];
  activeWallet: ConnectedWallet | null;
  setActiveWalletAddress: (address: `0x${string}`) => void;
}

const WalletContext = createContext<WalletState>({
  address: null,
  isConnected: false,
  isConnecting: false,
  error: null,
  connect: async () => {},
  disconnect: async () => {},
  wallets: [],
  activeWallet: null,
  setActiveWalletAddress: () => {},
});

function normalizeAddress(address: string): `0x${string}` {
  return address.toLowerCase() as `0x${string}`;
}

function isEthereumWallet(wallet: ConnectedWallet): boolean {
  return wallet.type === "ethereum";
}

function isEmbeddedWallet(wallet: ConnectedWallet): boolean {
  return wallet.walletClientType === "privy" || wallet.walletClientType === "privy-v2";
}

function isExternalEthereumWallet(wallet: ConnectedWallet): boolean {
  return isEthereumWallet(wallet) && !isEmbeddedWallet(wallet);
}

function readStoredWalletAddress(): `0x${string}` | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? normalizeAddress(value) : null;
  } catch {
    return null;
  }
}

function persistWalletAddress(address: `0x${string}` | null): void {
  try {
    if (address) localStorage.setItem(STORAGE_KEY, address);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function readSuppressedState(): boolean {
  try {
    return localStorage.getItem(SUPPRESSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function persistSuppressedState(suppressed: boolean): void {
  try {
    if (suppressed) localStorage.setItem(SUPPRESSED_STORAGE_KEY, "true");
    else localStorage.removeItem(SUPPRESSED_STORAGE_KEY);
  } catch {}
}

function pickDefaultWallet(wallets: ConnectedWallet[], storedAddress: `0x${string}` | null): ConnectedWallet | null {
  if (wallets.length === 0) return null;
  if (storedAddress) {
    const stored = wallets.find((wallet) => normalizeAddress(wallet.address) === storedAddress);
    if (stored) return stored;
  }

  const linkedExternal = wallets.find((wallet) => wallet.linked && !isEmbeddedWallet(wallet));
  if (linkedExternal) return linkedExternal;

  const linkedEmbedded = wallets.find((wallet) => wallet.linked && isEmbeddedWallet(wallet));
  if (linkedEmbedded) return linkedEmbedded;

  const anyExternal = wallets.find((wallet) => !isEmbeddedWallet(wallet));
  if (anyExternal) return anyExternal;

  return wallets[0] ?? null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const { wallets: rawWallets, ready: walletsReady } = useWallets();
  const [selectedAddress, setSelectedAddress] = useState<`0x${string}` | null>(() => readStoredWalletAddress());
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletsSuppressed, setWalletsSuppressed] = useState(() => readSuppressedState());

  function revealWallet(address: string | null): void {
    setWalletsSuppressed(false);
    persistSuppressedState(false);
    if (address) {
      setSelectedAddress(normalizeAddress(address));
    }
  }

  const { connectWallet } = useConnectWallet({
    onSuccess: ({ wallet }) => {
      revealWallet(wallet.address);
      setError(null);
      setIsConnecting(false);
    },
    onError: () => {
      setError("Failed to connect wallet");
      setIsConnecting(false);
    },
  });

  const { linkWallet } = useLinkAccount({
    onSuccess: ({ linkedAccount }) => {
      const nextAddress = "address" in linkedAccount && typeof linkedAccount.address === "string"
        ? linkedAccount.address
        : null;
      revealWallet(nextAddress);
      setError(null);
      setIsConnecting(false);
    },
    onError: () => {
      setError("Failed to connect wallet");
      setIsConnecting(false);
    },
  });

  const availableWallets = useMemo(
    () => rawWallets.filter(isExternalEthereumWallet),
    [rawWallets],
  );
  const wallets = useMemo(
    () => (walletsSuppressed ? [] : availableWallets),
    [availableWallets, walletsSuppressed],
  );
  const activeWallet = useMemo(
    () => pickDefaultWallet(wallets, selectedAddress),
    [wallets, selectedAddress],
  );
  const address = activeWallet ? normalizeAddress(activeWallet.address) : null;

  useEffect(() => {
    configureAuth(address);
  }, [address]);

  useEffect(() => {
    persistWalletAddress(address);
    setActiveWalletSnapshot({
      activeWallet,
      wallets,
      ready: ready && walletsReady,
    });
  }, [activeWallet, address, ready, wallets, walletsReady]);

  useEffect(() => {
    persistSuppressedState(walletsSuppressed);
  }, [walletsSuppressed]);

  async function connect(): Promise<void> {
    const reconnectAfterLogout = walletsSuppressed;
    setIsConnecting(true);
    setError(null);

    try {
      if (!reconnectAfterLogout && availableWallets.length > 0) {
        const nextWallet = pickDefaultWallet(availableWallets, selectedAddress);
        if (nextWallet) {
          revealWallet(nextWallet.address);
          setIsConnecting(false);
          return;
        }
      }

      if (authenticated) {
        linkWallet({ walletChainType: "ethereum-only" });
      } else {
        connectWallet({ walletChainType: "ethereum-only" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet");
      setIsConnecting(false);
    }
  }

  async function disconnect(): Promise<void> {
    setWalletsSuppressed(true);
    persistSuppressedState(true);
    persistWalletAddress(null);
    setSelectedAddress(null);
    setError(null);

    for (const wallet of availableWallets) {
      try {
        await Promise.resolve(wallet.disconnect());
      } catch {
        // Best-effort disconnect; auth/logout state is still cleared below.
      }
    }

    await signOut();
  }

  function setActiveWalletAddress(nextAddress: `0x${string}`): void {
    setSelectedAddress(normalizeAddress(nextAddress));
  }

  return (
    <WalletContext.Provider
      value={{
        address,
        isConnected: address !== null,
        isConnecting,
        error,
        connect,
        disconnect,
        wallets,
        activeWallet,
        setActiveWalletAddress,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  return useContext(WalletContext);
}
