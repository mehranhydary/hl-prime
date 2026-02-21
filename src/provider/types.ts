// Normalized types decoupled from @nktkas/hyperliquid SDK types.
// These are the shapes the rest of Hyperliquid Prime works with.

export type CandleInterval =
  | "1m" | "3m" | "5m" | "15m" | "30m"
  | "1h" | "2h" | "4h" | "8h" | "12h"
  | "1d" | "3d" | "1w" | "1M";

export interface Candle {
  t: number;   // open timestamp (ms)
  T: number;   // close timestamp (ms)
  s: string;   // asset symbol
  i: string;   // interval
  o: string;   // open price
  c: string;   // close price
  h: string;   // high price
  l: string;   // low price
  v: string;   // volume (base)
  n: number;   // number of trades
}

export interface MetaAsset {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated?: boolean;
  marginMode?: string;
  isDelisted?: boolean;
}

export interface Meta {
  universe: MetaAsset[];
  collateralToken: number;
}

export interface SpotToken {
  name: string;
  index: number;
  szDecimals: number;
  weiDecimals: number;
  tokenId: string;
  isCanonical: boolean;
  fullName?: string | null;
}

export interface SpotMeta {
  tokens: SpotToken[];
  universe: { name: string; tokens: number[]; index: number; isCanonical: boolean }[];
}

export interface PerpDex {
  name: string;
  deployer: string;
  fullName?: string;
  oracleUpdater?: string | null;
  feeRecipient?: string | null;
}

export interface AssetCtx {
  funding: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium?: string;
  oraclePx: string;
  markPx: string;
  midPx?: string;
  impactPxs?: [string, string];
}

export interface L2Level {
  px: string;
  sz: string;
  n: number;
}

export interface L2Book {
  coin: string;
  time: number;
  levels: [L2Level[], L2Level[]]; // [bids, asks]
}

export interface ClearinghouseState {
  marginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
    totalMarginUsed: string;
  };
  crossMarginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
    totalMarginUsed: string;
  };
  assetPositions: AssetPosition[];
  crossMaintenanceMarginUsed: string;
  withdrawable?: string;
}

export interface AssetPosition {
  position: {
    coin: string;
    szi: string;
    entryPx: string;
    positionValue: string;
    unrealizedPnl: string;
    returnOnEquity: string;
    leverage: { type: string; value: string } | null;
    liquidationPx: string | null;
    marginUsed: string;
    maxLeverage: number;
    cumFunding: {
      allTime: string;
      sinceChange: string;
      sinceOpen: string;
    };
    markPx?: string;
  };
  type: string;
}

export interface SpotClearinghouseState {
  balances: SpotBalance[];
}

export interface SpotBalance {
  coin: string;
  hold: string;
  total: string;
  entryNtl: string;
  token: number;
}

export interface OpenOrder {
  coin: string;
  limitPx: string;
  oid: number;
  side: string;
  sz: string;
  timestamp: number;
  cloid?: string;
}

export interface Fill {
  coin: string;
  px: string;
  sz: string;
  side: string;
  time: number;
  startPosition: string;
  dir: string;
  closedPnl: string;
  hash: string;
  oid: number;
  crossed: boolean;
  fee: string;
  feeToken: string;
  tid: number;
  liquidation?: boolean;
}

export interface FundingRecord {
  coin: string;
  fundingRate: string;
  premium: string;
  time: number;
}

export interface FrontendOpenOrder {
  coin: string;
  side: "B" | "A";
  limitPx: string;
  sz: string;
  oid: number;
  timestamp: number;
  origSz: string;
  triggerCondition: string;
  isTrigger: boolean;
  triggerPx: string;
  children: unknown[];
  isPositionTpsl: boolean;
  reduceOnly: boolean;
  orderType: string;
  tif: string | null;
  cloid?: string | null;
}

export interface HistoricalOrder {
  order: FrontendOpenOrder;
  status: string;
  statusTimestamp: number;
}

export interface UserFundingEntry {
  time: number;
  hash: `0x${string}`;
  delta: {
    type: "funding";
    coin: string;
    usdc: string;
    szi: string;
    fundingRate: string;
    nSamples: number | null;
  };
}

export interface OrderType {
  limit?: { tif: "Alo" | "Ioc" | "Gtc" };
  trigger?: {
    triggerPx: string;
    isMarket: boolean;
    tpsl: "tp" | "sl";
  };
}

export interface OrderParams {
  assetIndex: number;
  isBuy: boolean;
  price: string;
  size: string;
  reduceOnly?: boolean;
  orderType: OrderType;
  cloid?: string;
}

export interface OrderResult {
  statuses: OrderStatus[];
}

export type OrderStatus =
  | { resting: { oid: number; cloid?: string } }
  | { filled: { totalSz: string; avgPx: string; oid: number } }
  | { error: string }
  | "waitingForFill"
  | "waitingForTrigger";

export interface CancelParams {
  asset: number;
  oid: number;
}

export interface CancelResult {
  statuses: string[];
}

// Referral types
export interface ReferralUserState {
  user: `0x${string}`;
  cumVlm: string;
  cumRewardedFeesSinceReferred: string;
  cumFeesRewardedToReferrer: string;
  timeJoined: number;
}

export interface ReferralResponse {
  referredBy: { referrer: `0x${string}`; code: string } | null;
  cumVlm: string;
  unclaimedRewards: string;
  claimedRewards: string;
  builderRewards: string;
  referrerState:
    | { stage: "ready"; data: { code: string; nReferrals: number; referralStates: ReferralUserState[] } }
    | { stage: "needToCreateCode" }
    | { stage: "needToTrade"; data: { required: string } };
  rewardHistory: { earned: string; vlm: string; referralVlm: string; time: number }[];
}

// Subscription event types
export interface L2BookUpdate {
  coin: string;
  time: number;
  levels: [L2Level[], L2Level[]];
}

export interface AllMidsUpdate {
  mids: Record<string, string>;
}

export interface Trade {
  coin: string;
  side: string;
  px: string;
  sz: string;
  time: number;
  hash: string;
  tid: number;
}

export interface UserEvent {
  fills?: Fill[];
  funding?: {
    coin: string;
    fundingRate: string;
    szi: string;
    usdc: string;
    time: number;
    hash: string;
    nSamples: number;
  };
  liquidation?: unknown;
}
