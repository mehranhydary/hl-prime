import type { PerpMarket } from "hyperliquid-prime";

export const DEFAULT_ORDER_SIZE_DECIMALS = 6;
export const MAX_ORDER_SIZE_DECIMALS = 12;
export const MAX_PERP_PRICE_DECIMALS = 6;
export const MAX_PRICE_SIG_FIGS = 5;

export function sizeDecimalsForMarket(market: PerpMarket): number {
  if (market.szDecimals === undefined) return DEFAULT_ORDER_SIZE_DECIMALS;
  if (!Number.isFinite(market.szDecimals)) return DEFAULT_ORDER_SIZE_DECIMALS;
  const normalized = Math.floor(market.szDecimals);
  return Math.max(0, Math.min(MAX_ORDER_SIZE_DECIMALS, normalized));
}

export function trimTrailingZeros(value: string): string {
  if (!value.includes(".")) return value;
  const trimmed = value.replace(/\.?0+$/, "");
  return trimmed.length > 0 ? trimmed : "0";
}

export function quantizeOrderSize(size: number, market: PerpMarket): string {
  if (!Number.isFinite(size) || size <= 0) return "0";
  const decimals = sizeDecimalsForMarket(market);
  const factor = 10 ** decimals;
  const truncated = Math.floor(size * factor + Number.EPSILON) / factor;
  if (!Number.isFinite(truncated) || truncated <= 0) return "0";
  return trimTrailingZeros(truncated.toFixed(decimals));
}

export function maxPriceDecimalsForMarket(market: PerpMarket): number {
  const sizeDecimals = sizeDecimalsForMarket(market);
  const allowed = MAX_PERP_PRICE_DECIMALS - sizeDecimals;
  return Math.max(0, Math.min(MAX_PERP_PRICE_DECIMALS, allowed));
}

export function significantFigureFactor(value: number, sigFigs: number): number {
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  return 10 ** (sigFigs - magnitude - 1);
}

export function quantizeOrderPrice(
  price: number,
  side: "buy" | "sell",
  market: PerpMarket,
): string {
  if (!Number.isFinite(price) || price <= 0) return "0";

  const sigFactor = significantFigureFactor(price, MAX_PRICE_SIG_FIGS);
  let rounded = side === "buy"
    ? Math.ceil((price + Number.EPSILON) * sigFactor) / sigFactor
    : Math.floor((price + Number.EPSILON) * sigFactor) / sigFactor;

  const priceDecimals = maxPriceDecimalsForMarket(market);
  const decimalFactor = 10 ** priceDecimals;
  rounded = side === "buy"
    ? Math.ceil((rounded + Number.EPSILON) * decimalFactor) / decimalFactor
    : Math.floor((rounded + Number.EPSILON) * decimalFactor) / decimalFactor;

  if (!Number.isFinite(rounded) || rounded <= 0) return "0";
  return trimTrailingZeros(rounded.toFixed(priceDecimals));
}
