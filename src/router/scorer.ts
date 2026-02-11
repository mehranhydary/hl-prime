import type { HIP3Market } from "../market/types.js";
import type { MarketScore, SimulationResult } from "./types.js";

export class MarketScorer {
  /**
   * Score a market for a given trade. Lower score = better.
   *
   * v0 scoring factors:
   * 1. Price impact (dominant factor)
   * 2. Funding rate (secondary — prefer favorable funding)
   * 3. Collateral match (bonus if user already holds the right stable)
   */
  score(
    simulation: SimulationResult,
    market: HIP3Market,
    side: "buy" | "sell",
    userCollateral: string[],
  ): MarketScore {
    // Price impact: direct cost, measured in bps
    const priceImpact = simulation.priceImpactBps;

    // Funding: if going long and funding is negative (shorts pay longs), that's good
    const fundingRate = parseFloat(market.funding ?? "0");
    const fundingBenefit = side === "buy" ? -fundingRate : fundingRate;
    // Normalize to bps equivalent (rough: daily funding * 3 = ~comparable to spread)
    const fundingScore = fundingBenefit * 10000 * 3;

    // Collateral match: avoid needing a swap
    const hasCollateral = userCollateral.includes(market.collateral);
    // In v0: if user doesn't have the collateral, heavily penalize
    // (since we don't auto-swap in v0)
    const collateralPenalty = hasCollateral ? 0 : 10000; // 100bps penalty

    const totalScore = priceImpact - fundingScore + collateralPenalty;

    return {
      market,
      priceImpact,
      fundingRate,
      collateralMatch: hasCollateral,
      totalScore,
      reason: !hasCollateral
        ? `No ${market.collateral} balance`
        : undefined,
    };
  }
}
