/**
 * Calculate weighted average price from a set of fills.
 */
export function weightedAvgPrice(fills: { price: number; size: number }[]): number {
  if (fills.length === 0) return 0;
  let totalCost = 0;
  let totalSize = 0;
  for (const fill of fills) {
    totalCost += fill.price * fill.size;
    totalSize += fill.size;
  }
  return totalSize === 0 ? 0 : totalCost / totalSize;
}

/**
 * Convert basis points to decimal fraction.
 */
export function bpsToDecimal(bps: number): number {
  return bps / 10000;
}

/**
 * Convert decimal fraction to basis points.
 */
export function decimalToBps(decimal: number): number {
  return decimal * 10000;
}

/**
 * Round a price to a given number of significant figures.
 */
export function roundToSigFigs(value: number, sigFigs: number): number {
  if (value === 0) return 0;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const factor = Math.pow(10, sigFigs - magnitude - 1);
  return Math.round(value * factor) / factor;
}

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
