import type { PerpMarket } from "../market/types.js";
import type { MarketScore, SimulationResult } from "./types.js";

/** Default swap cost estimate (bps) when no spot book data is available */
const DEFAULT_SWAP_COST_BPS = 50;

/**
 * Penalty (bps) per 1x of leverage clamping.
 * E.g. requesting 20x on a 12x market → 8x gap → 8 * 25 = 200 bps penalty.
 * This makes lower-leverage markets less attractive but doesn't exclude them,
 * so the optimizer can still use their liquidity when it's price-competitive.
 */
const LEVERAGE_CLAMP_PENALTY_PER_X = 25;

export class MarketScorer {
  /**
   * Score a market for a given trade. Lower score = better.
   *
   * Scoring factors:
   * 1. Price impact (dominant factor)
   * 2. Funding rate (secondary — prefer favorable funding)
   * 3. Collateral match (if user lacks collateral, penalize by estimated swap cost)
   * 4. Leverage fit (penalty when market maxLeverage < requested leverage)
   *
   * @param swapCostBps Estimated cost to swap into this market's collateral.
   *                    Pass 0 or omit when user already holds the collateral.
   *                    When omitted and collateral is missing, uses a conservative default.
   * @param requestedLeverage Target leverage requested by the user. When omitted, no leverage penalty is applied.
   */
  score(
    simulation: SimulationResult,
    market: PerpMarket,
    side: "buy" | "sell",
    userCollateral: string[],
    swapCostBps?: number,
    requestedLeverage?: number,
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

    // Leverage fit: penalize if the market can't meet the requested leverage
    let leveragePenalty = 0;
    let leverageClamped: number | undefined;
    if (requestedLeverage !== undefined && requestedLeverage > market.maxLeverage) {
      const gap = requestedLeverage - market.maxLeverage;
      leveragePenalty = gap * LEVERAGE_CLAMP_PENALTY_PER_X;
      leverageClamped = market.maxLeverage;
    }

    const totalScore = priceImpact - fundingScore + collateralPenalty + leveragePenalty;

    const reasons: string[] = [];
    if (!hasCollateral) {
      reasons.push(`No ${market.collateral} balance (swap ~${collateralPenalty.toFixed(1)} bps)`);
    }
    if (leverageClamped !== undefined) {
      reasons.push(`Leverage clamped to ${leverageClamped}x (max), requested ${requestedLeverage}x`);
    }

    return {
      market,
      priceImpact,
      fundingRate,
      collateralMatch: hasCollateral,
      totalScore,
      swapCostBps: hasCollateral ? undefined : (swapCostBps ?? DEFAULT_SWAP_COST_BPS),
      leverageClamped,
      reason: reasons.length > 0 ? reasons.join("; ") : undefined,
    };
  }
}
