import { describe, it, expect } from "vitest";
import { computeRisk } from "../../src/position/risk.js";
import type { LogicalPosition } from "../../src/position/types.js";

function makePosition(overrides: Partial<LogicalPosition> = {}): LogicalPosition {
  return {
    baseAsset: "BTC",
    coin: "BTC",
    market: undefined,
    side: "long",
    size: 1,
    entryPrice: 42000,
    markPrice: 42500,
    unrealizedPnl: 500,
    leverage: 10,
    liquidationPrice: 38000,
    managedBySDK: "unknown",
    ...overrides,
  };
}

describe("computeRisk", () => {
  it("computes risk for a standard long position", () => {
    const risk = computeRisk(makePosition());

    expect(risk.coin).toBe("BTC");
    expect(risk.side).toBe("long");
    expect(risk.size).toBe(1);
    expect(risk.entryPrice).toBe(42000);
    expect(risk.markPrice).toBe(42500);
    expect(risk.leverage).toBe(10);
    expect(risk.liquidationPrice).toBe(38000);
    expect(risk.unrealizedPnl).toBe(500);
  });

  it("computes marginUsed as size * entryPrice / leverage", () => {
    const risk = computeRisk(makePosition({ size: 2, entryPrice: 50000, leverage: 20 }));
    expect(risk.marginUsed).toBe(5000); // 2 * 50000 / 20
  });

  it("computes distanceToLiquidation as percentage", () => {
    const risk = computeRisk(makePosition({ markPrice: 42000, liquidationPrice: 38000 }));
    // |42000 - 38000| / 42000 * 100 = 9.5238...%
    expect(risk.distanceToLiquidation).toBeCloseTo(9.5238, 2);
  });

  it("returns null distanceToLiquidation when liquidationPrice is null", () => {
    const risk = computeRisk(makePosition({ liquidationPrice: null }));
    expect(risk.distanceToLiquidation).toBeNull();
  });

  it("returns null distanceToLiquidation when markPrice is 0", () => {
    const risk = computeRisk(makePosition({ markPrice: 0 }));
    expect(risk.distanceToLiquidation).toBeNull();
  });

  it("handles short position distance calculation", () => {
    const risk = computeRisk(makePosition({
      side: "short",
      markPrice: 42000,
      liquidationPrice: 46000,
    }));
    // |42000 - 46000| / 42000 * 100 = 9.5238...%
    expect(risk.distanceToLiquidation).toBeCloseTo(9.5238, 2);
  });

  it("handles 1x leverage", () => {
    const risk = computeRisk(makePosition({ size: 1, entryPrice: 42000, leverage: 1 }));
    expect(risk.marginUsed).toBe(42000);
  });

  it("handles very small position size", () => {
    const risk = computeRisk(makePosition({ size: 0.001, entryPrice: 42000, leverage: 10 }));
    expect(risk.marginUsed).toBeCloseTo(4.2, 4);
  });

  it("handles mark price exactly at liquidation", () => {
    const risk = computeRisk(makePosition({ markPrice: 38000, liquidationPrice: 38000 }));
    expect(risk.distanceToLiquidation).toBe(0);
  });
});
