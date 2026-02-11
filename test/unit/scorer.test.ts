import { describe, it, expect } from "vitest";
import { MarketScorer } from "../../src/router/scorer.js";
import { TSLA_XYZ, TSLA_FLX, TSLA_CASH } from "../fixtures/markets.js";
import type { SimulationResult } from "../../src/router/types.js";

describe("MarketScorer", () => {
  const scorer = new MarketScorer();

  const baseSim: SimulationResult = {
    avgPrice: 431.50,
    midPrice: 431.25,
    priceImpactBps: 0.78,
    totalCost: 21575,
    filledSize: 50,
  };

  it("scores lower for less price impact", () => {
    const lowImpact: SimulationResult = { ...baseSim, priceImpactBps: 0.5 };
    const highImpact: SimulationResult = { ...baseSim, priceImpactBps: 5.0 };

    const low = scorer.score(lowImpact, TSLA_XYZ, "buy", ["USDC"]);
    const high = scorer.score(highImpact, TSLA_XYZ, "buy", ["USDC"]);

    expect(low.totalScore).toBeLessThan(high.totalScore);
  });

  it("penalizes missing collateral with default swap cost", () => {
    const withCollateral = scorer.score(baseSim, TSLA_XYZ, "buy", ["USDC"]);
    const noCollateral = scorer.score(baseSim, TSLA_XYZ, "buy", ["USDH"]);

    // Default swap cost is 50 bps
    expect(noCollateral.totalScore).toBeGreaterThan(withCollateral.totalScore);
    expect(noCollateral.totalScore - withCollateral.totalScore).toBeCloseTo(50, 0);
    expect(noCollateral.collateralMatch).toBe(false);
    expect(withCollateral.collateralMatch).toBe(true);
  });

  it("prefers negative funding for longs", () => {
    // TSLA_FLX has funding = -0.0002 (favorable for longs)
    // TSLA_XYZ has funding = 0.00000625 (unfavorable for longs)
    const flxScore = scorer.score(baseSim, TSLA_FLX, "buy", ["USDH"]);
    const xyzScore = scorer.score(baseSim, TSLA_XYZ, "buy", ["USDC"]);

    // FLX should have lower score (better) due to funding benefit
    expect(flxScore.totalScore).toBeLessThan(xyzScore.totalScore);
  });

  it("prefers positive funding for shorts", () => {
    // TSLA_CASH has funding = 0.0005 (favorable for shorts)
    const cashScore = scorer.score(baseSim, TSLA_CASH, "sell", ["USDT0"]);
    const xyzScore = scorer.score(baseSim, TSLA_XYZ, "sell", ["USDC"]);

    expect(cashScore.totalScore).toBeLessThan(xyzScore.totalScore);
  });

  it("provides reason for collateral mismatch", () => {
    const score = scorer.score(baseSim, TSLA_FLX, "buy", ["USDC"]);
    expect(score.reason).toContain("USDH");
  });

  it("returns no reason when collateral matches", () => {
    const score = scorer.score(baseSim, TSLA_XYZ, "buy", ["USDC"]);
    expect(score.reason).toBeUndefined();
  });

  it("uses explicit swap cost instead of default", () => {
    const withDefault = scorer.score(baseSim, TSLA_XYZ, "buy", ["USDH"]);
    const withExplicit = scorer.score(baseSim, TSLA_XYZ, "buy", ["USDH"], 5);

    // Explicit 5 bps should be much less penalty than default 50 bps
    expect(withExplicit.totalScore).toBeLessThan(withDefault.totalScore);
    expect(withExplicit.swapCostBps).toBe(5);
    expect(withDefault.swapCostBps).toBe(50);
  });

  it("does not set swapCostBps when collateral matches", () => {
    const score = scorer.score(baseSim, TSLA_XYZ, "buy", ["USDC"]);
    expect(score.swapCostBps).toBeUndefined();
  });

  it("includes swap cost in reason message", () => {
    const score = scorer.score(baseSim, TSLA_FLX, "buy", ["USDC"], 3.5);
    expect(score.reason).toContain("USDH");
    expect(score.reason).toContain("3.5");
  });
});
