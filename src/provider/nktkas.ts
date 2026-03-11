import * as hl from "@nktkas/hyperliquid";
import { createRequire } from "node:module";
import { privateKeyToAccount } from "viem/accounts";
import type { HLProvider } from "./provider.js";
import { NoWalletError } from "../utils/errors.js";
import {
  MetaSchema,
  MetaAndAssetCtxsSchema,
  L2BookSchema,
  SpotMetaSchema,
  PerpDexSchema,
  ClearinghouseStateSchema,
  SpotClearinghouseStateSchema,
  OpenOrderSchema,
  FrontendOpenOrderSchema,
  HistoricalOrderSchema,
  FillSchema,
  FundingRecordSchema,
  UserFundingEntrySchema,
  CandleSchema,
  ReferralResponseSchema,
  OrderStatusSchema,
  L2BookUpdateSchema,
  AllMidsUpdateSchema,
  TradeSchema,
  UserEventSchema,
} from "./schemas.js";
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
} from "./types.js";

export interface ProviderConfig {
  privateKey?: `0x${string}`;
  walletAddress?: `0x${string}`;
  vaultAddress?: `0x${string}`;
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
const BALANCE_CACHE_TTL_MS = 30_000;
const require = createRequire(import.meta.url);

type ReconnectOptions = NonNullable<hl.WebSocketTransportOptions["reconnect"]>;

function resolveNodeWebSocket(): ReconnectOptions["WebSocket"] | undefined {
  try {
    const wsModule = require("ws") as { WebSocket?: unknown; default?: unknown };
    const ctor = wsModule.WebSocket ?? wsModule.default;
    if (typeof ctor === "function") {
      return ctor as ReconnectOptions["WebSocket"];
    }
  } catch {
    // No-op: browser runtimes may not have the "ws" package installed.
  }
  return undefined;
}

/** Normalize a user string to 0x-prefixed hex address. */
function asHexAddress(user: string): `0x${string}` {
  return user as `0x${string}`;
}

export class NktkasProvider implements HLProvider {
  private info: hl.InfoClient;
  private exchange: hl.ExchangeClient | null = null;
  private subs: hl.SubscriptionClient;
  private httpTransport: hl.HttpTransport;
  private wsTransport: hl.WebSocketTransport;
  private readonly l2BookCacheTtlMs: number;
  private readonly spotMetaCacheTtlMs: number;
  private readonly signerAddress: `0x${string}` | null;
  private l2BookCache = new Map<string, TimedCache<L2Book>>();
  private l2BookInFlight = new Map<string, Promise<L2Book>>();
  private spotMetaCache: TimedCache<SpotMeta> | null = null;
  private spotMetaInFlight: Promise<SpotMeta> | null = null;
  private spotBalanceCache = new Map<string, TimedCache<SpotClearinghouseState>>();
  private clearinghouseCache = new Map<string, TimedCache<ClearinghouseState>>();

  constructor(config: ProviderConfig) {
    const nodeWebSocket = resolveNodeWebSocket();
    this.httpTransport = new hl.HttpTransport({
      isTestnet: config.testnet ?? false,
    });
    this.wsTransport = new hl.WebSocketTransport({
      isTestnet: config.testnet ?? false,
      ...(nodeWebSocket
        ? { reconnect: { WebSocket: nodeWebSocket } }
        : {}),
    });

    this.info = new hl.InfoClient({ transport: this.httpTransport });
    this.subs = new hl.SubscriptionClient({ transport: this.wsTransport });
    this.l2BookCacheTtlMs = config.l2BookCacheTtlMs ?? DEFAULT_L2_BOOK_CACHE_TTL_MS;
    this.spotMetaCacheTtlMs = config.spotMetaCacheTtlMs ?? DEFAULT_SPOT_META_CACHE_TTL_MS;
    this.signerAddress = config.privateKey
      ? privateKeyToAccount(config.privateKey).address as `0x${string}`
      : null;

    if (config.privateKey) {
      const wallet = privateKeyToAccount(config.privateKey);
      const signerAddress = wallet.address.toLowerCase() as `0x${string}`;
      // Only use explicit vaultAddress for vault/sub-account routing.
      // walletAddress identifies the logical user for reads/position lookups, but
      // forcing it into defaultVaultAddress can cause "Vault not registered" errors
      // for normal agent-on-master trading flows.
      const configuredVaultAddress = config.vaultAddress?.toLowerCase() as `0x${string}` | undefined;
      const defaultVaultAddress =
        configuredVaultAddress && configuredVaultAddress !== signerAddress
          ? configuredVaultAddress
          : undefined;
      this.exchange = new hl.ExchangeClient({
        transport: this.httpTransport,
        wallet,
        ...(defaultVaultAddress ? { defaultVaultAddress } : {}),
      });
    }
  }

  getSignerAddress(): `0x${string}` | null {
    return this.signerAddress;
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
    this.spotBalanceCache.clear();
    this.clearinghouseCache.clear();
  }

  // --- Info methods ---

  async meta(dex?: string): Promise<Meta> {
    const raw = await this.info.meta(dex !== undefined ? { dex } : undefined);
    return MetaSchema.parse(raw);
  }

  async metaAndAssetCtxs(dex?: string): Promise<[Meta, AssetCtx[]]> {
    const raw = await this.info.metaAndAssetCtxs(dex !== undefined ? { dex } : undefined);
    return MetaAndAssetCtxsSchema.parse(raw);
  }

  async perpDexs(): Promise<(PerpDex | null)[]> {
    const raw = await this.info.perpDexs();
    return (raw as unknown[]).map((d) => (d === null ? null : PerpDexSchema.parse(d)));
  }

  async allPerpMetas(): Promise<Meta[]> {
    const raw = await this.info.allPerpMetas();
    return (raw as unknown[]).map((m) => MetaSchema.parse(m));
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
        const value = SpotMetaSchema.parse(raw);
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
    return raw as Record<string, string>;
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
          ? L2BookSchema.parse(raw)
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

  async clearinghouseState(user: string, dex?: string): Promise<ClearinghouseState> {
    const cacheKey = `${user.toLowerCase()}:${dex ?? ""}`;
    const now = Date.now();
    const cached = this.clearinghouseCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const addr = asHexAddress(user);
    const raw = await this.info.clearinghouseState(
      dex !== undefined ? { user: addr, dex } : { user: addr },
    );
    const parsed = ClearinghouseStateSchema.parse(raw);
    this.clearinghouseCache.set(cacheKey, { value: parsed, expiresAt: now + BALANCE_CACHE_TTL_MS });
    return parsed;
  }

  async spotClearinghouseState(user: string): Promise<SpotClearinghouseState> {
    const cacheKey = user.toLowerCase();
    const now = Date.now();
    const cached = this.spotBalanceCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const raw = await this.info.spotClearinghouseState({ user: asHexAddress(user) });
    const parsed = SpotClearinghouseStateSchema.parse(raw);
    this.spotBalanceCache.set(cacheKey, { value: parsed, expiresAt: now + BALANCE_CACHE_TTL_MS });
    return parsed;
  }

  /** Invalidate balance caches after trades or transfers. */
  invalidateBalanceCaches(): void {
    this.spotBalanceCache.clear();
    this.clearinghouseCache.clear();
  }

  async openOrders(user: string): Promise<OpenOrder[]> {
    const raw = await this.info.openOrders({ user: asHexAddress(user) });
    return (raw as unknown[]).map((o) => OpenOrderSchema.parse(o));
  }

  async frontendOpenOrders(user: string, dex?: string): Promise<FrontendOpenOrder[]> {
    const addr = asHexAddress(user);
    const raw = await this.info.frontendOpenOrders(
      dex !== undefined ? { user: addr, dex } : { user: addr },
    );
    return (raw as unknown[]).map((o) => FrontendOpenOrderSchema.parse(o));
  }

  async historicalOrders(user: string): Promise<HistoricalOrder[]> {
    const raw = await this.info.historicalOrders({ user: asHexAddress(user) });
    return (raw as unknown[]).map((o) => HistoricalOrderSchema.parse(o));
  }

  async userFills(user: string): Promise<Fill[]> {
    const raw = await this.info.userFills({ user: asHexAddress(user) });
    return (raw as unknown[]).map((f) => FillSchema.parse(f));
  }

  async userFillsByTime(
    user: string,
    startTime: number,
    endTime?: number,
    aggregateByTime?: boolean,
  ): Promise<Fill[]> {
    const params: {
      user: `0x${string}`;
      startTime: number;
      endTime?: number;
      aggregateByTime?: boolean;
    } = {
      user: asHexAddress(user),
      startTime,
    };
    if (endTime !== undefined) params.endTime = endTime;
    if (aggregateByTime !== undefined) params.aggregateByTime = aggregateByTime;
    const raw = await this.info.userFillsByTime(params);
    return (raw as unknown[]).map((f) => FillSchema.parse(f));
  }

  async userFunding(
    user: string,
    startTime?: number,
    endTime?: number,
  ): Promise<UserFundingEntry[]> {
    const params: {
      user: `0x${string}`;
      startTime?: number;
      endTime?: number;
    } = { user: asHexAddress(user) };
    if (startTime !== undefined) params.startTime = startTime;
    if (endTime !== undefined) params.endTime = endTime;
    const raw = await this.info.userFunding(params);
    return (raw as unknown[]).map((f) => UserFundingEntrySchema.parse(f)) as UserFundingEntry[];
  }

  async fundingHistory(coin: string, startTime: number, _endTime?: number): Promise<FundingRecord[]> {
    const raw = await this.info.fundingHistory({
      coin,
      startTime,
    });
    return (raw as unknown[]).map((f) => FundingRecordSchema.parse(f));
  }

  async candleSnapshot(coin: string, interval: CandleInterval, startTime: number, endTime?: number): Promise<Candle[]> {
    const params: { coin: string; interval: string; startTime: number; endTime?: number } = {
      coin,
      interval,
      startTime,
    };
    if (endTime !== undefined) params.endTime = endTime;
    const raw = await this.info.candleSnapshot(params as any);
    return (raw as unknown[]).map((c) => CandleSchema.parse(c));
  }

  async referral(user: string): Promise<ReferralResponse> {
    const raw = await this.info.referral({ user: asHexAddress(user) });
    return ReferralResponseSchema.parse(raw) as ReferralResponse;
  }

  // --- Subscription methods ---

  async subscribeL2Book(coin: string, cb: (data: L2BookUpdate) => void): Promise<() => Promise<void>> {
    const sub = await this.subs.l2Book({ coin }, (data) => {
      cb(L2BookUpdateSchema.parse(data));
    });
    return () => sub.unsubscribe();
  }

  async subscribeAllMids(cb: (data: AllMidsUpdate) => void): Promise<() => Promise<void>> {
    const sub = await this.subs.allMids((data) => {
      cb(AllMidsUpdateSchema.parse(data));
    });
    return () => sub.unsubscribe();
  }

  async subscribeTrades(coin: string, cb: (data: Trade[]) => void): Promise<() => Promise<void>> {
    const sub = await this.subs.trades({ coin }, (data) => {
      cb((data as unknown[]).map((t) => TradeSchema.parse(t)));
    });
    return () => sub.unsubscribe();
  }

  async subscribeUserEvents(user: string, cb: (data: UserEvent) => void): Promise<() => Promise<void>> {
    const sub = await this.subs.userEvents({ user: asHexAddress(user) }, (data) => {
      cb(UserEventSchema.parse(data));
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

    return this.parseOrderResult(result.response.data);
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

    return this.parseOrderResult(result.response.data);
  }

  async setLeverage(assetIndex: number, leverage: number, isCross: boolean): Promise<void> {
    const exchange = this.requireExchange();

    await exchange.updateLeverage({
      asset: assetIndex,
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
    // Legacy shim: map old boolean API to current agent abstraction modes.
    await exchange.agentSetAbstraction({
      abstraction: enabled ? "u" : "i",
    });
  }

  // --- Agent wallet methods ---

  async approveAgent(params: { agentAddress: `0x${string}`; agentName?: string | null }): Promise<void> {
    const exchange = this.requireExchange();
    await exchange.approveAgent({
      agentAddress: params.agentAddress,
      agentName: params.agentName ?? null,
    });
  }

  async extraAgents(user: string): Promise<{ address: `0x${string}`; name: string; validUntil: number }[]> {
    const result = await this.info.extraAgents({ user: asHexAddress(user) });
    return result as { address: `0x${string}`; name: string; validUntil: number }[];
  }

  // --- Abstraction methods ---

  async userSetAbstraction(params: {
    user: `0x${string}`;
    abstraction: "dexAbstraction" | "unifiedAccount" | "portfolioMargin" | "disabled";
  }): Promise<void> {
    const exchange = this.requireExchange();
    await exchange.userSetAbstraction({
      user: params.user,
      abstraction: params.abstraction,
    });
  }

  async agentSetAbstraction(params: { abstraction: "i" | "u" | "p" }): Promise<void> {
    const exchange = this.requireExchange();
    await exchange.agentSetAbstraction({
      abstraction: params.abstraction,
    });
  }

  // --- Builder fee methods ---

  async approveBuilderFee(params: { maxFeeRate: string; builder: string }): Promise<void> {
    const exchange = this.requireExchange();
    await exchange.approveBuilderFee({
      maxFeeRate: params.maxFeeRate,
      builder: asHexAddress(params.builder),
    });
  }

  async maxBuilderFee(params: { user: string; builder: string }): Promise<number> {
    const result = await this.info.maxBuilderFee({
      user: asHexAddress(params.user),
      builder: asHexAddress(params.builder),
    });
    return result;
  }

  // --- Private helpers ---

  private requireExchange(): hl.ExchangeClient {
    if (!this.exchange) throw new NoWalletError();
    return this.exchange;
  }

  private parseOrderResult(data: unknown): OrderResult {
    const obj = data as { statuses?: unknown[] };
    if (!obj.statuses || !Array.isArray(obj.statuses)) {
      return { statuses: [] };
    }
    return {
      statuses: obj.statuses.map((s) => OrderStatusSchema.parse(s)) as OrderResult["statuses"],
    };
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
