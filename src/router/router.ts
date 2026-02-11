import type { HLProvider } from "../provider/provider.js";
import type { L2Book } from "../provider/types.js";
import type { Logger } from "../logging/logger.js";
import type { MarketRegistry } from "../market/registry.js";
import type { BookAggregator } from "../market/aggregator.js";
import type { PerpMarket } from "../market/types.js";
import type { CollateralPlan } from "../collateral/types.js";
import type { Quote, MarketScore, SplitQuote, SplitExecutionPlan } from "./types.js";
import { FillSimulator } from "./simulator.js";
import { MarketScorer } from "./scorer.js";
import { SplitOptimizer } from "./splitter.js";
import {
  NoMarketsError,
  InsufficientLiquidityError,
  MarketDataUnavailableError,
} from "../utils/errors.js";

const BOOK_FETCH_TIMEOUT_MS = 2_500;

interface MarketSnapshot {
  market: PerpMarket;
  book: L2Book;
}

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

    const { snapshots, failedMarkets, warnings } = await this.fetchSnapshots(
      markets,
      baseAsset,
    );
    if (snapshots.length === 0) {
      throw new MarketDataUnavailableError(
        baseAsset,
        failedMarkets.length > 0 ? failedMarkets : markets.map((m) => m.coin),
      );
    }

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
    const bestSnapshot = snapshots.find(
      (s) => s.market.coin === best.market.coin,
    );
    if (!bestSnapshot) {
      throw new MarketDataUnavailableError(baseAsset, [best.market.coin]);
    }
    const sim = this.simulator.simulate(bestSnapshot.book, side, size)!;

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
      warnings: warnings.length > 0 ? warnings : undefined,
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
    const marketMap = new Map<string, PerpMarket>();
    for (const m of markets) {
      marketMap.set(m.coin, m);
    }

    const warnings: string[] = [];
    const aggBook = await this.aggregator.aggregateForOrder(baseAsset, side, size);
    if (aggBook.marketBooks.length === 0) {
      throw new MarketDataUnavailableError(baseAsset, markets.map((m) => m.coin));
    }
    if (aggBook.marketBooks.length < markets.length) {
      warnings.push(
        `Partial market data: ${aggBook.marketBooks.length}/${markets.length} markets responded`,
      );
    }

    // Find optimal split
    const splitResult = this.splitter.optimize(aggBook, side, size, marketMap);
    if (!splitResult) {
      throw new InsufficientLiquidityError(baseAsset, size);
    }

    // Collateral requirements are now resolved during execution only.
    const collateralPlan: CollateralPlan = {
      requirements: [],
      totalSwapCostBps: 0,
      swapsNeeded: false,
      abstractionEnabled: false,
    };
    warnings.push(
      "Collateral requirements are estimated during executeSplit() using live balances",
    );

    const bookMap = new Map<string, L2Book>(
      aggBook.marketBooks.map((book) => [
        book.coin,
        {
          coin: book.coin,
          time: aggBook.timestamp,
          levels: [book.bids, book.asks],
        } as L2Book,
      ]),
    );

    // Score each market for the alternativesConsidered list
    const scored: MarketScore[] = [];
    for (const alloc of splitResult.allocations) {
      const book = bookMap.get(alloc.market.coin);
      if (!book) {
        this.pushWarning(
          warnings,
          `Missing book snapshot for ${alloc.market.coin}; score omitted`,
        );
        continue;
      }
      const sim = this.simulator.simulate(book, side, alloc.size);
      if (sim) {
        scored.push(
          this.scorer.score(
            sim,
            alloc.market,
            side,
            userCollateral,
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
        warnings,
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
      warnings: warnings.length > 0 ? warnings : undefined,
      plan: legs[0], // Primary leg as the default plan

      // Split-specific fields
      isSplit: true,
      allocations: splitResult.allocations,
      collateralPlan,
      splitPlan,
    };
  }

  private async fetchSnapshots(
    markets: PerpMarket[],
    baseAsset: string,
  ): Promise<{
    snapshots: MarketSnapshot[];
    failedMarkets: string[];
    warnings: string[];
  }> {
    const settled = await Promise.allSettled(
      markets.map(async (market) => {
        const book = await this.withTimeout(
          this.provider.l2Book(market.coin),
          BOOK_FETCH_TIMEOUT_MS,
          `Book fetch timed out for ${market.coin}`,
        );
        return { market, book } as MarketSnapshot;
      }),
    );

    const snapshots: MarketSnapshot[] = [];
    const failedMarkets: string[] = [];
    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      const market = markets[i];
      if (result.status === "fulfilled") {
        snapshots.push(result.value);
      } else {
        failedMarkets.push(market.coin);
      }
    }

    const warnings: string[] = [];
    if (failedMarkets.length > 0) {
      warnings.push(
        `Partial market data: ${snapshots.length}/${markets.length} markets responded`,
      );
      this.logger.warn(
        { baseAsset, failedMarkets },
        "Some market books failed to load; continuing with partial data",
      );
    }

    return { snapshots, failedMarkets, warnings };
  }

  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  private pushWarning(warnings: string[], warning: string): void {
    if (!warnings.includes(warning)) {
      warnings.push(warning);
    }
  }
}
