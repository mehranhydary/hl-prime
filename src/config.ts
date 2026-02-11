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
}
