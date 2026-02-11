import { describe, it, expect, vi } from "vitest";
import { CollateralManager } from "../../src/collateral/manager.js";
import type { HLProvider } from "../../src/provider/provider.js";
import type { SplitAllocation } from "../../src/router/types.js";
import { createLogger } from "../../src/logging/logger.js";
import { TSLA_FLX, TSLA_XYZ } from "../fixtures/markets.js";

function makeProvider(overrides: Partial<HLProvider> = {}): HLProvider {
  return {
    meta: vi.fn(),
    metaAndAssetCtxs: vi.fn(),
    perpDexs: vi.fn(),
    allPerpMetas: vi.fn(),
    spotMeta: vi.fn(async () => ({
      tokens: [
        { name: "USDC", index: 0, szDecimals: 8, weiDecimals: 8, tokenId: "0x0", isCanonical: true },
        { name: "USDH", index: 1, szDecimals: 8, weiDecimals: 8, tokenId: "0x1", isCanonical: true },
        { name: "USDT0", index: 2, szDecimals: 8, weiDecimals: 8, tokenId: "0x2", isCanonical: true },
      ],
      universe: [
        { name: "USDC/USDH", tokens: [0, 1], index: 10, isCanonical: true },
        { name: "USDC/USDT0", tokens: [0, 2], index: 11, isCanonical: true },
      ],
    })),
    allMids: vi.fn(),
    l2Book: vi.fn(async (coin: string) => ({
      coin,
      time: Date.now(),
      levels: [
        [{ px: "0.999", sz: "1000", n: 1 }],
        [{ px: "1.001", sz: "1000", n: 1 }],
      ],
    })),
    clearinghouseState: vi.fn(async () => ({
      marginSummary: { accountValue: "5000", totalNtlPos: "0", totalRawUsd: "0", totalMarginUsed: "0" },
      crossMarginSummary: { accountValue: "0", totalNtlPos: "0", totalRawUsd: "0", totalMarginUsed: "0" },
      assetPositions: [],
      crossMaintenanceMarginUsed: "0",
    })),
    spotClearinghouseState: vi.fn(async () => ({
      balances: [
        { coin: "USDH", hold: "0", total: "20", entryNtl: "20", token: 1 },
      ],
    })),
    openOrders: vi.fn(),
    userFills: vi.fn(),
    fundingHistory: vi.fn(),
    subscribeL2Book: vi.fn(),
    subscribeAllMids: vi.fn(),
    subscribeTrades: vi.fn(),
    subscribeUserEvents: vi.fn(),
    placeOrder: vi.fn(async () => ({
      statuses: [{ filled: { oid: 1, totalSz: "50", avgPx: "1.001" } }],
    })),
    cancelOrder: vi.fn(),
    batchOrders: vi.fn(),
    setLeverage: vi.fn(),
    usdClassTransfer: vi.fn(async () => {}),
    setDexAbstraction: vi.fn(async () => {}),
    approveBuilderFee: vi.fn(),
    maxBuilderFee: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    ...overrides,
  } as unknown as HLProvider;
}

function allocation(
  market = TSLA_FLX,
  size = 10,
  avg = 100,
  proportion = 1,
): SplitAllocation {
  return {
    market,
    size,
    estimatedCost: size * avg,
    estimatedAvgPrice: avg,
    proportion,
  };
}

describe("CollateralManager", () => {
  it("estimates token shortfalls and swap costs", async () => {
    const provider = makeProvider();
    const manager = new CollateralManager(provider, createLogger({ level: "silent" }));
    const swapSpy = vi.spyOn(manager, "estimateSwapCost")
      .mockImplementation(async (_from, to) => to === "USDH" ? 12 : 34);

    const plan = await manager.estimateRequirements(
      [
        allocation(TSLA_FLX, 10, 10, 0.5), // USDH, need 100
        allocation({ ...TSLA_XYZ, collateral: "USDT0" }, 5, 10, 0.5), // USDT0, need 50
      ],
      "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01",
    );

    expect(plan.swapsNeeded).toBe(true);
    expect(plan.requirements.find((r) => r.token === "USDH")?.shortfall).toBe(80);
    expect(plan.requirements.find((r) => r.token === "USDT0")?.shortfall).toBe(50);
    expect(swapSpy).toHaveBeenCalledTimes(2);
  });

  it("returns conservative defaults when swap book is unavailable", async () => {
    const provider = makeProvider({
      l2Book: vi.fn(async () => ({
        coin: "USDH",
        time: Date.now(),
        levels: [[], []],
      })),
    });
    const manager = new CollateralManager(provider, createLogger({ level: "silent" }));

    const bps = await manager.estimateSwapCost("USDC", "USDH", 100);
    expect(bps).toBe(50);
  });

  it("returns 100bps when spot book depth is insufficient", async () => {
    const provider = makeProvider({
      l2Book: vi.fn(async () => ({
        coin: "USDH",
        time: Date.now(),
        levels: [
          [{ px: "1.0", sz: "1", n: 1 }],
          [{ px: "1.01", sz: "1", n: 1 }],
        ],
      })),
    });
    const manager = new CollateralManager(provider, createLogger({ level: "silent" }));

    const bps = await manager.estimateSwapCost("USDC", "USDH", 100);
    expect(bps).toBe(100);
  });

  it("preloads spot metadata once in prepare() across multiple requirements", async () => {
    const provider = makeProvider();
    const manager = new CollateralManager(provider, createLogger({ level: "silent" }));

    const receipt = await manager.prepare(
      {
        requirements: [
          {
            token: "USDH",
            amountNeeded: 100,
            currentBalance: 0,
            shortfall: 100,
            swapFrom: "USDC",
            estimatedSwapCostBps: 12,
          },
          {
            token: "USDT0",
            amountNeeded: 80,
            currentBalance: 0,
            shortfall: 80,
            swapFrom: "USDC",
            estimatedSwapCostBps: 20,
          },
        ],
        totalSwapCostBps: 16,
        swapsNeeded: true,
        abstractionEnabled: false,
      },
      "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01",
    );

    expect(receipt.success).toBe(true);
    expect(provider.spotMeta).toHaveBeenCalledTimes(1);
    expect(provider.usdClassTransfer).toHaveBeenCalledTimes(2);
    expect(provider.placeOrder).toHaveBeenCalledTimes(2);
  });

  it("fails prepare() when there is no spot liquidity for a token", async () => {
    const provider = makeProvider({
      l2Book: vi.fn(async (coin: string) => ({
        coin,
        time: Date.now(),
        levels: [[], []],
      })),
    });
    const manager = new CollateralManager(provider, createLogger({ level: "silent" }));

    const receipt = await manager.prepare(
      {
        requirements: [{
          token: "USDH",
          amountNeeded: 100,
          currentBalance: 0,
          shortfall: 100,
          swapFrom: "USDC",
          estimatedSwapCostBps: 50,
        }],
        totalSwapCostBps: 50,
        swapsNeeded: true,
        abstractionEnabled: true,
      },
      "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01",
    );

    expect(receipt.success).toBe(false);
    expect(receipt.error).toContain("No spot liquidity");
  });

  it("returns failed receipt when provider throws in prepare()", async () => {
    const provider = makeProvider({
      setDexAbstraction: vi.fn(async () => {
        throw new Error("rpc unavailable");
      }),
    });
    const manager = new CollateralManager(provider, createLogger({ level: "silent" }));

    const receipt = await manager.prepare(
      {
        requirements: [],
        totalSwapCostBps: 0,
        swapsNeeded: false,
        abstractionEnabled: false,
      },
      "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01",
    );

    expect(receipt.success).toBe(false);
    expect(receipt.error).toContain("rpc unavailable");
  });
});
