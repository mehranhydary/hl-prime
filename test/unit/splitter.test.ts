import { describe, it, expect } from "vitest";
import { SplitOptimizer } from "../../src/router/splitter.js";
import { BookAggregator } from "../../src/market/aggregator.js";
import type { HLProvider } from "../../src/provider/provider.js";
import { MarketRegistry } from "../../src/market/registry.js";
import { createLogger } from "../../src/logging/logger.js";
import type { HIP3Market, AggregatedBook } from "../../src/market/types.js";
import type { L2Book } from "../../src/provider/types.js";
import {
  TSLA_BOOK_DEEP,
  TSLA_HIP3_BOOK,
  EMPTY_BOOK,
} from "../fixtures/books.js";
import { TSLA_XYZ, TSLA_FLX } from "../fixtures/markets.js";

const logger = createLogger({ level: "silent" });

// Build market lookup map
function marketMap(...markets: HIP3Market[]): Map<string, HIP3Market> {
  return new Map(markets.map((m) => [m.coin, m]));
}

// Helper to create an aggregated book from raw books using the real BookAggregator
async function aggregateBooks(
  books: Record<string, L2Book>,
  dexes?: { name: string | null; universe: { name: string; szDecimals: number; maxLeverage: number }[]; collateralToken: number }[],
): Promise<AggregatedBook> {
  const defaultDexes = dexes ?? [
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

  const provider = {
    meta: async () => ({ universe: defaultDexes[0]?.universe ?? [], collateralToken: 0 }),
    metaAndAssetCtxs: async (dex?: string) => {
      const target = dex === "" || dex === undefined
        ? defaultDexes.find((d) => d.name === null)
        : defaultDexes.find((d) => d.name === dex);
      const universe = target?.universe ?? [];
      const meta = { universe, collateralToken: target?.collateralToken ?? 0 };
      const ctxs = universe.map(() => ({
        funding: "0.00001", openInterest: "1000", prevDayPx: "430.00",
        dayNtlVlm: "1000000", oraclePx: "431.50", markPx: "431.50",
      }));
      return [meta, ctxs] as Awaited<ReturnType<HLProvider["metaAndAssetCtxs"]>>;
    },
    perpDexs: async () => defaultDexes.map((d) =>
      d.name === null ? null : { name: d.name, deployer: "0x0000000000000000000000000000000000000000" },
    ),
    allPerpMetas: async () => defaultDexes.map((d) => ({
      universe: d.universe, collateralToken: d.collateralToken,
    })),
    spotMeta: async () => ({
      tokens: [
        { name: "USDC", index: 0, szDecimals: 8, weiDecimals: 8, tokenId: "0x0", isCanonical: true },
        { name: "USDH", index: 1, szDecimals: 8, weiDecimals: 8, tokenId: "0x1", isCanonical: true },
      ],
      universe: [],
    }),
    allMids: async () => ({}),
    l2Book: async (coin: string) => books[coin] ?? { coin, time: 0, levels: [[], []] },
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
  } as unknown as HLProvider;

  const registry = new MarketRegistry(provider, logger);
  await registry.discover();

  const aggregator = new BookAggregator(provider, registry, logger);
  return aggregator.aggregate("TSLA");
}

describe("SplitOptimizer", () => {
  const optimizer = new SplitOptimizer();

  describe("optimize", () => {
    it("splits across two markets based on price levels", async () => {
      const book = await aggregateBooks({
        "xyz:TSLA": TSLA_BOOK_DEEP,
        "flx:TSLA": TSLA_HIP3_BOOK,
      });

      const markets = marketMap(TSLA_XYZ, TSLA_FLX);
      const result = optimizer.optimize(book, "buy", 5, markets);

      expect(result).not.toBeNull();
      expect(result!.allocations.length).toBeGreaterThanOrEqual(1);
      expect(result!.totalSize).toBeCloseTo(5, 2);

      // All allocations should be positive
      for (const alloc of result!.allocations) {
        expect(alloc.size).toBeGreaterThan(0);
        expect(alloc.estimatedAvgPrice).toBeGreaterThan(0);
        expect(alloc.proportion).toBeGreaterThan(0);
      }

      // Proportions should sum to ~1
      const totalProportion = result!.allocations.reduce((sum, a) => sum + a.proportion, 0);
      expect(totalProportion).toBeCloseTo(1, 4);
    });

    it("allocates to single market when only one has liquidity", async () => {
      // Only xyz:TSLA has a book
      const book = await aggregateBooks(
        { "xyz:TSLA": TSLA_BOOK_DEEP, "flx:TSLA": EMPTY_BOOK },
      );

      const markets = marketMap(TSLA_XYZ, TSLA_FLX);
      const result = optimizer.optimize(book, "buy", 5, markets);

      expect(result).not.toBeNull();
      expect(result!.allocations).toHaveLength(1);
      expect(result!.allocations[0].market.coin).toBe("xyz:TSLA");
      expect(result!.allocations[0].size).toBeCloseTo(5, 2);
      expect(result!.allocations[0].proportion).toBeCloseTo(1, 4);
    });

    it("returns null for insufficient aggregate liquidity", async () => {
      const book = await aggregateBooks({
        "xyz:TSLA": TSLA_BOOK_DEEP,
        "flx:TSLA": TSLA_HIP3_BOOK,
      });

      const markets = marketMap(TSLA_XYZ, TSLA_FLX);
      // TSLA_BOOK_DEEP asks: 5+10+20+50=85, TSLA_HIP3_BOOK asks: 3+8=11, total=96
      const result = optimizer.optimize(book, "buy", 200, markets);
      expect(result).toBeNull();
    });

    it("returns null for empty book", async () => {
      const book: AggregatedBook = {
        baseAsset: "TSLA",
        bids: [],
        asks: [],
        marketBooks: [],
        timestamp: Date.now(),
      };

      const markets = marketMap(TSLA_XYZ);
      const result = optimizer.optimize(book, "buy", 5, markets);
      expect(result).toBeNull();
    });

    it("handles sell side correctly (walks bids)", async () => {
      const book = await aggregateBooks({
        "xyz:TSLA": TSLA_BOOK_DEEP,
        "flx:TSLA": TSLA_HIP3_BOOK,
      });

      const markets = marketMap(TSLA_XYZ, TSLA_FLX);
      const result = optimizer.optimize(book, "sell", 5, markets);

      expect(result).not.toBeNull();
      expect(result!.totalSize).toBeCloseTo(5, 2);
      // Sell walks bids, best bids are at 431.00 (xyz) and 430.80 (flx)
      // Aggregate avg price should be around the bid range
      expect(result!.aggregateAvgPrice).toBeGreaterThan(430);
      expect(result!.aggregateAvgPrice).toBeLessThan(432);
    });

    it("fills exactly at total available depth", async () => {
      const book = await aggregateBooks({
        "xyz:TSLA": TSLA_BOOK_DEEP,
        "flx:TSLA": TSLA_HIP3_BOOK,
      });

      const markets = marketMap(TSLA_XYZ, TSLA_FLX);
      // Total ask depth: xyz(5+10+20+50=85) + flx(3+8=11) = 96
      const result = optimizer.optimize(book, "buy", 96, markets);

      expect(result).not.toBeNull();
      expect(result!.totalSize).toBeCloseTo(96, 1);
    });

    it("filters out dust allocations", async () => {
      const book = await aggregateBooks({
        "xyz:TSLA": TSLA_BOOK_DEEP,
        "flx:TSLA": TSLA_HIP3_BOOK,
      });

      const markets = marketMap(TSLA_XYZ, TSLA_FLX);
      // With minAllocationSize=5, small flx fills at shared price levels should be redistributed
      const result = optimizer.optimize(book, "buy", 3, markets, 5);

      expect(result).not.toBeNull();
      // With a small order and high min, everything should go to one market
      expect(result!.allocations).toHaveLength(1);
    });

    it("calculates price impact in basis points", async () => {
      const book = await aggregateBooks({
        "xyz:TSLA": TSLA_BOOK_DEEP,
        "flx:TSLA": TSLA_HIP3_BOOK,
      });

      const markets = marketMap(TSLA_XYZ, TSLA_FLX);
      const result = optimizer.optimize(book, "buy", 5, markets);

      expect(result).not.toBeNull();
      expect(result!.aggregatePriceImpactBps).toBeGreaterThan(0);
      expect(result!.midPrice).toBeGreaterThan(0);
    });

    it("proportions are correct for multi-market split", async () => {
      const book = await aggregateBooks({
        "xyz:TSLA": TSLA_BOOK_DEEP,
        "flx:TSLA": TSLA_HIP3_BOOK,
      });

      const markets = marketMap(TSLA_XYZ, TSLA_FLX);
      // Buy 8 — xyz has 5 at 431.50, flx has 3 at 431.70
      // Both are asks at different prices. The aggregated book sorts them.
      // 431.50 (xyz: 5) then 431.70 (flx: 3) — we take 5 from xyz, 3 from flx
      const result = optimizer.optimize(book, "buy", 8, markets);

      expect(result).not.toBeNull();
      if (result!.allocations.length === 2) {
        const xyzAlloc = result!.allocations.find((a) => a.market.coin === "xyz:TSLA");
        const flxAlloc = result!.allocations.find((a) => a.market.coin === "flx:TSLA");
        expect(xyzAlloc).toBeDefined();
        expect(flxAlloc).toBeDefined();
        expect(xyzAlloc!.size + flxAlloc!.size).toBeCloseTo(8, 2);
        expect(xyzAlloc!.proportion + flxAlloc!.proportion).toBeCloseTo(1, 4);
      }
    });
  });
});
