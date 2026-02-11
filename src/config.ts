/** Builder fee configuration. */
export interface BuilderConfig {
  /** Builder address (0x-prefixed). */
  address: `0x${string}`;
  /** Fee in basis points. 1 bps = 0.01%. Max 10 bps (0.1%) for perps. */
  feeBps: number;
}

/** @internal SDK default builder fee configuration. */
export const DEFAULT_BUILDER: BuilderConfig = {
  address: "0x34411c9d3c312e6ECb32C079AA0F34B572Dddc37",
  feeBps: 1,
};

export interface HyperliquidPrimeConfig {
  /** Hex private key. Required for trading, optional for read-only. */
  privateKey?: `0x${string}`;

  /** User's wallet address. Derived from privateKey if not provided. */
  walletAddress?: string;

  /** Use testnet. Default: false. */
  testnet?: boolean;

  /** Default slippage for market orders. Default: 0.01 (1%). */
  defaultSlippage?: number;

  /** Log level. Default: "info". */
  logLevel?: "debug" | "info" | "warn" | "error" | "silent";

  /** Pretty-print logs. Default: false. */
  prettyLogs?: boolean;

  /**
   * Builder fee configuration.
   * - Default (undefined): SDK author's address with 1 bps fee.
   * - null: Disable builder fees entirely.
   * - BuilderConfig: Custom builder address and fee.
   */
  builder?: BuilderConfig | null;
}
