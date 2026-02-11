import { describe, it, expect } from "vitest";
import { MarketRegistry } from "../../src/market/registry.js";
import type { HLProvider } from "../../src/provider/provider.js";
import { createLogger } from "../../src/logging/logger.js";

interface MockDex {
  name: string | null; // null = native
  universe: { name: string; szDecimals: number; maxLeverage: number; isDelisted?: boolean }[];
  collateralToken: number;
}

function createMockProvider(dexes: MockDex[]): HLProvider {
  const ctxFactory = () => ({
    funding: "0.0001",
    openInterest: "50000",
    prevDayPx: "3100.00",
    dayNtlVlm: "1000000",
    oraclePx: "3200.00",
    markPx: "3200.25",
  });

  return {
    meta: async () => ({ universe: dexes[0]?.universe ?? [], collateralToken: dexes[0]?.collateralToken ?? 0 }),
    metaAndAssetCtxs: async (dex?: string) => {
      const target = dex === "" || dex === undefined
        ? dexes.find((d) => d.name === null)
        : dexes.find((d) => d.name === dex);
      const universe = target?.universe ?? [];
      const meta = { universe, collateralToken: target?.collateralToken ?? 0 };
      const ctxs = universe.map(ctxFactory);
      return [meta, ctxs] as [typeof meta, typeof ctxs];
    },
    perpDexs: async () => dexes.map((d) =>
      d.name === null ? null : { name: d.name, deployer: "0x0000000000000000000000000000000000000000" },
    ),
    allPerpMetas: async () => dexes.map((d) => ({
      universe: d.universe,
      collateralToken: d.collateralToken,
    })),
    spotMeta: async () => ({
      tokens: [
        { name: "USDC", index: 0, szDecimals: 8, weiDecimals: 8, tokenId: "0x0", isCanonical: true },
        { name: "USDT", index: 1, szDecimals: 8, weiDecimals: 8, tokenId: "0x1", isCanonical: true },
      ],
      universe: [],
    }),
    allMids: async () => ({}),
    l2Book: async () => ({ coin: "", time: 0, levels: [[], []] }),
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

describe("MarketRegistry", () => {
  const logger = createLogger({ level: "silent" });

  it("discovers native perp markets", async () => {
    const provider = createMockProvider([
      {
        name: null,
        universe: [
          { name: "BTC", szDecimals: 4, maxLeverage: 50 },
          { name: "ETH", szDecimals: 4, maxLeverage: 50 },
        ],
        collateralToken: 0,
      },
    ]);

    const registry = new MarketRegistry(provider, logger);
    await registry.discover();

    const btc = registry.getMarkets("BTC");
    expect(btc).toHaveLength(1);
    expect(btc[0].coin).toBe("BTC");
    expect(btc[0].isNative).toBe(true);
    expect(btc[0].dexName).toBe("__native__");
    expect(btc[0].collateral).toBe("USDC");
    expect(btc[0].assetIndex).toBe(0);

    const eth = registry.getMarkets("ETH");
    expect(eth).toHaveLength(1);
    expect(eth[0].assetIndex).toBe(1);
  });

  it("discovers HIP-3 markets and groups them with native", async () => {
    const provider = createMockProvider([
      {
        name: null,
        universe: [{ name: "ETH", szDecimals: 4, maxLeverage: 50 }],
        collateralToken: 0,
      },
      {
        name: "xyz",
        universe: [{ name: "xyz:ETH100", szDecimals: 4, maxLeverage: 20 }],
        collateralToken: 0,
      },
      {
        name: "abc",
        universe: [{ name: "abc:ETH50", szDecimals: 4, maxLeverage: 20 }],
        collateralToken: 1,
      },
    ]);

    const registry = new MarketRegistry(provider, logger);
    await registry.discover();

    const ethMarkets = registry.getMarkets("ETH");
    expect(ethMarkets).toHaveLength(3);

    const group = registry.getGroup("ETH")!;
    expect(group.hasAlternatives).toBe(true);

    // Check HIP-3 parsing
    const hip3 = ethMarkets.find((m) => m.coin === "xyz:ETH100")!;
    expect(hip3.isNative).toBe(false);
    expect(hip3.dexName).toBe("xyz");
    expect(hip3.baseAsset).toBe("ETH");
    expect(hip3.collateral).toBe("USDC");

    // Check collateral resolution for different deployer
    const abc = ethMarkets.find((m) => m.coin === "abc:ETH50")!;
    expect(abc.collateral).toBe("USDT");
  });

  it("returns empty for unknown assets", async () => {
    const provider = createMockProvider([
      {
        name: null,
        universe: [{ name: "BTC", szDecimals: 4, maxLeverage: 50 }],
        collateralToken: 0,
      },
    ]);

    const registry = new MarketRegistry(provider, logger);
    await registry.discover();

    expect(registry.getMarkets("XYZ")).toHaveLength(0);
    expect(registry.getGroup("XYZ")).toBeUndefined();
  });

  it("identifies groups with alternatives", async () => {
    const provider = createMockProvider([
      {
        name: null,
        universe: [
          { name: "BTC", szDecimals: 4, maxLeverage: 50 },
          { name: "ETH", szDecimals: 4, maxLeverage: 50 },
        ],
        collateralToken: 0,
      },
      {
        name: "xyz",
        universe: [{ name: "xyz:ETH100", szDecimals: 4, maxLeverage: 20 }],
        collateralToken: 0,
      },
    ]);

    const registry = new MarketRegistry(provider, logger);
    await registry.discover();

    const withAlts = registry.getGroupsWithAlternatives();
    expect(withAlts).toHaveLength(1);
    expect(withAlts[0].baseAsset).toBe("ETH");
  });

  it("is case-insensitive for lookups", async () => {
    const provider = createMockProvider([
      {
        name: null,
        universe: [{ name: "ETH", szDecimals: 4, maxLeverage: 50 }],
        collateralToken: 0,
      },
    ]);

    const registry = new MarketRegistry(provider, logger);
    await registry.discover();

    expect(registry.getMarkets("eth")).toHaveLength(1);
    expect(registry.getMarkets("Eth")).toHaveLength(1);
    expect(registry.getMarkets("ETH")).toHaveLength(1);
  });

  it("skips delisted markets", async () => {
    const provider = createMockProvider([
      {
        name: "xyz",
        universe: [
          { name: "xyz:TSLA", szDecimals: 3, maxLeverage: 10 },
          { name: "xyz:GME", szDecimals: 2, maxLeverage: 10, isDelisted: true },
        ],
        collateralToken: 0,
      },
    ]);

    const registry = new MarketRegistry(provider, logger);
    await registry.discover();

    expect(registry.getMarkets("TSLA")).toHaveLength(1);
    expect(registry.getMarkets("GME")).toHaveLength(0);
  });

  it("handles HIP-3 names without trailing digits", async () => {
    const provider = createMockProvider([
      {
        name: "xyz",
        universe: [
          { name: "xyz:TSLA", szDecimals: 3, maxLeverage: 10 },
          { name: "xyz:EUR", szDecimals: 2, maxLeverage: 50 },
          { name: "xyz:GOLD", szDecimals: 4, maxLeverage: 20 },
        ],
        collateralToken: 0,
      },
    ]);

    const registry = new MarketRegistry(provider, logger);
    await registry.discover();

    expect(registry.getMarkets("TSLA")).toHaveLength(1);
    expect(registry.getMarkets("EUR")).toHaveLength(1);
    expect(registry.getMarkets("GOLD")).toHaveLength(1);
  });

  it("discovers TSLA across multiple deployers with different collateral", async () => {
    const provider = createMockProvider([
      {
        name: null,
        universe: [{ name: "BTC", szDecimals: 4, maxLeverage: 50 }],
        collateralToken: 0,
      },
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
      {
        name: "cash",
        universe: [{ name: "cash:TSLA", szDecimals: 3, maxLeverage: 20 }],
        collateralToken: 1,
      },
    ]);

    const registry = new MarketRegistry(provider, logger);
    await registry.discover();

    const tsla = registry.getMarkets("TSLA");
    expect(tsla).toHaveLength(3);

    const group = registry.getGroup("TSLA")!;
    expect(group.hasAlternatives).toBe(true);

    const xyz = tsla.find((m) => m.coin === "xyz:TSLA")!;
    expect(xyz.dexName).toBe("xyz");
    expect(xyz.collateral).toBe("USDC");

    const flx = tsla.find((m) => m.coin === "flx:TSLA")!;
    expect(flx.dexName).toBe("flx");
    expect(flx.collateral).toBe("USDT");

    const cash = tsla.find((m) => m.coin === "cash:TSLA")!;
    expect(cash.dexName).toBe("cash");
    expect(cash.collateral).toBe("USDT");
  });

  it("is idempotent across repeated discover() calls", async () => {
    const provider = createMockProvider([
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
    ]);

    const registry = new MarketRegistry(provider, logger);
    await registry.discover();
    await registry.discover();

    expect(registry.getMarkets("TSLA")).toHaveLength(2);
  });
});
