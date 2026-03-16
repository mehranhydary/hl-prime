import type {
  Meta,
  AssetCtx,
  L2Book,
  ClearinghouseState,
  SpotClearinghouseState,
  SpotMeta,
  PerpDex,
  OpenOrder,
  Fill,
  FundingRecord,
  FrontendOpenOrder,
  HistoricalOrder,
  UserFundingEntry,
  OrderParams,
  OrderResult,
  CancelParams,
  CancelResult,
  L2BookUpdate,
  AllMidsUpdate,
  Trade,
  UserEvent,
  Candle,
  CandleInterval,
  ReferralResponse,
  AbstractionMode,
  BorrowLendUserState,
  BorrowLendReserveState,
} from "./types.js";

export interface HLProvider {
  // Info (read-only)
  meta(dex?: string): Promise<Meta>;
  metaAndAssetCtxs(dex?: string): Promise<[Meta, AssetCtx[]]>;
  perpDexs(): Promise<(PerpDex | null)[]>;
  allPerpMetas(): Promise<Meta[]>;
  spotMeta(): Promise<SpotMeta>;
  allMids(): Promise<Record<string, string>>;
  l2Book(coin: string, nSigFigs?: number): Promise<L2Book>;
  clearinghouseState(user: string, dex?: string): Promise<ClearinghouseState>;
  spotClearinghouseState(user: string): Promise<SpotClearinghouseState>;
  openOrders(user: string): Promise<OpenOrder[]>;
  frontendOpenOrders(user: string, dex?: string): Promise<FrontendOpenOrder[]>;
  historicalOrders(user: string): Promise<HistoricalOrder[]>;
  userFills(user: string): Promise<Fill[]>;
  userFillsByTime(
    user: string,
    startTime: number,
    endTime?: number,
    aggregateByTime?: boolean,
  ): Promise<Fill[]>;
  userFunding(user: string, startTime?: number, endTime?: number): Promise<UserFundingEntry[]>;
  fundingHistory(coin: string, startTime: number, endTime?: number): Promise<FundingRecord[]>;
  candleSnapshot(coin: string, interval: CandleInterval, startTime: number, endTime?: number): Promise<Candle[]>;
  referral(user: string): Promise<ReferralResponse>;

  // Borrow/Lend (Portfolio Margin)
  userAbstraction(user: string): Promise<AbstractionMode>;
  borrowLendUserState(user: string): Promise<BorrowLendUserState>;
  borrowLendReserveState(token: number): Promise<BorrowLendReserveState>;
  allBorrowLendReserveStates(): Promise<[number, BorrowLendReserveState][]>;

  // Subscriptions
  subscribeL2Book(coin: string, cb: (data: L2BookUpdate) => void): Promise<() => Promise<void>>;
  subscribeAllMids(cb: (data: AllMidsUpdate) => void): Promise<() => Promise<void>>;
  subscribeTrades(coin: string, cb: (data: Trade[]) => void): Promise<() => Promise<void>>;
  subscribeUserEvents(user: string, cb: (data: UserEvent) => void): Promise<() => Promise<void>>;

  // Exchange (requires wallet)
  placeOrder(params: OrderParams, builder?: { b: `0x${string}`; f: number }): Promise<OrderResult>;
  cancelOrder(params: CancelParams): Promise<CancelResult>;
  batchOrders(params: OrderParams[], builder?: { b: `0x${string}`; f: number }): Promise<OrderResult>;

  // Builder fee management
  approveBuilderFee(params: { maxFeeRate: string; builder: string }): Promise<void>;
  maxBuilderFee(params: { user: string; builder: string }): Promise<number>;
  setLeverage(assetIndex: number, leverage: number, isCross: boolean): Promise<void>;

  // Collateral management (requires wallet)
  usdClassTransfer(amount: number, toPerp: boolean): Promise<void>;
  /** @deprecated Use userSetAbstraction or agentSetAbstraction instead. */
  setDexAbstraction(enabled: boolean): Promise<void>;

  // Agent wallet management
  approveAgent(params: { agentAddress: `0x${string}`; agentName?: string | null }): Promise<void>;
  extraAgents(user: string): Promise<{ address: `0x${string}`; name: string; validUntil: number }[]>;

  // Abstraction management
  userSetAbstraction(params: {
    user: `0x${string}`;
    abstraction: "dexAbstraction" | "unifiedAccount" | "portfolioMargin" | "disabled";
  }): Promise<void>;
  agentSetAbstraction(params: {
    abstraction: "i" | "u" | "p";
  }): Promise<void>;

  // Lifecycle
  getSignerAddress?(): `0x${string}` | null;
  /** Invalidate cached balance data after trades/transfers. Optional. */
  invalidateBalanceCaches?(): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
