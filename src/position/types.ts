import type { PerpMarket } from "../market/types.js";

export type ManagedPositionState = "managed" | "external" | "unknown";

export interface LogicalPosition {
  baseAsset: string;
  coin: string;
  market: PerpMarket | undefined;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number;
  liquidationPrice: number | null;
  managedBySDK: ManagedPositionState;
}

export interface RiskProfile {
  coin: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  markPrice: number;
  leverage: number;
  liquidationPrice: number | null;
  marginUsed: number;
  unrealizedPnl: number;
  distanceToLiquidation: number | null; // percentage
}
