import { describe, it, expect } from "vitest";
import { BookAggregator } from "../../src/market/aggregator.js";
import type { HLProvider } from "../../src/provider/provider.js";
import { MarketRegistry } from "../../src/market/registry.js";
import { createLogger } from "../../src/logging/logger.js";
import {
  TSLA_BOOK_DEEP,
  TSLA_HIP3_BOOK,
} from "../fixtures/books.js";
import type { L2Book } from "../../src/provider/types.js";

interface MockDex {
  name: string | null;
  universe: { name: string; szDecimals: number; maxLeverage: number }[];
  collateralToken: number;
}

function createMockProvider(
  books: Record<string, L2Book>,
  dexes?: MockDex[],
  throwCoins: Set<string> = new Set(),
): HLProvider {
  const defaultDexes: MockDex[] = dexes ?? [
    {
      name: "xyz",
      universe: [{ name: "xyz:TSLA", szDecimals: 3, maxLeverage: 10 }],
      collateralToken: 0,
    },
    {
      name: "flx",
      universe: [{ name: "flx:TSLA", szDecimals: 3, maxLeverage: 10 }],
      collateralToken: 1,
    },
  ];

  const ctxMap: Record<string, () => object> = {
    "xyz:TSLA": () => ({
      funding: "0.00000625",
      openInterest: "37735",
      prevDayPx: "428.00",
      dayNtlVlm: "5000000",
      oraclePx: "431.56",
      markPx: "431.56",
    }),
    "flx:TSLA": () => ({
      funding: "-0.0002",
      openInterest: "1780",
      prevDayPx: "428.00",
      dayNtlVlm: "500000",
      oraclePx: "431.71",
      markPx: "431.86",
    }),
  };

  return {
    meta: async () => ({ universe: defaultDexes[0]?.universe ?? [], collateralToken: 0 }),
    metaAndAssetCtxs: async (dex?: string) => {
      const target = dex === "" || dex === undefined
        ? defaultDexes.find((d) => d.name === null)
        : defaultDexes.find((d) => d.name === dex);
      const universe = target?.universe ?? [];
      const meta = { universe, collateralToken: target?.collateralToken ?? 0 };
      const ctxs = universe.map((a) => (ctxMap[a.name] ?? ctxMap["xyz:TSLA"])());
      return [meta, ctxs] as Awaited<ReturnType<HLProvider["metaAndAssetCtxs"]>>;
    },
    perpDexs: async () => defaultDexes.map((d) =>
      d.name === null ? null : { name: d.name, deployer: "0x0000000000000000000000000000000000000000" },
    ),
    allPerpMetas: async () => defaultDexes.map((d) => ({
      universe: d.universe,
      collateralToken: d.collateralToken,
    })),
    spotMeta: async () => ({
      tokens: [
        { name: "USDC", index: 0, szDecimals: 8, weiDecimals: 8, tokenId: "0x0", isCanonical: true },
        { name: "USDH", index: 1, szDecimals: 8, weiDecimals: 8, tokenId: "0x1", isCanonical: true },
      ],
      universe: [],
    }),
    allMids: async () => ({}),
    l2Book: async (coin: string) => {
      if (throwCoins.has(coin)) throw new Error(`book unavailable for ${coin}`);
      return books[coin] ?? { coin, time: 0, levels: [[], []] };
    },
    clearinghouseState: async () => ({
      marginSummary: { accountValue: "0", totalNtlPos: "0", totalRawUsd: "0", totalMarginUsed: "0" },
      crossMarginSummary: { accountValue: "0", totalNtlPos: "0", totalRawUsd: "0", totalMarginUsed: "0" },
      assetPositions: [],
      crossMaintenanceMarginUsed: "0",
    }),
    spotClearinghouseState: async () => ({ balances: [] }),
    openOrders: async () => [],
    userFills: async () => [],
    fundingHistory: async () => [],
    subscribeL2Book: async () => async () => {},
    subscribeAllMids: async () => async () => {},
    subscribeTrades: async () => async () => {},
    subscribeUserEvents: async () => async () => {},
    placeOrder: async () => ({ statuses: [] }),
    cancelOrder: async () => ({ statuses: [] }),
    batchOrders: async () => ({ statuses: [] }),
    setLeverage: async () => {},
    connect: async () => {},
    disconnect: async () => {},
  };
}

describe("BookAggregator", () => {
  const logger = createLogger({ level: "silent" });

  it("aggregates books from multiple markets", async () => {
    const books: Record<string, L2Book> = {
      "xyz:TSLA": TSLA_BOOK_DEEP,
      "flx:TSLA": TSLA_HIP3_BOOK,
    };

    const provider = createMockProvider(books);
    const registry = new MarketRegistry(provider, logger);
    await registry.discover();

    const aggregator = new BookAggregator(provider, registry, logger);
    const result = await aggregator.aggregate("TSLA");

    // Should have levels from both books
    expect(result.bids.length).toBeGreaterThan(0);
    expect(result.asks.length).toBeGreaterThan(0);
    expect(result.marketBooks).toHaveLength(2);

    // Bids should be sorted descending
    for (let i = 1; i < result.bids.length; i++) {
      expect(result.bids[i].px).toBeLessThanOrEqual(result.bids[i - 1].px);
    }

    // Asks should be sorted ascending
    for (let i = 1; i < result.asks.length; i++) {
      expect(result.asks[i].px).toBeGreaterThanOrEqual(result.asks[i - 1].px);
    }
  });

  it("returns empty for unknown asset", async () => {
    const provider = createMockProvider({}, [
      { name: null, universe: [], collateralToken: 0 },
    ]);
    const registry = new MarketRegistry(provider, logger);
    await registry.discover();

    const aggregator = new BookAggregator(provider, registry, logger);
    const result = await aggregator.aggregate("UNKNOWN");

    expect(result.bids).toHaveLength(0);
    expect(result.asks).toHaveLength(0);
  });

  it("tracks sources per price level", async () => {
    const books: Record<string, L2Book> = {
      "xyz:TSLA": TSLA_BOOK_DEEP,
      "flx:TSLA": TSLA_HIP3_BOOK,
    };

    const provider = createMockProvider(books);
    const registry = new MarketRegistry(provider, logger);
    await registry.discover();

    const aggregator = new BookAggregator(provider, registry, logger);
    const result = await aggregator.aggregate("TSLA");

    // Check that sources are tracked
    for (const level of [...result.bids, ...result.asks]) {
      expect(level.sources.length).toBeGreaterThan(0);
      const totalFromSources = level.sources.reduce(
        (sum, s) => sum + s.sz,
        0,
      );
      expect(totalFromSources).toBeCloseTo(level.sz, 4);
    }
  });

  it("continues aggregation when one market book fails", async () => {
    const books: Record<string, L2Book> = {
      "xyz:TSLA": TSLA_BOOK_DEEP,
      "flx:TSLA": TSLA_HIP3_BOOK,
    };
    const provider = createMockProvider(books, undefined, new Set(["flx:TSLA"]));
    const registry = new MarketRegistry(provider, logger);
    await registry.discover();

    const aggregator = new BookAggregator(provider, registry, logger);
    const result = await aggregator.aggregate("TSLA");

    expect(result.marketBooks).toHaveLength(1);
    expect(result.marketBooks[0].coin).toBe("xyz:TSLA");
    expect(result.asks.length).toBeGreaterThan(0);
  });
});
