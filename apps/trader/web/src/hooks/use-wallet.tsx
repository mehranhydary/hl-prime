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
import type { WalletAddChainParameter } from "../lib/bridge-chain-config.js";

const STORAGE_KEY = "hl-prime:active-wallet-address:v1";
const SUPPRESSED_STORAGE_KEY = "hl-prime:wallets-suppressed:v1";

interface WalletState {
  address: `0x${string}` | null;
  activeChainId: number | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchChain: (chainId: number, addChain?: WalletAddChainParameter | null) => Promise<void>;
  wallets: ConnectedWallet[];
  activeWallet: ConnectedWallet | null;
  setActiveWalletAddress: (address: `0x${string}`) => void;
}

const WalletContext = createContext<WalletState>({
  address: null,
  activeChainId: null,
  isConnected: false,
  isConnecting: false,
  error: null,
  connect: async () => {},
  disconnect: async () => {},
  switchChain: async () => {},
  wallets: [],
  activeWallet: null,
  setActiveWalletAddress: () => {},
});

function normalizeAddress(address: string): `0x${string}` {
  return address.toLowerCase() as `0x${string}`;
}

async function readWalletChainId(wallet: ConnectedWallet): Promise<number | null> {
  try {
    const provider = await wallet.getEthereumProvider();
    const chainIdHex = await provider.request({ method: "eth_chainId" });
    if (typeof chainIdHex !== "string") return null;
    const parsed = parseInt(chainIdHex, 16);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
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

function shouldAttemptAddChain(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
  if (code === 4902) return true;

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("unrecognized chain")
    || message.includes("unknown chain")
    || message.includes("chain not added")
    || message.includes("does not exist")
    || message.includes("4902");
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
  const [activeChainId, setActiveChainId] = useState<number | null>(null);
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

  useEffect(() => {
    let cancelled = false;

    async function syncActiveChainId() {
      if (!activeWallet) {
        if (!cancelled) setActiveChainId(null);
        return;
      }
      const chainId = await readWalletChainId(activeWallet);
      if (!cancelled) {
        setActiveChainId(chainId);
      }
    }

    void syncActiveChainId();
    return () => {
      cancelled = true;
    };
  }, [activeWallet]);

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

  async function switchChain(chainId: number, addChain?: WalletAddChainParameter | null): Promise<void> {
    if (!activeWallet) {
      throw new Error("No wallet selected.");
    }
    try {
      await activeWallet.switchChain(chainId);
    } catch (error) {
      if (!shouldAttemptAddChain(error) || !addChain) {
        throw error;
      }

      const provider = await activeWallet.getEthereumProvider();
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [addChain],
      });
      await activeWallet.switchChain(chainId);
    }
    setActiveChainId(chainId);
  }

  function setActiveWalletAddress(nextAddress: `0x${string}`): void {
    setSelectedAddress(normalizeAddress(nextAddress));
  }

  return (
    <WalletContext.Provider
      value={{
        address,
        activeChainId,
        isConnected: address !== null,
        isConnecting,
        error,
        connect,
        disconnect,
        switchChain,
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
