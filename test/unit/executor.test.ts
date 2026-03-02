import { describe, it, expect, vi } from "vitest";
import { Executor } from "../../src/execution/executor.js";
import type { HLProvider } from "../../src/provider/provider.js";
import type { CollateralManager } from "../../src/collateral/manager.js";
import type { CollateralPlan } from "../../src/collateral/types.js";
import type { ExecutionPlan, SplitExecutionPlan } from "../../src/router/types.js";
import { TSLA_FLX, TSLA_XYZ } from "../fixtures/markets.js";
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
    it("applies leverage before placing an order when requested", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });
      const receipt = await executor.execute(
        makePlan({ leverage: 5, isCross: false }),
        USER,
      );

      expect(receipt.success).toBe(true);
      expect(provider.setLeverage).toHaveBeenCalledWith(TSLA_XYZ.assetIndex, 5, false);
      expect(provider.placeOrder).toHaveBeenCalledTimes(1);
    });

    it("falls back to isolated leverage for only-isolated assets", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });
      const receipt = await executor.execute(
        makePlan({
          market: { ...TSLA_XYZ, onlyIsolated: true },
          leverage: 5,
          isCross: true,
        }),
        USER,
      );

      expect(receipt.success).toBe(true);
      expect(provider.setLeverage).toHaveBeenCalledWith(TSLA_XYZ.assetIndex, 5, false);
    });

    it("clamps leverage to market maxLeverage as safety guard", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });
      // TSLA_XYZ has maxLeverage = 10, request 20x → should clamp to 10
      const receipt = await executor.execute(
        makePlan({ leverage: 20, isCross: true }),
        USER,
      );

      expect(receipt.success).toBe(true);
      expect(provider.setLeverage).toHaveBeenCalledWith(TSLA_XYZ.assetIndex, 10, true);
    });

    it("fails before order placement when leverage setup errors", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10),
        setLeverage: vi.fn().mockRejectedValue(new Error("invalid leverage")),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });
      const receipt = await executor.execute(
        makePlan({ leverage: 5, isCross: true }),
        USER,
      );

      expect(receipt.success).toBe(false);
      expect(receipt.error).toContain("invalid leverage");
      expect(provider.placeOrder).not.toHaveBeenCalled();
    });

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

    it("returns failed receipt for waitingForFill status", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10),
        placeOrder: vi.fn().mockResolvedValue({
          statuses: ["waitingForFill"],
        }),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });
      const receipt = await executor.execute(makePlan(), USER);

      expect(receipt.success).toBe(false);
      expect(receipt.error).toContain("waitingForFill");
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

    it("treats maxBuilderFee bps-unit responses as sufficient approval", async () => {
      const provider = makeProvider({
        // Some environments return this in bps (1 bps = 0.01%) rather than 0.1 bps.
        maxBuilderFee: vi.fn().mockResolvedValue(1),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });

      await executor.execute(makePlan(), USER);

      expect(provider.approveBuilderFee).not.toHaveBeenCalled();
      expect(provider.placeOrder).toHaveBeenCalledWith(
        expect.any(Object),
        { b: BUILDER_ADDR, f: 10 },
      );
    });

    it("places the order without builder when approval check fails", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockRejectedValue(new Error("maxBuilderFee unavailable")),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });

      await executor.execute(makePlan(), USER);

      expect(provider.placeOrder).toHaveBeenCalledWith(
        expect.any(Object),
        undefined,
      );
    });

    it("stops retrying builder approval when deposit is required", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockRejectedValue(
          new Error("Must deposit before performing actions. User: 0x123"),
        ),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });

      await executor.execute(makePlan(), USER);
      await executor.execute(makePlan(), USER);

      expect(provider.maxBuilderFee).toHaveBeenCalledTimes(1);
      expect(provider.placeOrder).toHaveBeenCalledTimes(2);
    });

    it("does not auto-approve builder fee in agent sessions", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(0),
        getSignerAddress: vi.fn().mockReturnValue("0x8988ee386c52f415452598a8c671f4876a17fce1"),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });

      await executor.execute(makePlan(), USER);
      await executor.execute(makePlan(), USER);

      expect(provider.approveBuilderFee).not.toHaveBeenCalled();
      // 1 initial check + 2 poll retries on first execute = 3; second execute skips (approvalChecked)
      expect(provider.maxBuilderFee).toHaveBeenCalledTimes(3);
      expect(provider.placeOrder).toHaveBeenCalledTimes(2);
    });

    it("re-checks builder approval after resetBuilderApprovalCheck()", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn()
          .mockResolvedValueOnce(0)   // first trade: initial check
          .mockResolvedValueOnce(0)   // first trade: poll 1
          .mockResolvedValueOnce(0)   // first trade: poll 2
          .mockResolvedValueOnce(10), // after reset: now approved
        getSignerAddress: vi.fn().mockReturnValue("0x8988ee386c52f415452598a8c671f4876a17fce1"),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });

      // First trade: not approved, caches result
      await executor.execute(makePlan(), USER);
      expect(provider.maxBuilderFee).toHaveBeenCalledTimes(3);

      // Reset after setup approves the fee
      executor.resetBuilderApprovalCheck();

      // Second trade: re-checks and finds approval
      await executor.execute(makePlan(), USER);
      expect(provider.maxBuilderFee).toHaveBeenCalledTimes(4);
      expect(provider.approveBuilderFee).not.toHaveBeenCalled();
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

    it("applies per-leg leverage once per unique market setting before split order", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });
      const collateralManager = makeCollateralManager();
      const legs = [
        makePlan({ leverage: 4, isCross: true }),
        makePlan({ leverage: 4, isCross: true }),
        makePlan({
          market: TSLA_FLX,
          leverage: 3,
          isCross: false,
        }),
      ];

      await executor.executeSplit(
        makeSplitPlan({
          legs,
          totalSize: "3",
        }),
        collateralManager,
        USER,
      );

      expect(provider.setLeverage).toHaveBeenCalledTimes(2);
      expect(provider.setLeverage).toHaveBeenNthCalledWith(1, TSLA_XYZ.assetIndex, 4, true);
      expect(provider.setLeverage).toHaveBeenNthCalledWith(2, TSLA_FLX.assetIndex, 3, false);
    });

    it("estimates collateral from leverage-adjusted margin (not full notional)", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10),
      });
      const estimateRequirements = vi.fn().mockResolvedValue({
        requirements: [],
        totalSwapCostBps: 0,
        swapsNeeded: false,
        abstractionEnabled: false,
      } satisfies CollateralPlan);
      const collateralManager = makeCollateralManager({
        estimateRequirements,
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });

      const leg = makePlan({
        market: TSLA_FLX,
        size: "13.625649",
        price: "73.3929",
        leverage: 20,
        isCross: false,
      });

      await executor.executeSplit(
        makeSplitPlan({
          legs: [leg],
          totalSize: leg.size,
        }),
        collateralManager,
        USER,
      );

      expect(estimateRequirements).toHaveBeenCalledTimes(1);
      const allocations = estimateRequirements.mock.calls[0][0] as Array<{ estimatedCost: number }>;
      const expectedMargin = parseFloat(leg.size) * parseFloat(leg.price) / 20;
      expect(allocations[0].estimatedCost).toBeCloseTo(expectedMargin, 6);
    });

    it("fails split execution when leverage setup fails", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10),
        setLeverage: vi.fn().mockRejectedValue(new Error("leverage rejected")),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });
      const collateralManager = makeCollateralManager();

      const receipt = await executor.executeSplit(
        makeSplitPlan({
          legs: [makePlan({ leverage: 100, isCross: true })],
        }),
        collateralManager,
        USER,
      );

      expect(receipt.success).toBe(false);
      expect(receipt.error).toContain("Leverage setup failed");
      expect(provider.batchOrders).not.toHaveBeenCalled();
      expect(collateralManager.estimateRequirements).not.toHaveBeenCalled();
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

    it("surfaces waiting statuses as leg errors in split execution", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10),
        batchOrders: vi.fn().mockResolvedValue({
          statuses: ["waitingForFill"],
        }),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });
      const collateralManager = makeCollateralManager();

      const receipt = await executor.executeSplit(makeSplitPlan(), collateralManager, USER);

      expect(receipt.success).toBe(false);
      expect(receipt.legs[0].success).toBe(false);
      expect(receipt.legs[0].error).toContain("waitingForFill");
    });

    it("handles all legs succeeding in a multi-leg split", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10),
        batchOrders: vi.fn().mockResolvedValue({
          statuses: [
            { filled: { oid: 1, totalSz: "3", avgPx: "431.50" } },
            { filled: { oid: 2, totalSz: "5", avgPx: "431.70" } },
          ],
        }),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });
      const collateralManager = makeCollateralManager();

      const receipt = await executor.executeSplit(
        makeSplitPlan({
          legs: [
            makePlan({ size: "3" }),
            makePlan({ market: TSLA_FLX, size: "5" }),
          ],
          totalSize: "8",
        }),
        collateralManager,
        USER,
      );

      expect(receipt.success).toBe(true);
      expect(receipt.legs).toHaveLength(2);
      expect(receipt.legs[0].success).toBe(true);
      expect(receipt.legs[1].success).toBe(true);
    });

    it("handles batchOrders throwing an error", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10),
        batchOrders: vi.fn().mockRejectedValue(new Error("network timeout")),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });
      const collateralManager = makeCollateralManager();

      const receipt = await executor.executeSplit(makeSplitPlan(), collateralManager, USER);
      expect(receipt.success).toBe(false);
      expect(receipt.error).toContain("network timeout");
    });

    it("returns resting status as success in split legs", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10),
        batchOrders: vi.fn().mockResolvedValue({
          statuses: [{ resting: { oid: 42 } }],
        }),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });
      const collateralManager = makeCollateralManager();

      const receipt = await executor.executeSplit(makeSplitPlan(), collateralManager, USER);
      expect(receipt.success).toBe(true);
      expect(receipt.legs[0].success).toBe(true);
    });
  });
});
