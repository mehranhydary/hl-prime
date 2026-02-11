import type { HIP3Market } from "../market/types.js";

export interface LogicalPosition {
  baseAsset: string;
  coin: string;
  market: HIP3Market | undefined;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number;
  liquidationPrice: number | null;
  managedBySDK: boolean;
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
