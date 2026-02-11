import type { HIP3Market } from "../../src/market/types.js";

export const ETH_NATIVE: HIP3Market = {
  baseAsset: "ETH",
  coin: "ETH",
  assetIndex: 1,
  dexName: "__native__",
  collateral: "USDC",
  isNative: true,
  funding: "0.0001",
  openInterest: "50000",
  markPrice: "3200.25",
};

export const ETH_HIP3_USDT: HIP3Market = {
  baseAsset: "ETH",
  coin: "xyz:ETH100",
  assetIndex: 200,
  dexName: "xyz",
  collateral: "USDT",
  isNative: false,
  funding: "-0.0002",
  openInterest: "15000",
  markPrice: "3200.30",
};

export const ETH_HIP3_USDE: HIP3Market = {
  baseAsset: "ETH",
  coin: "abc:ETH50",
  assetIndex: 201,
  dexName: "abc",
  collateral: "USDE",
  isNative: false,
  funding: "0.0005",
  openInterest: "8000",
  markPrice: "3200.15",
};

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

export const ALL_ETH_MARKETS = [ETH_NATIVE, ETH_HIP3_USDT, ETH_HIP3_USDE];
