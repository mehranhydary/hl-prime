import type { L2Book, L2Level } from "../provider/types.js";

export interface NormalizedBook {
  coin: string;
  bids: L2Level[];
  asks: L2Level[];
  midPrice: number;
  spread: number;
  spreadBps: number;
  timestamp: number;
}

/**
 * Normalize a raw L2Book into a simpler shape with computed mid/spread.
 */
export function normalizeBook(raw: L2Book): NormalizedBook {
  const bids = raw.levels[0];
  const asks = raw.levels[1];

  const bestBid = bids.length > 0 ? parseFloat(bids[0].px) : 0;
  const bestAsk = asks.length > 0 ? parseFloat(asks[0].px) : 0;
  const midPrice =
    bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : bestBid || bestAsk;
  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
  const spreadBps = midPrice > 0 ? (spread / midPrice) * 10000 : 0;

  return {
    coin: raw.coin,
    bids,
    asks,
    midPrice,
    spread,
    spreadBps,
    timestamp: raw.time,
  };
}

/**
 * Get the total depth on one side of the book up to a price distance.
 */
export function getBookDepth(
  levels: L2Level[],
  maxLevels?: number,
): { totalSize: number; levelCount: number } {
  const limit = maxLevels ?? levels.length;
  let totalSize = 0;
  const count = Math.min(limit, levels.length);
  for (let i = 0; i < count; i++) {
    totalSize += parseFloat(levels[i].sz);
  }
  return { totalSize, levelCount: count };
}
