import { describe, it, expect, vi } from "vitest";
import { Router } from "../../src/router/router.js";
import { BookAggregator } from "../../src/market/aggregator.js";
import { MarketRegistry } from "../../src/market/registry.js";
import { createLogger } from "../../src/logging/logger.js";
import type { HLProvider } from "../../src/provider/provider.js";
import type { L2Book } from "../../src/provider/types.js";
import { TSLA_BOOK_DEEP, TSLA_HIP3_BOOK } from "../fixtures/books.js";
import { MarketDataUnavailableError } from "../../src/utils/errors.js";

interface MockDex {
  name: string | null;
  universe: { name: string; szDecimals: number; maxLeverage: number }[];
  collateralToken: number;
}

function createMockProvider(
  books: Record<string, L2Book>,
  dexes?: MockDex[],
  throwCoins: Set<string> = new Set(),
): HLProvider & { l2Book: ReturnType<typeof vi.fn> } {
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

  const l2Book = vi.fn(async (coin: string) => {
    if (throwCoins.has(coin)) {
      throw new Error(`book unavailable for ${coin}`);
    }
    return books[coin] ?? { coin, time: Date.now(), levels: [[], []] };
  });

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
    meta: vi.fn(async () => ({ universe: defaultDexes[0]?.universe ?? [], collateralToken: 0 })),
    metaAndAssetCtxs: vi.fn(async (dex?: string) => {
      const target = dex === "" || dex === undefined
        ? defaultDexes.find((d) => d.name === null)
        : defaultDexes.find((d) => d.name === dex);
      const universe = target?.universe ?? [];
      const meta = { universe, collateralToken: target?.collateralToken ?? 0 };
      const ctxs = universe.map((a) => (ctxMap[a.name] ?? ctxMap["xyz:TSLA"])());
      return [meta, ctxs] as Awaited<ReturnType<HLProvider["metaAndAssetCtxs"]>>;
    }),
    perpDexs: vi.fn(async () => defaultDexes.map((d) =>
      d.name === null ? null : { name: d.name, deployer: "0x0000000000000000000000000000000000000000" },
    )),
    allPerpMetas: vi.fn(async () => defaultDexes.map((d) => ({
      universe: d.universe,
      collateralToken: d.collateralToken,
    }))),
    spotMeta: vi.fn(async () => ({
      tokens: [
        { name: "USDC", index: 0, szDecimals: 8, weiDecimals: 8, tokenId: "0x0", isCanonical: true },
        { name: "USDH", index: 1, szDecimals: 8, weiDecimals: 8, tokenId: "0x1", isCanonical: true },
      ],
      universe: [],
    })),
    allMids: vi.fn(async () => ({})),
    l2Book,
    clearinghouseState: vi.fn(async () => ({
      marginSummary: { accountValue: "0", totalNtlPos: "0", totalRawUsd: "0", totalMarginUsed: "0" },
      crossMarginSummary: { accountValue: "0", totalNtlPos: "0", totalRawUsd: "0", totalMarginUsed: "0" },
      assetPositions: [],
      crossMaintenanceMarginUsed: "0",
    })),
    spotClearinghouseState: vi.fn(async () => ({ balances: [] })),
    openOrders: vi.fn(async () => []),
    userFills: vi.fn(async () => []),
    fundingHistory: vi.fn(async () => []),
    subscribeL2Book: vi.fn(async () => async () => {}),
    subscribeAllMids: vi.fn(async () => async () => {}),
    subscribeTrades: vi.fn(async () => async () => {}),
    subscribeUserEvents: vi.fn(async () => async () => {}),
    placeOrder: vi.fn(async () => ({ statuses: [] })),
    cancelOrder: vi.fn(async () => ({ statuses: [] })),
    batchOrders: vi.fn(async () => ({ statuses: [] })),
    setLeverage: vi.fn(async () => {}),
    usdClassTransfer: vi.fn(async () => {}),
    setDexAbstraction: vi.fn(async () => {}),
    approveBuilderFee: vi.fn(async () => {}),
    maxBuilderFee: vi.fn(async () => 0),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
  };
}

async function createRouter(provider: HLProvider): Promise<{
  router: Router;
  registry: MarketRegistry;
}> {
  const logger = createLogger({ level: "silent" });
  const registry = new MarketRegistry(provider, logger);
  await registry.discover();
  const aggregator = new BookAggregator(provider, registry, logger);
  const router = new Router(provider, registry, logger, aggregator);
  return { router, registry };
}

describe("Router", () => {
  it("selects a best market for quote", async () => {
    const provider = createMockProvider({
      "xyz:TSLA": TSLA_BOOK_DEEP,
      "flx:TSLA": TSLA_HIP3_BOOK,
    });
    const { router } = await createRouter(provider);

    const quote = await router.quote("TSLA", "buy", 8, ["USDC"]);
    expect(quote.selectedMarket.coin).toBe("xyz:TSLA");
    expect(quote.warnings).toBeUndefined();
  });

  it("degrades quote when a market book fails", async () => {
    const provider = createMockProvider(
      {
        "xyz:TSLA": TSLA_BOOK_DEEP,
        "flx:TSLA": TSLA_HIP3_BOOK,
      },
      undefined,
      new Set(["flx:TSLA"]),
    );
    const { router } = await createRouter(provider);

    const quote = await router.quote("TSLA", "buy", 3, ["USDC"]);
    expect(quote.selectedMarket.coin).toBe("xyz:TSLA");
    expect(quote.warnings?.[0]).toContain("Partial market data");
  });

  it("throws MarketDataUnavailableError when all market books fail", async () => {
    const provider = createMockProvider(
      {
        "xyz:TSLA": TSLA_BOOK_DEEP,
        "flx:TSLA": TSLA_HIP3_BOOK,
      },
      undefined,
      new Set(["xyz:TSLA", "flx:TSLA"]),
    );
    const { router } = await createRouter(provider);

    await expect(router.quote("TSLA", "buy", 3, ["USDC"]))
      .rejects
      .toBeInstanceOf(MarketDataUnavailableError);
  });

  it("reuses aggregated books in split quotes without duplicate l2Book calls", async () => {
    const provider = createMockProvider({
      "xyz:TSLA": TSLA_BOOK_DEEP,
      "flx:TSLA": TSLA_HIP3_BOOK,
    });
    const { router } = await createRouter(provider);

    const splitQuote = await router.quoteSplit("TSLA", "buy", 8, ["USDC"]);
    expect(splitQuote.allocations.length).toBeGreaterThan(0);
    expect(splitQuote.warnings?.some((w) => w.includes("Collateral requirements"))).toBe(true);
    expect(provider.l2Book).toHaveBeenCalledTimes(2);
  });
});
