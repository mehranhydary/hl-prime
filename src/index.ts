import { privateKeyToAccount } from "viem/accounts";
import type { HyperliquidPrimeConfig, BuilderConfig } from "./config.js";
import { DEFAULT_BUILDER } from "./config.js";
import type { HLProvider } from "./provider/provider.js";
import { NktkasProvider } from "./provider/nktkas.js";
import { MarketRegistry } from "./market/registry.js";
import { BookAggregator } from "./market/aggregator.js";
import { Router } from "./router/router.js";
import { Executor } from "./execution/executor.js";
import { CollateralManager } from "./collateral/manager.js";
import { PositionManager } from "./position/manager.js";
import { createLogger } from "./logging/logger.js";
import { HyperliquidPrimeError, NoWalletError, NotConnectedError } from "./utils/errors.js";
import type { PerpMarket, MarketGroup, AggregatedBook, FundingComparison } from "./market/types.js";
import type { Quote, ExecutionPlan, SplitQuote, SplitExecutionPlan } from "./router/types.js";
import type { ExecutionReceipt, SplitExecutionReceipt } from "./execution/types.js";
import type { LogicalPosition } from "./position/types.js";
import type { Logger } from "./logging/logger.js";

export class HyperliquidPrime {
  private provider: HLProvider;
  private _registry: MarketRegistry;
  private router: Router;
  private executor: Executor;
  private collateralManager: CollateralManager;
  private positions: PositionManager;
  private aggregator: BookAggregator;
  private logger: Logger;
  private _config: HyperliquidPrimeConfig;
  private walletAddress: string | undefined;
  private connected = false;

  constructor(config: HyperliquidPrimeConfig) {
    this._config = config;
    this.logger = createLogger({
      level: config.logLevel ?? "info",
      pretty: config.prettyLogs ?? false,
    });

    this.provider = new NktkasProvider({
      privateKey: config.privateKey,
      testnet: config.testnet ?? false,
    });

    // Derive wallet address if private key is provided
    if (config.privateKey) {
      this.walletAddress =
        config.walletAddress ??
        privateKeyToAccount(config.privateKey).address;
    } else {
      this.walletAddress = config.walletAddress;
    }

    this._registry = new MarketRegistry(this.provider, this.logger);
    this.aggregator = new BookAggregator(
      this.provider,
      this._registry,
      this.logger,
    );
    this.collateralManager = new CollateralManager(this.provider, this.logger);
    this.router = new Router(
      this.provider,
      this._registry,
      this.logger,
      this.aggregator,
    );

    // Resolve builder config: undefined → default, null → disabled, object → custom
    const resolvedBuilder: BuilderConfig | null =
      config.builder === undefined ? DEFAULT_BUILDER
        : config.builder === null ? null
        : config.builder;

    if (resolvedBuilder && (resolvedBuilder.feeBps < 0 || resolvedBuilder.feeBps > 10)) {
      throw new HyperliquidPrimeError(
        `Builder fee ${resolvedBuilder.feeBps} bps out of range (0-10 bps)`,
      );
    }

    this.executor = new Executor(this.provider, this.logger, resolvedBuilder);
    this.positions = new PositionManager(
      this.provider,
      this._registry,
      this.logger,
    );
  }

  /** Connect to Hyperliquid and discover markets. Must be called before use. */
  async connect(): Promise<void> {
    await this.provider.connect();
    await this._registry.discover();
    this.connected = true;
    this.logger.info("Hyperliquid Prime connected");
  }

  private ensureConnected(): void {
    if (!this.connected) throw new NotConnectedError();
  }

  private ensureWallet(): string {
    if (!this.walletAddress) throw new NoWalletError();
    return this.walletAddress;
  }

  // === Read-Only (no wallet required) ===

  /** Get all HIP-3 markets for an asset. */
  getMarkets(baseAsset: string): PerpMarket[] {
    this.ensureConnected();
    return this._registry.getMarkets(baseAsset);
  }

  /** Get all asset groups that have multiple HIP-3 markets. */
  getAggregatedMarkets(): MarketGroup[] {
    this.ensureConnected();
    return this._registry.getGroupsWithAlternatives();
  }

  /** Get a merged orderbook across all markets for an asset. */
  async getAggregatedBook(baseAsset: string): Promise<AggregatedBook> {
    this.ensureConnected();
    return this.aggregator.aggregate(baseAsset);
  }

  /** Compare funding rates across all markets for an asset. */
  async getFundingComparison(
    baseAsset: string,
  ): Promise<FundingComparison> {
    this.ensureConnected();
    const markets = this._registry.getMarkets(baseAsset);

    const comparison: FundingComparison = {
      baseAsset,
      markets: markets.map((m) => ({
        coin: m.coin,
        dexName: m.dexName,
        collateral: m.collateral,
        fundingRate: parseFloat(m.funding ?? "0"),
        openInterest: parseFloat(m.openInterest ?? "0"),
        markPrice: parseFloat(m.markPrice ?? "0"),
      })),
      bestForLong: "",
      bestForShort: "",
    };

    // Best for long = lowest (most negative) funding rate
    // (shorts pay longs when funding is negative)
    const sorted = [...comparison.markets].sort(
      (a, b) => a.fundingRate - b.fundingRate,
    );
    comparison.bestForLong = sorted[0]?.coin ?? "";
    comparison.bestForShort = sorted[sorted.length - 1]?.coin ?? "";

    return comparison;
  }

  /** Generate a routing quote. Does NOT execute. */
  async quote(
    baseAsset: string,
    side: "buy" | "sell",
    size: number,
  ): Promise<Quote> {
    this.ensureConnected();
    const { collateral, warnings } = await this.resolveUserCollateral();
    const quote = await this.router.quote(
      baseAsset,
      side,
      size,
      collateral,
      this._config.defaultSlippage ?? 0.01,
    );
    if (warnings.length > 0) {
      quote.warnings = [...(quote.warnings ?? []), ...warnings];
    }
    return quote;
  }

  // === Trading (wallet required) ===

  /** Execute a previously generated quote. */
  async execute(plan: ExecutionPlan): Promise<ExecutionReceipt> {
    this.ensureConnected();
    const user = this.ensureWallet();
    return this.executor.execute(plan, user);
  }

  /** Convenience: quote + execute in one call. */
  async long(
    baseAsset: string,
    size: number,
  ): Promise<ExecutionReceipt> {
    const q = await this.quote(baseAsset, "buy", size);
    return this.execute(q.plan);
  }

  async short(
    baseAsset: string,
    size: number,
  ): Promise<ExecutionReceipt> {
    const q = await this.quote(baseAsset, "sell", size);
    return this.execute(q.plan);
  }

  /** Generate a split quote across multiple HIP-3 markets. Does NOT execute. */
  async quoteSplit(
    baseAsset: string,
    side: "buy" | "sell",
    size: number,
  ): Promise<SplitQuote> {
    this.ensureConnected();
    const { collateral, warnings } = await this.resolveUserCollateral();
    const quote = await this.router.quoteSplit(
      baseAsset,
      side,
      size,
      collateral,
      this._config.defaultSlippage ?? 0.01,
    );
    if (warnings.length > 0) {
      quote.warnings = [...(quote.warnings ?? []), ...warnings];
    }
    return quote;
  }

  /** Execute a previously generated split quote. */
  async executeSplit(plan: SplitExecutionPlan): Promise<SplitExecutionReceipt> {
    this.ensureConnected();
    const user = this.ensureWallet();
    return this.executor.executeSplit(
      plan,
      this.collateralManager,
      user,
    );
  }

  /** Convenience: split quote + execute in one call. */
  async longSplit(
    baseAsset: string,
    size: number,
  ): Promise<SplitExecutionReceipt> {
    const q = await this.quoteSplit(baseAsset, "buy", size);
    return this.executeSplit(q.splitPlan);
  }

  async shortSplit(
    baseAsset: string,
    size: number,
  ): Promise<SplitExecutionReceipt> {
    const q = await this.quoteSplit(baseAsset, "sell", size);
    return this.executeSplit(q.splitPlan);
  }

  async close(baseAsset: string): Promise<ExecutionReceipt[]> {
    this.ensureConnected();
    const user = this.ensureWallet();
    const allPositions = await this.positions.getPositions(user);
    const toClose = allPositions.filter(
      (p) => p.baseAsset.toUpperCase() === baseAsset.toUpperCase() && p.size > 0,
    );

    const receipts: ExecutionReceipt[] = [];
    for (const pos of toClose) {
      const side = pos.side === "long" ? "sell" : "buy";
      const q = await this.quote(pos.coin, side, pos.size);
      const receipt = await this.execute(q.plan);
      receipts.push(receipt);
    }
    return receipts;
  }

  // === Positions ===

  /** Get all positions. */
  async getPositions(): Promise<LogicalPosition[]> {
    this.ensureConnected();
    const user = this.ensureWallet();
    return this.positions.getPositions(user);
  }

  /** Get positions grouped by base asset (unified view). */
  async getGroupedPositions(): Promise<Map<string, LogicalPosition[]>> {
    this.ensureConnected();
    const user = this.ensureWallet();
    return this.positions.getGroupedPositions(user);
  }

  // === Balance ===

  /** Get perp account balance/margin summary. */
  async getBalance(): Promise<{
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
    totalRawUsd: string;
  }> {
    this.ensureConnected();
    const user = this.ensureWallet();
    const state = await this.provider.clearinghouseState(user);
    return state.marginSummary;
  }

  // === Escape Hatches ===

  /** Direct access to the provider for raw HL API calls. */
  get api(): HLProvider {
    return this.provider;
  }

  /** Direct access to the market registry. */
  get markets(): MarketRegistry {
    return this._registry;
  }

  // === Lifecycle ===

  async disconnect(): Promise<void> {
    await this.provider.disconnect();
    this.connected = false;
    this.logger.info("Hyperliquid Prime disconnected");
  }

  private async resolveUserCollateral(): Promise<{
    collateral: string[];
    warnings: string[];
  }> {
    let collateral: string[] = ["USDC"];
    const warnings: string[] = [];
    if (!this.walletAddress) {
      return { collateral, warnings };
    }

    try {
      const spotState = await this.provider.spotClearinghouseState(
        this.walletAddress,
      );
      collateral = spotState.balances
        .filter((b) => parseFloat(b.total) > 0)
        .map((b) => b.coin);
      if (!collateral.includes("USDC")) {
        collateral.push("USDC");
      }
    } catch (error) {
      warnings.push(
        "Could not load spot balances for collateral matching; defaulting to USDC",
      );
      this.logger.warn(
        { error },
        "Falling back to default collateral set due to spot balance fetch failure",
      );
    }

    return { collateral, warnings };
  }
}

// Re-export types for consumers
export type { HyperliquidPrimeConfig, BuilderConfig } from "./config.js";
export type { HLProvider } from "./provider/provider.js";
export type { PerpMarket, HIP3Market, MarketGroup, AggregatedBook, FundingComparison } from "./market/types.js";
export type { Quote, ExecutionPlan, MarketScore, SimulationResult, SplitQuote, SplitExecutionPlan, SplitAllocation, SplitResult } from "./router/types.js";
export { isSplitQuote } from "./router/types.js";
export type { ExecutionReceipt, SplitExecutionReceipt } from "./execution/types.js";
export type { CollateralPlan, CollateralRequirement, CollateralReceipt } from "./collateral/types.js";
export type { LogicalPosition, ManagedPositionState, RiskProfile } from "./position/types.js";
export type { Logger } from "./logging/logger.js";
export { MarketRegistry } from "./market/registry.js";
export { BookAggregator } from "./market/aggregator.js";
export { Router } from "./router/router.js";
export { FillSimulator } from "./router/simulator.js";
export { MarketScorer } from "./router/scorer.js";
export { SplitOptimizer } from "./router/splitter.js";
export { CollateralManager } from "./collateral/manager.js";
export { Executor } from "./execution/executor.js";
export { PositionManager } from "./position/manager.js";
export { NktkasProvider } from "./provider/nktkas.js";
export { createLogger } from "./logging/logger.js";
export {
  HyperliquidPrimeError,
  NoMarketsError,
  InsufficientLiquidityError,
  MarketDataUnavailableError,
  NoWalletError,
  NotConnectedError,
  ExecutionError,
} from "./utils/errors.js";
