import type { PerpMarket } from "../market/types.js";
import type { MarketScore, SimulationResult } from "./types.js";

/** Default swap cost estimate (bps) when no spot book data is available */
const DEFAULT_SWAP_COST_BPS = 50;

export class MarketScorer {
  /**
   * Score a market for a given trade. Lower score = better.
   *
   * Scoring factors:
   * 1. Price impact (dominant factor)
   * 2. Funding rate (secondary — prefer favorable funding)
   * 3. Collateral match (if user lacks collateral, penalize by estimated swap cost)
   *
   * @param swapCostBps Estimated cost to swap into this market's collateral.
   *                    Pass 0 or omit when user already holds the collateral.
   *                    When omitted and collateral is missing, uses a conservative default.
   */
  score(
    simulation: SimulationResult,
    market: PerpMarket,
    side: "buy" | "sell",
    userCollateral: string[],
    swapCostBps?: number,
  ): MarketScore {
    // Price impact: direct cost, measured in bps
    const priceImpact = simulation.priceImpactBps;

    // Funding: if going long and funding is negative (shorts pay longs), that's good
    const fundingRate = parseFloat(market.funding ?? "0");
    const fundingBenefit = side === "buy" ? -fundingRate : fundingRate;
    // Normalize to bps equivalent (rough: daily funding * 3 = ~comparable to spread)
    const fundingScore = fundingBenefit * 10000 * 3;

    // Collateral match: penalize by actual estimated swap cost
    const hasCollateral = userCollateral.includes(market.collateral);
    const collateralPenalty = hasCollateral
      ? 0
      : (swapCostBps ?? DEFAULT_SWAP_COST_BPS);

    const totalScore = priceImpact - fundingScore + collateralPenalty;

    return {
      market,
      priceImpact,
      fundingRate,
      collateralMatch: hasCollateral,
      totalScore,
      swapCostBps: hasCollateral ? undefined : (swapCostBps ?? DEFAULT_SWAP_COST_BPS),
      reason: !hasCollateral
        ? `No ${market.collateral} balance (swap ~${collateralPenalty.toFixed(1)} bps)`
        : undefined,
    };
  }
}
