import * as hl from "@nktkas/hyperliquid";
import type { ConnectedWallet, EIP1193Provider } from "@privy-io/react-auth";
import type { Network } from "@shared/types";
import { getActiveWallet } from "./active-wallet.js";

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

type JsonRpcTypedDataParams = {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
};

interface ConnectedWalletAdapter {
  signTypedData: (params: JsonRpcTypedDataParams, options?: unknown) => Promise<`0x${string}`>;
  getAddresses: () => Promise<`0x${string}`[]>;
  getChainId: () => Promise<number>;
}

function configFor(network: Network) {
  return CHAIN_CONFIG[network];
}

function normalizeAddress(address: string): `0x${string}` {
  return address.toLowerCase() as `0x${string}`;
}

function hexChainId(value: number): `0x${string}` {
  return `0x${value.toString(16)}`;
}

function parseDomainChainId(domain: Record<string, unknown> | undefined): number | null {
  if (!domain) return null;
  const chainId = domain.chainId;
  if (typeof chainId === "number" && Number.isFinite(chainId)) return chainId;
  if (typeof chainId === "bigint") return Number(chainId);
  if (typeof chainId === "string" && chainId.length > 0) {
    const value = chainId.startsWith("0x") || chainId.startsWith("0X")
      ? parseInt(chainId, 16)
      : parseInt(chainId, 10);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

async function resolveActiveWallet(expectedAddress?: `0x${string}`): Promise<ConnectedWallet> {
  const wallet = getActiveWallet();
  if (!wallet) {
    throw new Error("No Privy wallet selected. Connect a wallet and try again.");
  }

  const isConnected = await wallet.isConnected();
  if (!isConnected) {
    throw new Error("Selected wallet is no longer connected. Reconnect and try again.");
  }

  if (expectedAddress && normalizeAddress(wallet.address) !== normalizeAddress(expectedAddress)) {
    throw new Error(
      `Connected wallet account changed to ${wallet.address}. Reconnect the app to keep signing in sync.`,
    );
  }

  return wallet;
}

async function getWalletProvider(wallet: ConnectedWallet): Promise<EIP1193Provider> {
  return wallet.getEthereumProvider();
}

async function readActiveChainId(wallet: ConnectedWallet): Promise<number> {
  const provider = await getWalletProvider(wallet);
  const chainIdHex = await provider.request({ method: "eth_chainId" });
  if (typeof chainIdHex !== "string") {
    throw new Error("Wallet returned an invalid chainId.");
  }
  return parseInt(chainIdHex, 16);
}

async function switchWalletChain(wallet: ConnectedWallet, chainId: number): Promise<void> {
  await wallet.switchChain(chainId);
}

function createWalletAdapter(expectedAddress: `0x${string}`): ConnectedWalletAdapter {
  return {
    async getAddresses() {
      const wallet = await resolveActiveWallet(expectedAddress);
      return [normalizeAddress(wallet.address)];
    },
    async getChainId() {
      const wallet = await resolveActiveWallet(expectedAddress);
      return readActiveChainId(wallet);
    },
    async signTypedData(params) {
      const wallet = await resolveActiveWallet(expectedAddress);
      const targetDomainChainId = parseDomainChainId(params.domain);
      const initialChainId = await readActiveChainId(wallet);

      let switched = false;
      if (
        targetDomainChainId !== null &&
        Number.isFinite(targetDomainChainId) &&
        initialChainId !== targetDomainChainId
      ) {
        await switchWalletChain(wallet, targetDomainChainId);
        switched = true;
      }

      try {
        const provider = await getWalletProvider(wallet);
        const signature = await provider.request({
          method: "eth_signTypedData_v4",
          params: [
            normalizeAddress(wallet.address),
            JSON.stringify({
              domain: params.domain,
              types: params.types,
              primaryType: params.primaryType,
              message: params.message,
            }),
          ],
        });
        if (typeof signature !== "string") {
          throw new Error("Wallet returned an invalid typed-data signature.");
        }
        return signature as `0x${string}`;
      } finally {
        if (switched) {
          try {
            await switchWalletChain(wallet, initialChainId);
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

export async function ensureWalletChain(network: Network, expectedAddress?: `0x${string}`): Promise<void> {
  const wallet = await resolveActiveWallet(expectedAddress);
  const chainCfg = configFor(network);

  try {
    await switchWalletChain(wallet, parseInt(chainCfg.chainId, 16));
  } catch (error) {
    const provider = await getWalletProvider(wallet);
    const code = (error as { code?: number }).code;
    if (code !== 4902) {
      throw error;
    }

    await provider.request({
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
  await ensureWalletChain(network, address);
  await resolveActiveWallet(address);
  const wallet = createWalletAdapter(address);

  const transport = new hl.HttpTransport({
    isTestnet: network === "testnet",
  });

  return new hl.ExchangeClient({
    transport,
    wallet: wallet as never,
  });
}

export const createExchangeClientFromWallet = createExchangeClientFromInjected;
