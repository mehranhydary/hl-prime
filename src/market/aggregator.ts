import type { HLProvider } from "../provider/provider.js";
import type { L2Level } from "../provider/types.js";
import type { Logger } from "../logging/logger.js";
import type { MarketRegistry } from "./registry.js";
import type { AggregatedBook, AggregatedLevel, PerpMarket } from "./types.js";

const BOOK_FETCH_TIMEOUT_MS = 2_500;

interface MarketBookSnapshot {
  coin: string;
  bids: L2Level[];
  asks: L2Level[];
}

export class BookAggregator {
  private logger: Logger;

  constructor(
    private provider: HLProvider,
    private registry: MarketRegistry,
    logger: Logger,
  ) {
    this.logger = logger.child({ module: "aggregator" });
  }

  /**
   * Fetch orderbooks from all markets for a given asset and merge them
   * into a single aggregated view.
   */
  async aggregate(baseAsset: string): Promise<AggregatedBook> {
    const markets = this.registry.getMarkets(baseAsset);
    if (markets.length === 0) {
      return {
        baseAsset,
        bids: [],
        asks: [],
        marketBooks: [],
        timestamp: Date.now(),
      };
    }

    const books = await this.fetchMarketBooks(markets, baseAsset);
    if (books.length === 0) {
      return {
        baseAsset,
        bids: [],
        asks: [],
        marketBooks: [],
        timestamp: Date.now(),
      };
    }

    this.logger.debug(
      { baseAsset, marketCount: books.length },
      "Aggregating orderbooks",
    );

    const bids = this.mergeLevels(
      books.map((b) => ({ coin: b.coin, levels: b.bids })),
      "desc",
    );

    const asks = this.mergeLevels(
      books.map((b) => ({ coin: b.coin, levels: b.asks })),
      "asc",
    );

    return {
      baseAsset,
      bids,
      asks,
      marketBooks: books,
      timestamp: Date.now(),
    };
  }

  /**
   * Aggregate only enough levels to quote a given size for routing.
   * This avoids building the full merged side when an order only needs shallow depth.
   */
  async aggregateForOrder(
    baseAsset: string,
    side: "buy" | "sell",
    size: number,
  ): Promise<AggregatedBook> {
    const markets = this.registry.getMarkets(baseAsset);
    if (markets.length === 0) {
      return {
        baseAsset,
        bids: [],
        asks: [],
        marketBooks: [],
        timestamp: Date.now(),
      };
    }

    const books = await this.fetchMarketBooks(markets, baseAsset);
    if (books.length === 0) {
      return {
        baseAsset,
        bids: [],
        asks: [],
        marketBooks: [],
        timestamp: Date.now(),
      };
    }

    const isBuy = side === "buy";
    const targetDepth = Math.max(0, size);

    const bids = this.mergeLevels(
      books.map((b) => ({ coin: b.coin, levels: b.bids })),
      "desc",
      isBuy ? undefined : targetDepth,
    );
    const asks = this.mergeLevels(
      books.map((b) => ({ coin: b.coin, levels: b.asks })),
      "asc",
      isBuy ? targetDepth : undefined,
    );

    return {
      baseAsset,
      bids,
      asks,
      marketBooks: books,
      timestamp: Date.now(),
    };
  }

  /**
   * Merge price levels from multiple books.
   * Groups by price, sums sizes, tracks which markets contribute.
   */
  private mergeLevels(
    sources: { coin: string; levels: L2Level[] }[],
    sort: "asc" | "desc",
    targetDepth?: number,
  ): AggregatedLevel[] {
    const priceMap = new Map<
      string,
      { px: number; sz: number; sources: { coin: string; sz: number }[] }
    >();

    for (const { coin, levels } of sources) {
      for (const level of levels) {
        const px = level.px;
        const sz = parseFloat(level.sz);
        if (!priceMap.has(px)) {
          priceMap.set(px, {
            px: parseFloat(px),
            sz: 0,
            sources: [],
          });
        }
        const entry = priceMap.get(px)!;
        entry.sz += sz;
        entry.sources.push({ coin, sz });
      }
    }

    const merged = [...priceMap.values()];
    merged.sort((a, b) =>
      sort === "desc" ? b.px - a.px : a.px - b.px,
    );

    if (targetDepth === undefined || targetDepth <= 0) {
      return merged;
    }

    let cumulative = 0;
    const trimmed: AggregatedLevel[] = [];
    for (const level of merged) {
      trimmed.push(level);
      cumulative += level.sz;
      if (cumulative >= targetDepth) break;
    }
    return trimmed;
  }

  private async fetchMarketBooks(
    markets: PerpMarket[],
    baseAsset: string,
  ): Promise<MarketBookSnapshot[]> {
    const settled = await Promise.allSettled(
      markets.map(async (m) => {
        const book = await this.withTimeout(
          this.provider.l2Book(m.coin),
          BOOK_FETCH_TIMEOUT_MS,
          `l2Book timeout for ${m.coin}`,
        );
        return {
          coin: m.coin,
          bids: book.levels[0],
          asks: book.levels[1],
        } as MarketBookSnapshot;
      }),
    );

    const books: MarketBookSnapshot[] = [];
    const failures: { coin: string; reason: string }[] = [];

    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      const market = markets[i];
      if (result.status === "fulfilled") {
        books.push(result.value);
        continue;
      }

      failures.push({
        coin: market?.coin ?? `market_${i}`,
        reason: String(result.reason),
      });
    }

    if (failures.length > 0) {
      this.logger.warn(
        {
          baseAsset,
          failedMarkets: failures.map((f) => f.coin),
          failureCount: failures.length,
        },
        "Some market books failed to load; continuing with partial data",
      );
    }

    return books;
  }

  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }
}
