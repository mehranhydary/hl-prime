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
  builderFee?: string;
}

export interface MockFillLeg {
  coin: string;
  size: string;
  price: string;
  status: "filled";
  coinIconUrl: string;
  deployerIconUrl?: string;
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
  makeAsset("xyz:GOLD", "GOLD", "Gold", "890M", "xyz"),
  makeAsset("BTC", "BTC", "Bitcoin", "2.1B"),
  makeAsset("ETH", "ETH", "Ethereum", "1.4B"),
  makeAsset("xyz:NVDA", "NVDA", "NVIDIA", "2.4B", "xyz"),
  makeAsset("xyz:SILVER", "SILVER", "Silver", "342M", "xyz"),
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

// ─── Trade (NVDA Long — showcases HIP-3 multi-venue routing) ───

const nvdaPrice = fmtPrice(latestPrice("xyz:NVDA"));
const nvdaPriceNum = latestPrice("xyz:NVDA");
const nvdaChange = priceChange24h("xyz:NVDA");
// $5,000 amount × 20x leverage = $100,000 notional
const nvdaNotional = 100000;
const nvdaSize = (nvdaNotional / nvdaPriceNum).toFixed(6);
const nvdaSizeShort = (nvdaNotional / nvdaPriceNum).toFixed(2);

export const MOCK_TRADE = {
  asset: "NVDA",
  coin: "xyz:NVDA" as ChartAssetKey,
  assetName: "NVIDIA",
  side: "long" as const,
  amount: "5000",
  leverage: 20,
  currentPrice: nvdaPrice,
  priceChange: fmtChange(nvdaChange.change),
  fundingRate: "0.0018%",
  marketsCount: "4",
  collaterals: "USDC, USDH, USDT",
  conversionAmount: `≈ ${nvdaSizeShort} NVDA`,
  iconUrl: hlTokenIcon("xyz:NVDA"),
};

// ─── Quote (multi-venue: 4 legs, 2 active — matches real HL Prime UI) ───

const kmSize = (parseFloat(nvdaSize) * 0.142).toFixed(6);
const cashSize = (parseFloat(nvdaSize) * 0.858).toFixed(6);

export const MOCK_QUOTE: MockQuote = {
  baseSize: nvdaSize,
  usdNotional: `~$${(nvdaNotional - 33).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
  legs: [
    {
      coin: "xyz:NVDA",
      deployer: "xyz",
      proportion: 0,
      size: "0",
      price: `$${nvdaPrice}`,
      collateral: "USDC",
      coinIconUrl: hlTokenIcon("xyz:NVDA"),
      collateralIconUrl: collateralIcon("usdc"),
      deployerIconUrl: deployerIcon("xyz"),
    },
    {
      coin: "flx:NVDA",
      deployer: "flx",
      proportion: 0,
      size: "0",
      price: `$${nvdaPrice}`,
      collateral: "USDC",
      coinIconUrl: hlTokenIcon("flx:NVDA"),
      collateralIconUrl: collateralIcon("usdc"),
      deployerIconUrl: deployerIcon("flx"),
    },
    {
      coin: "km:NVDA",
      deployer: "km",
      proportion: 0.142,
      size: kmSize,
      price: `$${nvdaPrice}`,
      collateral: "USDH",
      coinIconUrl: hlTokenIcon("km:NVDA"),
      collateralIconUrl: collateralIcon("usdh"),
      deployerIconUrl: deployerIcon("km"),
    },
    {
      coin: "cash:NVDA",
      deployer: "cash",
      proportion: 0.858,
      size: cashSize,
      price: `$${nvdaPrice}`,
      collateral: "USDT",
      coinIconUrl: hlTokenIcon("cash:NVDA"),
      collateralIconUrl: collateralIcon("usdt"),
      deployerIconUrl: deployerIcon("cash"),
    },
  ],
  leverage: "20x",
  marginRequired: "$250.00",
  estimatedAvgPrice: `$${nvdaPrice}`,
  impactBps: "0.73 bps",
  fundingRate: "0.0018%",
  builderFee: "1 bps",
};

// ─── Fill ───

export const MOCK_FILL: MockFill = {
  totalSize: nvdaSize,
  avgPrice: `$${nvdaPrice}`,
  legs: [
    { coin: "km:NVDA", size: kmSize, price: `$${nvdaPrice}`, status: "filled", coinIconUrl: hlTokenIcon("km:NVDA"), deployerIconUrl: deployerIcon("km") },
    { coin: "cash:NVDA", size: cashSize, price: `$${nvdaPrice}`, status: "filled", coinIconUrl: hlTokenIcon("cash:NVDA"), deployerIconUrl: deployerIcon("cash") },
  ],
};

// ─── Collateral Prep (swaps needed before execution) ───

export interface MockCollateralSwap {
  fromToken: string;
  toToken: string;
  amount: string;
  need: string;
  have: string;
  impactBps: string;
  fromIconUrl: string;
  toIconUrl: string;
}

export const MOCK_COLLATERAL_PREP: MockCollateralSwap[] = [
  {
    fromToken: "USDH",
    toToken: "USDT",
    amount: "~$432.94",
    need: "$432.94",
    have: "$0.00",
    impactBps: "0.5 bps est",
    fromIconUrl: collateralIcon("usdh"),
    toIconUrl: collateralIcon("usdt"),
  },
  {
    fromToken: "USDC",
    toToken: "USDH",
    amount: "~$70.50",
    need: "$71.74",
    have: "$1.24",
    impactBps: "0.3 bps est",
    fromIconUrl: collateralIcon("usdc"),
    toIconUrl: collateralIcon("usdh"),
  },
];

export const MOCK_SWAP = {
  fromToken: "USDC",
  toToken: "USDT",
  amount: "$175.00",
  fromIconUrl: collateralIcon("usdc"),
  toIconUrl: collateralIcon("usdt"),
  reason: "cash:NVDA requires USDT collateral",
};

// ─── Scene Captions (side text for phone scenes) ───

export const SCENE_CAPTIONS = {
  dashboard: {
    heading: "What Prime Does",
    bullets: [
      "Discover every perp market",
      "Aggregate all liquidity",
      "Route to the best price",
    ],
  },
  tradePage: {
    heading: "Trading",
    bullets: [
      "Real-time price charts",
      "4 venues with live liquidity",
    ],
  },
  fillForm: {
    heading: "Smart Order Routing",
    bullets: [
      "Compare across all venues",
      "Auto collateral swaps",
      "Quote, then execute",
    ],
  },
  quotePhase: {
    heading: "Generating Quote",
    bullets: [
      "Scanning 4 venues...",
      "Optimizing split ratio",
      "Best execution found",
    ],
  },
  swapPhase: {
    heading: "Collateral Swap",
    bullets: [
      "Converting USD to the right collateral for each position",
    ],
  },
  fillPhase: {
    heading: "Order Filled!",
    bullets: [
      "Easily create orders on Trade.xyz, Dreamcash, and more with a handful of clicks.",
    ],
  },
};

// Keep KEY_POINTS for backward compat
export const KEY_POINTS = [
  SCENE_CAPTIONS.dashboard,
  SCENE_CAPTIONS.fillForm,
];
