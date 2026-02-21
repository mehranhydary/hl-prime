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
      withdrawable: "5000",
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
    userSetAbstraction: vi.fn(async () => {}),
    agentSetAbstraction: vi.fn(async () => {}),
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
    expect(plan.requirements.find((r) => r.token === "USDT0")?.swapFrom).toBe("USDC");
    expect(swapSpy).toHaveBeenCalledTimes(2);
  });

  it("prefers available non-USDC stable spot balance as swap source when sufficient", async () => {
    const provider = makeProvider({
      clearinghouseState: vi.fn(async () => ({
        marginSummary: { accountValue: "200", totalNtlPos: "0", totalRawUsd: "0", totalMarginUsed: "0" },
        crossMarginSummary: { accountValue: "0", totalNtlPos: "0", totalRawUsd: "0", totalMarginUsed: "0" },
        assetPositions: [],
        crossMaintenanceMarginUsed: "0",
        withdrawable: "200",
      })),
      spotClearinghouseState: vi.fn(async () => ({
        balances: [
          { coin: "USDH", hold: "0", total: "200", entryNtl: "200", token: 1 },
        ],
      })),
    });
    const manager = new CollateralManager(provider, createLogger({ level: "silent" }));
    const swapSpy = vi.spyOn(manager, "estimateSwapCost")
      .mockImplementation(async (_from, _to) => 10);

    const plan = await manager.estimateRequirements(
      [
        allocation({ ...TSLA_XYZ, collateral: "USDT0" }, 5, 10, 1), // need 50 USDT0
      ],
      "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01",
    );

    expect(plan.requirements).toHaveLength(1);
    expect(plan.requirements[0].shortfall).toBe(50);
    expect(plan.requirements[0].swapFrom).toBe("USDH");
    expect(swapSpy).toHaveBeenCalledWith("USDH", "USDT0", 50);
  });

  it("detects USDC collateral shortfall and plans USDH->USDC swap when spot USDH is available", async () => {
    const provider = makeProvider({
      clearinghouseState: vi.fn(async () => ({
        marginSummary: { accountValue: "5000", totalNtlPos: "0", totalRawUsd: "65", totalMarginUsed: "0" },
        crossMarginSummary: { accountValue: "0", totalNtlPos: "0", totalRawUsd: "0", totalMarginUsed: "0" },
        assetPositions: [],
        crossMaintenanceMarginUsed: "0",
        withdrawable: "65",
      })),
      spotClearinghouseState: vi.fn(async () => ({
        balances: [
          { coin: "USDH", hold: "0", total: "50", entryNtl: "50", token: 1 },
          { coin: "USDC", hold: "0", total: "0", entryNtl: "0", token: 0 },
        ],
      })),
    });
    const manager = new CollateralManager(provider, createLogger({ level: "silent" }));
    const swapSpy = vi.spyOn(manager, "estimateSwapCost")
      .mockImplementation(async (_from, _to) => 10);

    const plan = await manager.estimateRequirements(
      [
        allocation(TSLA_XYZ, 5, 10, 1), // need 50 USDC collateral
      ],
      "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01",
    );

    expect(plan.requirements).toHaveLength(1);
    expect(plan.requirements[0].token).toBe("USDC");
    expect(plan.requirements[0].currentBalance).toBe(15);
    expect(plan.requirements[0].shortfall).toBe(35);
    expect(plan.requirements[0].swapFrom).toBe("USDH");
    expect(swapSpy).toHaveBeenCalledWith("USDH", "USDC", 35);
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
    expect(provider.agentSetAbstraction).not.toHaveBeenCalled();
    expect(provider.userSetAbstraction).not.toHaveBeenCalled();
    expect(provider.setDexAbstraction).not.toHaveBeenCalled();
    expect(provider.usdClassTransfer).not.toHaveBeenCalled();
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

  it("does not mutate abstraction state during prepare()", async () => {
    const provider = makeProvider();
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

    expect(receipt.success).toBe(true);
    expect(provider.agentSetAbstraction).not.toHaveBeenCalled();
    expect(provider.userSetAbstraction).not.toHaveBeenCalled();
    expect(provider.setDexAbstraction).not.toHaveBeenCalled();
  });

  it("fails fast when swaps are needed in agent sessions", async () => {
    const provider = makeProvider({
      getSignerAddress: vi.fn().mockReturnValue("0x8988ee386c52f415452598a8c671f4876a17fce1"),
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
      "0x8c1938750caf4b1f9f97174a6228eae705148d5e",
    );

    expect(receipt.success).toBe(false);
    expect(receipt.error).toContain("master-wallet signing");
    expect(provider.usdClassTransfer).not.toHaveBeenCalled();
    expect(provider.placeOrder).not.toHaveBeenCalled();
  });
});
