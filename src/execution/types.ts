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

export interface SplitExecutionReceipt {
  success: boolean;             // true if ALL legs succeeded
  legs: ExecutionReceipt[];     // per-market receipts
  collateralReceipt: CollateralReceipt;
  totalRequestedSize: string;
  totalFilledSize: string;
  aggregateAvgPrice: string;    // weighted by filled size
  timestamp: number;
  error?: string;
}
