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
  OrderParams,
  OrderResult,
  CancelParams,
  CancelResult,
  L2BookUpdate,
  AllMidsUpdate,
  Trade,
  UserEvent,
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
  clearinghouseState(user: string): Promise<ClearinghouseState>;
  spotClearinghouseState(user: string): Promise<SpotClearinghouseState>;
  openOrders(user: string): Promise<OpenOrder[]>;
  userFills(user: string): Promise<Fill[]>;
  fundingHistory(coin: string, startTime: number, endTime?: number): Promise<FundingRecord[]>;

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
  setLeverage(coin: string, leverage: number, isCross: boolean): Promise<void>;

  // Collateral management (requires wallet)
  usdClassTransfer(amount: number, toPerp: boolean): Promise<void>;
  setDexAbstraction(enabled: boolean): Promise<void>;

  // Lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
