import type { HLProvider } from "../provider/provider.js";
import type { Logger } from "../logging/logger.js";
import type { MarketRegistry } from "../market/registry.js";
import type { BookAggregator } from "../market/aggregator.js";
import type { HIP3Market } from "../market/types.js";
import type { CollateralManager } from "../collateral/manager.js";
import type { Quote, MarketScore, SplitQuote, SplitExecutionPlan } from "./types.js";
import { FillSimulator } from "./simulator.js";
import { MarketScorer } from "./scorer.js";
import { SplitOptimizer } from "./splitter.js";
import { NoMarketsError, InsufficientLiquidityError } from "../utils/errors.js";

export class Router {
  private simulator: FillSimulator;
  private scorer: MarketScorer;
  private splitter: SplitOptimizer;
  private logger: Logger;

  constructor(
    private provider: HLProvider,
    private registry: MarketRegistry,
    logger: Logger,
    private aggregator?: BookAggregator,
    private collateralManager?: CollateralManager,
  ) {
    this.simulator = new FillSimulator();
    this.scorer = new MarketScorer();
    this.splitter = new SplitOptimizer();
    this.logger = logger.child({ module: "router" });
  }

  /**
   * Generate a quote for a trade. This is read-only — no orders are placed.
   * The caller must explicitly call execute(plan) to act on it.
   */
  async quote(
    baseAsset: string,
    side: "buy" | "sell",
    size: number,
    userCollateral: string[],
    slippage = 0.01,
  ): Promise<Quote> {
    const markets = this.registry.getMarkets(baseAsset);
    if (markets.length === 0) {
      throw new NoMarketsError(baseAsset);
    }

    // Fetch books for all markets in parallel
    const snapshots = await Promise.all(
      markets.map(async (m) => {
        const book = await this.provider.l2Book(m.coin);
        return { market: m, book };
      }),
    );

    // Simulate + score each market
    const scored: MarketScore[] = [];

    for (const { market, book } of snapshots) {
      const sim = this.simulator.simulate(book, side, size);
      if (!sim) {
        scored.push({
          market,
          priceImpact: Infinity,
          fundingRate: 0,
          collateralMatch: false,
          totalScore: Infinity,
          reason: "Insufficient book depth",
        });
        continue;
      }

      scored.push(this.scorer.score(sim, market, side, userCollateral));
    }

    // Sort by score (lower = better)
    scored.sort((a, b) => a.totalScore - b.totalScore);

    const best = scored[0];
    if (best.totalScore === Infinity) {
      throw new InsufficientLiquidityError(baseAsset, size);
    }

    this.logger.info(
      {
        baseAsset,
        side,
        size,
        selectedMarket: best.market.coin,
        score: best.totalScore,
        alternatives: scored.length - 1,
      },
      "Route selected",
    );

    // Build execution plan
    const bestBook = snapshots.find(
      (s) => s.market.coin === best.market.coin,
    )!.book;
    const sim = this.simulator.simulate(bestBook, side, size)!;

    const slippagePrice =
      side === "buy"
        ? sim.avgPrice * (1 + slippage)
        : sim.avgPrice * (1 - slippage);

    return {
      baseAsset,
      side,
      requestedSize: size,
      selectedMarket: best.market,
      estimatedAvgPrice: sim.avgPrice,
      estimatedPriceImpact: sim.priceImpactBps,
      estimatedFundingRate: parseFloat(best.market.funding ?? "0"),
      alternativesConsidered: scored,
      plan: {
        market: best.market,
        side,
        size: size.toString(),
        price: slippagePrice.toFixed(6), // TODO: respect tick size
        orderType: { limit: { tif: "Ioc" } },
        slippage,
      },
    };
  }

  /**
   * Generate a split quote that distributes across multiple HIP-3 markets.
   * Uses the BookAggregator to merge books, then SplitOptimizer to find
   * the optimal allocation, then CollateralManager to estimate swap costs.
   */
  async quoteSplit(
    baseAsset: string,
    side: "buy" | "sell",
    size: number,
    userCollateral: string[],
    userAddress: string,
    slippage = 0.01,
  ): Promise<SplitQuote> {
    if (!this.aggregator) {
      throw new Error("BookAggregator required for split quotes");
    }

    const markets = this.registry.getMarkets(baseAsset);
    if (markets.length === 0) {
      throw new NoMarketsError(baseAsset);
    }

    // Build market lookup
    const marketMap = new Map<string, HIP3Market>();
    for (const m of markets) {
      marketMap.set(m.coin, m);
    }

    // Aggregate books across all markets
    const aggBook = await this.aggregator.aggregate(baseAsset);

    // Find optimal split
    const splitResult = this.splitter.optimize(aggBook, side, size, marketMap);
    if (!splitResult) {
      throw new InsufficientLiquidityError(baseAsset, size);
    }

    // Estimate collateral requirements
    let collateralPlan = {
      requirements: [],
      totalSwapCostBps: 0,
      swapsNeeded: false,
      abstractionEnabled: false,
    } as import("../collateral/types.js").CollateralPlan;

    if (this.collateralManager) {
      collateralPlan = await this.collateralManager.estimateRequirements(
        splitResult.allocations,
        userAddress,
      );
    }

    // Score each market for the alternativesConsidered list
    const scored: MarketScore[] = [];
    for (const alloc of splitResult.allocations) {
      const book = await this.provider.l2Book(alloc.market.coin);
      const sim = this.simulator.simulate(book, side, alloc.size);
      if (sim) {
        const swapReq = collateralPlan.requirements.find(
          (r) => r.token === alloc.market.collateral,
        );
        scored.push(
          this.scorer.score(
            sim,
            alloc.market,
            side,
            userCollateral,
            swapReq?.estimatedSwapCostBps,
          ),
        );
      }
    }
    scored.sort((a, b) => a.totalScore - b.totalScore);

    // Build execution legs
    const legs = splitResult.allocations.map((alloc) => {
      const slippagePrice = side === "buy"
        ? alloc.estimatedAvgPrice * (1 + slippage)
        : alloc.estimatedAvgPrice * (1 - slippage);

      return {
        market: alloc.market,
        side,
        size: alloc.size.toString(),
        price: slippagePrice.toFixed(6),
        orderType: { limit: { tif: "Ioc" as const } },
        slippage,
      };
    });

    // Compute weighted funding rate
    const weightedFunding = splitResult.allocations.reduce(
      (sum, a) =>
        sum + parseFloat(a.market.funding ?? "0") * a.proportion,
      0,
    );

    // Use the largest allocation's market as the "selected" market (for backward compat)
    const primaryAlloc = [...splitResult.allocations].sort(
      (a, b) => b.size - a.size,
    )[0];

    this.logger.info(
      {
        baseAsset,
        side,
        size,
        legs: legs.length,
        markets: legs.map((l) => l.market.coin),
        allocations: splitResult.allocations.map((a) => ({
          coin: a.market.coin,
          size: a.size.toFixed(3),
          pct: (a.proportion * 100).toFixed(1) + "%",
        })),
        swapsNeeded: collateralPlan.swapsNeeded,
      },
      "Split route selected",
    );

    const splitPlan: SplitExecutionPlan = {
      legs,
      collateralPlan,
      side,
      totalSize: size.toString(),
      slippage,
    };

    return {
      // Quote fields (backward compatible)
      baseAsset,
      side,
      requestedSize: size,
      selectedMarket: primaryAlloc.market,
      estimatedAvgPrice: splitResult.aggregateAvgPrice,
      estimatedPriceImpact: splitResult.aggregatePriceImpactBps,
      estimatedFundingRate: weightedFunding,
      alternativesConsidered: scored,
      plan: legs[0], // Primary leg as the default plan

      // Split-specific fields
      isSplit: true,
      allocations: splitResult.allocations,
      collateralPlan,
      splitPlan,
    };
  }
}
