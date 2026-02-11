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

  it("penalizes missing collateral heavily", () => {
    const withCollateral = scorer.score(baseSim, TSLA_XYZ, "buy", ["USDC"]);
    const noCollateral = scorer.score(baseSim, TSLA_XYZ, "buy", ["USDH"]);

    expect(noCollateral.totalScore).toBeGreaterThan(
      withCollateral.totalScore + 5000,
    );
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
});
