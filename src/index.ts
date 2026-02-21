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
import { assetVariants } from "./utils/asset.js";
import type { PerpMarket, MarketGroup, AggregatedBook, FundingComparison } from "./market/types.js";
import type {
  Quote,
  ExecutionPlan,
  SplitAllocation,
  SplitQuote,
  SplitExecutionPlan,
  TradeExecutionOptions,
} from "./router/types.js";
import type { ExecutionReceipt, SplitExecutionReceipt } from "./execution/types.js";
import type { LogicalPosition } from "./position/types.js";
import type { CollateralPlan } from "./collateral/types.js";
import type { ReferralResponse } from "./provider/types.js";
import type { Logger } from "./logging/logger.js";
import type { WithWarnings } from "./types/result.js";

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

    // Derive wallet address if private key is provided
    if (config.privateKey) {
      this.walletAddress =
        config.walletAddress ??
        privateKeyToAccount(config.privateKey).address;
    } else {
      this.walletAddress = config.walletAddress;
    }

    this.provider = new NktkasProvider({
      privateKey: config.privateKey,
      walletAddress: this.walletAddress as `0x${string}` | undefined,
      testnet: config.testnet ?? false,
    });

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
    options?: TradeExecutionOptions,
  ): Promise<Quote> {
    this.ensureConnected();
    const tradeOptions = this.normalizeTradeOptions(options);
    const { collateral, warnings } = await this.resolveUserCollateral();
    const quote = await this.router.quote(
      baseAsset,
      side,
      size,
      collateral,
      this._config.defaultSlippage ?? 0.01,
      tradeOptions,
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
    const receipt = await this.executor.execute(plan, user);
    this.provider.invalidateBalanceCaches?.();
    return receipt;
  }

  /** Convenience: quote + execute in one call. */
  async long(
    baseAsset: string,
    size: number,
    options?: TradeExecutionOptions,
  ): Promise<ExecutionReceipt> {
    const q = await this.quote(baseAsset, "buy", size, options);
    return this.execute(q.plan);
  }

  async short(
    baseAsset: string,
    size: number,
    options?: TradeExecutionOptions,
  ): Promise<ExecutionReceipt> {
    const q = await this.quote(baseAsset, "sell", size, options);
    return this.execute(q.plan);
  }

  /** Generate a split quote across multiple HIP-3 markets. Does NOT execute. */
  async quoteSplit(
    baseAsset: string,
    side: "buy" | "sell",
    size: number,
    options?: TradeExecutionOptions,
  ): Promise<SplitQuote> {
    this.ensureConnected();
    const tradeOptions = this.normalizeTradeOptions(options);
    const { collateral, warnings } = await this.resolveUserCollateral();
    const quote = await this.router.quoteSplit(
      baseAsset,
      side,
      size,
      collateral,
      this._config.defaultSlippage ?? 0.01,
      tradeOptions,
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
    const receipt = await this.executor.executeSplit(
      plan,
      this.collateralManager,
      user,
    );
    this.provider.invalidateBalanceCaches?.();
    return receipt;
  }

  /**
   * Estimate collateral swaps required for a split execution plan.
   * Read-only: no transfers, swaps, or abstraction writes are performed.
   */
  async estimateSplitCollateral(
    plan: SplitExecutionPlan,
    userAddress?: string,
  ): Promise<CollateralPlan> {
    this.ensureConnected();
    const user = userAddress ?? this.walletAddress;
    if (!user) throw new NoWalletError();

    const allocations = this.buildAllocationsFromSplitPlan(plan);
    return this.collateralManager.estimateRequirements(allocations, user);
  }

  /** Convenience: split quote + execute in one call. */
  async longSplit(
    baseAsset: string,
    size: number,
    options?: TradeExecutionOptions,
  ): Promise<SplitExecutionReceipt> {
    const q = await this.quoteSplit(baseAsset, "buy", size, options);
    return this.executeSplit(q.splitPlan);
  }

  async shortSplit(
    baseAsset: string,
    size: number,
    options?: TradeExecutionOptions,
  ): Promise<SplitExecutionReceipt> {
    const q = await this.quoteSplit(baseAsset, "sell", size, options);
    return this.executeSplit(q.splitPlan);
  }

  async close(baseAsset: string): Promise<ExecutionReceipt[]> {
    this.ensureConnected();
    const user = this.ensureWallet();
    const requestedVariants = assetVariants(baseAsset);
    const { data: allPositions } = await this.positions.getPositions(user);
    const toClose = allPositions.filter(
      (p) => {
        if (p.size <= 0 || requestedVariants.size === 0) return false;
        const positionVariants = new Set<string>([
          ...assetVariants(p.baseAsset),
          ...assetVariants(p.coin),
        ]);
        for (const variant of positionVariants) {
          if (requestedVariants.has(variant)) return true;
        }
        return false;
      },
    );

    const receipts: ExecutionReceipt[] = [];
    for (const pos of toClose) {
      const side = pos.side === "long" ? "sell" : "buy";
      const q = await this.quote(pos.baseAsset, side, pos.size);
      const receipt = await this.execute(q.plan);
      receipts.push(receipt);
    }
    return receipts;
  }

  // === Positions ===

  /** Get all positions with warnings about any failed deployer fetches. */
  async getPositions(): Promise<WithWarnings<LogicalPosition[]>> {
    this.ensureConnected();
    const user = this.ensureWallet();
    return this.positions.getPositions(user);
  }

  /** Get positions grouped by base asset (unified view) with warnings. */
  async getGroupedPositions(): Promise<WithWarnings<Map<string, LogicalPosition[]>>> {
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

  // === Agent Wallet Management ===

  /** Approve an agent wallet to trade on behalf of this account. Master signs. */
  async approveAgent(agentAddress: `0x${string}`, agentName?: string): Promise<void> {
    this.ensureConnected();
    return this.provider.approveAgent({
      agentAddress,
      agentName: agentName ?? null,
    });
  }

  /** List approved agent wallets for the current user. */
  async listAgents(): Promise<{ address: `0x${string}`; name: string; validUntil: number }[]> {
    this.ensureConnected();
    const user = this.ensureWallet();
    return this.provider.extraAgents(user);
  }

  /** Set abstraction mode for the user. Master signs. */
  async setAbstraction(
    abstraction: "dexAbstraction" | "unifiedAccount" | "portfolioMargin" | "disabled",
  ): Promise<void> {
    this.ensureConnected();
    const user = this.ensureWallet();
    return this.provider.userSetAbstraction({
      user: user as `0x${string}`,
      abstraction,
    });
  }

  /** Set abstraction mode as an agent. Agent signs. */
  async agentSetAbstraction(abstraction: "i" | "u" | "p"): Promise<void> {
    this.ensureConnected();
    return this.provider.agentSetAbstraction({ abstraction });
  }

  // === Referral ===

  /** Get referral data for any user (public read, no wallet needed). */
  async getReferral(user: string): Promise<ReferralResponse> {
    this.ensureConnected();
    return this.provider.referral(user);
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

  private normalizeTradeOptions(
    options?: TradeExecutionOptions,
  ): TradeExecutionOptions | undefined {
    if (!options) return undefined;
    if (options.isCross !== undefined && options.leverage === undefined) {
      throw new HyperliquidPrimeError(
        "isCross requires leverage. Provide leverage when specifying margin mode.",
      );
    }
    if (options.leverage === undefined) {
      return undefined;
    }
    if (!Number.isFinite(options.leverage) || options.leverage <= 0) {
      throw new HyperliquidPrimeError(
        `Invalid leverage "${options.leverage}". Expected a positive number.`,
      );
    }
    return {
      leverage: options.leverage,
      isCross: options.isCross ?? true,
    };
  }

  private buildAllocationsFromSplitPlan(plan: SplitExecutionPlan): SplitAllocation[] {
    const totalSize = plan.legs.reduce(
      (sum, leg) => sum + parseFloat(leg.size),
      0,
    );

    return plan.legs.map((leg) => {
      const size = parseFloat(leg.size);
      const estimatedAvgPrice = parseFloat(leg.price);
      const notional = size * estimatedAvgPrice;
      const leverage = Number.isFinite(leg.leverage) && (leg.leverage ?? 0) > 0
        ? (leg.leverage as number)
        : 1;
      const estimatedCost = notional / leverage;
      return {
        market: leg.market,
        size,
        estimatedCost,
        estimatedAvgPrice,
        proportion: totalSize > 0 ? size / totalSize : 0,
      };
    });
  }
}

// Re-export types for consumers
export type { HyperliquidPrimeConfig, BuilderConfig } from "./config.js";
export type { HLProvider } from "./provider/provider.js";
export type { PerpMarket, HIP3Market, MarketGroup, AggregatedBook, FundingComparison } from "./market/types.js";
export type { Quote, ExecutionPlan, MarketScore, SimulationResult, SplitQuote, SplitExecutionPlan, SplitAllocation, SplitResult } from "./router/types.js";
export { isSplitQuote } from "./router/types.js";
export type { ExecutionReceipt, SplitExecutionReceipt, LegReceipt } from "./execution/types.js";
export type { CollateralPlan, CollateralRequirement, CollateralReceipt } from "./collateral/types.js";
export type { ReferralResponse, ReferralUserState } from "./provider/types.js";
export type { LogicalPosition, ManagedPositionState, RiskProfile } from "./position/types.js";
export type { TradeExecutionOptions } from "./router/types.js";
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
export type { WithWarnings } from "./types/result.js";
export { ok, withWarnings } from "./types/result.js";
