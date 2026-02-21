/**
 * Shared math helpers for portfolio aggregation.
 *
 * Used by account routes to combine per-market rows into base-asset-level
 * aggregates with weighted averages, sums, and grouping.
 */

/**
 * Group items by a string key derived from each item.
 */
export function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  return map;
}

/**
 * Compute a size-weighted average across items.
 * Returns `fallback` if total weight is zero.
 */
export function weightedAverage<T>(
  items: T[],
  valueFn: (item: T) => number,
  weightFn: (item: T) => number,
  fallback = 0,
): number {
  let totalValue = 0;
  let totalWeight = 0;
  for (const item of items) {
    const w = weightFn(item);
    totalValue += valueFn(item) * w;
    totalWeight += w;
  }
  return totalWeight > 0 ? totalValue / totalWeight : fallback;
}

/**
 * Sum a numeric field across items.
 */
export function sumField<T>(items: T[], fn: (item: T) => number): number {
  let total = 0;
  for (const item of items) {
    total += fn(item);
  }
  return total;
}

/**
 * Return the maximum value of a numeric field across items.
 * Returns `-Infinity` for empty arrays.
 */
export function maxField<T>(items: T[], fn: (item: T) => number): number {
  let max = -Infinity;
  for (const item of items) {
    const v = fn(item);
    if (v > max) max = v;
  }
  return max;
}
