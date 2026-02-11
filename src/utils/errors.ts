export class HyperliquidPrimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HyperliquidPrimeError";
  }
}

export class NoMarketsError extends HyperliquidPrimeError {
  constructor(public readonly baseAsset: string) {
    super(`No markets found for ${baseAsset}`);
    this.name = "NoMarketsError";
  }
}

export class InsufficientLiquidityError extends HyperliquidPrimeError {
  constructor(
    public readonly baseAsset: string,
    public readonly requestedSize: number,
  ) {
    super(
      `Insufficient liquidity for ${requestedSize} ${baseAsset} across all markets`,
    );
    this.name = "InsufficientLiquidityError";
  }
}

export class NoWalletError extends HyperliquidPrimeError {
  constructor() {
    super("Wallet required for trading operations. Provide a privateKey in config.");
    this.name = "NoWalletError";
  }
}

export class NotConnectedError extends HyperliquidPrimeError {
  constructor() {
    super("Not connected. Call connect() before using the SDK.");
    this.name = "NotConnectedError";
  }
}

export class ExecutionError extends HyperliquidPrimeError {
  constructor(
    message: string,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = "ExecutionError";
  }
}

export class MarketDataUnavailableError extends HyperliquidPrimeError {
  constructor(
    public readonly baseAsset: string,
    public readonly failedMarkets: string[],
  ) {
    super(
      `Market data unavailable for ${baseAsset}. Failed markets: ${failedMarkets.join(", ") || "unknown"}`,
    );
    this.name = "MarketDataUnavailableError";
  }
}
