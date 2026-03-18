import type { Chain } from "viem/chains";
import {
  arbitrum,
  avalanche,
  base,
  blast,
  bsc,
  linea,
  mainnet,
  mantle,
  mode,
  optimism,
  polygon,
  scroll,
  zora,
} from "viem/chains";

export interface WalletAddChainParameter {
  chainId: `0x${string}`;
  chainName: string;
  rpcUrls: string[];
  blockExplorerUrls?: string[];
  iconUrls?: string[];
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

interface BridgeChainMetadataInput {
  chainId: number;
  displayName?: string;
  rpcUrl?: string;
  explorerUrl?: string;
  iconUrl?: string;
  logoUrl?: string;
}

const KNOWN_BRIDGE_CHAINS = new Map<number, Chain>([
  [mainnet.id, mainnet],
  [arbitrum.id, arbitrum],
  [optimism.id, optimism],
  [base.id, base],
  [polygon.id, polygon],
  [avalanche.id, avalanche],
  [bsc.id, bsc],
  [blast.id, blast],
  [linea.id, linea],
  [scroll.id, scroll],
  [zora.id, zora],
  [mantle.id, mantle],
  [mode.id, mode],
]);

function toHexChainId(chainId: number): `0x${string}` {
  return `0x${chainId.toString(16)}` as `0x${string}`;
}

function firstHttpRpc(chain: Chain): string | undefined {
  return chain.rpcUrls.default.http[0] ?? chain.rpcUrls.public?.http[0];
}

function toWalletAddChainParameter(chain: Chain): WalletAddChainParameter | null {
  const rpcUrl = firstHttpRpc(chain);
  if (!rpcUrl) return null;
  return {
    chainId: toHexChainId(chain.id),
    chainName: chain.name,
    rpcUrls: [rpcUrl],
    blockExplorerUrls: chain.blockExplorers?.default?.url ? [chain.blockExplorers.default.url] : undefined,
    nativeCurrency: chain.nativeCurrency,
  };
}

export function getBridgeWalletAddChainParameter(input: BridgeChainMetadataInput): WalletAddChainParameter | null {
  const known = KNOWN_BRIDGE_CHAINS.get(input.chainId);
  if (known) {
    return toWalletAddChainParameter(known);
  }

  if (!input.rpcUrl) return null;

  return {
    chainId: toHexChainId(input.chainId),
    chainName: input.displayName ?? `Chain ${input.chainId}`,
    rpcUrls: [input.rpcUrl],
    blockExplorerUrls: input.explorerUrl ? [input.explorerUrl] : undefined,
    iconUrls: input.logoUrl ? [input.logoUrl] : input.iconUrl ? [input.iconUrl] : undefined,
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
  };
}
