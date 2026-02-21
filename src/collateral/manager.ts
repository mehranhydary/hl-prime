import type { HLProvider } from "../provider/provider.js";
import type { Logger } from "../logging/logger.js";
import type { SplitAllocation } from "../router/types.js";
import { FillSimulator } from "../router/simulator.js";
import { formatPrice } from "@nktkas/hyperliquid/utils";
import type {
  CollateralRequirement,
  CollateralPlan,
  CollateralReceipt,
} from "./types.js";

const KNOWN_STABLE_COLLATERAL = new Set([
  "USDC",
  "USDT",
  "USDT0",
  "USDH",
  "USDE",
  "USDS",
  "USDB",
  "USDD",
  "DAI",
  "FDUSD",
  "PYUSD",
]);
const DEFAULT_QUOTE_TOKEN_PRIORITY = [
  "USDC",
  "USDT",
  "USDT0",
  "USDH",
  "USDE",
  "USDS",
  "USDB",
  "USDD",
  "DAI",
  "FDUSD",
  "PYUSD",
];

type SpotTokenMeta = {
  name: string;
  index: number;
  szDecimals: number;
};

type SpotPairMeta = {
  name: string;
  index: number;
  isCanonical?: boolean;
  tokens: number[];
};

type ResolvedSpotSwapMarket = {
  pairId: string;
  pairLabel: string;
  assetIndex: number;
  baseSzDecimals: number;
  side: "buy" | "sell";
  priceSide: "asks" | "bids";
  sizeMultiplier: number;
  sizeDivisor: number;
  quoteToken: string;
};

function normalizeToken(value: string): string {
  return value.trim().toUpperCase();
}

function parsePerpSpendableStableUsd(state: {
  withdrawable?: string;
  marginSummary?: { totalRawUsd?: string; accountValue?: string };
}): number {
  const totalRawUsdRaw = parseFloat(String(state.marginSummary?.totalRawUsd ?? ""));
  const withdrawableRaw = parseFloat(String(state.withdrawable ?? ""));
  const hasPositiveTotalRawUsd = Number.isFinite(totalRawUsdRaw) && totalRawUsdRaw > 0;
  if (Number.isFinite(withdrawableRaw) && hasPositiveTotalRawUsd) {
    // Use the more conservative spendable estimate for USDC collateral planning.
    return Math.max(0, Math.min(withdrawableRaw, totalRawUsdRaw));
  }
  if (Number.isFinite(withdrawableRaw)) return Math.max(0, withdrawableRaw);
  if (hasPositiveTotalRawUsd) return Math.max(0, totalRawUsdRaw);

  const accountValueRaw = parseFloat(String(state.marginSummary?.accountValue ?? "0"));
  if (Number.isFinite(accountValueRaw)) return Math.max(0, accountValueRaw);
  return 0;
}

function inferPerpUsdcBalanceFromSpot(params: {
  spendableStableUsd: number;
  spotBalances: Map<string, number>;
}): { perpUsdcBalance: number; spotUsdcBalance: number; nonUsdcStableSpotBalance: number } {
  const spotUsdcBalance = Math.max(0, params.spotBalances.get("USDC") ?? 0);
  let nonUsdcStableSpotBalance = 0;
  for (const [coinRaw, totalRaw] of params.spotBalances.entries()) {
    const coin = normalizeToken(coinRaw);
    if (coin === "USDC" || !isStableCollateralToken(coin)) continue;
    const total = Number.isFinite(totalRaw) ? Math.max(0, totalRaw) : 0;
    nonUsdcStableSpotBalance += total;
  }

  const spendableStableUsd = Number.isFinite(params.spendableStableUsd)
    ? Math.max(0, params.spendableStableUsd)
    : 0;
  const inferredPerp = Math.max(
    0,
    spendableStableUsd - nonUsdcStableSpotBalance - spotUsdcBalance,
  );

  return {
    perpUsdcBalance: inferredPerp,
    spotUsdcBalance,
    nonUsdcStableSpotBalance,
  };
}

function isStableCollateralToken(value: string): boolean {
  const token = normalizeToken(value);
  if (KNOWN_STABLE_COLLATERAL.has(token)) return true;
  return token.startsWith("USD");
}

function normalizeSzDecimals(value: number | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return 6;
  return Math.max(0, Math.min(12, Math.floor(value ?? 6)));
}

function quantizeSize(value: number, szDecimals: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const decimals = normalizeSzDecimals(szDecimals);
  const factor = 10 ** decimals;
  return Math.ceil((value - Number.EPSILON) * factor) / factor;
}

function toSizeString(value: number, decimals: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return value.toFixed(normalizeSzDecimals(decimals)).replace(/\.?0+$/, "");
}

function formatSpotLimitPrice(price: number, szDecimals: number): string {
  const safePrice = Number.isFinite(price) ? Math.max(price, 0) : 0;
  if (safePrice <= 0) {
    throw new Error("Invalid spot limit price after slippage adjustment.");
  }
  return formatPrice(safePrice, normalizeSzDecimals(szDecimals), "spot");
}

function quotePriority(token: string, preferredQuotes: readonly string[]): number {
  const normalized = normalizeToken(token);
  const idx = preferredQuotes.indexOf(normalized);
  if (idx >= 0) return idx;
  if (isStableCollateralToken(normalized)) return preferredQuotes.length;
  return Number.POSITIVE_INFINITY;
}

function buildStableSourceBalances(
  spotBalances: Map<string, number>,
  perpUsdcBalance: number,
): Map<string, number> {
  const out = new Map<string, number>();

  for (const [coinRaw, totalRaw] of spotBalances.entries()) {
    const coin = normalizeToken(coinRaw);
    const total = Number.isFinite(totalRaw) ? Math.max(0, totalRaw) : 0;
    if (total <= 0 || !isStableCollateralToken(coin)) continue;
    out.set(coin, (out.get(coin) ?? 0) + total);
  }

  const perpUsdc = Number.isFinite(perpUsdcBalance) ? Math.max(0, perpUsdcBalance) : 0;
  if (perpUsdc > 0) {
    out.set("USDC", (out.get("USDC") ?? 0) + perpUsdc);
  }

  return out;
}

function consumeSourceBalance(
  sourceBalances: Map<string, number>,
  token: string,
  amount: number,
): void {
  const key = normalizeToken(token);
  const available = sourceBalances.get(key) ?? 0;
  sourceBalances.set(key, Math.max(0, available - Math.max(0, amount)));
}

function chooseSwapSourceToken(params: {
  sourceBalances: Map<string, number>;
  targetToken: string;
  amountNeeded: number;
  preferredSource?: string;
}): string {
  const target = normalizeToken(params.targetToken);
  const preferred = params.preferredSource ? normalizeToken(params.preferredSource) : undefined;
  const amountNeeded = Number.isFinite(params.amountNeeded) ? Math.max(0, params.amountNeeded) : 0;

  const candidateEntries = [...params.sourceBalances.entries()]
    .filter(([token, available]) =>
      token !== target &&
      available > 0 &&
      isStableCollateralToken(token))
    .sort((a, b) => {
      const [tokenA, availableA] = a;
      const [tokenB, availableB] = b;
      const coversNeededA = availableA >= amountNeeded ? 1 : 0;
      const coversNeededB = availableB >= amountNeeded ? 1 : 0;
      if (coversNeededA !== coversNeededB) return coversNeededB - coversNeededA;
      const usdcPenaltyA = tokenA === "USDC" ? 1 : 0;
      const usdcPenaltyB = tokenB === "USDC" ? 1 : 0;
      if (usdcPenaltyA !== usdcPenaltyB) return usdcPenaltyA - usdcPenaltyB;
      if (availableA !== availableB) return availableB - availableA;
      return quotePriority(tokenA, DEFAULT_QUOTE_TOKEN_PRIORITY)
        - quotePriority(tokenB, DEFAULT_QUOTE_TOKEN_PRIORITY);
    });

  if (candidateEntries.length > 0) {
    return candidateEntries[0][0];
  }

  if (preferred && preferred !== target) {
    return preferred;
  }

  return "USDC";
}

function isLikelyInsufficientBalanceError(message: string): boolean {
  return /insufficient|not enough|available|balance|margin/i.test(message);
}

function resolveSpotSwapMarket(
  tokenByIndex: Map<number, SpotTokenMeta>,
  pairs: SpotPairMeta[],
  targetToken: string,
  swapFrom: string,
): ResolvedSpotSwapMarket {
  const target = normalizeToken(targetToken);
  const from = normalizeToken(swapFrom);
  const candidates: Array<{
    pair: SpotPairMeta;
    baseToken: string;
    quoteToken: string;
    baseSzDecimals: number;
    orientationRank: number;
  }> = [];

  for (const pair of pairs) {
    if (pair.tokens.length < 2) continue;
    const base = tokenByIndex.get(pair.tokens[0]);
    const quote = tokenByIndex.get(pair.tokens[1]);
    if (!base || !quote) continue;

    const baseToken = normalizeToken(base.name);
    const quoteToken = normalizeToken(quote.name);
    if (baseToken === target && quoteToken === from) {
      // target/swapFrom pair: buy base to receive target token.
      candidates.push({
        pair,
        baseToken: base.name,
        quoteToken: quote.name,
        baseSzDecimals: base.szDecimals,
        orientationRank: 0,
      });
      continue;
    }
    if (baseToken === from && quoteToken === target) {
      // swapFrom/target pair: sell base to receive target token as quote.
      candidates.push({
        pair,
        baseToken: base.name,
        quoteToken: quote.name,
        baseSzDecimals: base.szDecimals,
        orientationRank: 1,
      });
    }
  }

  if (candidates.length === 0) {
    const stableFallback = [
      from,
      ...DEFAULT_QUOTE_TOKEN_PRIORITY,
    ].filter((token, index, values) => values.indexOf(token) === index);
    for (const pair of pairs) {
      if (pair.tokens.length < 2) continue;
      const base = tokenByIndex.get(pair.tokens[0]);
      const quote = tokenByIndex.get(pair.tokens[1]);
      if (!base || !quote) continue;
      if (normalizeToken(base.name) !== target) continue;
      if (quotePriority(quote.name, stableFallback) === Number.POSITIVE_INFINITY) continue;
      candidates.push({
        pair,
        baseToken: base.name,
        quoteToken: quote.name,
        baseSzDecimals: base.szDecimals,
        orientationRank: 2,
      });
    }
  }

  if (candidates.length === 0) {
    throw new Error(`No spot pair found for ${swapFrom}->${targetToken}`);
  }

  candidates.sort((a, b) => {
    if (a.orientationRank !== b.orientationRank) {
      return a.orientationRank - b.orientationRank;
    }
    if (Boolean(a.pair.isCanonical) !== Boolean(b.pair.isCanonical)) {
      return a.pair.isCanonical ? -1 : 1;
    }
    return a.pair.index - b.pair.index;
  });

  const selected = candidates[0];
  if (selected.orientationRank === 1) {
    return {
      pairId: selected.pair.name,
      pairLabel: `${selected.baseToken}/${selected.quoteToken}`,
      assetIndex: 10000 + selected.pair.index,
      baseSzDecimals: selected.baseSzDecimals,
      side: "sell",
      priceSide: "bids",
      sizeMultiplier: 1.01,
      sizeDivisor: 1,
      quoteToken: selected.quoteToken,
    };
  }

  return {
    pairId: selected.pair.name,
    pairLabel: `${selected.baseToken}/${selected.quoteToken}`,
    assetIndex: 10000 + selected.pair.index,
    baseSzDecimals: selected.baseSzDecimals,
    side: "buy",
    priceSide: "asks",
    sizeMultiplier: 1,
    sizeDivisor: 1,
    quoteToken: selected.quoteToken,
  };
}

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
      const parsed = parseFloat(b.total);
      balanceMap.set(
        normalizeToken(b.coin),
        Number.isFinite(parsed) ? parsed : 0,
      );
    }

    // Get perp balance (USDC is the perp native collateral)
    const perpState = await this.provider.clearinghouseState(userAddress);
    const spendableStableUsd = parsePerpSpendableStableUsd(perpState);
    const {
      perpUsdcBalance,
      spotUsdcBalance,
      nonUsdcStableSpotBalance,
    } = inferPerpUsdcBalanceFromSpot({
      spendableStableUsd,
      spotBalances: balanceMap,
    });
    this.logger.warn(
      {
        user: userAddress,
        accountValue: perpState.marginSummary?.accountValue,
        totalRawUsd: perpState.marginSummary?.totalRawUsd,
        withdrawable: perpState.withdrawable,
        spendableStableUsd,
        nonUsdcStableSpotBalance,
        spotUsdcBalance,
        plannedPerpUsdcAvailable: perpUsdcBalance,
      },
      "[debug] Collateral balance inputs",
    );

    // Group allocations by collateral type
    const collateralNeeds = new Map<string, number>();
    for (const alloc of allocations) {
      const token = alloc.market.collateral;
      const amount = alloc.estimatedCost; // USD value needed
      collateralNeeds.set(token, (collateralNeeds.get(token) ?? 0) + amount);
    }

    const sourceBalances = buildStableSourceBalances(balanceMap, perpUsdcBalance);
    const requirements: CollateralRequirement[] = [];
    let swapsNeeded = false;
    const swapCostJobs: Array<{
      index: number;
      fromToken: string;
      toToken: string;
      amount: number;
    }> = [];

    for (const [tokenRaw, amountNeeded] of collateralNeeds) {
      const token = normalizeToken(tokenRaw);
      const spotTokenBalance = balanceMap.get(token) ?? 0;
      const currentBalance = token === "USDC"
        ? perpUsdcBalance + spotTokenBalance
        : spotTokenBalance;
      const reservedExistingBalance = Math.min(amountNeeded, currentBalance);
      if (reservedExistingBalance > 0) {
        consumeSourceBalance(sourceBalances, token, reservedExistingBalance);
      }

      const shortfall = Math.max(0, amountNeeded - currentBalance);
      let swapFrom = token;
      if (shortfall > 0) {
        swapsNeeded = true;
        const sourceAmountNeeded = shortfall * 1.01;
        swapFrom = chooseSwapSourceToken({
          sourceBalances,
          targetToken: token,
          amountNeeded: sourceAmountNeeded,
        });
        consumeSourceBalance(sourceBalances, swapFrom, sourceAmountNeeded);
      }

      const requirementIndex = requirements.length;
      requirements.push({
        token,
        amountNeeded,
        currentBalance,
        shortfall,
        swapFrom,
        estimatedSwapCostBps: 0,
      });

      if (shortfall > 0) {
        swapCostJobs.push({
          index: requirementIndex,
          fromToken: swapFrom,
          toToken: token,
          amount: shortfall,
        });
      }
    }

    const swapCosts = await Promise.all(
      swapCostJobs.map(async (job) => {
        const bps = await this.estimateSwapCost(job.fromToken, job.toToken, job.amount);
        return { index: job.index, bps };
      }),
    );
    for (const { index, bps } of swapCosts) {
      requirements[index].estimatedSwapCostBps = bps;
    }

    const totalSwapCostBps = this.weightedSwapCost(requirements, allocations);

    return {
      requirements,
      totalSwapCostBps,
      swapsNeeded,
      // In trader app flow, unified abstraction is configured during setup.
      // Avoid write-side abstraction changes during execution.
      abstractionEnabled: true,
    };
  }

  /**
   * Estimate the cost in basis points to swap fromToken to toToken on the spot market.
   * Uses the spot L2Book to simulate the swap.
   */
  async estimateSwapCost(
    fromToken: string,
    toToken: string,
    amount: number,
  ): Promise<number> {
    try {
      const spotMeta = await this.provider.spotMeta();
      const tokenByIndex = new Map<number, SpotTokenMeta>();
      for (const token of spotMeta.tokens as SpotTokenMeta[]) {
        tokenByIndex.set(token.index, token);
      }
      const market = resolveSpotSwapMarket(
        tokenByIndex,
        spotMeta.universe as SpotPairMeta[],
        toToken,
        fromToken,
      );
      const byId = await this.provider.l2Book(market.pairId);
      const needsAsks = market.priceSide === "asks";
      const hasDepth = needsAsks ? byId.levels[1].length > 0 : byId.levels[0].length > 0;
      const book = hasDepth || normalizeToken(market.pairId) === normalizeToken(market.pairLabel)
        ? byId
        : await this.provider.l2Book(market.pairLabel);

      if (book.levels[0].length === 0 && book.levels[1].length === 0) {
        // No spot book available — return conservative default
        return 50;
      }

      const simSide = market.side === "buy" ? "buy" : "sell";
      const sim = this.simulator.simulate(book, simSide, amount);
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
    userAddress: string,
  ): Promise<CollateralReceipt> {
    const swapsExecuted: CollateralReceipt["swapsExecuted"] = [];
    const abstractionWasEnabled = false;

    try {
      const signerAddress = this.provider.getSignerAddress?.();
      const isAgentSession = Boolean(
        signerAddress && signerAddress.toLowerCase() !== userAddress.toLowerCase(),
      );
      if (isAgentSession && plan.swapsNeeded) {
        return {
          success: false,
          swapsExecuted,
          abstractionWasEnabled,
          error:
            "Collateral transfers/swaps require master-wallet signing. " +
            "Current session uses an agent signer, so usdClassTransfer cannot move balances for the user.",
        };
      }

      const spotMeta = await this.provider.spotMeta();
      const tokenByIndex = new Map<number, SpotTokenMeta>();
      for (const token of spotMeta.tokens as SpotTokenMeta[]) {
        tokenByIndex.set(token.index, token);
      }
      const pairs = spotMeta.universe as SpotPairMeta[];
      const spotState = await this.provider.spotClearinghouseState(userAddress);
      const spotBalanceMap = new Map<string, number>();
      for (const balance of spotState.balances) {
        const parsed = parseFloat(balance.total);
        spotBalanceMap.set(
          normalizeToken(balance.coin),
          Number.isFinite(parsed) ? parsed : 0,
        );
      }
      const perpState = await this.provider.clearinghouseState(userAddress);
      const spendableStableUsd = parsePerpSpendableStableUsd(perpState);
      const { perpUsdcBalance } = inferPerpUsdcBalanceFromSpot({
        spendableStableUsd,
        spotBalances: spotBalanceMap,
      });
      const sourceBalances = buildStableSourceBalances(spotBalanceMap, perpUsdcBalance);

      // Step 2: Execute swaps for each requirement with shortfall
      for (const req of plan.requirements) {
        if (req.shortfall <= 0) continue;
        const sourceAmountNeeded = req.shortfall * 1.01;
        const swapFrom = chooseSwapSourceToken({
          sourceBalances,
          targetToken: req.token,
          amountNeeded: sourceAmountNeeded,
          preferredSource: req.swapFrom,
        });

        const market = resolveSpotSwapMarket(
          tokenByIndex,
          pairs,
          req.token,
          swapFrom,
        );

        // Place spot order to swap USDC → target token
        // Spot orders use the same provider.placeOrder with spot asset indices
        const byId = await this.provider.l2Book(market.pairId);
        const needsAsks = market.priceSide === "asks";
        const hasDepth = needsAsks ? byId.levels[1].length > 0 : byId.levels[0].length > 0;
        const spotBook = hasDepth || normalizeToken(market.pairId) === normalizeToken(market.pairLabel)
          ? byId
          : await this.provider.l2Book(market.pairLabel);
        const topLevels = market.priceSide === "asks"
          ? spotBook.levels[1]
          : spotBook.levels[0];
        if (topLevels.length === 0) {
          return {
            success: false,
            swapsExecuted,
            abstractionWasEnabled,
            error: `No spot liquidity for ${req.token} (${market.pairLabel})`,
          };
        }

        const topPrice = parseFloat(topLevels[0].px);
        if (!Number.isFinite(topPrice) || topPrice <= 0) {
          return {
            success: false,
            swapsExecuted,
            abstractionWasEnabled,
            error: `Invalid spot top-of-book price for ${req.token} (${market.pairLabel})`,
          };
        }
        const limitPriceRaw = market.side === "buy"
          ? topPrice * 1.005
          : topPrice * 0.995;
        const limitPrice = formatSpotLimitPrice(limitPriceRaw, market.baseSzDecimals);
        const orderSize = market.side === "buy"
          ? req.shortfall
          : req.shortfall / topPrice;
        const finalOrderSizeRaw = orderSize * market.sizeMultiplier / market.sizeDivisor;
        const finalOrderSize = quantizeSize(finalOrderSizeRaw, market.baseSzDecimals);
        const finalOrderSizeStr = toSizeString(finalOrderSize, market.baseSzDecimals);
        if (!Number.isFinite(finalOrderSize) || finalOrderSize <= 0) {
          return {
            success: false,
            swapsExecuted,
            abstractionWasEnabled,
            error: `Invalid spot order size for ${req.token} (${market.pairLabel})`,
          };
        }
        if (finalOrderSizeStr === "0") {
          return {
            success: false,
            swapsExecuted,
            abstractionWasEnabled,
            error: `Spot order size rounded to zero for ${req.token} (${market.pairLabel})`,
          };
        }

        this.logger.info(
          {
            from: swapFrom,
            token: req.token,
            size: finalOrderSize,
            side: market.side,
            limitPrice,
            spotAssetIndex: market.assetIndex,
            pair: market.pairLabel,
          },
          "Placing spot swap order",
        );

        const placeSwapOrder = async (): Promise<string> => {
          const result = await this.provider.placeOrder({
            assetIndex: market.assetIndex,
            isBuy: market.side === "buy",
            price: limitPrice,
            size: finalOrderSizeStr,
            reduceOnly: false,
            orderType: { limit: { tif: "Ioc" } },
          });

          const status = result.statuses[0];
          if (status && typeof status === "object" && "error" in status) {
            throw new Error(
              `Spot swap rejected for ${req.token} (${market.pairLabel}): ${status.error} (side ${market.side}, px ${limitPrice}, size ${finalOrderSizeStr}, szDecimals ${market.baseSzDecimals})`,
            );
          }
          if (status && typeof status === "string") {
            if (status === "waitingForFill" || status === "waitingForTrigger") {
              throw new Error(
                `Spot swap did not fill immediately for ${req.token} (${market.pairLabel}): ${status}`,
              );
            }
            throw new Error(`Unknown spot swap status for ${req.token}: ${status}`);
          }
          if (status && typeof status === "object" && "filled" in status) {
            return status.filled.totalSz;
          }
          return "0";
        };

        let filled = "0";
        try {
          filled = await placeSwapOrder();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (swapFrom !== "USDC" || !isLikelyInsufficientBalanceError(message)) {
            return {
              success: false,
              swapsExecuted,
              abstractionWasEnabled,
              error: message,
            };
          }

          this.logger.info(
            { amount: sourceAmountNeeded, token: req.token },
            "Transferring USDC to spot for swap fallback",
          );
          await this.provider.usdClassTransfer(sourceAmountNeeded, false);
          filled = await placeSwapOrder();
        }

        consumeSourceBalance(sourceBalances, swapFrom, sourceAmountNeeded);

        swapsExecuted.push({
          from: swapFrom,
          to: req.token,
          amount: req.shortfall.toString(),
          filled,
        });
      }

      // Post-swap balance assertion: verify each required token's balance
      // meets the needed amount after swaps completed.
      if (swapsExecuted.length > 0) {
        const postSwapSpotState = await this.provider.spotClearinghouseState(userAddress);
        const postSwapBalances = new Map<string, number>();
        for (const b of postSwapSpotState.balances) {
          const parsed = parseFloat(b.total);
          postSwapBalances.set(
            normalizeToken(b.coin),
            Number.isFinite(parsed) ? parsed : 0,
          );
        }
        for (const req of plan.requirements) {
          if (req.shortfall <= 0) continue;
          const postBalance = postSwapBalances.get(normalizeToken(req.token)) ?? 0;
          // Allow 2% tolerance for rounding, slippage, and fees
          const threshold = req.amountNeeded * 0.98;
          if (postBalance < threshold) {
            this.logger.warn(
              {
                token: req.token,
                expected: req.amountNeeded,
                actual: postBalance,
                threshold,
              },
              "Post-swap balance below required threshold",
            );
            return {
              success: false,
              swapsExecuted,
              abstractionWasEnabled,
              error: `Post-swap balance for ${req.token} is ${postBalance.toFixed(2)}, need ${req.amountNeeded.toFixed(2)} (${((postBalance / req.amountNeeded) * 100).toFixed(1)}% of required)`,
            };
          }
        }
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
