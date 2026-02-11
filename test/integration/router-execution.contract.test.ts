import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HLProvider } from "../../src/provider/provider.js";
import type { L2Book } from "../../src/provider/types.js";
import { createLogger } from "../../src/logging/logger.js";
import { MarketRegistry } from "../../src/market/registry.js";
import { BookAggregator } from "../../src/market/aggregator.js";
import { Router } from "../../src/router/router.js";
import { Executor } from "../../src/execution/executor.js";
import { CollateralManager } from "../../src/collateral/manager.js";
import { TSLA_BOOK_DEEP, TSLA_HIP3_BOOK } from "../fixtures/books.js";

function createProvider(books: Record<string, L2Book>): HLProvider & {
  placeOrder: ReturnType<typeof vi.fn>;
  batchOrders: ReturnType<typeof vi.fn>;
} {
  const placeOrder = vi.fn(async () => ({
    statuses: [{ filled: { oid: 101, totalSz: "5", avgPx: "431.55" } }],
  }));
  const batchOrders = vi.fn(async ({ length }: { length: number }) => ({
    statuses: Array.from({ length }).map((_, i) => ({
      filled: { oid: 200 + i, totalSz: "4", avgPx: "431.70" },
    })),
  }));

  return {
    meta: vi.fn(async () => ({ universe: [], collateralToken: 0 })),
    metaAndAssetCtxs: vi.fn(async (dex?: string) => {
      const byDex = dex === "flx"
        ? [{ name: "flx:TSLA", szDecimals: 3, maxLeverage: 10 }]
        : [{ name: "xyz:TSLA", szDecimals: 3, maxLeverage: 10 }];
      const ctx = byDex.map(() => ({
        funding: "0.00001",
        openInterest: "10000",
        prevDayPx: "430.00",
        dayNtlVlm: "1000000",
        oraclePx: "431.50",
        markPx: "431.50",
      }));
      return [{ universe: byDex, collateralToken: dex === "flx" ? 1 : 0 }, ctx];
    }),
    perpDexs: vi.fn(async () => [
      { name: "xyz", deployer: "0x0000000000000000000000000000000000000000" },
      { name: "flx", deployer: "0x0000000000000000000000000000000000000000" },
    ]),
    allPerpMetas: vi.fn(async () => [
      { universe: [{ name: "xyz:TSLA", szDecimals: 3, maxLeverage: 10 }], collateralToken: 0 },
      { universe: [{ name: "flx:TSLA", szDecimals: 3, maxLeverage: 10 }], collateralToken: 1 },
    ]),
    spotMeta: vi.fn(async () => ({
      tokens: [
        { name: "USDC", index: 0, szDecimals: 8, weiDecimals: 8, tokenId: "0x0", isCanonical: true },
        { name: "USDH", index: 1, szDecimals: 8, weiDecimals: 8, tokenId: "0x1", isCanonical: true },
      ],
      universe: [{ name: "USDC/USDH", tokens: [0, 1], index: 0, isCanonical: true }],
    })),
    allMids: vi.fn(async () => ({})),
    l2Book: vi.fn(async (coin: string) => books[coin] ?? { coin, time: Date.now(), levels: [[], []] }),
    clearinghouseState: vi.fn(async () => ({
      marginSummary: { accountValue: "10000", totalNtlPos: "0", totalRawUsd: "0", totalMarginUsed: "0" },
      crossMarginSummary: { accountValue: "10000", totalNtlPos: "0", totalRawUsd: "0", totalMarginUsed: "0" },
      assetPositions: [],
      crossMaintenanceMarginUsed: "0",
    })),
    spotClearinghouseState: vi.fn(async () => ({
      balances: [{ coin: "USDH", hold: "0", total: "10000", entryNtl: "10000", token: 1 }],
    })),
    openOrders: vi.fn(async () => []),
    userFills: vi.fn(async () => []),
    fundingHistory: vi.fn(async () => []),
    subscribeL2Book: vi.fn(async () => async () => {}),
    subscribeAllMids: vi.fn(async () => async () => {}),
    subscribeTrades: vi.fn(async () => async () => {}),
    subscribeUserEvents: vi.fn(async () => async () => {}),
    placeOrder,
    cancelOrder: vi.fn(async () => ({ statuses: [] })),
    batchOrders: vi.fn(async (orders: unknown[]) => batchOrders({ length: orders.length })),
    setLeverage: vi.fn(async () => {}),
    usdClassTransfer: vi.fn(async () => {}),
    setDexAbstraction: vi.fn(async () => {}),
    approveBuilderFee: vi.fn(async () => {}),
    maxBuilderFee: vi.fn(async () => 10),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
  };
}

describe("Routing+execution contract (deterministic)", () => {
  let provider: ReturnType<typeof createProvider>;
  let registry: MarketRegistry;
  let router: Router;
  let executor: Executor;
  let collateralManager: CollateralManager;

  beforeEach(async () => {
    provider = createProvider({
      "xyz:TSLA": TSLA_BOOK_DEEP,
      "flx:TSLA": TSLA_HIP3_BOOK,
      USDH: {
        coin: "USDH",
        time: Date.now(),
        levels: [
          [{ px: "1.00", sz: "100000", n: 1 }],
          [{ px: "1.00", sz: "100000", n: 1 }],
        ],
      },
    });
    const logger = createLogger({ level: "silent" });
    registry = new MarketRegistry(provider, logger);
    await registry.discover();
    const aggregator = new BookAggregator(provider, registry, logger);
    router = new Router(provider, registry, logger, aggregator);
    executor = new Executor(provider, logger, null);
    collateralManager = new CollateralManager(provider, logger);
  });

  it("quotes and executes a single-market order end-to-end", async () => {
    const quote = await router.quote("TSLA", "buy", 5, ["USDC"]);
    const receipt = await executor.execute(quote.plan, "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01");

    expect(quote.selectedMarket.coin).toBeTruthy();
    expect(receipt.success).toBe(true);
    expect(provider.placeOrder).toHaveBeenCalledTimes(1);
  });

  it("quotes and executes a split order end-to-end", async () => {
    const splitQuote = await router.quoteSplit("TSLA", "buy", 8, ["USDC"]);
    const receipt = await executor.executeSplit(
      splitQuote.splitPlan,
      collateralManager,
      "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01",
    );

    expect(splitQuote.allocations.length).toBeGreaterThan(0);
    expect(receipt.success).toBe(true);
    expect(provider.batchOrders).toHaveBeenCalledTimes(1);
  });
});
