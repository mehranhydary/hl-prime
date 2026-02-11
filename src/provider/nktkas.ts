import * as hl from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import type { HLProvider } from "./provider.js";
import { NoWalletError } from "../utils/errors.js";
import type {
  Meta,
  AssetCtx,
  L2Book,
  L2Level,
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

export interface ProviderConfig {
  privateKey?: `0x${string}`;
  testnet?: boolean;
  l2BookCacheTtlMs?: number;
  spotMetaCacheTtlMs?: number;
}

interface TimedCache<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_L2_BOOK_CACHE_TTL_MS = 250;
const DEFAULT_SPOT_META_CACHE_TTL_MS = 30_000;

export class NktkasProvider implements HLProvider {
  private info: hl.InfoClient;
  private exchange: hl.ExchangeClient | null = null;
  private subs: hl.SubscriptionClient;
  private httpTransport: hl.HttpTransport;
  private wsTransport: hl.WebSocketTransport;
  private readonly l2BookCacheTtlMs: number;
  private readonly spotMetaCacheTtlMs: number;
  private l2BookCache = new Map<string, TimedCache<L2Book>>();
  private l2BookInFlight = new Map<string, Promise<L2Book>>();
  private spotMetaCache: TimedCache<SpotMeta> | null = null;
  private spotMetaInFlight: Promise<SpotMeta> | null = null;

  constructor(config: ProviderConfig) {
    this.httpTransport = new hl.HttpTransport({
      isTestnet: config.testnet ?? false,
    });
    this.wsTransport = new hl.WebSocketTransport({
      isTestnet: config.testnet ?? false,
    });

    this.info = new hl.InfoClient({ transport: this.httpTransport });
    this.subs = new hl.SubscriptionClient({ transport: this.wsTransport });
    this.l2BookCacheTtlMs = config.l2BookCacheTtlMs ?? DEFAULT_L2_BOOK_CACHE_TTL_MS;
    this.spotMetaCacheTtlMs = config.spotMetaCacheTtlMs ?? DEFAULT_SPOT_META_CACHE_TTL_MS;

    if (config.privateKey) {
      const wallet = privateKeyToAccount(config.privateKey);
      this.exchange = new hl.ExchangeClient({
        transport: this.httpTransport,
        wallet,
      });
    }
  }

  async connect(): Promise<void> {
    await this.wsTransport.ready();
  }

  async disconnect(): Promise<void> {
    await this.wsTransport.close();
    this.l2BookCache.clear();
    this.l2BookInFlight.clear();
    this.spotMetaCache = null;
    this.spotMetaInFlight = null;
  }

  // --- Info methods ---

  async meta(dex?: string): Promise<Meta> {
    const raw = await this.info.meta(dex !== undefined ? { dex } : undefined);
    return raw as unknown as Meta;
  }

  async metaAndAssetCtxs(dex?: string): Promise<[Meta, AssetCtx[]]> {
    const raw = await this.info.metaAndAssetCtxs(dex !== undefined ? { dex } : undefined);
    return raw as unknown as [Meta, AssetCtx[]];
  }

  async perpDexs(): Promise<(PerpDex | null)[]> {
    const raw = await this.info.perpDexs();
    return raw as unknown as (PerpDex | null)[];
  }

  async allPerpMetas(): Promise<Meta[]> {
    const raw = await this.info.allPerpMetas();
    return raw as unknown as Meta[];
  }

  async spotMeta(): Promise<SpotMeta> {
    const now = Date.now();
    if (this.spotMetaCache && this.spotMetaCache.expiresAt > now) {
      return this.spotMetaCache.value;
    }

    if (this.spotMetaInFlight) {
      return this.spotMetaInFlight;
    }

    this.spotMetaInFlight = this.info.spotMeta()
      .then((raw) => {
        const value = raw as unknown as SpotMeta;
        this.spotMetaCache = {
          value,
          expiresAt: Date.now() + this.spotMetaCacheTtlMs,
        };
        return value;
      })
      .finally(() => {
        this.spotMetaInFlight = null;
      });

    return this.spotMetaInFlight;
  }

  async allMids(): Promise<Record<string, string>> {
    const raw = await this.info.allMids();
    return raw as unknown as Record<string, string>;
  }

  async l2Book(coin: string, nSigFigs?: number): Promise<L2Book> {
    const cacheKey = `${coin}:${nSigFigs ?? "na"}`;
    const now = Date.now();
    const cached = this.l2BookCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }
    if (this.l2BookInFlight.has(cacheKey)) {
      return this.l2BookInFlight.get(cacheKey)!;
    }

    const params: { coin: string; nSigFigs?: 2 | 3 | 4 | 5 } = { coin };
    if (nSigFigs !== undefined) {
      params.nSigFigs = nSigFigs as 2 | 3 | 4 | 5;
    }

    const request = this.info.l2Book(params)
      .then((raw) => {
        const value = raw
          ? raw as unknown as L2Book
          : {
            coin,
            time: Date.now(),
            levels: [[], []] as [L2Level[], L2Level[]],
          };
        this.l2BookCache.set(cacheKey, {
          value,
          expiresAt: Date.now() + this.l2BookCacheTtlMs,
        });
        return value;
      })
      .finally(() => {
        this.l2BookInFlight.delete(cacheKey);
      });

    this.l2BookInFlight.set(cacheKey, request);
    return request;
  }

  async clearinghouseState(user: string): Promise<ClearinghouseState> {
    const raw = await this.info.clearinghouseState({ user: user as `0x${string}` });
    return raw as unknown as ClearinghouseState;
  }

  async spotClearinghouseState(user: string): Promise<SpotClearinghouseState> {
    const raw = await this.info.spotClearinghouseState({ user: user as `0x${string}` });
    return raw as unknown as SpotClearinghouseState;
  }

  async openOrders(user: string): Promise<OpenOrder[]> {
    const raw = await this.info.openOrders({ user: user as `0x${string}` });
    return raw as unknown as OpenOrder[];
  }

  async userFills(user: string): Promise<Fill[]> {
    const raw = await this.info.userFills({ user: user as `0x${string}` });
    return raw as unknown as Fill[];
  }

  async fundingHistory(coin: string, startTime: number, _endTime?: number): Promise<FundingRecord[]> {
    const raw = await this.info.fundingHistory({
      coin,
      startTime,
    });
    return raw as unknown as FundingRecord[];
  }

  // --- Subscription methods ---

  async subscribeL2Book(coin: string, cb: (data: L2BookUpdate) => void): Promise<() => Promise<void>> {
    const sub = await this.subs.l2Book({ coin }, (data) => {
      cb(data as unknown as L2BookUpdate);
    });
    return () => sub.unsubscribe();
  }

  async subscribeAllMids(cb: (data: AllMidsUpdate) => void): Promise<() => Promise<void>> {
    const sub = await this.subs.allMids((data) => {
      cb(data as unknown as AllMidsUpdate);
    });
    return () => sub.unsubscribe();
  }

  async subscribeTrades(coin: string, cb: (data: Trade[]) => void): Promise<() => Promise<void>> {
    const sub = await this.subs.trades({ coin }, (data) => {
      cb(data as unknown as Trade[]);
    });
    return () => sub.unsubscribe();
  }

  async subscribeUserEvents(user: string, cb: (data: UserEvent) => void): Promise<() => Promise<void>> {
    const sub = await this.subs.userEvents({ user: user as `0x${string}` }, (data) => {
      cb(data as unknown as UserEvent);
    });
    return () => sub.unsubscribe();
  }

  // --- Exchange methods ---

  async placeOrder(params: OrderParams, builder?: { b: `0x${string}`; f: number }): Promise<OrderResult> {
    const exchange = this.requireExchange();

    const orderType = this.mapOrderType(params.orderType);

    const result = await exchange.order({
      orders: [{
        a: params.assetIndex,
        b: params.isBuy,
        p: params.price,
        s: params.size,
        r: params.reduceOnly ?? false,
        t: orderType,
        c: params.cloid as `0x${string}` | undefined,
      }],
      grouping: "na",
      ...(builder ? { builder } : {}),
    });

    return {
      statuses: result.response.data.statuses as unknown as OrderResult["statuses"],
    };
  }

  async cancelOrder(params: CancelParams): Promise<CancelResult> {
    const exchange = this.requireExchange();

    const result = await exchange.cancel({
      cancels: [{ a: params.asset, o: params.oid }],
    });

    return {
      statuses: result.response.data.statuses as unknown as string[],
    };
  }

  async batchOrders(params: OrderParams[], builder?: { b: `0x${string}`; f: number }): Promise<OrderResult> {
    const exchange = this.requireExchange();

    const orders = params.map((p) => ({
      a: p.assetIndex,
      b: p.isBuy,
      p: p.price,
      s: p.size,
      r: p.reduceOnly ?? false,
      t: this.mapOrderType(p.orderType),
      c: p.cloid as `0x${string}` | undefined,
    }));

    const result = await exchange.order({
      orders,
      grouping: "na",
      ...(builder ? { builder } : {}),
    });

    return {
      statuses: result.response.data.statuses as unknown as OrderResult["statuses"],
    };
  }

  async setLeverage(coin: string, leverage: number, isCross: boolean): Promise<void> {
    const exchange = this.requireExchange();

    await exchange.updateLeverage({
      asset: coin,
      leverage,
      isCross,
    });
  }

  // --- Collateral management methods ---

  async usdClassTransfer(amount: number, toPerp: boolean): Promise<void> {
    const exchange = this.requireExchange();
    await exchange.usdClassTransfer({ amount, toPerp });
  }

  async setDexAbstraction(enabled: boolean): Promise<void> {
    const exchange = this.requireExchange();
    await (exchange as any).userDexAbstraction({ enabled });
  }

  // --- Builder fee methods ---

  async approveBuilderFee(params: { maxFeeRate: string; builder: string }): Promise<void> {
    const exchange = this.requireExchange();
    await exchange.approveBuilderFee({
      maxFeeRate: params.maxFeeRate,
      builder: params.builder as `0x${string}`,
    });
  }

  async maxBuilderFee(params: { user: string; builder: string }): Promise<number> {
    const result = await this.info.maxBuilderFee({
      user: params.user as `0x${string}`,
      builder: params.builder as `0x${string}`,
    });
    return result;
  }

  // --- Private helpers ---

  private requireExchange(): hl.ExchangeClient {
    if (!this.exchange) throw new NoWalletError();
    return this.exchange;
  }

  private mapOrderType(ot: OrderParams["orderType"]) {
    if (ot.limit) {
      return { limit: { tif: ot.limit.tif } } as const;
    }
    if (ot.trigger) {
      return {
        trigger: {
          triggerPx: ot.trigger.triggerPx,
          isMarket: ot.trigger.isMarket,
          tpsl: ot.trigger.tpsl,
        },
      } as const;
    }
    return { limit: { tif: "Ioc" as const } } as const;
  }
}
