import { describe, it, expect, vi } from "vitest";
import { Executor } from "../../src/execution/executor.js";
import type { HLProvider } from "../../src/provider/provider.js";
import type { CollateralManager } from "../../src/collateral/manager.js";
import type { CollateralPlan } from "../../src/collateral/types.js";
import type { ExecutionPlan, SplitExecutionPlan } from "../../src/router/types.js";
import { TSLA_XYZ } from "../fixtures/markets.js";
import pino from "pino";

const logger = pino({ level: "silent" });
const USER = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01";
const BUILDER_ADDR = "0x34411c9d3c312e6ECb32C079AA0F34B572Dddc37" as `0x${string}`;

function makePlan(overrides: Partial<ExecutionPlan> = {}): ExecutionPlan {
  return {
    market: TSLA_XYZ,
    side: "buy",
    size: "1",
    price: "431.50",
    orderType: { limit: { tif: "Ioc" } },
    slippage: 0.01,
    ...overrides,
  };
}

function makeSplitPlan(overrides: Partial<SplitExecutionPlan> = {}): SplitExecutionPlan {
  return {
    legs: [makePlan()],
    collateralPlan: {
      requirements: [],
      totalSwapCostBps: 0,
      swapsNeeded: false,
      abstractionEnabled: false,
    },
    side: "buy",
    totalSize: "1",
    slippage: 0.01,
    ...overrides,
  };
}

function makeProvider(overrides: Partial<HLProvider> = {}): HLProvider {
  return {
    meta: vi.fn(),
    metaAndAssetCtxs: vi.fn(),
    perpDexs: vi.fn(),
    allPerpMetas: vi.fn(),
    spotMeta: vi.fn(),
    allMids: vi.fn(),
    l2Book: vi.fn(),
    clearinghouseState: vi.fn(),
    spotClearinghouseState: vi.fn(),
    openOrders: vi.fn(),
    userFills: vi.fn(),
    fundingHistory: vi.fn(),
    subscribeL2Book: vi.fn(),
    subscribeAllMids: vi.fn(),
    subscribeTrades: vi.fn(),
    subscribeUserEvents: vi.fn(),
    placeOrder: vi.fn().mockResolvedValue({
      statuses: [{ filled: { oid: 1, totalSz: "1", avgPx: "431.50" } }],
    }),
    cancelOrder: vi.fn(),
    batchOrders: vi.fn().mockResolvedValue({
      statuses: [{ filled: { oid: 1, totalSz: "1", avgPx: "431.50" } }],
    }),
    setLeverage: vi.fn(),
    usdClassTransfer: vi.fn(),
    setDexAbstraction: vi.fn(),
    approveBuilderFee: vi.fn().mockResolvedValue(undefined),
    maxBuilderFee: vi.fn().mockResolvedValue(0),
    connect: vi.fn(),
    disconnect: vi.fn(),
    ...overrides,
  };
}

function makeCollateralManager(
  overrides: Partial<CollateralManager> = {},
): CollateralManager {
  const defaultPlan: CollateralPlan = {
    requirements: [],
    totalSwapCostBps: 0,
    swapsNeeded: false,
    abstractionEnabled: false,
  };
  return {
    estimateRequirements: vi.fn().mockResolvedValue(defaultPlan),
    prepare: vi.fn().mockResolvedValue({
      success: true,
      swapsExecuted: [],
      abstractionWasEnabled: false,
    }),
    estimateSwapCost: vi.fn(),
    ...overrides,
  } as unknown as CollateralManager;
}

describe("Executor", () => {
  describe("builder fee wiring", () => {
    it("passes the 0.1bps wire builder object to placeOrder", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10), // already approved
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });
      await executor.execute(makePlan(), USER);

      expect(provider.placeOrder).toHaveBeenCalledWith(
        expect.any(Object),
        { b: BUILDER_ADDR, f: 10 },
      );
    });

    it("uses undefined builder when disabled", async () => {
      const provider = makeProvider();
      const executor = new Executor(provider, logger, null);
      await executor.execute(makePlan(), USER);

      expect(provider.placeOrder).toHaveBeenCalledWith(
        expect.any(Object),
        undefined,
      );
      expect(provider.maxBuilderFee).not.toHaveBeenCalled();
      expect(provider.approveBuilderFee).not.toHaveBeenCalled();
    });
  });

  describe("single-order execution behavior", () => {
    it("returns rejected receipt on order status error", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10),
        placeOrder: vi.fn().mockResolvedValue({
          statuses: [{ error: "invalid order" }],
        }),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });
      const receipt = await executor.execute(makePlan(), USER);

      expect(receipt.success).toBe(false);
      expect(receipt.error).toContain("invalid order");
    });

    it("treats resting status as successful submission", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10),
        placeOrder: vi.fn().mockResolvedValue({
          statuses: [{ resting: { oid: 77 } }],
        }),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });
      const receipt = await executor.execute(makePlan(), USER);

      expect(receipt.success).toBe(true);
      expect(receipt.filledSize).toBe("0");
      expect(receipt.orderId).toBe(77);
    });

    it("returns failed receipt when placeOrder throws", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10),
        placeOrder: vi.fn().mockRejectedValue(new Error("rpc timeout")),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });
      const receipt = await executor.execute(makePlan(), USER);

      expect(receipt.success).toBe(false);
      expect(receipt.error).toContain("rpc timeout");
    });
  });

  describe("builder approval behavior", () => {
    it("checks builder approval once per session", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });

      await executor.execute(makePlan(), USER);
      await executor.execute(makePlan(), USER);

      expect(provider.maxBuilderFee).toHaveBeenCalledTimes(1);
    });

    it("approves builder fee when current approval is insufficient", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(0),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 5 });

      await executor.execute(makePlan(), USER);

      expect(provider.approveBuilderFee).toHaveBeenCalledWith({
        maxFeeRate: "0.05%",
        builder: BUILDER_ADDR,
      });
    });
  });

  describe("split execution behavior", () => {
    it("passes builder to batchOrders in split execution", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });
      const collateralManager = makeCollateralManager();

      await executor.executeSplit(
        makeSplitPlan({
          legs: [makePlan(), makePlan({ market: { ...TSLA_XYZ, coin: "flx:TSLA" } })],
          totalSize: "2",
        }),
        collateralManager,
        USER,
      );

      expect(provider.batchOrders).toHaveBeenCalledWith(
        expect.any(Array),
        { b: BUILDER_ADDR, f: 10 },
      );
    });

    it("estimates collateral at execution time even when quote plan says no swaps", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });
      const collateralManager = makeCollateralManager();

      await executor.executeSplit(makeSplitPlan(), collateralManager, USER);

      expect(collateralManager.estimateRequirements).toHaveBeenCalledTimes(1);
      expect(provider.batchOrders).toHaveBeenCalledTimes(1);
    });

    it("fails fast when collateral preparation fails", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });
      const collateralManager = makeCollateralManager({
        estimateRequirements: vi.fn().mockResolvedValue({
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
          abstractionEnabled: false,
        }),
        prepare: vi.fn().mockResolvedValue({
          success: false,
          swapsExecuted: [],
          abstractionWasEnabled: true,
          error: "no spot liquidity",
        }),
      });

      const receipt = await executor.executeSplit(makeSplitPlan(), collateralManager, USER);
      expect(receipt.success).toBe(false);
      expect(receipt.error).toContain("Collateral preparation failed");
      expect(provider.batchOrders).not.toHaveBeenCalled();
    });

    it("marks split as unsuccessful when any leg errors", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10),
        batchOrders: vi.fn().mockResolvedValue({
          statuses: [
            { filled: { oid: 1, totalSz: "1", avgPx: "431.50" } },
            { error: "post only reject" },
          ],
        }),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });
      const collateralManager = makeCollateralManager();

      const receipt = await executor.executeSplit(
        makeSplitPlan({
          legs: [makePlan(), makePlan({ market: { ...TSLA_XYZ, coin: "flx:TSLA" } })],
          totalSize: "2",
        }),
        collateralManager,
        USER,
      );

      expect(receipt.success).toBe(false);
      expect(receipt.legs).toHaveLength(2);
      expect(receipt.legs[0].success).toBe(true);
      expect(receipt.legs[1].success).toBe(false);
      expect(receipt.legs[1].error).toContain("post only reject");
    });
  });
});
