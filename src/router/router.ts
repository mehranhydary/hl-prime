import type { HLProvider } from "../provider/provider.js";
import type { Logger } from "../logging/logger.js";
import type { MarketRegistry } from "../market/registry.js";
import type { Quote, MarketScore } from "./types.js";
import { FillSimulator } from "./simulator.js";
import { MarketScorer } from "./scorer.js";
import { NoMarketsError, InsufficientLiquidityError } from "../utils/errors.js";

export class Router {
  private simulator: FillSimulator;
  private scorer: MarketScorer;
  private logger: Logger;

  constructor(
    private provider: HLProvider,
    private registry: MarketRegistry,
    logger: Logger,
  ) {
    this.simulator = new FillSimulator();
    this.scorer = new MarketScorer();
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
}
