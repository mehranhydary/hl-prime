/**
 * Generic result wrapper that carries partial data alongside warnings.
 * Used when an operation succeeds but some data sources failed.
 *
 * Example: fetching positions from 3 deployers where 1 is down returns
 * the positions from the 2 healthy deployers plus a warning about the failed one.
 */
export type WithWarnings<T> = {
  data: T;
  warnings: string[];
};

/** Create a WithWarnings with no warnings. */
export function ok<T>(data: T): WithWarnings<T> {
  return { data, warnings: [] };
}

/** Create a WithWarnings with warnings. */
export function withWarnings<T>(data: T, warnings: string[]): WithWarnings<T> {
  return { data, warnings };
}
