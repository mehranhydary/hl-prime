import type { L2Level } from "../provider/types.js";

export interface PerpMarket {
  baseAsset: string;       // Normalized: "ETH", "BTC"
  coin: string;            // Full HL identifier: "xyz:TSLA", "hyena:ETH", or "ETH"
  assetIndex: number;      // Global asset ID for exchange (native=index, HIP-3=100000+dex*10000+index)
  dexName: string;         // "xyz", "hyena", or "__native__" for core HL perps
  collateral: string;      // "USDC", "USDH", "USDT0"
  isNative: boolean;       // true for core HL perps, false for HIP-3

  // Populated from assetCtx
  funding?: string;
  openInterest?: string;
  markPrice?: string;
  oraclePx?: string;
}

/** @deprecated Use PerpMarket instead */
export type HIP3Market = PerpMarket;

export interface MarketGroup {
  baseAsset: string;
  markets: PerpMarket[];
  hasAlternatives: boolean; // true if markets.length > 1
}

export interface AggregatedLevel {
  px: number;
  sz: number;
  sources: { coin: string; sz: number }[];
}

export interface AggregatedBook {
  baseAsset: string;
  bids: AggregatedLevel[];
  asks: AggregatedLevel[];
  marketBooks: { coin: string; bids: L2Level[]; asks: L2Level[] }[];
  timestamp: number;
}

export interface FundingComparison {
  baseAsset: string;
  markets: {
    coin: string;
    dexName: string;
    collateral: string;
    fundingRate: number;
    openInterest: number;
    markPrice: number;
  }[];
  bestForLong: string;  // coin with most favorable funding for longs
  bestForShort: string; // coin with most favorable funding for shorts
}
