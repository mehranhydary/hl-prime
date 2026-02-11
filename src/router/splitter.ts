import type { PerpMarket, AggregatedBook, AggregatedLevel } from "../market/types.js";
import type { SplitAllocation, SplitResult } from "./types.js";

/**
 * SplitOptimizer walks an aggregated orderbook (merged across multiple HIP-3 markets)
 * and computes the optimal size distribution. By consuming price levels greedily from
 * best to worst, the split naturally minimizes total price impact.
 */
export class SplitOptimizer {
  /**
   * Compute optimal allocation across markets for a given order.
   *
   * @param book     Aggregated book from BookAggregator (levels already price-sorted)
   * @param side     "buy" walks asks, "sell" walks bids
   * @param size     Total size to fill
   * @param markets  Market metadata keyed by coin (for PerpMarket lookup)
   * @param minAllocationSize  Minimum allocation per market; smaller amounts get redistributed
   * @returns SplitResult with per-market allocations, or null if insufficient liquidity
   */
  optimize(
    book: AggregatedBook,
    side: "buy" | "sell",
    size: number,
    markets: Map<string, PerpMarket>,
    minAllocationSize = 0.001,
  ): SplitResult | null {
    const levels: AggregatedLevel[] = side === "buy" ? book.asks : book.bids;

    if (levels.length === 0) return null;

    // Track per-market fill accumulation
    const fills = new Map<string, { size: number; cost: number }>();

    let remaining = size;

    for (const level of levels) {
      if (remaining <= 0) break;

      const fillFromLevel = Math.min(remaining, level.sz);
      const sourceTotal = level.sources.reduce((sum, s) => sum + s.sz, 0);

      // Distribute this level's fill proportionally across its contributing markets
      let levelFilled = 0;
      for (const source of level.sources) {
        const sourceProportion = source.sz / sourceTotal;
        const sourceFill = Math.min(fillFromLevel * sourceProportion, source.sz);

        if (!fills.has(source.coin)) {
          fills.set(source.coin, { size: 0, cost: 0 });
        }
        const entry = fills.get(source.coin)!;
        entry.size += sourceFill;
        entry.cost += sourceFill * level.px;
        levelFilled += sourceFill;
      }

      remaining -= levelFilled;
    }

    // Insufficient aggregate liquidity
    if (remaining > size * 0.001) return null; // allow tiny rounding tolerance

    // Build raw allocations
    const rawAllocations: SplitAllocation[] = [];
    for (const [coin, fill] of fills) {
      const market = markets.get(coin);
      if (!market || fill.size <= 0) continue;

      rawAllocations.push({
        market,
        size: fill.size,
        estimatedCost: fill.cost,
        estimatedAvgPrice: fill.cost / fill.size,
        proportion: 0, // computed after filtering
      });
    }

    // Filter out dust allocations and redistribute to largest market
    const filtered = this.filterDust(rawAllocations, minAllocationSize);
    if (filtered.length === 0) return null;

    // Compute totals and proportions
    const totalSize = filtered.reduce((sum, a) => sum + a.size, 0);
    const totalCost = filtered.reduce((sum, a) => sum + a.estimatedCost, 0);

    for (const alloc of filtered) {
      alloc.proportion = alloc.size / totalSize;
    }

    // Compute mid price from best bid/ask
    const bestBid = book.bids[0]?.px ?? 0;
    const bestAsk = book.asks[0]?.px ?? 0;
    const midPrice = bestBid > 0 && bestAsk > 0
      ? (bestBid + bestAsk) / 2
      : bestBid || bestAsk;

    const aggregateAvgPrice = totalCost / totalSize;
    const aggregatePriceImpactBps = midPrice > 0
      ? Math.abs(aggregateAvgPrice - midPrice) / midPrice * 10000
      : 0;

    return {
      allocations: filtered,
      totalSize,
      totalCost,
      aggregateAvgPrice,
      aggregatePriceImpactBps,
      midPrice,
    };
  }

  /**
   * Remove allocations smaller than minSize and redistribute their volume
   * to the largest allocation.
   */
  private filterDust(
    allocations: SplitAllocation[],
    minSize: number,
  ): SplitAllocation[] {
    if (allocations.length <= 1) return allocations;

    // Sort by size descending to find the primary market
    allocations.sort((a, b) => b.size - a.size);
    const primary = allocations[0];

    const kept: SplitAllocation[] = [primary];
    for (let i = 1; i < allocations.length; i++) {
      const alloc = allocations[i];
      if (alloc.size >= minSize) {
        kept.push(alloc);
      } else {
        // Redistribute dust to primary market at primary's average price
        primary.size += alloc.size;
        primary.estimatedCost += alloc.size * primary.estimatedAvgPrice;
      }
    }

    // Recalculate primary's avg price after redistribution
    if (primary.size > 0) {
      primary.estimatedAvgPrice = primary.estimatedCost / primary.size;
    }

    return kept;
  }
}
