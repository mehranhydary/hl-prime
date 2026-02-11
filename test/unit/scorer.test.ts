import { describe, it, expect } from "vitest";
import { MarketScorer } from "../../src/router/scorer.js";
import { ETH_NATIVE, ETH_HIP3_USDT, ETH_HIP3_USDE } from "../fixtures/markets.js";
import type { SimulationResult } from "../../src/router/types.js";

describe("MarketScorer", () => {
  const scorer = new MarketScorer();

  const baseSim: SimulationResult = {
    avgPrice: 3200.5,
    midPrice: 3200.25,
    priceImpactBps: 0.78,
    totalCost: 32005,
    filledSize: 10,
  };

  it("scores lower for less price impact", () => {
    const lowImpact: SimulationResult = { ...baseSim, priceImpactBps: 0.5 };
    const highImpact: SimulationResult = { ...baseSim, priceImpactBps: 5.0 };

    const low = scorer.score(lowImpact, ETH_NATIVE, "buy", ["USDC"]);
    const high = scorer.score(highImpact, ETH_NATIVE, "buy", ["USDC"]);

    expect(low.totalScore).toBeLessThan(high.totalScore);
  });

  it("penalizes missing collateral heavily", () => {
    const withCollateral = scorer.score(baseSim, ETH_NATIVE, "buy", ["USDC"]);
    const noCollateral = scorer.score(baseSim, ETH_NATIVE, "buy", ["USDT"]);

    expect(noCollateral.totalScore).toBeGreaterThan(
      withCollateral.totalScore + 5000,
    );
    expect(noCollateral.collateralMatch).toBe(false);
    expect(withCollateral.collateralMatch).toBe(true);
  });

  it("prefers negative funding for longs", () => {
    // ETH_HIP3_USDT has funding = -0.0002 (favorable for longs)
    // ETH_NATIVE has funding = 0.0001 (unfavorable for longs)
    const hip3Score = scorer.score(baseSim, ETH_HIP3_USDT, "buy", [
      "USDT",
    ]);
    const nativeScore = scorer.score(baseSim, ETH_NATIVE, "buy", [
      "USDC",
    ]);

    // HIP3 should have lower score (better) due to funding benefit
    expect(hip3Score.totalScore).toBeLessThan(nativeScore.totalScore);
  });

  it("prefers positive funding for shorts", () => {
    // ETH_HIP3_USDE has funding = 0.0005 (favorable for shorts)
    const usdeScore = scorer.score(baseSim, ETH_HIP3_USDE, "sell", [
      "USDE",
    ]);
    const nativeScore = scorer.score(baseSim, ETH_NATIVE, "sell", [
      "USDC",
    ]);

    expect(usdeScore.totalScore).toBeLessThan(nativeScore.totalScore);
  });

  it("provides reason for collateral mismatch", () => {
    const score = scorer.score(baseSim, ETH_HIP3_USDT, "buy", ["USDC"]);
    expect(score.reason).toContain("USDT");
  });

  it("returns no reason when collateral matches", () => {
    const score = scorer.score(baseSim, ETH_NATIVE, "buy", ["USDC"]);
    expect(score.reason).toBeUndefined();
  });
});
