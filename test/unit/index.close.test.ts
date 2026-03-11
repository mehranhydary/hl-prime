import { describe, expect, it, vi } from "vitest";
import { HyperliquidPrime } from "../../src/index.js";
import type { ExecutionReceipt } from "../../src/execution/types.js";
import type { PerpMarket } from "../../src/market/types.js";
import type { LogicalPosition } from "../../src/position/types.js";
import type { ExecutionPlan } from "../../src/router/types.js";
import { TSLA_CASH, TSLA_XYZ } from "../fixtures/markets.js";

function makePosition(market: PerpMarket): LogicalPosition {
  return {
    baseAsset: market.baseAsset,
    coin: market.coin,
    market,
    side: "long",
    size: 1,
    entryPrice: 100,
    markPrice: Number(market.markPrice),
    unrealizedPnl: 0,
    leverage: 1,
    liquidationPrice: null,
    managedBySDK: "unknown",
  };
}

function makeReceipt(plan: ExecutionPlan): ExecutionReceipt {
  return {
    success: true,
    market: plan.market,
    side: plan.side,
    requestedSize: plan.size,
    filledSize: plan.size,
    avgPrice: plan.price,
    orderId: 1,
    timestamp: Date.now(),
  };
}

describe("HyperliquidPrime close", () => {
  it("closes only the requested coin when a full HIP-3 coin symbol is provided", async () => {
    const hp = new HyperliquidPrime({ testnet: true, logLevel: "silent" });
    const executeMock = vi.fn(async (plan: ExecutionPlan) => makeReceipt(plan));

    (hp as any).connected = true;
    (hp as any).walletAddress = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01";
    (hp as any).provider = { invalidateBalanceCaches: vi.fn() };
    (hp as any).positions = {
      getPositions: vi.fn(async () => ({
        data: [makePosition(TSLA_XYZ), makePosition(TSLA_CASH)],
        warnings: [],
      })),
    };
    (hp as any).execute = executeMock;

    const receipts = await hp.close("xyz:TSLA");

    expect(receipts).toHaveLength(1);
    expect(executeMock).toHaveBeenCalledTimes(1);
    const [plan] = executeMock.mock.calls[0] as [ExecutionPlan];
    expect(plan.market.coin).toBe("xyz:TSLA");
    expect(plan.side).toBe("sell");
    expect(plan.reduceOnly).toBe(true);
    expect(plan.orderType).toEqual({ limit: { tif: "FrontendMarket" } });
  });

  it("keeps base-asset close behavior and sends reduce-only FrontendMarket orders", async () => {
    const hp = new HyperliquidPrime({ testnet: true, logLevel: "silent" });
    const executeMock = vi.fn(async (plan: ExecutionPlan) => makeReceipt(plan));

    (hp as any).connected = true;
    (hp as any).walletAddress = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01";
    (hp as any).provider = { invalidateBalanceCaches: vi.fn() };
    (hp as any).positions = {
      getPositions: vi.fn(async () => ({
        data: [makePosition(TSLA_XYZ), makePosition(TSLA_CASH)],
        warnings: [],
      })),
    };
    (hp as any).execute = executeMock;

    const receipts = await hp.close("TSLA");

    expect(receipts).toHaveLength(2);
    expect(executeMock).toHaveBeenCalledTimes(2);
    const coins = new Set((executeMock.mock.calls as Array<[ExecutionPlan]>).map(([plan]) => plan.market.coin));
    expect(coins).toEqual(new Set(["xyz:TSLA", "cash:TSLA"]));
    for (const [plan] of executeMock.mock.calls as Array<[ExecutionPlan]>) {
      expect(plan.reduceOnly).toBe(true);
      expect(plan.orderType).toEqual({ limit: { tif: "FrontendMarket" } });
    }
  });
});
