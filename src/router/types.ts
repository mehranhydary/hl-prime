import type { HIP3Market } from "../market/types.js";
import type { OrderType } from "../provider/types.js";

export interface Quote {
  baseAsset: string;
  side: "buy" | "sell";
  requestedSize: number;
  selectedMarket: HIP3Market;
  estimatedAvgPrice: number;
  estimatedPriceImpact: number;
  estimatedFundingRate: number;
  alternativesConsidered: MarketScore[];
  plan: ExecutionPlan;
}

export interface ExecutionPlan {
  market: HIP3Market;
  side: "buy" | "sell";
  size: string;
  price: string;        // Limit price (market price + slippage for IOC)
  orderType: OrderType;
  slippage: number;
}

export interface MarketScore {
  market: HIP3Market;
  priceImpact: number;       // Cost in basis points to fill at this size
  fundingRate: number;        // Current funding rate
  collateralMatch: boolean;   // Does user already hold this collateral?
  totalScore: number;         // Lower is better
  reason?: string;            // Why this wasn't selected
}

export interface SimulationResult {
  avgPrice: number;
  midPrice: number;
  priceImpactBps: number;
  totalCost: number;
  filledSize: number;
}
