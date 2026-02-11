import type { HIP3Market } from "../../src/market/types.js";

// Real mainnet TSLA markets — 4 deployers, 3 different collateral types
export const TSLA_XYZ: HIP3Market = {
  baseAsset: "TSLA",
  coin: "xyz:TSLA",
  assetIndex: 1,
  dexName: "xyz",
  collateral: "USDC",
  isNative: false,
  funding: "0.00000625",
  openInterest: "37735.156",
  markPrice: "431.56",
};

export const TSLA_FLX: HIP3Market = {
  baseAsset: "TSLA",
  coin: "flx:TSLA",
  assetIndex: 0,
  dexName: "flx",
  collateral: "USDH",
  isNative: false,
  funding: "-0.0002",
  openInterest: "1780.1",
  markPrice: "431.86",
};

export const TSLA_CASH: HIP3Market = {
  baseAsset: "TSLA",
  coin: "cash:TSLA",
  assetIndex: 1,
  dexName: "cash",
  collateral: "USDT0",
  isNative: false,
  funding: "0.0005",
  openInterest: "3839.184",
  markPrice: "431.48",
};

export const ALL_TSLA_MARKETS = [TSLA_XYZ, TSLA_FLX, TSLA_CASH];

export const BTC_NATIVE: HIP3Market = {
  baseAsset: "BTC",
  coin: "BTC",
  assetIndex: 0,
  dexName: "__native__",
  collateral: "USDC",
  isNative: true,
  funding: "0.00005",
  openInterest: "100000",
  markPrice: "42000.50",
};
