import { formatPrice, formatSize } from "@nktkas/hyperliquid/utils";
import type { PerpMarket } from "hyperliquid-prime";

const DEFAULT_ORDER_SIZE_DECIMALS = 6;
const MAX_ORDER_SIZE_DECIMALS = 12;

export function sizeDecimalsForMarket(market: PerpMarket): number {
  if (market.szDecimals === undefined) return DEFAULT_ORDER_SIZE_DECIMALS;
  if (!Number.isFinite(market.szDecimals)) return DEFAULT_ORDER_SIZE_DECIMALS;
  const normalized = Math.floor(market.szDecimals);
  return Math.max(0, Math.min(MAX_ORDER_SIZE_DECIMALS, normalized));
}

export function quantizeOrderSize(size: number, market: PerpMarket): string {
  if (!Number.isFinite(size) || size <= 0) return "0";
  const szDecimals = sizeDecimalsForMarket(market);
  try {
    return formatSize(size, szDecimals);
  } catch {
    return "0";
  }
}

/**
 * Format a price to a valid Hyperliquid tick size using the official
 * `@nktkas/hyperliquid` string-based formatting.
 *
 * Rules (per HL docs):
 *  - Max 5 significant figures
 *  - Max (6 - szDecimals) decimal places for perps
 *  - Integer prices always allowed
 *
 * Slippage is applied upstream, so truncation is safe for both directions.
 */
export function quantizeOrderPrice(
  price: number,
  _side: "buy" | "sell",
  market: PerpMarket,
): string {
  if (!Number.isFinite(price) || price <= 0) return "0";
  const szDecimals = sizeDecimalsForMarket(market);
  try {
    return formatPrice(price, szDecimals, "perp");
  } catch {
    return "0";
  }
}
