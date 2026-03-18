export const RELAY_BASE_URL = "https://api.relay.link";
export const RELAY_QUOTE_PATH = "/quote/v2";
export const RELAY_QUOTE_FALLBACK_PATH = "/quote";
export const RELAY_CHAINS_PATH = "/chains";
export const RELAY_STATUS_PATH = "/intents/status/v3";
export const RELAY_STATUS_FALLBACK_PATH = "/intents/status";

export const RELAY_HYPERLIQUID_CHAIN_ID = 1337;
export const RELAY_HYPERLIQUID_USDC_ADDRESS = "0x00000000000000000000000000000000";

export const RELAY_DEFAULT_SLIPPAGE_BPS = 50;
export const RELAY_DEFAULT_CHAINS_TTL_MS = 5 * 60 * 1000;
export const RELAY_DEFAULT_STATUS_POLL_INTERVAL_MS = 2_000;
export const RELAY_DEFAULT_STATUS_POLL_TIMEOUT_MS = 2 * 60 * 1000;

export const RELAY_PREFERRED_ORIGIN_CHAIN_ORDER = [
  8453, // Base
  1, // Ethereum
  10, // Optimism
  137, // Polygon
  42161, // Arbitrum
  43114, // Avalanche
  56, // BNB Chain
  324, // zkSync Era
  59144, // Linea
  81457, // Blast
] as const;

export const RELAY_FALLBACK_USDC_BY_CHAIN_ID: Record<number, string> = {
  1: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  10: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
  56: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
  137: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
  324: "0x1d17cb9923a24d334b6faefc2d457fbfc522ca11",
  8453: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  42161: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
  43114: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
  59144: "0x176211869ca2b568f2a7d4ee941e073a821ee1ff",
  81457: "0x4300000000000000000000000000000000000003",
};

export const RELAY_SUPPORTED_USDC_SYMBOLS = new Set([
  "USDC",
  "USDC.E",
  "USDBC",
]);
