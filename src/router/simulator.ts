import type { L2Book, L2Level } from "../provider/types.js";
import type { SimulationResult } from "./types.js";

export class FillSimulator {
  /**
   * Walk an orderbook and estimate the average fill price for a given size.
   * Returns null if the book doesn't have enough depth.
   */
  simulate(
    book: L2Book,
    side: "buy" | "sell",
    size: number,
  ): SimulationResult | null {
    const levels: L2Level[] = side === "buy" ? book.levels[1] : book.levels[0];
    let remaining = size;
    let totalCost = 0;

    for (const level of levels) {
      const px = parseFloat(level.px);
      const sz = parseFloat(level.sz);
      const fillQty = Math.min(remaining, sz);

      totalCost += fillQty * px;
      remaining -= fillQty;

      if (remaining <= 0) break;
    }

    if (remaining > 0) return null; // Insufficient depth

    const avgPrice = totalCost / size;
    const midPrice = this.getMidPrice(book);
    const priceImpactBps =
      midPrice > 0
        ? Math.abs((avgPrice - midPrice) / midPrice) * 10000
        : 0;

    return { avgPrice, midPrice, priceImpactBps, totalCost, filledSize: size };
  }

  getMidPrice(book: L2Book): number {
    const bestBid = book.levels[0].length > 0
      ? parseFloat(book.levels[0][0].px)
      : 0;
    const bestAsk = book.levels[1].length > 0
      ? parseFloat(book.levels[1][0].px)
      : 0;
    if (bestBid === 0 && bestAsk === 0) return 0;
    if (bestBid === 0) return bestAsk;
    if (bestAsk === 0) return bestBid;
    return (bestBid + bestAsk) / 2;
  }
}
