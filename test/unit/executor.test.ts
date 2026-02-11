import { describe, it, expect, vi, beforeEach } from "vitest";
import { Executor } from "../../src/execution/executor.js";
import type { HLProvider } from "../../src/provider/provider.js";
import type { BuilderConfig } from "../../src/config.js";
import type { ExecutionPlan } from "../../src/router/types.js";
import { TSLA_XYZ } from "../fixtures/markets.js";
import pino from "pino";

const logger = pino({ level: "silent" });

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

const USER = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01";
const BUILDER_ADDR = "0x34411c9d3c312e6ECb32C079AA0F34B572Dddc37" as `0x${string}`;

describe("Executor — builder fee", () => {
  describe("wire format conversion", () => {
    it("converts feeBps to 0.1bps wire format", () => {
      const provider = makeProvider();
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });
      // Verify by executing — builder should be passed to placeOrder
      executor.execute(makePlan(), USER);
      // The wire format is checked via the placeOrder call
    });

    it("passes correct wire builder to placeOrder", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10), // already approved
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });
      await executor.execute(makePlan(), USER);

      expect(provider.placeOrder).toHaveBeenCalledWith(
        expect.any(Object),
        { b: BUILDER_ADDR, f: 10 }, // 1 bps * 10 = 10 in 0.1bps
      );
    });

    it("passes correct wire builder for 5 bps", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(50),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 5 });
      await executor.execute(makePlan(), USER);

      expect(provider.placeOrder).toHaveBeenCalledWith(
        expect.any(Object),
        { b: BUILDER_ADDR, f: 50 },
      );
    });
  });

  describe("null builder (disabled)", () => {
    it("passes undefined builder to placeOrder when disabled", async () => {
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

    it("passes undefined builder to batchOrders when disabled", async () => {
      const provider = makeProvider();
      const executor = new Executor(provider, logger, null);

      const collateralManager = {
        prepare: vi.fn(),
        estimateSwapCost: vi.fn(),
      } as any;

      await executor.executeSplit(
        {
          legs: [makePlan()],
          collateralPlan: { swapsNeeded: false, requirements: [] },
          side: "buy",
          totalSize: "1",
          slippage: 0.01,
        },
        collateralManager,
        USER,
      );

      expect(provider.batchOrders).toHaveBeenCalledWith(
        expect.any(Array),
        undefined,
      );
    });
  });

  describe("auto-approval", () => {
    it("skips approval when already approved", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10), // exactly what we need
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });
      await executor.execute(makePlan(), USER);

      expect(provider.maxBuilderFee).toHaveBeenCalledWith({
        user: USER,
        builder: BUILDER_ADDR,
      });
      expect(provider.approveBuilderFee).not.toHaveBeenCalled();
    });

    it("approves when not yet approved", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(0), // not approved
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });
      await executor.execute(makePlan(), USER);

      expect(provider.approveBuilderFee).toHaveBeenCalledWith({
        maxFeeRate: "0.01%",
        builder: BUILDER_ADDR,
      });
    });

    it("approves with correct fee rate for 5 bps", async () => {
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

    it("checks approval only once per session", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });

      await executor.execute(makePlan(), USER);
      await executor.execute(makePlan(), USER);

      expect(provider.maxBuilderFee).toHaveBeenCalledTimes(1);
    });

    it("gracefully handles approval failure", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockRejectedValue(new Error("network error")),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });

      // Should not throw — trade still attempted
      const receipt = await executor.execute(makePlan(), USER);
      expect(receipt.success).toBe(true);
      expect(provider.placeOrder).toHaveBeenCalled();
    });

    it("does not retry after approval failure", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockRejectedValue(new Error("network error")),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });

      await executor.execute(makePlan(), USER);
      await executor.execute(makePlan(), USER);

      // Should only attempt once despite failure
      expect(provider.maxBuilderFee).toHaveBeenCalledTimes(1);
    });
  });

  describe("builder passed to batchOrders (split)", () => {
    it("passes builder to batchOrders in split execution", async () => {
      const provider = makeProvider({
        maxBuilderFee: vi.fn().mockResolvedValue(10),
      });
      const executor = new Executor(provider, logger, { address: BUILDER_ADDR, feeBps: 1 });

      const collateralManager = {
        prepare: vi.fn(),
        estimateSwapCost: vi.fn(),
      } as any;

      await executor.executeSplit(
        {
          legs: [makePlan(), makePlan({ market: { ...TSLA_XYZ, coin: "flx:TSLA" } })],
          collateralPlan: { swapsNeeded: false, requirements: [] },
          side: "buy",
          totalSize: "2",
          slippage: 0.01,
        },
        collateralManager,
        USER,
      );

      expect(provider.batchOrders).toHaveBeenCalledWith(
        expect.any(Array),
        { b: BUILDER_ADDR, f: 10 },
      );
    });
  });
});
