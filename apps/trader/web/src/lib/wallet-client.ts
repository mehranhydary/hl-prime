import * as hl from "@nktkas/hyperliquid";
import type { Network } from "@shared/types";

const CHAIN_CONFIG = {
  mainnet: {
    chainId: "0xa4b1",
    chainName: "Arbitrum One",
    rpcUrls: ["https://arb1.arbitrum.io/rpc"],
    blockExplorerUrls: ["https://arbiscan.io"],
  },
  testnet: {
    chainId: "0x66eee",
    chainName: "Arbitrum Sepolia",
    rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
    blockExplorerUrls: ["https://sepolia.arbiscan.io"],
  },
} as const;

function configFor(network: Network) {
  return CHAIN_CONFIG[network];
}

type JsonRpcTypedDataParams = {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
};

interface InjectedWalletAdapter {
  signTypedData: (params: JsonRpcTypedDataParams, options?: unknown) => Promise<`0x${string}`>;
  getAddresses: () => Promise<`0x${string}`[]>;
  getChainId: () => Promise<number>;
}

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

function hexChainId(value: number): `0x${string}` {
  return `0x${value.toString(16)}`;
}

async function readActiveChainId(): Promise<number> {
  if (!window.ethereum) {
    throw new Error("No wallet provider found. Install MetaMask or similar.");
  }
  const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
  if (typeof chainIdHex !== "string") {
    throw new Error("Wallet returned an invalid chainId.");
  }
  return parseInt(chainIdHex, 16);
}

function parseDomainChainId(domain: Record<string, unknown> | undefined): number | null {
  if (!domain) return null;
  const chainId = domain.chainId;
  if (typeof chainId === "number" && Number.isFinite(chainId)) return chainId;
  if (typeof chainId === "bigint") return Number(chainId);
  if (typeof chainId === "string" && chainId.length > 0) {
    if (chainId.startsWith("0x") || chainId.startsWith("0X")) {
      const value = parseInt(chainId, 16);
      return Number.isFinite(value) ? value : null;
    }
    const value = parseInt(chainId, 10);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

async function switchWalletChain(chainId: number): Promise<void> {
  if (!window.ethereum) {
    throw new Error("No wallet provider found. Install MetaMask or similar.");
  }
  await window.ethereum.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: hexChainId(chainId) }],
  });
}

async function getInjectedAddresses(requestAccess = false): Promise<`0x${string}`[]> {
  if (!window.ethereum) {
    throw new Error("No wallet provider found. Install MetaMask or similar.");
  }

  const method = requestAccess ? "eth_requestAccounts" : "eth_accounts";
  const result = await window.ethereum.request({ method });
  if (!Array.isArray(result)) return [];
  return result.filter((value): value is `0x${string}` => typeof value === "string");
}

async function resolveActiveInjectedAddress(
  expectedAddress: `0x${string}`,
): Promise<`0x${string}`> {
  let addresses = await getInjectedAddresses(false);
  if (addresses.length === 0) {
    addresses = await getInjectedAddresses(true);
  }

  if (addresses.length === 0) {
    throw new Error("No connected wallet account found. Reconnect your wallet and try again.");
  }

  const activeAddress = addresses[0];
  if (normalizeAddress(activeAddress) !== normalizeAddress(expectedAddress)) {
    throw new Error(
      `Connected wallet account changed to ${activeAddress}. Reconnect the app to keep signing in sync.`,
    );
  }

  return activeAddress;
}

function createInjectedWalletAdapter(
  expectedAddress: `0x${string}`,
  _network: Network,
): InjectedWalletAdapter {
  const ethereum = window.ethereum;
  if (!ethereum) {
    throw new Error("No wallet provider found. Install MetaMask or similar.");
  }

  return {
    async getAddresses() {
      const activeAddress = await resolveActiveInjectedAddress(expectedAddress);
      return [activeAddress];
    },
    async getChainId() {
      return readActiveChainId();
    },
    async signTypedData(params, _options) {
      const activeAddress = await resolveActiveInjectedAddress(expectedAddress);
      const targetDomainChainId = parseDomainChainId(params.domain);
      const initialChainId = await readActiveChainId();

      let switched = false;
      if (
        targetDomainChainId !== null &&
        Number.isFinite(targetDomainChainId) &&
        initialChainId !== targetDomainChainId
      ) {
        try {
          await switchWalletChain(targetDomainChainId);
          switched = true;
        } catch (error) {
          const code = (error as { code?: number }).code;
          if (code === 4902) {
            throw new Error(
              `Wallet is missing chainId ${targetDomainChainId} required for Hyperliquid typed-data signing. Add this chain in wallet settings, then retry.`,
            );
          }
          throw error;
        }
      }

      try {
        const typedData = JSON.stringify({
          domain: params.domain,
          types: params.types,
          primaryType: params.primaryType,
          message: params.message,
        });
        const signature = await ethereum.request({
          method: "eth_signTypedData_v4",
          params: [activeAddress, typedData],
        });
        if (typeof signature !== "string") {
          throw new Error("Wallet returned an invalid typed-data signature.");
        }
        return signature as `0x${string}`;
      } finally {
        if (switched) {
          try {
            await switchWalletChain(initialChainId);
          } catch {
            // Ignore restoration failures to avoid masking the primary signing result.
          }
        }
      }
    },
  };
}

export function getErrorChainMessage(error: unknown): string {
  if (error instanceof Error) {
    const seen = new Set<string>();
    const messages: string[] = [];
    let current: unknown = error;
    let depth = 0;

    while (current instanceof Error && depth < 6) {
      const message = current.message?.trim();
      if (message && !seen.has(message)) {
        seen.add(message);
        messages.push(message);
      }
      current = (current as { cause?: unknown }).cause;
      depth += 1;
    }

    if (messages.length > 0) {
      return messages.join(" | ");
    }
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return "Unknown error";
}

export async function ensureWalletChain(network: Network): Promise<void> {
  if (!window.ethereum) {
    throw new Error("No wallet provider found. Install MetaMask or similar.");
  }

  const chainCfg = configFor(network);

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainCfg.chainId }],
    });
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code !== 4902) {
      throw err;
    }

    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: chainCfg.chainId,
        chainName: chainCfg.chainName,
        rpcUrls: chainCfg.rpcUrls,
        blockExplorerUrls: chainCfg.blockExplorerUrls,
        nativeCurrency: {
          name: "Ether",
          symbol: "ETH",
          decimals: 18,
        },
      }],
    });
  }
}

export async function createExchangeClientFromInjected(
  address: `0x${string}`,
  network: Network,
): Promise<hl.ExchangeClient> {
  if (!window.ethereum) {
    throw new Error("No wallet provider found. Install MetaMask or similar.");
  }

  await ensureWalletChain(network);
  await resolveActiveInjectedAddress(address);
  const wallet = createInjectedWalletAdapter(address, network);

  const transport = new hl.HttpTransport({
    isTestnet: network === "testnet",
  });

  return new hl.ExchangeClient({
    transport,
    wallet: wallet as any,
  });
}
