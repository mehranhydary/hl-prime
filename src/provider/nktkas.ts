import * as hl from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import type { HLProvider } from "./provider.js";
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

export interface ProviderConfig {
  privateKey?: `0x${string}`;
  testnet?: boolean;
}

export class NktkasProvider implements HLProvider {
  private info: hl.InfoClient;
  private exchange: hl.ExchangeClient | null = null;
  private subs: hl.SubscriptionClient;
  private httpTransport: hl.HttpTransport;
  private wsTransport: hl.WebSocketTransport;

  constructor(config: ProviderConfig) {
    this.httpTransport = new hl.HttpTransport({
      isTestnet: config.testnet ?? false,
    });
    this.wsTransport = new hl.WebSocketTransport({
      isTestnet: config.testnet ?? false,
    });

    this.info = new hl.InfoClient({ transport: this.httpTransport });
    this.subs = new hl.SubscriptionClient({ transport: this.wsTransport });

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
    const raw = await this.info.spotMeta();
    return raw as unknown as SpotMeta;
  }

  async allMids(): Promise<Record<string, string>> {
    const raw = await this.info.allMids();
    return raw as unknown as Record<string, string>;
  }

  async l2Book(coin: string, nSigFigs?: number): Promise<L2Book> {
    const params: { coin: string; nSigFigs?: 2 | 3 | 4 | 5 } = { coin };
    if (nSigFigs !== undefined) {
      params.nSigFigs = nSigFigs as 2 | 3 | 4 | 5;
    }
    const raw = await this.info.l2Book(params);
    if (!raw) {
      return { coin, time: Date.now(), levels: [[], []] };
    }
    return raw as unknown as L2Book;
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

  async placeOrder(params: OrderParams): Promise<OrderResult> {
    if (!this.exchange) throw new Error("No wallet configured");

    const orderType = this.mapOrderType(params.orderType);

    const result = await this.exchange.order({
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
    });

    return {
      statuses: result.response.data.statuses as unknown as OrderResult["statuses"],
    };
  }

  async cancelOrder(params: CancelParams): Promise<CancelResult> {
    if (!this.exchange) throw new Error("No wallet configured");

    const result = await this.exchange.cancel({
      cancels: [{ a: params.asset, o: params.oid }],
    });

    return {
      statuses: result.response.data.statuses as unknown as string[],
    };
  }

  async batchOrders(params: OrderParams[]): Promise<OrderResult> {
    if (!this.exchange) throw new Error("No wallet configured");

    const orders = params.map((p) => ({
      a: p.assetIndex,
      b: p.isBuy,
      p: p.price,
      s: p.size,
      r: p.reduceOnly ?? false,
      t: this.mapOrderType(p.orderType),
      c: p.cloid as `0x${string}` | undefined,
    }));

    const result = await this.exchange.order({
      orders,
      grouping: "na",
    });

    return {
      statuses: result.response.data.statuses as unknown as OrderResult["statuses"],
    };
  }

  async setLeverage(coin: string, leverage: number, isCross: boolean): Promise<void> {
    if (!this.exchange) throw new Error("No wallet configured");

    await this.exchange.updateLeverage({
      asset: coin,
      leverage,
      isCross,
    });
  }

  // --- Collateral management methods ---

  async usdClassTransfer(amount: number, toPerp: boolean): Promise<void> {
    if (!this.exchange) throw new Error("No wallet configured");
    await this.exchange.usdClassTransfer({ amount, toPerp });
  }

  async setDexAbstraction(enabled: boolean): Promise<void> {
    if (!this.exchange) throw new Error("No wallet configured");
    await (this.exchange as any).userDexAbstraction({ enabled });
  }

  // --- Private helpers ---

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
