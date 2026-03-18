export interface BridgeQuoteRequest {
  userAddress: `0x${string}`;
  originChainId: number;
  amount: string;
  destinationAddress?: `0x${string}`;
  slippageTolerance?: number;
}

export interface BridgeFeeBreakdown {
  gas: string;
  relayer: string;
  totalUsd: string;
  app?: string;
}

export interface BridgeStep {
  id: "approve" | "deposit" | "authorize" | string;
  chainId: number;
  to: string;
  data: string;
  value: string;
  requestId?: string;
  checkEndpoint?: string;
  gas?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface SupportedChain {
  chainId: number;
  name: string;
  displayName: string;
  usdcAddress: string;
  usdcDecimals: number;
  supportsPermit: boolean;
  rpcUrl?: string;
  iconUrl?: string;
  logoUrl?: string;
  explorerUrl?: string;
}

export interface BridgeQuote {
  requestId: string;
  steps: BridgeStep[];
  fees: BridgeFeeBreakdown;
  outputAmount: string;
  outputAmountRaw: string;
  originChainId: number;
  originCurrency: string;
  destinationChainId: number;
  destinationCurrency: string;
  timeEstimateSec: number;
}

export type BridgeStatus = "pending" | "depositing" | "waiting" | "success" | "failure" | "refund";

export interface BridgeStatusResult {
  requestId: string;
  status: BridgeStatus;
  rawStatus: string;
  isTerminal: boolean;
  originChainId?: number;
  destinationChainId?: number;
  txHashes: string[];
  details?: string;
  updatedAt?: number;
}

export interface RelayAppFee {
  recipient: `0x${string}`;
  fee: string;
}

export interface RelayBridgeConfig {
  baseUrl?: string;
  apiKey?: string | null;
  appFees?: RelayAppFee[];
  chainsTtlMs?: number;
  destinationChainId?: number;
  destinationCurrency?: string;
  fetchFn?: typeof fetch;
  quotePath?: string;
  statusPath?: string;
}

export interface RelayChainCurrency {
  address?: string;
  chainId?: number;
  decimals?: number;
  metadata?: {
    logoURI?: string;
    verified?: boolean;
    isNative?: boolean;
  };
  name?: string;
  supportsPermit?: boolean;
  symbol?: string;
}

export interface RelayChain {
  contracts?: {
    erc20Router?: string;
    v3?: {
      erc20Router?: string;
    };
  };
  depositEnabled?: boolean;
  disabled?: boolean;
  displayName?: string;
  erc20Currencies?: RelayChainCurrency[];
  explorerUrl?: string;
  httpRpcUrl?: string;
  iconUrl?: string;
  id?: number;
  logoUrl?: string;
  name?: string;
  vmType?: string;
}

export interface RelayQuoteResponse {
  breakdown?: {
    timeEstimate?: number;
  };
  details?: {
    currencyIn?: {
      amount?: string;
      amountFormatted?: string;
      amountUsd?: string;
      currency?: RelayChainCurrency;
    };
    currencyOut?: {
      amount?: string;
      amountFormatted?: string;
      amountUsd?: string;
      currency?: RelayChainCurrency;
    };
  };
  fees?: {
    app?: string;
    gas?: string;
    gasCurrency?: string;
    relayer?: string;
    relayerCurrency?: string;
    subsidized?: {
      amount?: string;
      amountUsd?: string;
    };
  };
  steps?: Array<{
    id?: string;
    kind?: string;
    requestId?: string;
    items?: Array<{
      check?: {
        endpoint?: string;
      };
      data?: {
        chainId?: number;
        data?: string;
        gas?: number | string;
        maxFeePerGas?: string;
        maxPriorityFeePerGas?: string;
        to?: string;
        value?: string;
      };
      status?: string;
      txHash?: string;
    }>;
  }>;
}

export interface RelayStatusResponse {
  details?: string;
  destinationChainId?: number;
  originChainId?: number;
  requestId?: string;
  status?: string;
  txHashes?: string[];
  updatedAt?: number;
}
