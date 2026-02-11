import type { L2Level } from "../provider/types.js";

export interface HIP3Market {
  baseAsset: string;       // Normalized: "ETH", "BTC"
  coin: string;            // Full HL identifier: "xyz:ETH100" or "ETH"
  assetIndex: number;      // For exchange endpoint
  dexName: string;         // "xyz", "abc", or "__native__" for first-party
  collateral: string;      // "USDC", "USDT", "USDE" — determined by research
  isNative: boolean;       // true for first-party HL perps, false for HIP-3

  // Populated from assetCtx
  funding?: string;
  openInterest?: string;
  markPrice?: string;
  oraclePx?: string;
}

export interface MarketGroup {
  baseAsset: string;
  markets: HIP3Market[];
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
