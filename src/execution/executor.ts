import { randomUUID } from "node:crypto";
import type { HLProvider } from "../provider/provider.js";
import type { Logger } from "../logging/logger.js";
import type { ExecutionPlan, SplitAllocation, SplitExecutionPlan } from "../router/types.js";
import type { ExecutionReceipt, LegReceipt, SplitExecutionReceipt } from "./types.js";
import type { CollateralManager } from "../collateral/manager.js";
import type { CollateralReceipt } from "../collateral/types.js";
import type { BuilderConfig } from "../config.js";

/** Wire-format builder object for @nktkas/hyperliquid. */
interface WireBuilder {
  b: `0x${string}`;
  f: number; // 0.1bps units
}

interface ParsedOrderStatus {
  success: boolean;
  orderId: number | undefined;
  filledSize: string;
  avgPrice: string;
  error?: string;
}

export class Executor {
  private logger: Logger;
  private wireBuilder: WireBuilder | null;
  private builderEnabledForOrders = false;
  private approvalChecked = false;
  private builderManualApprovalWarned = false;

  constructor(
    private provider: HLProvider,
    logger: Logger,
    builderConfig: BuilderConfig | null,
  ) {
    this.logger = logger.child({ module: "executor" });

    if (builderConfig) {
      this.wireBuilder = {
        b: builderConfig.address,
        f: builderConfig.feeBps * 10, // bps → 0.1bps
      };
    } else {
      this.wireBuilder = null;
    }
  }

  /**
   * Ensure the user has approved this builder's fee before trading.
   * Called once per session, before the first trade.
   */
  private async ensureBuilderApproval(userAddress: string): Promise<void> {
    if (!this.wireBuilder || this.approvalChecked) return;

    try {
      const currentApproval = await this.provider.maxBuilderFee({
        user: userAddress,
        builder: this.wireBuilder.b,
      });

      if (this.isBuilderApprovalSufficient(currentApproval, this.wireBuilder.f)) {
        this.logger.debug(
          {
            builder: this.wireBuilder.b,
            approvedRaw: currentApproval,
            approvedTenthsBps: this.normalizedApprovalTenthsBps(currentApproval),
            requiredTenthsBps: this.wireBuilder.f,
          },
          "Builder fee already approved",
        );
        this.builderEnabledForOrders = true;
        this.approvalChecked = true;
        this.builderManualApprovalWarned = false;
        return;
      }

      const signerAddress = this.provider.getSignerAddress?.();
      const isAgentSession = Boolean(
        signerAddress && signerAddress.toLowerCase() !== userAddress.toLowerCase(),
      );
      if (isAgentSession) {
        // The master wallet may have just approved the builder fee (e.g. via the trade form's
        // pre-trade actions). Poll briefly to allow the on-chain state to propagate before
        // giving up.
        const approved = await this.pollBuilderApproval(userAddress);
        if (approved) {
          this.builderEnabledForOrders = true;
          this.approvalChecked = true;
          this.builderManualApprovalWarned = false;
          this.logger.info(
            { builder: this.wireBuilder.b, user: userAddress },
            "Builder fee confirmed after polling",
          );
          return;
        }

        // Do NOT cache the negative result for agent sessions. The master wallet
        // may approve the builder fee at any time (e.g. via the frontend pre-trade
        // MetaMask flow), so we must re-check on every trade until approved.
        this.builderEnabledForOrders = false;
        if (!this.builderManualApprovalWarned) {
          this.logger.warn(
            {
              builder: this.wireBuilder.b,
              signer: signerAddress,
              user: userAddress,
              approvedRaw: currentApproval,
              approvedTenthsBps: this.normalizedApprovalTenthsBps(currentApproval),
              requiredTenthsBps: this.wireBuilder.f,
              maxFeeRate: `${(this.wireBuilder.f / 1000).toFixed(2)}%`,
            },
            "Builder fee not approved for user. Approve with master wallet (setup flow) to enable builder fees.",
          );
          this.builderManualApprovalWarned = true;
        }
        return;
      }

      // Convert wire 0.1bps back to percentage string for approval
      const bps = this.wireBuilder.f / 10;
      const maxFeeRate = `${(bps * 0.01).toFixed(2)}%`;

      this.logger.warn(
        { builder: this.wireBuilder.b, maxFeeRate },
        "Auto-approving builder fee (one-time on-chain action). Set builder: null in config to disable.",
      );

      await this.provider.approveBuilderFee({
        maxFeeRate,
        builder: this.wireBuilder.b,
      });

      this.builderEnabledForOrders = true;
      this.approvalChecked = true;
      this.logger.info("Builder fee approved successfully");
    } catch (error) {
      this.builderEnabledForOrders = false;
      if (this.isDepositRequiredError(error)) {
        // Terminal condition until funds are deposited: avoid noisy retries every order.
        this.approvalChecked = true;
        this.logger.warn(
          { error },
          "Builder fee approval unavailable before first deposit; disabling builder fee checks for this session.",
        );
        return;
      }
      this.logger.warn(
        { error },
        "Failed to check/approve builder fee — continuing without builder fee for this order; will retry next order.",
      );
      // Do NOT set approvalChecked = true so we retry on the next order attempt
    }
  }

  /**
   * Reset the cached builder approval state so the next trade re-checks on-chain.
   * Call after the master wallet approves the builder fee (e.g. after setup flow).
   */
  resetBuilderApprovalCheck(): void {
    this.approvalChecked = false;
    this.builderEnabledForOrders = false;
    this.builderManualApprovalWarned = false;
  }

  /**
   * Execute a plan generated by the router.
   * This is the ONLY place orders are placed.
   */
  async execute(plan: ExecutionPlan, userAddress: string): Promise<ExecutionReceipt> {
    await this.ensureBuilderApproval(userAddress);

    this.logger.info(
      {
        market: plan.market.coin,
        side: plan.side,
        size: plan.size,
        price: plan.price,
      },
      "Executing order",
    );

    try {
      await this.applyLeverageIfRequested(plan);

      const builder = this.builderEnabledForOrders ? this.wireBuilder ?? undefined : undefined;
      const cloid = `0x${randomUUID().replace(/-/g, "")}`;
      const result = await this.provider.placeOrder(
        {
          assetIndex: plan.market.assetIndex,
          isBuy: plan.side === "buy",
          price: plan.price,
          size: plan.size,
          reduceOnly: plan.reduceOnly ?? false,
          orderType: plan.orderType,
          cloid,
        },
        builder,
      );

      const parsed = this.parseOrderStatus(result.statuses[0], plan.price);
      if (!parsed.success) {
        this.logger.error({ error: parsed.error, status: result.statuses[0], plan }, "Order rejected");
        return {
          success: false,
          market: plan.market,
          side: plan.side,
          requestedSize: plan.size,
          filledSize: parsed.filledSize,
          avgPrice: parsed.avgPrice,
          orderId: parsed.orderId,
          timestamp: Date.now(),
          error: parsed.error ?? "Order rejected",
          raw: result,
        };
      }

      const receipt: ExecutionReceipt = {
        success: true,
        market: plan.market,
        side: plan.side,
        requestedSize: plan.size,
        filledSize: parsed.filledSize,
        avgPrice: parsed.avgPrice,
        orderId: parsed.orderId,
        timestamp: Date.now(),
        raw: result,
      };

      this.logger.info(
        {
          orderId: receipt.orderId,
          filledSize: receipt.filledSize,
          avgPrice: receipt.avgPrice,
        },
        "Order executed",
      );

      return receipt;
    } catch (error) {
      this.logger.error({ error, plan }, "Order execution failed");

      return {
        success: false,
        market: plan.market,
        side: plan.side,
        requestedSize: plan.size,
        filledSize: "0",
        avgPrice: "0",
        orderId: undefined,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : String(error),
        raw: error,
      };
    }
  }

  /**
   * Execute a split order plan across multiple markets.
   * Flow: prepare collateral → batch place all leg orders → aggregate receipts.
   *
   * Returns per-leg receipts so callers can see exactly which legs succeeded
   * even when some fail (partial fill scenario).
   */
  async executeSplit(
    plan: SplitExecutionPlan,
    collateralManager: CollateralManager,
    userAddress: string,
  ): Promise<SplitExecutionReceipt> {
    await this.ensureBuilderApproval(userAddress);

    this.logger.info(
      {
        legs: plan.legs.length,
        side: plan.side,
        totalSize: plan.totalSize,
        markets: plan.legs.map((l) => l.market.coin),
      },
      "Executing split order",
    );

    const timestamp = Date.now();

    // Step 1: Apply requested leverage per leg/market before any transfers/orders.
    try {
      await this.applySplitLeverage(plan);
    } catch (error) {
      return this.failedSplitReceipt(plan, timestamp, {
        success: false,
        swapsExecuted: [],
        abstractionWasEnabled: false,
        error: error instanceof Error ? error.message : String(error),
      }, `Leverage setup failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Step 2: Estimate collateral using live balances at execution time.
    const allocations: SplitAllocation[] = this.buildAllocationsFromLegs(plan);
    const collateralPlan = await collateralManager.estimateRequirements(
      allocations,
      userAddress,
    );
    this.logger.info(
      {
        user: userAddress,
        swapsNeeded: collateralPlan.swapsNeeded,
        requirements: collateralPlan.requirements.map((req) => ({
          token: req.token,
          amountNeeded: req.amountNeeded,
          currentBalance: req.currentBalance,
          shortfall: req.shortfall,
          swapFrom: req.swapFrom,
          estimatedSwapCostBps: req.estimatedSwapCostBps,
        })),
      },
      "Collateral estimate at execution time (live balances)",
    );

    // Step 3: Prepare collateral (enable abstraction, swap if needed)
    let collateralReceipt: CollateralReceipt;
    if (collateralPlan.swapsNeeded) {
      collateralReceipt = await collateralManager.prepare(
        collateralPlan,
        userAddress,
      );
      if (!collateralReceipt.success) {
        return this.failedSplitReceipt(plan, timestamp, collateralReceipt,
          `Collateral preparation failed: ${collateralReceipt.error}`);
      }
    } else {
      collateralReceipt = {
        success: true,
        swapsExecuted: [],
        abstractionWasEnabled: false,
      };
    }

    // Step 4: Place all leg orders via batchOrders (single atomic API call)
    try {
      const orderParams = plan.legs.map((leg) => ({
        assetIndex: leg.market.assetIndex,
        isBuy: leg.side === "buy",
        price: leg.price,
        size: leg.size,
        reduceOnly: false,
        orderType: leg.orderType,
        cloid: `0x${randomUUID().replace(/-/g, "")}`,
      }));

      const result = await this.provider.batchOrders(
        orderParams,
        this.builderEnabledForOrders ? this.wireBuilder ?? undefined : undefined,
      );

      // Step 5: Map each status to a per-leg receipt
      const legs: LegReceipt[] = plan.legs.map((leg, i) => {
        const status = result.statuses[i];
        const parsed = this.parseOrderStatus(status, leg.price);

        return {
          market: leg.market,
          side: leg.side,
          requestedSize: leg.size,
          filledSize: parsed.filledSize,
          avgPrice: parsed.avgPrice,
          orderId: parsed.orderId,
          success: parsed.success,
          error: parsed.error,
          raw: status,
        };
      });

      // Step 6: Aggregate results
      let totalFilledSize = 0;
      let totalFilledCost = 0;
      let succeededCount = 0;
      let failedCount = 0;

      for (const leg of legs) {
        const filled = parseFloat(leg.filledSize);
        const price = parseFloat(leg.avgPrice);
        totalFilledSize += filled;
        totalFilledCost += filled * price;
        if (leg.success) {
          succeededCount++;
        } else {
          failedCount++;
        }
      }

      const allSucceeded = failedCount === 0;
      const partialFill = succeededCount > 0 && failedCount > 0;
      const aggregateAvgPrice = totalFilledSize > 0
        ? (totalFilledCost / totalFilledSize).toFixed(6)
        : "0";

      const warnings: string[] = [];
      if (partialFill) {
        const failedLegs = legs.filter((l) => !l.success);
        warnings.push(
          `Partial fill: ${succeededCount}/${legs.length} legs succeeded. ` +
          `Failed: ${failedLegs.map((l) => `${l.market.coin} (${l.error ?? "unknown"})`).join(", ")}`,
        );
      }

      this.logger.info(
        {
          allSucceeded,
          partialFill,
          totalFilledSize,
          aggregateAvgPrice,
          legsSucceeded: succeededCount,
          legsFailed: failedCount,
        },
        "Split order executed",
      );

      return {
        success: allSucceeded,
        allSucceeded,
        partialFill,
        legs,
        collateralReceipt,
        totalRequestedSize: plan.totalSize,
        totalFilledSize: totalFilledSize.toString(),
        aggregateAvgPrice,
        timestamp,
        warnings,
      };
    } catch (error) {
      this.logger.error({ error }, "Split order execution failed");
      return this.failedSplitReceipt(plan, timestamp, collateralReceipt,
        error instanceof Error ? error.message : String(error));
    }
  }

  /** Build a failed SplitExecutionReceipt with consistent shape. */
  private failedSplitReceipt(
    plan: SplitExecutionPlan,
    timestamp: number,
    collateralReceipt: CollateralReceipt,
    error: string,
  ): SplitExecutionReceipt {
    return {
      success: false,
      allSucceeded: false,
      partialFill: false,
      legs: [],
      collateralReceipt,
      totalRequestedSize: plan.totalSize,
      totalFilledSize: "0",
      aggregateAvgPrice: "0",
      timestamp,
      warnings: [],
      error,
    };
  }

  private buildAllocationsFromLegs(plan: SplitExecutionPlan): SplitAllocation[] {
    const totalSize = plan.legs.reduce((sum, leg) => sum + parseFloat(leg.size), 0);
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

  private async applyLeverageIfRequested(plan: ExecutionPlan): Promise<void> {
    if (plan.leverage === undefined) return;
    if (!Number.isFinite(plan.market.assetIndex)) {
      throw new Error(`Invalid asset index "${plan.market.assetIndex}" for ${plan.market.coin}`);
    }
    if (!Number.isFinite(plan.leverage) || plan.leverage <= 0) {
      throw new Error(`Invalid leverage "${plan.leverage}" for ${plan.market.coin}`);
    }

    // Safety clamp: never send leverage exceeding the market's maximum to the exchange
    const maxLev = plan.market.maxLeverage;
    let effective = plan.leverage;
    if (maxLev > 0 && effective > maxLev) {
      this.logger.warn(
        { market: plan.market.coin, requested: effective, max: maxLev },
        "Clamping leverage to market maximum (safety guard)",
      );
      effective = maxLev;
    }

    let isCross = plan.isCross ?? true;
    if (isCross && plan.market.onlyIsolated) {
      this.logger.warn(
        { market: plan.market.coin, assetIndex: plan.market.assetIndex },
        "Cross margin not supported for this asset; switching leverage update to isolated margin",
      );
      isCross = false;
    }
    this.logger.info(
      { market: plan.market.coin, assetIndex: plan.market.assetIndex, leverage: effective, isCross },
      "Applying leverage before execution",
    );
    await this.provider.setLeverage(plan.market.assetIndex, effective, isCross);
  }

  private async applySplitLeverage(plan: SplitExecutionPlan): Promise<void> {
    const applied = new Set<string>();
    for (const leg of plan.legs) {
      if (leg.leverage === undefined) continue;
      const key = `${leg.market.coin}:${leg.leverage}:${leg.isCross ?? true}`;
      if (applied.has(key)) continue;
      await this.applyLeverageIfRequested(leg);
      applied.add(key);
    }
  }

  private parseOrderStatus(status: unknown, fallbackPrice: string): ParsedOrderStatus {
    if (!status) {
      return {
        success: false,
        orderId: undefined,
        filledSize: "0",
        avgPrice: "0",
        error: "Exchange returned no order status.",
      };
    }

    if (typeof status === "string") {
      if (status === "waitingForFill" || status === "waitingForTrigger") {
        return {
          success: false,
          orderId: undefined,
          filledSize: "0",
          avgPrice: "0",
          error: `Order did not fill immediately (${status}).`,
        };
      }

      return {
        success: false,
        orderId: undefined,
        filledSize: "0",
        avgPrice: "0",
        error: `Unknown order status: ${status}`,
      };
    }

    if (typeof status !== "object") {
      return {
        success: false,
        orderId: undefined,
        filledSize: "0",
        avgPrice: "0",
        error: "Unrecognized order status payload.",
      };
    }

    const value = status as Record<string, unknown>;

    if ("filled" in value && value.filled && typeof value.filled === "object") {
      const filled = value.filled as Record<string, unknown>;
      const rawSize = typeof filled.totalSz === "string" ? filled.totalSz : "0";
      const rawPrice = typeof filled.avgPx === "string" ? filled.avgPx : "0";
      const parsedSize = parseFloat(rawSize);
      const parsedPrice = parseFloat(rawPrice);

      // Sanity: reject nonsensical fills (negative or non-finite values)
      if (!Number.isFinite(parsedSize) || parsedSize < 0) {
        return {
          success: false,
          orderId: typeof filled.oid === "number" ? filled.oid : undefined,
          filledSize: "0",
          avgPrice: "0",
          error: `Exchange returned invalid fill size: ${rawSize}`,
        };
      }
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        return {
          success: false,
          orderId: typeof filled.oid === "number" ? filled.oid : undefined,
          filledSize: "0",
          avgPrice: "0",
          error: `Exchange returned invalid fill price: ${rawPrice}`,
        };
      }

      return {
        success: true,
        orderId: typeof filled.oid === "number" ? filled.oid : undefined,
        filledSize: rawSize,
        avgPrice: rawPrice,
      };
    }

    if ("resting" in value && value.resting && typeof value.resting === "object") {
      const resting = value.resting as Record<string, unknown>;
      return {
        success: true,
        orderId: typeof resting.oid === "number" ? resting.oid : undefined,
        filledSize: "0",
        avgPrice: fallbackPrice,
      };
    }

    if ("error" in value) {
      return {
        success: false,
        orderId: undefined,
        filledSize: "0",
        avgPrice: "0",
        error: typeof value.error === "string" ? value.error : "Order rejected.",
      };
    }

    return {
      success: false,
      orderId: undefined,
      filledSize: "0",
      avgPrice: "0",
      error: "Unknown order status payload from exchange.",
    };
  }

  private isDepositRequiredError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /must deposit before performing actions/i.test(message);
  }

  private normalizedApprovalTenthsBps(rawApproval: number): number {
    if (!Number.isFinite(rawApproval) || rawApproval <= 0) return 0;
    const raw = Math.max(0, rawApproval);
    const candidates = [raw, raw * 10];
    if (raw < 1) {
      candidates.push(raw * 1000);
    }
    return Math.max(...candidates);
  }

  private isBuilderApprovalSufficient(rawApproval: number, requiredTenthsBps: number): boolean {
    return this.normalizedApprovalTenthsBps(rawApproval) >= requiredTenthsBps;
  }

  /**
   * Poll maxBuilderFee a few times with short delays to allow on-chain state propagation.
   * The master wallet may have just signed the approval via the frontend pre-trade flow.
   */
  private async pollBuilderApproval(
    userAddress: string,
    retries = 4,
    delayMs = 400,
  ): Promise<boolean> {
    if (!this.wireBuilder) return false;
    for (let i = 0; i < retries; i++) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      try {
        const approval = await this.provider.maxBuilderFee({
          user: userAddress,
          builder: this.wireBuilder.b,
        });
        if (this.isBuilderApprovalSufficient(approval, this.wireBuilder.f)) {
          return true;
        }
      } catch {
        // Ignore transient errors during polling
      }
    }
    return false;
  }
}
