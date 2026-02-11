import type { HLProvider } from "../provider/provider.js";
import type { Logger } from "../logging/logger.js";
import type { SplitAllocation } from "../router/types.js";
import { FillSimulator } from "../router/simulator.js";
import type {
  CollateralRequirement,
  CollateralPlan,
  CollateralReceipt,
} from "./types.js";

/**
 * CollateralManager handles two concerns:
 * 1. Estimation (read-only): What collateral swaps are needed and how much will they cost?
 * 2. Execution (writes): Perform the actual swaps and enable DEX abstraction.
 *
 * When DEX abstraction is enabled on Hyperliquid:
 *   - USDC-collateral DEXs pull from the perp USDC balance automatically
 *   - Non-USDC DEXs pull from the user's spot balance of that token
 *
 * So the flow for non-USDC collateral is:
 *   1. usdClassTransfer: move USDC from perp → spot
 *   2. Spot order: swap USDC → target token (e.g., USDH)
 *   3. DEX abstraction handles the rest
 */
export class CollateralManager {
  private simulator: FillSimulator;
  private logger: Logger;

  constructor(
    private provider: HLProvider,
    logger: Logger,
  ) {
    this.simulator = new FillSimulator();
    this.logger = logger.child({ module: "collateral" });
  }

  /**
   * Estimate collateral requirements for a set of split allocations.
   * This is read-only — no orders or transfers are made.
   */
  async estimateRequirements(
    allocations: SplitAllocation[],
    userAddress: string,
  ): Promise<CollateralPlan> {
    // Get user's current spot balances
    const spotState = await this.provider.spotClearinghouseState(userAddress);
    const balanceMap = new Map<string, number>();
    for (const b of spotState.balances) {
      balanceMap.set(b.coin, parseFloat(b.total));
    }

    // Get perp balance (USDC is the perp native collateral)
    const perpState = await this.provider.clearinghouseState(userAddress);
    const perpUsdcBalance = parseFloat(perpState.marginSummary.accountValue);

    // Group allocations by collateral type
    const collateralNeeds = new Map<string, number>();
    for (const alloc of allocations) {
      const token = alloc.market.collateral;
      const amount = alloc.estimatedCost; // USD value needed
      collateralNeeds.set(token, (collateralNeeds.get(token) ?? 0) + amount);
    }

    const requirements: CollateralRequirement[] = [];
    let swapsNeeded = false;
    const swapShortfalls = new Map<string, number>();
    const tokenBalances = new Map<string, number>();

    for (const [token, amountNeeded] of collateralNeeds) {
      if (token === "USDC") {
        // USDC comes from perp balance automatically via abstraction
        requirements.push({
          token,
          amountNeeded,
          currentBalance: perpUsdcBalance,
          shortfall: 0, // Abstraction handles USDC automatically
          swapFrom: "USDC",
          estimatedSwapCostBps: 0,
        });
        continue;
      }

      // Non-USDC: needs to be in spot balance
      const currentBalance = balanceMap.get(token) ?? 0;
      const shortfall = Math.max(0, amountNeeded - currentBalance);
      tokenBalances.set(token, currentBalance);

      if (shortfall > 0) {
        swapsNeeded = true;
        swapShortfalls.set(token, shortfall);
      }
    }

    const swapCostMap = new Map<string, number>();
    await Promise.all(
      [...swapShortfalls.entries()].map(async ([token, shortfall]) => {
        const swapCostBps = await this.estimateSwapCost("USDC", token, shortfall);
        swapCostMap.set(token, swapCostBps);
      }),
    );

    for (const [token, amountNeeded] of collateralNeeds) {
      if (token === "USDC") continue;
      const currentBalance = tokenBalances.get(token) ?? 0;
      const shortfall = Math.max(0, amountNeeded - currentBalance);
      requirements.push({
        token,
        amountNeeded,
        currentBalance,
        shortfall,
        swapFrom: "USDC",
        estimatedSwapCostBps: swapCostMap.get(token) ?? 0,
      });
    }

    const totalSwapCostBps = this.weightedSwapCost(requirements, allocations);

    return {
      requirements,
      totalSwapCostBps,
      swapsNeeded,
      abstractionEnabled: false, // Will be checked during prepare()
    };
  }

  /**
   * Estimate the cost in basis points to swap fromToken to toToken on the spot market.
   * Uses the spot L2Book to simulate the swap.
   */
  async estimateSwapCost(
    _fromToken: string,
    toToken: string,
    amount: number,
  ): Promise<number> {
    try {
      // Fetch the spot book for the target token
      // On Hyperliquid, stablecoin pairs typically use @{index} format
      // For now, try the token name directly
      const book = await this.provider.l2Book(toToken);

      if (book.levels[0].length === 0 && book.levels[1].length === 0) {
        // No spot book available — return conservative default
        return 50;
      }

      // Simulate buying `amount` worth of toToken on the spot market
      // Since stablecoins trade near $1, amount ≈ size
      const sim = this.simulator.simulate(book, "buy", amount);
      if (!sim) {
        return 100; // Insufficient spot depth
      }

      return sim.priceImpactBps;
    } catch {
      // Spot book not available — return conservative estimate
      this.logger.debug({ toToken, amount }, "Spot book unavailable, using default swap cost");
      return 50;
    }
  }

  /**
   * Execute collateral preparation: enable abstraction, perform swaps.
   * Call this before placing split orders.
   */
  async prepare(
    plan: CollateralPlan,
    _userAddress: string,
  ): Promise<CollateralReceipt> {
    const swapsExecuted: CollateralReceipt["swapsExecuted"] = [];
    let abstractionWasEnabled = false;

    try {
      // Step 1: Enable DEX abstraction if not already enabled
      if (!plan.abstractionEnabled) {
        this.logger.info("Enabling DEX abstraction");
        await this.provider.setDexAbstraction(true);
        abstractionWasEnabled = true;
      }

      const spotMeta = await this.provider.spotMeta();
      const tokenByName = new Map(spotMeta.tokens.map((token) => [token.name, token]));
      const pairByTokenIndex = new Map<number, (typeof spotMeta.universe)[number]>();
      for (const pair of spotMeta.universe) {
        for (const tokenIndex of pair.tokens) {
          if (!pairByTokenIndex.has(tokenIndex)) {
            pairByTokenIndex.set(tokenIndex, pair);
          }
        }
      }

      // Step 2: Execute swaps for each requirement with shortfall
      for (const req of plan.requirements) {
        if (req.shortfall <= 0 || req.token === "USDC") continue;

        // Move USDC from perp → spot
        const transferAmount = req.shortfall * 1.01; // 1% buffer for slippage
        this.logger.info(
          { amount: transferAmount, token: req.token },
          "Transferring USDC to spot for swap",
        );
        await this.provider.usdClassTransfer(transferAmount, false);

        // Place spot order to swap USDC → target token
        // Spot orders use the same provider.placeOrder with spot asset indices
        const spotBook = await this.provider.l2Book(req.token);
        if (spotBook.levels[1].length === 0) {
          return {
            success: false,
            swapsExecuted,
            abstractionWasEnabled,
            error: `No spot liquidity for ${req.token}`,
          };
        }

        // Use best ask with slippage for limit price
        const bestAsk = parseFloat(spotBook.levels[1][0].px);
        const limitPrice = (bestAsk * 1.005).toFixed(6); // 0.5% slippage on swap

        const spotToken = tokenByName.get(req.token);
        if (!spotToken) {
          return {
            success: false,
            swapsExecuted,
            abstractionWasEnabled,
            error: `Spot token ${req.token} not found in spotMeta`,
          };
        }

        // Spot asset index = 10000 + 2 * pair_index for the base token
        // Find the pair that has this token
        const pair = pairByTokenIndex.get(spotToken.index);
        if (!pair) {
          return {
            success: false,
            swapsExecuted,
            abstractionWasEnabled,
            error: `No spot pair found for ${req.token}`,
          };
        }

        const spotAssetIndex = 10000 + 2 * pair.index;

        this.logger.info(
          { token: req.token, size: req.shortfall, limitPrice, spotAssetIndex },
          "Placing spot swap order",
        );

        const result = await this.provider.placeOrder({
          assetIndex: spotAssetIndex,
          isBuy: true,
          price: limitPrice,
          size: req.shortfall.toString(),
          reduceOnly: false,
          orderType: { limit: { tif: "Ioc" } },
        });

        const status = result.statuses[0];
        let filled = "0";
        if (status && typeof status === "object" && "filled" in status) {
          filled = status.filled.totalSz;
        }

        swapsExecuted.push({
          from: req.swapFrom,
          to: req.token,
          amount: req.shortfall.toString(),
          filled,
        });
      }

      return {
        success: true,
        swapsExecuted,
        abstractionWasEnabled,
      };
    } catch (error) {
      this.logger.error({ error }, "Collateral preparation failed");
      return {
        success: false,
        swapsExecuted,
        abstractionWasEnabled,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Compute weighted average swap cost across all requirements,
   * weighted by the proportion of each token's allocation.
   */
  private weightedSwapCost(
    requirements: CollateralRequirement[],
    allocations: SplitAllocation[],
  ): number {
    const totalCost = allocations.reduce((sum, a) => sum + a.estimatedCost, 0);
    if (totalCost === 0) return 0;

    let weightedSum = 0;
    for (const req of requirements) {
      if (req.shortfall <= 0) continue;
      const tokenAllocCost = allocations
        .filter((a) => a.market.collateral === req.token)
        .reduce((sum, a) => sum + a.estimatedCost, 0);
      const weight = tokenAllocCost / totalCost;
      weightedSum += req.estimatedSwapCostBps * weight;
    }

    return weightedSum;
  }
}
