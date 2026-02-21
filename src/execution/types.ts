import type { PerpMarket } from "../market/types.js";
import type { CollateralReceipt } from "../collateral/types.js";

export interface ExecutionReceipt {
  success: boolean;
  market: PerpMarket;
  side: "buy" | "sell";
  requestedSize: string;
  filledSize: string;
  avgPrice: string;
  orderId: number | undefined;
  timestamp: number;
  error?: string;
  raw?: unknown;
}

export type OrderStatusType =
  | "pending"
  | "open"
  | "filled"
  | "partially_filled"
  | "cancelled"
  | "rejected";

/** Per-leg receipt within a split execution. */
export interface LegReceipt {
  market: PerpMarket;
  side: "buy" | "sell";
  requestedSize: string;
  filledSize: string;
  avgPrice: string;
  orderId: number | undefined;
  success: boolean;
  error?: string;
  raw?: unknown;
}

export interface SplitExecutionReceipt {
  /** True only if ALL legs succeeded. */
  allSucceeded: boolean;
  /** True if at least one leg succeeded but not all. */
  partialFill: boolean;
  /** Individual per-leg results. */
  legs: LegReceipt[];
  collateralReceipt: CollateralReceipt;
  totalRequestedSize: string;
  totalFilledSize: string;
  /** Weighted average price across all filled legs. */
  aggregateAvgPrice: string;
  timestamp: number;
  /** Warnings generated during execution. */
  warnings: string[];
  error?: string;

  /** @deprecated Use allSucceeded instead. */
  success: boolean;
}
