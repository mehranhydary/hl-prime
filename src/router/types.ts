import type { PerpMarket } from "../market/types.js";
import type { OrderType } from "../provider/types.js";
import type { CollateralPlan } from "../collateral/types.js";

export interface Quote {
  baseAsset: string;
  side: "buy" | "sell";
  requestedSize: number;
  selectedMarket: PerpMarket;
  estimatedAvgPrice: number;
  estimatedPriceImpact: number;
  estimatedFundingRate: number;
  alternativesConsidered: MarketScore[];
  warnings?: string[];      // degraded mode notes (timeouts, partial market data, fallbacks)
  plan: ExecutionPlan;
}

export interface ExecutionPlan {
  market: PerpMarket;
  side: "buy" | "sell";
  size: string;
  price: string;        // Limit price (market price + slippage for IOC)
  orderType: OrderType;
  slippage: number;
}

export interface MarketScore {
  market: PerpMarket;
  priceImpact: number;       // Cost in basis points to fill at this size
  fundingRate: number;        // Current funding rate
  collateralMatch: boolean;   // Does user already hold this collateral?
  totalScore: number;         // Lower is better
  swapCostBps?: number;       // Estimated cost to swap into this collateral
  reason?: string;            // Why this wasn't selected
}

export interface SimulationResult {
  avgPrice: number;
  midPrice: number;
  priceImpactBps: number;
  totalCost: number;
  filledSize: number;
}

// --- Split order types ---

export interface SplitAllocation {
  market: PerpMarket;
  size: number;               // allocated fill size for this market
  estimatedCost: number;      // size * estimated avg price
  estimatedAvgPrice: number;
  proportion: number;         // fraction of total order (0-1)
}

export interface SplitResult {
  allocations: SplitAllocation[];
  totalSize: number;
  totalCost: number;
  aggregateAvgPrice: number;
  aggregatePriceImpactBps: number;
  midPrice: number;
}

export interface SplitQuote extends Quote {
  isSplit: true;
  allocations: SplitAllocation[];
  collateralPlan: CollateralPlan;
  splitPlan: SplitExecutionPlan;
}

export interface SplitExecutionPlan {
  legs: ExecutionPlan[];
  collateralPlan: CollateralPlan;
  side: "buy" | "sell";
  totalSize: string;
  slippage: number;
}

export function isSplitQuote(q: Quote): q is SplitQuote {
  return "isSplit" in q && (q as SplitQuote).isSplit === true;
}
