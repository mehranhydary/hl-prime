import type { HIP3Market } from "../market/types.js";

export interface ExecutionReceipt {
  success: boolean;
  market: HIP3Market;
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
