import type { PerpMarket } from "../../src/market/types.js";

// Real mainnet TSLA markets — 4 deployers, 3 different collateral types
export const TSLA_XYZ: PerpMarket = {
  baseAsset: "TSLA",
  coin: "xyz:TSLA",
  assetIndex: 110001,  // 100000 + 1*10000 + 1
  dexName: "xyz",
  collateral: "USDC",
  isNative: false,
  funding: "0.00000625",
  openInterest: "37735.156",
  markPrice: "431.56",
};

export const TSLA_FLX: PerpMarket = {
  baseAsset: "TSLA",
  coin: "flx:TSLA",
  assetIndex: 120000,  // 100000 + 2*10000 + 0
  dexName: "flx",
  collateral: "USDH",
  isNative: false,
  funding: "-0.0002",
  openInterest: "1780.1",
  markPrice: "431.86",
};

export const TSLA_CASH: PerpMarket = {
  baseAsset: "TSLA",
  coin: "cash:TSLA",
  assetIndex: 130001,  // 100000 + 3*10000 + 1
  dexName: "cash",
  collateral: "USDT0",
  isNative: false,
  funding: "0.0005",
  openInterest: "3839.184",
  markPrice: "431.48",
};

export const ALL_TSLA_MARKETS = [TSLA_XYZ, TSLA_FLX, TSLA_CASH];

export const BTC_NATIVE: PerpMarket = {
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

// Mixed native + HIP-3 markets for the same asset
export const ETH_NATIVE: PerpMarket = {
  baseAsset: "ETH",
  coin: "ETH",
  assetIndex: 1,
  dexName: "__native__",
  collateral: "USDC",
  isNative: true,
  funding: "0.00003",
  openInterest: "500000",
  markPrice: "3200.00",
};

export const ETH_HYENA: PerpMarket = {
  baseAsset: "ETH",
  coin: "hyena:ETH",
  assetIndex: 110001,  // 100000 + 1*10000 + 1
  dexName: "hyena",
  collateral: "USDC",
  isNative: false,
  funding: "0.00001",
  openInterest: "12000",
  markPrice: "3200.50",
};

export const ALL_ETH_MARKETS = [ETH_NATIVE, ETH_HYENA];
