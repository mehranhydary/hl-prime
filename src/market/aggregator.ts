import type { HLProvider } from "../provider/provider.js";
import type { L2Level } from "../provider/types.js";
import type { Logger } from "../logging/logger.js";
import type { MarketRegistry } from "./registry.js";
import type { AggregatedBook, AggregatedLevel } from "./types.js";

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

    // Fetch all books in parallel
    const books = await Promise.all(
      markets.map(async (m) => {
        const book = await this.provider.l2Book(m.coin);
        return {
          coin: m.coin,
          bids: book.levels[0],
          asks: book.levels[1],
        };
      }),
    );

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
   * Merge price levels from multiple books.
   * Groups by price, sums sizes, tracks which markets contribute.
   */
  private mergeLevels(
    sources: { coin: string; levels: L2Level[] }[],
    sort: "asc" | "desc",
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

    return merged;
  }
}
