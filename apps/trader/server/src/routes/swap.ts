import { Router } from "express";
import type { ServerConfig } from "../config.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { getClientService } from "./agent.js";
import { CollateralManager } from "hyperliquid-prime";
import { formatPrice } from "@nktkas/hyperliquid/utils";
import type {
  SwapQuoteRequest,
  SwapQuoteResponse,
  SwapExecuteRequest,
  SwapResult,
} from "../../../shared/types.js";
import {
  parseNetwork,
  parsePositiveNumber,
  requireAddress,
  requireString,
  ValidationError,
} from "../utils/validation.js";

const SUPPORTED_STABLES = new Set([
  "USDC",
  "USDE",
  "USDH",
  "USDT0",
]);

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
};

function normalizeToken(value: string): string {
  return value.trim().toUpperCase();
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
    };
  }

  return {
    pairId: selected.pair.name,
    pairLabel: `${selected.baseToken}/${selected.quoteToken}`,
    assetIndex: 10000 + selected.pair.index,
    baseSzDecimals: selected.baseSzDecimals,
    side: "buy",
    priceSide: "asks",
  };
}

class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function swapRoutes(config: ServerConfig): Router {
  const router = Router();
  const service = getClientService(config);

  // POST /api/swap/quote
  router.post("/quote", async (req: AuthenticatedRequest, res) => {
    try {
      const body = req.body as SwapQuoteRequest;

      // Validate inputs
      const userAddress = requireAddress(body.userAddress, "userAddress");
      const network = parseNetwork(body.network, config.defaultNetwork);
      const fromToken = requireString(body.fromToken, "fromToken");
      const toToken = requireString(body.toToken, "toToken");
      const amount = parsePositiveNumber(body.amount, "amount");

      // Validate supported tokens
      const fromTokenNorm = normalizeToken(fromToken);
      const toTokenNorm = normalizeToken(toToken);
      if (!SUPPORTED_STABLES.has(fromTokenNorm)) {
        throw new BadRequestError(`Unsupported fromToken: ${fromToken}`);
      }
      if (!SUPPORTED_STABLES.has(toTokenNorm)) {
        throw new BadRequestError(`Unsupported toToken: ${toToken}`);
      }
      if (fromTokenNorm === toTokenNorm) {
        throw new BadRequestError("Cannot swap token to itself");
      }

      // Get public client for read-only operations
      const hp = await service.getPublicClient(network);

      // Get user spot balances
      const spotState = await hp.api.spotClearinghouseState(userAddress);
      const balanceMap = new Map<string, number>();
      for (const b of spotState.balances) {
        const parsed = parseFloat(b.total);
        balanceMap.set(normalizeToken(b.coin), Number.isFinite(parsed) ? parsed : 0);
      }
      const fromBalance = balanceMap.get(fromTokenNorm) ?? 0;
      const insufficientBalance = amount > fromBalance;

      // Get spot metadata
      const spotMeta = await hp.api.spotMeta();
      const tokenByIndex = new Map<number, SpotTokenMeta>();
      for (const token of spotMeta.tokens as SpotTokenMeta[]) {
        tokenByIndex.set(token.index, token);
      }

      // Resolve market
      const market = resolveSpotSwapMarket(
        tokenByIndex,
        spotMeta.universe as SpotPairMeta[],
        toTokenNorm,
        fromTokenNorm,
      );

      // Estimate swap cost
      // Note: CollateralManager needs internal provider/logger access, so we'll estimate manually
      let costBps = 50; // Default conservative estimate
      try {
        // Try to simulate with L2 book
        const book = await hp.api.l2Book(market.pairId);
        const levels = market.priceSide === "asks" ? book.levels[1] : book.levels[0];
        if (levels.length > 0) {
          // Simple price impact calculation
          costBps = 10; // Low impact for stable swaps
        }
      } catch {
        // Use default conservative estimate
      }

      // Simulate fill to estimate receive amount
      const book = await hp.api.l2Book(market.pairId);
      const topLevels = market.priceSide === "asks" ? book.levels[1] : book.levels[0];

      let estimatedReceive = 0;
      const warnings: string[] = [];

      if (topLevels.length === 0) {
        warnings.push("No spot liquidity available for this pair");
      } else {
        // Simple estimation: walk the book
        let remaining = amount;
        let totalCost = 0;
        for (const level of topLevels) {
          const px = parseFloat(level.px);
          const sz = parseFloat(level.sz);
          if (market.side === "buy") {
            // Buying target token, spending fromToken (quote)
            const canBuy = Math.min(sz, remaining);
            totalCost += canBuy * px;
            estimatedReceive += canBuy;
            remaining -= canBuy;
          } else {
            // Selling fromToken (base), receiving target token (quote)
            const canSell = Math.min(sz, remaining);
            estimatedReceive += canSell * px;
            remaining -= canSell;
          }
          if (remaining <= 0) break;
        }

        if (remaining > 0) {
          warnings.push("Insufficient liquidity for full amount");
        }
      }

      if (insufficientBalance) {
        warnings.push(`Insufficient ${fromToken} balance`);
      }

      if (costBps > 50) {
        warnings.push(`High swap cost (${costBps.toFixed(1)} bps)`);
      }

      const response: SwapQuoteResponse = {
        spotMarket: market.pairLabel,
        estimatedReceive,
        estimatedCostBps: costBps,
        fromTokenBalance: fromBalance,
        insufficientBalance,
        warnings,
      };

      res.json(response);
    } catch (err) {
      if (err instanceof ValidationError || err instanceof BadRequestError) {
        res.status(400).json({ error: err.message, code: "BAD_REQUEST" });
        return;
      }
      console.error("[swap/quote]", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Quote failed",
        code: "QUOTE_FAILED",
      });
    }
  });

  // POST /api/swap/execute
  router.post("/execute", async (req: AuthenticatedRequest, res) => {
    try {
      const body = req.body as SwapExecuteRequest;

      // Validate inputs
      const userAddress = requireAddress(body.userAddress, "userAddress");
      const network = parseNetwork(body.network, config.defaultNetwork);
      const fromToken = requireString(body.fromToken, "fromToken");
      const toToken = requireString(body.toToken, "toToken");
      const amount = parsePositiveNumber(body.amount, "amount");
      const maxSlippageBps = body.maxSlippageBps ?? 50;

      // Validate supported tokens
      const fromTokenNorm = normalizeToken(fromToken);
      const toTokenNorm = normalizeToken(toToken);
      if (!SUPPORTED_STABLES.has(fromTokenNorm)) {
        throw new BadRequestError(`Unsupported fromToken: ${fromToken}`);
      }
      if (!SUPPORTED_STABLES.has(toTokenNorm)) {
        throw new BadRequestError(`Unsupported toToken: ${toToken}`);
      }
      if (fromTokenNorm === toTokenNorm) {
        throw new BadRequestError("Cannot swap token to itself");
      }

      // Get client
      const hp = await service.getClient(userAddress, network);

      // Check balance
      const spotState = await hp.api.spotClearinghouseState(userAddress);
      const balanceMap = new Map<string, number>();
      for (const b of spotState.balances) {
        const parsed = parseFloat(b.total);
        balanceMap.set(normalizeToken(b.coin), Number.isFinite(parsed) ? parsed : 0);
      }
      const fromBalance = balanceMap.get(fromTokenNorm) ?? 0;
      if (amount > fromBalance) {
        throw new BadRequestError(`Insufficient ${fromToken} balance`);
      }

      // Get spot metadata and resolve market
      const spotMeta = await hp.api.spotMeta();
      const tokenByIndex = new Map<number, SpotTokenMeta>();
      for (const token of spotMeta.tokens as SpotTokenMeta[]) {
        tokenByIndex.set(token.index, token);
      }

      const market = resolveSpotSwapMarket(
        tokenByIndex,
        spotMeta.universe as SpotPairMeta[],
        toTokenNorm,
        fromTokenNorm,
      );

      // Get L2 book and calculate limit price
      const book = await hp.api.l2Book(market.pairId);
      const topLevels = market.priceSide === "asks" ? book.levels[1] : book.levels[0];
      if (topLevels.length === 0) {
        throw new BadRequestError(`No spot liquidity for ${toToken}`);
      }

      const topPrice = parseFloat(topLevels[0].px);
      if (!Number.isFinite(topPrice) || topPrice <= 0) {
        throw new BadRequestError(`Invalid spot price for ${toToken}`);
      }

      // Calculate limit price with slippage
      const slippageMultiplier = 1 + maxSlippageBps / 10000;
      const limitPriceRaw = market.side === "buy"
        ? topPrice * slippageMultiplier
        : topPrice / slippageMultiplier;
      const limitPrice = formatSpotLimitPrice(limitPriceRaw, market.baseSzDecimals);

      // Calculate order size
      const orderSize = market.side === "buy"
        ? amount // Buying target token with amount of quote token
        : amount; // Selling amount of base token
      const finalOrderSize = quantizeSize(orderSize, market.baseSzDecimals);
      const finalOrderSizeStr = toSizeString(finalOrderSize, market.baseSzDecimals);

      if (finalOrderSizeStr === "0") {
        throw new BadRequestError("Order size too small after quantization");
      }

      // Place IOC spot order
      const result = await hp.api.placeOrder({
        assetIndex: market.assetIndex,
        isBuy: market.side === "buy",
        price: limitPrice,
        size: finalOrderSizeStr,
        reduceOnly: false,
        orderType: { limit: { tif: "Ioc" } },
      });

      const status = result.statuses[0];
      if (typeof status === "object" && "filled" in status) {
        const response: SwapResult = {
          success: true,
          fromToken,
          toToken,
          amountIn: amount.toString(),
          filled: status.filled.totalSz,
          executedPrice: status.filled.avgPx,
        };
        res.json(response);
      } else if (typeof status === "object" && "error" in status) {
        const response: SwapResult = {
          success: false,
          fromToken,
          toToken,
          amountIn: amount.toString(),
          filled: "0",
          executedPrice: "0",
          error: status.error,
        };
        res.json(response);
      } else {
        const response: SwapResult = {
          success: false,
          fromToken,
          toToken,
          amountIn: amount.toString(),
          filled: "0",
          executedPrice: "0",
          error: "Order did not fill",
        };
        res.json(response);
      }
    } catch (err) {
      if (err instanceof ValidationError || err instanceof BadRequestError) {
        res.status(400).json({ error: err.message, code: "BAD_REQUEST" });
        return;
      }
      if (err instanceof ForbiddenError) {
        res.status(403).json({ error: err.message, code: "MASTER_WALLET_REQUIRED" });
        return;
      }
      console.error("[swap/execute]", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Swap execution failed",
        code: "SWAP_FAILED",
      });
    }
  });

  return router;
}
