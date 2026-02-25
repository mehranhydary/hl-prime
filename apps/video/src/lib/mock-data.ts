import { staticFile } from "remotion";
import { latestPrice, priceChange24h, type ChartAssetKey } from "./chart-data";

export type { OHLCPoint, ChartAssetKey } from "./chart-data";
export { CHART_DATA, latestPrice, priceChange24h } from "./chart-data";

export interface MockAsset {
  symbol: string;
  /** Full coin key for chart data and icon URLs (e.g. "xyz:TSLA", "BTC") */
  coin: ChartAssetKey;
  name: string;
  price: string;
  change: string;
  positive: boolean;
  volume?: string;
  iconUrl: string;
  /** Optional deployer tag (shown for HIP-3 markets) */
  deployer?: string;
}

export interface MockPosition {
  symbol: string;
  side: "long" | "short";
  size: string;
  leverage: string;
  entryPrice: string;
  pnl: string;
  pnlPositive: boolean;
  iconUrl: string;
}

export interface MockQuoteLeg {
  coin: string;
  deployer?: string;
  proportion: number;
  size: string;
  price: string;
  collateral: string;
  coinIconUrl: string;
  collateralIconUrl: string;
  deployerIconUrl?: string;
}

export interface MockQuote {
  baseSize: string;
  usdNotional: string;
  legs: MockQuoteLeg[];
  leverage: string;
  marginRequired: string;
  estimatedAvgPrice: string;
  impactBps: string;
  fundingRate: string;
}

export interface MockFillLeg {
  coin: string;
  size: string;
  price: string;
  status: "filled";
  coinIconUrl: string;
}

export interface MockFill {
  totalSize: string;
  avgPrice: string;
  legs: MockFillLeg[];
}

// ─── Icon Helpers ───

/** Token icon from Hyperliquid CDN — use full coin name for HIP-3 (e.g. "xyz:TSLA") */
export function hlTokenIcon(coin: string): string {
  return `https://app.hyperliquid.xyz/coins/${coin}.svg`;
}

function collateralIcon(coin: string): string {
  return staticFile(`collateral/${coin.toLowerCase()}.png`);
}

function deployerIcon(deployer: string): string {
  return staticFile(`perp-dexes/${deployer}.png`);
}

/** Format price with commas and appropriate decimals */
function fmtPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

/** Format change percentage */
function fmtChange(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

// ─── Market Data (real prices from Hyperliquid chart data) ───

function makeAsset(
  coin: ChartAssetKey,
  displaySymbol: string,
  name: string,
  volume: string,
  deployer?: string,
): MockAsset {
  const { change, positive } = priceChange24h(coin);
  return {
    symbol: displaySymbol,
    coin,
    name,
    price: fmtPrice(latestPrice(coin)),
    change: fmtChange(change),
    positive,
    volume,
    iconUrl: hlTokenIcon(coin),
    deployer,
  };
}

export const MOCK_ASSETS: MockAsset[] = [
  makeAsset("xyz:TSLA", "TSLA", "Tesla", "1.8B", "xyz"),
  makeAsset("xyz:NVDA", "NVDA", "NVIDIA", "2.4B", "xyz"),
  makeAsset("xyz:GOLD", "GOLD", "Gold", "890M", "xyz"),
  makeAsset("xyz:SILVER", "SILVER", "Silver", "342M", "xyz"),
  makeAsset("BTC", "BTC", "Bitcoin", "2.1B"),
  makeAsset("ETH", "ETH", "Ethereum", "1.4B"),
  makeAsset("SOL", "SOL", "Solana", "892M"),
  makeAsset("xyz:AAPL", "AAPL", "Apple", "1.1B", "xyz"),
];

// ─── Positions (showcase non-crypto) ───

export const MOCK_POSITIONS: MockPosition[] = [
  { symbol: "NVDA", side: "long", size: "15", leverage: "5x", entryPrice: "845.20", pnl: "+$706.50", pnlPositive: true, iconUrl: hlTokenIcon("xyz:NVDA") },
  { symbol: "GOLD", side: "short", size: "2.5", leverage: "3x", entryPrice: "2,685.00", pnl: "-$91.25", pnlPositive: false, iconUrl: hlTokenIcon("xyz:GOLD") },
];

// ─── Balance ───

export const MOCK_BALANCE = "$24,350.00";
export const MOCK_ADDRESS = "0x7A3f...8e21";

// ─── Trade (TSLA Long — showcases HIP-3 multi-venue routing) ───

const tslaPrice = fmtPrice(latestPrice("xyz:TSLA"));
const tslaChange = priceChange24h("xyz:TSLA");
const tslaSize = (10000 / latestPrice("xyz:TSLA")).toFixed(2);

export const MOCK_TRADE = {
  asset: "TSLA",
  coin: "xyz:TSLA" as ChartAssetKey,
  assetName: "Tesla",
  side: "long" as const,
  amount: "10000",
  leverage: 5,
  currentPrice: tslaPrice,
  priceChange: fmtChange(tslaChange.change),
  fundingRate: "0.0018%",
  marketsCount: "4",
  collaterals: "USDC, USDH, USDT",
  conversionAmount: `~${tslaSize} TSLA`,
  iconUrl: hlTokenIcon("xyz:TSLA"),
};

// ─── Quote (split across xyz:TSLA + cash:TSLA — multi-venue) ───

export const MOCK_QUOTE: MockQuote = {
  baseSize: tslaSize,
  usdNotional: "~$10,000.00",
  legs: [
    {
      coin: "xyz:TSLA",
      deployer: "xyz",
      proportion: 0.65,
      size: (parseFloat(tslaSize) * 0.65).toFixed(2),
      price: `$${tslaPrice}`,
      collateral: "USDC",
      coinIconUrl: hlTokenIcon("xyz:TSLA"),
      collateralIconUrl: collateralIcon("usdc"),
      deployerIconUrl: deployerIcon("xyz"),
    },
    {
      coin: "cash:TSLA",
      deployer: "cash",
      proportion: 0.35,
      size: (parseFloat(tslaSize) * 0.35).toFixed(2),
      price: `$${tslaPrice}`,
      collateral: "USDT",
      coinIconUrl: hlTokenIcon("cash:TSLA"),
      collateralIconUrl: collateralIcon("usdt"),
      deployerIconUrl: deployerIcon("cash"),
    },
  ],
  leverage: "5x",
  marginRequired: "$2,000.00",
  estimatedAvgPrice: `$${tslaPrice}`,
  impactBps: "0.8 bps",
  fundingRate: "0.0018%",
};

// ─── Fill ───

export const MOCK_FILL: MockFill = {
  totalSize: tslaSize,
  avgPrice: `$${tslaPrice}`,
  legs: [
    { coin: "xyz:TSLA", size: (parseFloat(tslaSize) * 0.65).toFixed(2), price: `$${tslaPrice}`, status: "filled", coinIconUrl: hlTokenIcon("xyz:TSLA") },
    { coin: "cash:TSLA", size: (parseFloat(tslaSize) * 0.35).toFixed(2), price: `$${tslaPrice}`, status: "filled", coinIconUrl: hlTokenIcon("cash:TSLA") },
  ],
};

// ─── README Key Points (for text card scenes) ───

export const KEY_POINTS = [
  {
    heading: "What Hyperliquid Prime Does",
    bullets: [
      "Discovers all perp markets per asset \u2014 native + HIP-3",
      "Aggregates orderbooks across collateral types",
      "Routes to the single best market by price impact, funding & collateral",
      "Splits large orders across venues for better fills",
    ],
  },
  {
    heading: "Smart Order Routing",
    bullets: [
      "Compares liquidity across xyz, cash, flx, km, and native markets",
      "Automatically swaps collateral (USDC \u2192 USDH) when needed",
      "Single quote-then-execute flow",
    ],
  },
];
