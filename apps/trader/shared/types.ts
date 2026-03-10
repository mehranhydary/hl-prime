// ========== Network ==========

export type Network = "mainnet" | "testnet";

// ========== Agent ==========

export interface AgentInitResponse {
  pendingAgentId: string;
  agentAddress: `0x${string}`;
  agentName: string;
  builderApproval?: {
    builder: `0x${string}`;
    feeBps: number;
    maxFeeRate: string;
  };
}

export interface AgentCompleteRequest {
  masterAddress: `0x${string}`;
  network: Network;
  pendingAgentId: string;
}

export interface AgentCompleteResponse {
  success: boolean;
  agentAddress: `0x${string}`;
}

export interface AgentStatusResponse {
  configured: boolean;
  agentAddress?: `0x${string}`;
  network: Network;
}

// ========== Account ==========

export interface UnifiedBalance {
  totalUsd: number;
  /** Amount available for new trades / withdrawal (from clearinghouse). */
  availableUsd: number;
  perpAccountValueUsd: number;
  /** Deposited USDC in perps (totalRawUsd) — excludes unrealized PNL. */
  perpRawUsd: number;
  spotStableUsd: number;
  spotStableBreakdown: { coin: string; amount: number; usd: number }[];
  stableTokenSet: string[];
}

export interface DedupedAsset {
  baseAsset: string;
  primaryCoin: string;
  price: number | null;
  prevDayPx: number | null;
  fundingRate: number | null;
  dayNtlVlm: number;
  marketCount: number;
  deployers: string[];
  collaterals: string[];
  maxLeverage: number;
  hasPosition: boolean;
  isHip3: boolean;
}

export interface BootstrapResponse {
  balance: UnifiedBalance | null;
  assets: DedupedAsset[];
  positions: GroupedPosition[];
  agentConfigured: boolean;
}

export interface GroupedPosition {
  baseAsset: string;
  primaryCoin: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number;
  liquidationPrice: number | null;
  marketCount: number;
}

export type PortfolioViewMode = "aggregate" | "breakdown";

export interface PortfolioDataset<T> {
  aggregate: T[];
  breakdown: T[];
}

export interface PortfolioEquitySummary {
  accountEquityUsd: number;
  spotUsd: number;
  perpsUsd: number;
  unrealizedPnlUsd: number;
  crossMarginRatio: number;
  maintenanceMarginUsd: number;
  crossAccountLeverage: number;
}

export interface PortfolioBalanceRow {
  key: string;
  source: "perps" | "spot";
  asset: string;
  amount: number;
  usdValue: number;
}

export interface PortfolioPositionRow {
  key: string;
  market: string;
  baseAsset: string;
  collateral: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  markPrice: number;
  notionalUsd: number;
  marginUsedUsd: number;
  unrealizedPnlUsd: number;
  leverage: number;
  liquidationPrice: number | null;
  marketCount: number;
  updatedAt: number;
}

export interface PortfolioOpenOrderRow {
  key: string;
  market: string;
  baseAsset: string;
  collateral: string;
  side: "buy" | "sell";
  orderType: string;
  tif: string | null;
  reduceOnly: boolean;
  size: number;
  remainingSize: number;
  limitPrice: number;
  notionalUsd: number;
  timestamp: number;
  orderCount: number;
}

export interface PortfolioTradeRow {
  key: string;
  market: string;
  baseAsset: string;
  collateral: string;
  side: "buy" | "sell";
  size: number;
  price: number;
  notionalUsd: number;
  feeUsd: number;
  realizedPnlUsd: number;
  timestamp: number;
  hash: string;
  tradeCount: number;
}

export interface PortfolioFundingRow {
  key: string;
  market: string;
  baseAsset: string;
  collateral: string;
  fundingRate: number;
  positionSize: number;
  fundingUsd: number;
  timestamp: number;
  hash: string;
  eventCount: number;
}

export interface PortfolioOrderHistoryRow {
  key: string;
  market: string;
  baseAsset: string;
  collateral: string;
  side: "buy" | "sell";
  status: string;
  orderType: string;
  tif: string | null;
  size: number;
  filledSize: number;
  limitPrice: number;
  notionalUsd: number;
  timestamp: number;
  statusTimestamp: number;
  orderCount: number;
}

export interface PortfolioResponse {
  agentConfigured: boolean;
  requestedAt: number;
  summary: PortfolioEquitySummary;
  balances: PortfolioDataset<PortfolioBalanceRow>;
  positions: PortfolioDataset<PortfolioPositionRow>;
  openOrders: PortfolioDataset<PortfolioOpenOrderRow>;
  tradeHistory: PortfolioDataset<PortfolioTradeRow>;
  fundingHistory: PortfolioDataset<PortfolioFundingRow>;
  orderHistory: PortfolioDataset<PortfolioOrderHistoryRow>;
}

// ========== Referral ==========

export interface ReferralRow {
  address: `0x${string}`;
  dateJoined: number;
  totalVolume: string;
  feesPaid: string;
  yourRewards: string;
}

export interface ReferralDataResponse {
  referredBy: { referrer: string; code: string } | null;
  cumVlm: string;
  unclaimedRewards: string;
  claimedRewards: string;
  referrerStage: "ready" | "needToCreateCode" | "needToTrade" | "none";
  referrerCode: string | null;
  referralCount: number;
  referrals: ReferralRow[];
  rewardHistory: { earned: string; vlm: string; referralVlm: string; time: number }[];
}

// ========== Trade ==========

export interface QuoteRequest {
  network: Network;
  masterAddress: `0x${string}`;
  side: "buy" | "sell";
  asset: string;
  amountMode: "base" | "usd";
  amount: number;
  leverage?: number;
  isCross?: boolean;
}

export interface RouteLeg {
  coin: string;
  size: number;
  proportion: number;
  collateral: string;
  estimatedAvgPrice: number;
}

export interface RouteSummary {
  isSingleLeg: boolean;
  legs: RouteLeg[];
  estimatedImpactBps: number;
  estimatedFundingRate: number;
  builderFeeBps: number;
  builderApproval?: {
    builder: `0x${string}`;
    maxFeeRate: string;
  };
  warnings: string[];
}

export interface CollateralPreviewRequirement {
  token: string;
  amountNeeded: number;
  currentBalance: number;
  shortfall: number;
  swapFrom: string;
  estimatedSwapCostBps: number;
}

export interface CollateralPreview {
  requirements: CollateralPreviewRequirement[];
  totalSwapCostBps: number;
  swapsNeeded: boolean;
  abstractionEnabled: boolean;
}

export interface DirectExecutionLeg {
  coin: string;
  assetIndex: number;
  side: "buy" | "sell";
  size: string;
  price: string;
  orderType: { limit: { tif: string } };
  leverage?: number;
  isCross?: boolean;
}

export interface QuoteResponse {
  quoteId: string;
  resolvedBaseSize: number;
  resolvedUsdNotional: number;
  routeSummary: RouteSummary;
  collateralPreview?: CollateralPreview;
  /** Execution-ready leg params for frontend direct execution (when no agent) */
  executionLegs: DirectExecutionLeg[];
}

export interface ExecuteLegAdjustment {
  coin: string;
  proportion: number;
  enabled: boolean;
}

export interface ExecuteRequest {
  quoteId: string;
  legAdjustments?: ExecuteLegAdjustment[];
}

export interface ExecutePreviewRequest {
  quoteId: string;
  legAdjustments?: ExecuteLegAdjustment[];
}

export interface ExecutePreviewResponse {
  routeSummary: RouteSummary;
  collateralPreview?: CollateralPreview;
}

export interface QuickTradeRequest extends QuoteRequest {}

export interface ClosePositionRequest {
  network: Network;
  masterAddress: `0x${string}`;
  asset: string;
}

export interface TradeResult {
  success: boolean;
  totalFilledSize: number;
  aggregateAvgPrice: number;
  legs: {
    market: string;
    side: string;
    filledSize: string;
    avgPrice: string;
    success: boolean;
    error?: string;
  }[];
  error?: string;
}

export interface TradeHistoryLeg {
  coin: string;
  collateral: string;
  requestedSize: string;
  requestedPrice: string;
  requestedProportion: number;
  requestedLeverage?: number;
  requestedIsCross?: boolean;
  filledSize: string;
  avgPrice: string;
  success: boolean;
  error?: string;
}

export interface TradeHistoryItem {
  intentId: string;
  createdAt: number;
  network: Network;
  masterAddress: `0x${string}`;
  signerAddress: `0x${string}`;
  signerType: "agent" | "master";
  mode: "safe" | "quick";
  side: "buy" | "sell";
  asset: string;
  amountMode: "base" | "usd";
  requestedAmount: number;
  resolvedBaseSize: number;
  resolvedUsdNotional: number;
  leverage?: number;
  isCross?: boolean;
  quoteId?: string;
  routeSummary: RouteSummary;
  legs: TradeHistoryLeg[];
  success: boolean;
  error?: string;
}

export interface TradeHistoryResponse {
  items: TradeHistoryItem[];
}

// ========== Market Data ==========

export type CandleInterval =
  | "1m" | "3m" | "5m" | "15m" | "30m"
  | "1h" | "2h" | "4h" | "8h" | "12h"
  | "1d" | "3d" | "1w" | "1M";

export interface CandleData {
  time: number;  // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ========== Health ==========

export interface HealthResponse {
  status: "ok" | "degraded" | "error";
  sdkConnected: boolean;
  agentConfigured: boolean;
  network: Network;
  uptime: number;
}

// ========== API Error ==========

export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}
