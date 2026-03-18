import { Router } from "express";
import { v4 as uuid } from "uuid";
import { HyperliquidPrime, type SplitQuote, type SplitExecutionPlan, type PerpMarket } from "hyperliquid-prime";
import type { ServerConfig } from "../config.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { getClientService } from "./agent.js";
import { TradeHistoryStore } from "../services/trade-history-store.js";
import { getRuntimeStateStore } from "../services/runtime-state.js";
import type {
  QuoteRequest,
  QuoteResponse,
  ExecuteRequest,
  ExecutePreviewRequest,
  ExecutePreviewResponse,
  ExecuteLegAdjustment,
  QuickTradeRequest,
  ClosePositionRequest,
  TradeResult,
  RouteSummary,
  Network,
  TradeHistoryItem,
  TradeHistoryResponse,
  TradeHistoryLeg,
  CollateralPreview,
} from "../../../shared/types.js";
import { assetVariants } from "../../../shared/asset.js";
import { quantizeOrderPrice, quantizeOrderSize } from "../../../shared/order-precision.js";
import {
  parseLeverage,
  parseLimit,
  parseNetwork,
  parsePositiveNumber,
  requireAddress,
  requireString,
  ValidationError,
} from "../utils/validation.js";
import { audit } from "../utils/audit.js";

interface CachedQuote {
  id: string;
  quote: SplitQuote;
  splitPlan: SplitExecutionPlan;
  routeSummary: RouteSummary;
  side: "buy" | "sell";
  asset: string;
  amountMode: "base" | "usd";
  requestedAmount: number;
  leverage?: number;
  isCross?: boolean;
  resolvedBaseSize: number;
  resolvedUsdNotional: number;
  masterAddress: string;
  network: Network;
  createdAt: number;
  ownerPrivyUserId?: string;
}

const tradeHistoryStores = new Map<string, TradeHistoryStore>();
function tradeHistoryStore(config: ServerConfig): TradeHistoryStore {
  const key = config.dataDir;
  const existing = tradeHistoryStores.get(key);
  if (existing) return existing;
  const created = new TradeHistoryStore(config.dataDir);
  tradeHistoryStores.set(key, created);
  return created;
}
const QUOTE_TTL_MS = 120_000; // 2 minutes — allows time for manual leg adjustments
const MAX_PRICE_DEVIATION = 0.05; // 5% — reject execution if price moved beyond this
const MANUAL_ROUTE_WARNING = "Route manually adjusted before execution.";
const AGENT_COLLATERAL_WARNING = "Collateral swaps require master-wallet signing (usdClassTransfer). Agent mode cannot auto-move collateral between perp and spot.";
const DEFAULT_SPLIT_SLIPPAGE = 0.01;

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

function runtimeState(): ReturnType<typeof getRuntimeStateStore> {
  return getRuntimeStateStore();
}

function cleanQuoteCache(): void {
  runtimeState().cleanupQuotes();
}

function buildRouteSummary(
  quote: SplitQuote,
  builderConfig: { address: `0x${string}`; feeBps: number },
): RouteSummary {
  const legs = quote.allocations.map((alloc) => ({
    coin: alloc.market.coin,
    size: alloc.size,
    proportion: alloc.proportion,
    collateral: alloc.market.collateral,
    estimatedAvgPrice: alloc.estimatedAvgPrice,
  }));

  return {
    isSingleLeg: legs.length === 1,
    legs,
    estimatedImpactBps: quote.estimatedPriceImpact,
    estimatedFundingRate: quote.estimatedFundingRate,
    builderFeeBps: builderConfig.feeBps,
    builderApproval: builderConfig.feeBps > 0
      ? {
          builder: builderConfig.address,
          maxFeeRate: `${(builderConfig.feeBps * 0.01).toFixed(2)}%`,
        }
      : undefined,
    warnings: quote.warnings ?? [],
  };
}

function toPositiveNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function toFiniteNumber(value: string): number {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

/** Safe error message for client responses — avoids leaking internal details. */
function safeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ValidationError || error instanceof BadRequestError) {
    return errorMessage(error);
  }
  return fallback;
}

function isAgentNotApprovedError(error: unknown): boolean {
  const msg = errorMessage(error).toLowerCase();
  return msg.includes("not approved on-chain") || msg.includes("agent") && msg.includes("not approved");
}

function toTradeErrorCode(error: unknown, fallbackCode: string): string {
  return isAgentNotApprovedError(error) ? "AGENT_NOT_APPROVED" : fallbackCode;
}

function toTradeErrorStatus(error: unknown, fallbackStatus: number): number {
  return isAgentNotApprovedError(error) ? 409 : fallbackStatus;
}

function toTradeErrorMessage(error: unknown, fallback: string): string {
  if (isAgentNotApprovedError(error)) {
    return "Agent wallet is not approved for trading. Open Setup and approve the agent wallet.";
  }
  return safeErrorMessage(error, fallback);
}

/**
 * Verify that current mid prices haven't moved too far from the quote's
 * estimated prices. Rejects execution if any leg's price deviates beyond
 * MAX_PRICE_DEVIATION to protect against stale quotes.
 */
async function validatePriceFreshness(
  hp: any,
  splitPlan: SplitExecutionPlan,
): Promise<void> {
  const mids: Record<string, string> = await hp.api.allMids();
  for (const leg of splitPlan.legs) {
    const currentMid = parseFloat(mids[leg.market.coin] ?? "");
    if (!Number.isFinite(currentMid) || currentMid <= 0) continue;
    const quotedPrice = parseFloat(leg.price);
    if (!Number.isFinite(quotedPrice) || quotedPrice <= 0) continue;
    const deviation = Math.abs(currentMid - quotedPrice) / quotedPrice;
    if (deviation > MAX_PRICE_DEVIATION) {
      throw new BadRequestError(
        `Price for ${leg.market.coin} moved ${(deviation * 100).toFixed(1)}% since quote. Please requote.`,
      );
    }
  }
}

function normalizeAddress(value: string): `0x${string}` {
  return value.toLowerCase() as `0x${string}`;
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function assertCachedQuoteAccess(params: {
  cached: CachedQuote;
  auth: AuthenticatedRequest;
  requestedMasterAddress: `0x${string}`;
}): void {
  const { cached, auth, requestedMasterAddress } = params;
  if (!sameAddress(cached.masterAddress, requestedMasterAddress)) {
    throw new ForbiddenError("Quote owner does not match requested masterAddress");
  }
  if (auth.auth?.masterAddress && !sameAddress(cached.masterAddress, auth.auth.masterAddress)) {
    throw new ForbiddenError("Quote owner does not match authenticated user");
  }
  if (cached.ownerPrivyUserId && auth.auth?.privyUserId && cached.ownerPrivyUserId !== auth.auth.privyUserId) {
    throw new ForbiddenError("Quote owner does not match authenticated user");
  }
}

function extractPositions(state: any): any[] {
  if (Array.isArray(state?.assetPositions)) return state.assetPositions;
  if (Array.isArray(state?.positions)) return state.positions;
  return [];
}

function hasMatchingOpenPosition(clearinghouseState: any, requestedAsset: string): boolean {
  const normalizedRequested = String(requestedAsset ?? "").trim().toUpperCase();
  if (!normalizedRequested) return false;
  const requestedCoin = normalizedRequested.includes(":") ? normalizedRequested : null;
  const requestedVariants = requestedCoin ? new Set<string>() : assetVariants(normalizedRequested);

  const positions = extractPositions(clearinghouseState);
  return positions.some((item: any) => {
    const pos = item?.position ?? item;
    const coin = String(pos?.coin ?? "");
    if (!coin) return false;

    const szi = parseFloat(String(pos?.szi ?? "0"));
    if (!Number.isFinite(szi) || Math.abs(szi) < 1e-9) return false;

    if (requestedCoin) {
      return coin.toUpperCase() === requestedCoin;
    }

    for (const variant of assetVariants(coin)) {
      if (requestedVariants.has(variant)) return true;
    }
    return false;
  });
}

function getRelevantDexNamesForAsset(hp: HyperliquidPrime, asset: string): string[] {
  const normalizedAsset = String(asset ?? "").trim();
  if (normalizedAsset.includes(":")) {
    const dexName = normalizedAsset.split(":")[0]?.trim().toLowerCase();
    if (dexName) return [dexName];
  }

  try {
    const markets = hp.getMarkets(asset) as Array<{ dexName?: string; isNative?: boolean }>;
    const dexNames = new Set<string>();
    for (const market of markets) {
      if (market?.isNative) continue;
      const dexName = String(market?.dexName ?? "");
      if (dexName && dexName !== "__native__") {
        dexNames.add(dexName);
      }
    }
    return [...dexNames];
  } catch {
    return [];
  }
}

async function hasMatchingPositionOnDexes(params: {
  infoClient: any;
  user: string;
  dexNames: string[];
  asset: string;
}): Promise<boolean> {
  const { infoClient, user, dexNames, asset } = params;
  if (
    !infoClient
    || typeof infoClient.clearinghouseState !== "function"
    || dexNames.length === 0
  ) {
    return false;
  }

  const states = await Promise.allSettled(
    dexNames.map((dex) => infoClient.clearinghouseState({ user, dex })),
  );
  return states.some(
    (state): boolean =>
      state.status === "fulfilled" && hasMatchingOpenPosition(state.value, asset),
  );
}

type TimingMetaValue = string | number | boolean | undefined | null;
type TimingMeta = Record<string, TimingMetaValue>;

function shortAddress(value: string | undefined): string {
  if (!value) return "unknown";
  const normalized = value.toLowerCase();
  if (!normalized.startsWith("0x") || normalized.length < 12) return normalized;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function createTimingLogger(enabled: boolean, label: string): {
  mark: (stage: string) => void;
  end: (meta?: TimingMeta) => void;
} {
  const startedAt = Date.now();
  let lastAt = startedAt;
  const stages: string[] = [];

  return {
    mark(stage: string): void {
      if (!enabled) return;
      const now = Date.now();
      stages.push(`${stage}=${now - lastAt}ms`);
      lastAt = now;
    },
    end(meta: TimingMeta = {}): void {
      if (!enabled) return;
      const total = Date.now() - startedAt;
      const stageText = stages.length > 0 ? ` ${stages.join(" ")}` : "";
      const metaText = Object.entries(meta)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(" ");
      console.info(
        `[timing] ${label} total=${total}ms${stageText}${metaText ? ` ${metaText}` : ""}`,
      );
    },
  };
}

function appendWarningOnce(warnings: string[], message: string): void {
  if (!warnings.includes(message)) {
    warnings.push(message);
  }
}

function toSizeString(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return value.toFixed(12).replace(/\.?0+$/, "");
}

function cloneRouteSummary(routeSummary: RouteSummary): RouteSummary {
  return {
    ...routeSummary,
    legs: routeSummary.legs.map((leg) => ({ ...leg })),
    warnings: [...routeSummary.warnings],
  };
}

function cloneSplitPlan(splitPlan: SplitExecutionPlan): SplitExecutionPlan {
  return {
    ...splitPlan,
    legs: splitPlan.legs.map((leg) => ({ ...leg })),
  };
}

function clampLeverage(
  requested: number | undefined,
  market: PerpMarket,
): number | undefined {
  if (requested === undefined) return undefined;
  return Math.min(requested, market.maxLeverage);
}

function resolveIsCross(
  requested: boolean | undefined,
  market: PerpMarket,
  warnings: string[],
): boolean | undefined {
  if (requested === undefined) return undefined;
  if (requested && market.onlyIsolated) {
    appendWarningOnce(
      warnings,
      `${market.coin}: cross margin unsupported on this asset; using isolated margin`,
    );
    return false;
  }
  return requested;
}

function ensureRouteSummaryMarkets(
  routeSummary: RouteSummary,
  markets: PerpMarket[],
): RouteSummary {
  const next = cloneRouteSummary(routeSummary);
  if (markets.length === 0) return next;

  const byCoin = new Map(next.legs.map((leg) => [leg.coin, leg]));
  const knownMarketCoins = new Set(markets.map((m) => m.coin));
  const ordered: RouteSummary["legs"] = markets.map((market) => {
    const existing = byCoin.get(market.coin);
    if (existing) {
      return {
        ...existing,
        collateral: String(market.collateral ?? existing.collateral ?? "USD"),
      };
    }
    return {
      coin: market.coin,
      size: 0,
      proportion: 0,
      collateral: String(market.collateral ?? "USD"),
      estimatedAvgPrice: toPositiveNumber(market.markPrice) ?? 0,
    };
  });

  for (const leg of next.legs) {
    if (!knownMarketCoins.has(leg.coin)) {
      ordered.push({ ...leg });
    }
  }

  next.legs = ordered;
  const activeLegCount = ordered.filter((leg) => leg.proportion > 0).length;
  next.isSingleLeg = activeLegCount <= 1;
  return next;
}

function simulateAveragePriceFromBook(
  book: any,
  side: "buy" | "sell",
  size: number,
): number | undefined {
  const levels = side === "buy" ? book?.levels?.[1] : book?.levels?.[0];
  if (!Array.isArray(levels) || levels.length === 0) return undefined;
  if (!Number.isFinite(size) || size <= 0) return undefined;

  let remaining = size;
  let totalCost = 0;
  let filled = 0;
  let lastPx = 0;

  for (const level of levels) {
    const px = toPositiveNumber((level as any)?.px);
    const sz = toPositiveNumber((level as any)?.sz);
    if (!px || !sz) continue;

    const fillQty = Math.min(remaining, sz);
    totalCost += fillQty * px;
    filled += fillQty;
    remaining -= fillQty;
    lastPx = px;

    if (remaining <= 0) break;
  }

  if (filled <= 0) return undefined;
  if (remaining <= 0) return totalCost / size;
  if (lastPx > 0) return lastPx;
  return totalCost / filled;
}

async function resolveReferencePrice(params: {
  hp: any;
  market: PerpMarket;
  side: "buy" | "sell";
  size: number;
  mids: Record<string, string>;
  fallbackPrice?: number;
  warnings: string[];
}): Promise<number> {
  try {
    const book = await params.hp.api.l2Book(params.market.coin);
    const simulated = simulateAveragePriceFromBook(book, params.side, params.size);
    if (simulated && Number.isFinite(simulated) && simulated > 0) {
      return simulated;
    }
  } catch (err) {
    appendWarningOnce(
      params.warnings,
      `${params.market.coin}: book snapshot unavailable (${errorMessage(err)})`,
    );
  }

  const mid = toPositiveNumber(params.mids[params.market.coin]);
  if (mid) {
    appendWarningOnce(
      params.warnings,
      `${params.market.coin}: using mid-price fallback for manual route`,
    );
    return mid;
  }

  const mark = toPositiveNumber(params.market.markPrice);
  if (mark) {
    appendWarningOnce(
      params.warnings,
      `${params.market.coin}: using mark-price fallback for manual route`,
    );
    return mark;
  }

  if (params.fallbackPrice && Number.isFinite(params.fallbackPrice) && params.fallbackPrice > 0) {
    appendWarningOnce(
      params.warnings,
      `${params.market.coin}: using stale quote price fallback for manual route`,
    );
    return params.fallbackPrice;
  }

  throw new BadRequestError(`No price available for "${params.market.coin}" to build manual route.`);
}

function normalizeLegAdjustments(
  routeSummary: RouteSummary,
  legAdjustments: ExecuteLegAdjustment[] | undefined,
): Map<string, number> | undefined {
  if (!Array.isArray(legAdjustments) || legAdjustments.length === 0) {
    return undefined;
  }
  if (legAdjustments.length > 50) {
    throw new BadRequestError("Too many leg adjustments (max 50).");
  }

  if (routeSummary.legs.length === 0) {
    throw new BadRequestError("No route legs available to adjust.");
  }
  if (legAdjustments.length !== routeSummary.legs.length) {
    throw new BadRequestError(
      `Expected ${routeSummary.legs.length} leg adjustments, received ${legAdjustments.length}.`,
    );
  }

  const knownCoins = new Set(routeSummary.legs.map((leg) => leg.coin));
  const adjustmentByCoin = new Map<string, ExecuteLegAdjustment>();
  for (const adjustment of legAdjustments) {
    const coin = typeof adjustment.coin === "string" ? adjustment.coin.trim() : "";
    if (!coin) {
      throw new BadRequestError("Each leg adjustment must include a coin.");
    }
    if (!knownCoins.has(coin)) {
      throw new BadRequestError(`Leg adjustment coin "${coin}" is not part of the quote route.`);
    }
    if (adjustmentByCoin.has(coin)) {
      throw new BadRequestError(`Duplicate leg adjustment for coin "${coin}".`);
    }
    adjustmentByCoin.set(coin, adjustment);
  }

  for (const routeLeg of routeSummary.legs) {
    if (!adjustmentByCoin.has(routeLeg.coin)) {
      throw new BadRequestError(`Missing leg adjustment for coin "${routeLeg.coin}".`);
    }
  }

  const rawByCoin = new Map<string, number>();
  let totalEnabledWeight = 0;
  for (const routeLeg of routeSummary.legs) {
    const adjustment = adjustmentByCoin.get(routeLeg.coin)!;
    const rawWeight = adjustment.enabled ? adjustment.proportion : 0;
    if (!Number.isFinite(rawWeight) || rawWeight < 0) {
      throw new BadRequestError(
        `Invalid proportion for coin "${routeLeg.coin}". Expected a non-negative number.`,
      );
    }
    rawByCoin.set(routeLeg.coin, rawWeight);
    totalEnabledWeight += rawWeight;
  }

  if (totalEnabledWeight <= 0) {
    throw new BadRequestError("At least one route leg must remain enabled.");
  }

  const normalized = new Map<string, number>();
  for (const [coin, rawWeight] of rawByCoin) {
    normalized.set(coin, rawWeight / totalEnabledWeight);
  }
  return normalized;
}

async function applyLegAdjustmentsToExecution(params: {
  hp: any;
  splitPlan: SplitExecutionPlan;
  routeSummary: RouteSummary;
  legAdjustments?: ExecuteLegAdjustment[];
  asset: string;
  side: "buy" | "sell";
  leverage?: number;
  isCross?: boolean;
  resolvedBaseSize: number;
}): Promise<{
  splitPlan: SplitExecutionPlan;
  routeSummary: RouteSummary;
  adjustmentsApplied: boolean;
}> {
  const nextSplitPlan = cloneSplitPlan(params.splitPlan);
  const allMarkets = params.hp.getMarkets(params.asset) as PerpMarket[];
  const nextRouteSummary = ensureRouteSummaryMarkets(params.routeSummary, allMarkets);
  const normalized = normalizeLegAdjustments(nextRouteSummary, params.legAdjustments);
  if (!normalized) {
    return {
      splitPlan: nextSplitPlan,
      routeSummary: nextRouteSummary,
      adjustmentsApplied: false,
    };
  }

  const adjustmentsApplied = nextRouteSummary.legs.some((leg) => {
    const nextProportion = normalized.get(leg.coin) ?? 0;
    return Math.abs(leg.proportion - nextProportion) > 1e-6;
  });

  if (!adjustmentsApplied) {
    return {
      splitPlan: nextSplitPlan,
      routeSummary: nextRouteSummary,
      adjustmentsApplied: false,
    };
  }

  const marketByCoin = new Map(allMarkets.map((market) => [market.coin, market]));
  const warnings = [...nextRouteSummary.warnings];
  const mids = await params.hp.api.allMids()
    .then((result: Record<string, string>) => result)
    .catch(() => ({} as Record<string, string>));

  const slippage = Number.isFinite(nextSplitPlan.slippage)
    ? nextSplitPlan.slippage
    : DEFAULT_SPLIT_SLIPPAGE;

  const adjustedRouteLegs: RouteSummary["legs"] = [];
  const adjustedSplitLegs: SplitExecutionPlan["legs"] = [];

  for (const routeLeg of nextRouteSummary.legs) {
    const nextProportion = normalized.get(routeLeg.coin) ?? 0;
    const market = marketByCoin.get(routeLeg.coin);
    if (!market) {
      if (nextProportion > 0) {
        throw new BadRequestError(
          `Cannot allocate to "${routeLeg.coin}" because this market is currently unavailable.`,
        );
      }
      adjustedRouteLegs.push({
        ...routeLeg,
        proportion: 0,
        size: 0,
      });
      continue;
    }

    const targetSize = params.resolvedBaseSize * nextProportion;
    const quantizedSize = quantizeOrderSize(targetSize, market);
    const quantizedSizeNum = toFiniteNumber(quantizedSize);

    let estimatedAvgPrice = routeLeg.estimatedAvgPrice;
    if (nextProportion > 0 && quantizedSizeNum > 0) {
      estimatedAvgPrice = await resolveReferencePrice({
        hp: params.hp,
        market,
        side: params.side,
        size: targetSize,
        mids,
        fallbackPrice: routeLeg.estimatedAvgPrice,
        warnings,
      });
      const slippagePrice = params.side === "buy"
        ? estimatedAvgPrice * (1 + slippage)
        : estimatedAvgPrice * (1 - slippage);
      const orderPrice = quantizeOrderPrice(slippagePrice, params.side, market);
      if (orderPrice === "0") {
        throw new BadRequestError(
          `Manual route price rounded to zero for "${market.coin}".`,
        );
      }

      const effectiveLeverage = clampLeverage(params.leverage, market);
      if (
        params.leverage !== undefined &&
        effectiveLeverage !== undefined &&
        effectiveLeverage !== params.leverage
      ) {
        appendWarningOnce(
          warnings,
          `${market.coin}: leverage clamped to ${effectiveLeverage}x (market max), requested ${params.leverage}x`,
        );
      }
      const effectiveIsCross = resolveIsCross(params.isCross, market, warnings);

      adjustedSplitLegs.push({
        market,
        side: params.side,
        size: quantizedSize,
        price: orderPrice,
        orderType: { limit: { tif: "Ioc" } },
        slippage,
        leverage: effectiveLeverage,
        isCross: effectiveIsCross,
      });
    } else if (nextProportion > 0 && quantizedSizeNum <= 0) {
      appendWarningOnce(
        warnings,
        `${market.coin}: requested allocation rounded to zero size; leg skipped`,
      );
    }

    adjustedRouteLegs.push({
      coin: market.coin,
      size: quantizedSizeNum,
      proportion: nextProportion,
      collateral: String(market.collateral ?? routeLeg.collateral ?? "USD"),
      estimatedAvgPrice,
    });
  }

  if (adjustedSplitLegs.length === 0) {
    throw new BadRequestError("No active route legs remain after adjustments.");
  }

  const adjustedTotalSize = adjustedSplitLegs.reduce(
    (sum, leg) => sum + toFiniteNumber(leg.size),
    0,
  );
  const routeTotalSize = adjustedRouteLegs.reduce((sum, leg) => sum + leg.size, 0);
  const normalizedRouteLegs = adjustedRouteLegs.map((leg) => ({
    ...leg,
    proportion: routeTotalSize > 0 ? leg.size / routeTotalSize : 0,
  }));

  nextSplitPlan.legs = adjustedSplitLegs;
  nextSplitPlan.side = params.side;
  nextSplitPlan.totalSize = toSizeString(adjustedTotalSize);
  nextSplitPlan.slippage = slippage;

  nextRouteSummary.legs = normalizedRouteLegs;
  nextRouteSummary.isSingleLeg = adjustedSplitLegs.length === 1;
  nextRouteSummary.warnings = warnings;
  appendWarningOnce(nextRouteSummary.warnings, MANUAL_ROUTE_WARNING);

  return {
    splitPlan: nextSplitPlan,
    routeSummary: nextRouteSummary,
    adjustmentsApplied: true,
  };
}

function toCollateralPreview(plan: any): CollateralPreview {
  return {
    requirements: Array.isArray(plan?.requirements)
      ? plan.requirements.map((req: any) => ({
          token: String(req?.token ?? ""),
          amountNeeded: toFiniteNumber(String(req?.amountNeeded ?? "0")),
          currentBalance: toFiniteNumber(String(req?.currentBalance ?? "0")),
          shortfall: toFiniteNumber(String(req?.shortfall ?? "0")),
          swapFrom: String(req?.swapFrom ?? "USDC"),
          estimatedSwapCostBps: toFiniteNumber(String(req?.estimatedSwapCostBps ?? "0")),
        }))
      : [],
    totalSwapCostBps: toFiniteNumber(String(plan?.totalSwapCostBps ?? "0")),
    swapsNeeded: Boolean(plan?.swapsNeeded),
    bridgeRequired: toFiniteNumber(String(plan?.bridgeRequired ?? "0")),
    abstractionEnabled: Boolean(plan?.abstractionEnabled),
  };
}

function appendCollateralDebugWarnings(
  routeSummary: RouteSummary,
  preview: CollateralPreview | undefined,
): void {
  const requirements = preview?.requirements ?? [];
  const shortfalls = requirements.filter((req) => req.shortfall > 0);
  if (shortfalls.length === 0) {
    routeSummary.warnings.push(
      "[debug] Collateral plan: no swaps needed",
    );
    return;
  }

  for (const req of shortfalls) {
    routeSummary.warnings.push(
      `[debug] Collateral plan: need ${req.amountNeeded.toFixed(2)} ${req.token}, have ${req.currentBalance.toFixed(2)}, shortfall ${req.shortfall.toFixed(2)}, swap ${req.swapFrom}->${req.token}`,
    );
  }
}

async function appendCollateralInputDebugWarning(params: {
  routeSummary: RouteSummary;
  hp: any;
  userAddress: string;
  stableTokens: string[];
}): Promise<void> {
  try {
    const [perpState, spotState] = await Promise.all([
      params.hp.api.clearinghouseState(params.userAddress),
      params.hp.api.spotClearinghouseState(params.userAddress),
    ]);

    const stableSet = new Set(params.stableTokens.map((t) => t.toUpperCase()));
    const spotStables = ((spotState?.balances ?? []) as Array<{ coin?: string; total?: string }>)
      .filter((b) => stableSet.has(String(b.coin ?? "").toUpperCase()))
      .map((b) => `${String(b.coin ?? "").toUpperCase()}:${toFiniteNumber(String(b.total ?? "0")).toFixed(2)}`)
      .join(", ");

    params.routeSummary.warnings.push(
      `[debug] Collateral inputs user=${params.userAddress.toLowerCase()} accountValue=${String(perpState?.marginSummary?.accountValue ?? "0")} totalRawUsd=${String(perpState?.marginSummary?.totalRawUsd ?? "0")} withdrawable=${String(perpState?.withdrawable ?? "0")} spotStables=[${spotStables}]`,
    );
  } catch (err) {
    params.routeSummary.warnings.push(
      `[debug] Collateral inputs unavailable: ${errorMessage(err)}`,
    );
  }
}

function toTradeResult(receipt: any): TradeResult {
  return {
    success: receipt.success,
    totalFilledSize: toFiniteNumber(receipt.totalFilledSize),
    aggregateAvgPrice: toFiniteNumber(receipt.aggregateAvgPrice),
    legs: receipt.legs.map((leg: any) => ({
      market: leg.market.coin,
      side: leg.side,
      filledSize: leg.filledSize,
      avgPrice: leg.avgPrice,
      success: leg.success,
      error: leg.error,
    })),
    error: receipt.error,
  };
}

function toCloseTradeResult(receipts: any[]): TradeResult {
  const legs = receipts.map((receipt: any) => ({
    market: String(receipt?.market?.coin ?? ""),
    side: String(receipt?.side ?? ""),
    filledSize: String(receipt?.filledSize ?? "0"),
    avgPrice: String(receipt?.avgPrice ?? "0"),
    success: Boolean(receipt?.success),
    error: typeof receipt?.error === "string" ? receipt.error : undefined,
  }));

  let totalFilledSize = 0;
  let totalCost = 0;
  for (const leg of legs) {
    const filled = toFiniteNumber(leg.filledSize);
    const avg = toFiniteNumber(leg.avgPrice);
    totalFilledSize += filled;
    totalCost += filled * avg;
  }
  const aggregateAvgPrice = totalFilledSize > 0 ? totalCost / totalFilledSize : 0;
  const allSuccess = legs.length > 0 && legs.every((leg) => leg.success);

  let error: string | undefined;
  if (legs.length === 0) {
    error = "No open position found to close for the requested asset.";
  } else if (!allSuccess) {
    const legErrors = legs
      .filter((leg) => leg.error)
      .map((leg) => `${leg.market}: ${leg.error}`)
      .join(" | ");
    error = legErrors || "One or more close legs failed.";
  }

  return {
    success: allSuccess,
    totalFilledSize,
    aggregateAvgPrice,
    legs,
    error,
  };
}

function buildRouteSummaryFromReceipts(
  receipts: any[],
  warnings: string[] = [],
): RouteSummary {
  const totalRequested = receipts.reduce(
    (sum, receipt) => sum + toFiniteNumber(String(receipt?.requestedSize ?? "0")),
    0,
  );

  const legs = receipts.map((receipt) => {
    const size = toFiniteNumber(String(receipt?.requestedSize ?? "0"));
    return {
      coin: String(receipt?.market?.coin ?? ""),
      size,
      proportion: totalRequested > 0 ? size / totalRequested : 0,
      collateral: String(receipt?.market?.collateral ?? "USD"),
      estimatedAvgPrice: toFiniteNumber(String(receipt?.avgPrice ?? "0")),
    };
  });

  return {
    isSingleLeg: legs.length === 1,
    legs,
    estimatedImpactBps: 0,
    estimatedFundingRate: 0,
    builderFeeBps: 0,
    warnings,
  };
}

function buildHistoryLegsFromReceipts(
  receipts: any[],
  routeSummary: RouteSummary,
  result: TradeResult,
): TradeHistoryLeg[] {
  const routeByCoin = new Map(
    routeSummary.legs.map((leg) => [leg.coin, leg]),
  );

  return receipts.map((receipt, i) => {
    const coin = String(receipt?.market?.coin ?? "");
    const route = routeByCoin.get(coin);
    const executed = result.legs[i];
    return {
      coin,
      collateral: String(receipt?.market?.collateral ?? "USD"),
      requestedSize: String(receipt?.requestedSize ?? "0"),
      requestedPrice: String(receipt?.avgPrice ?? "0"),
      requestedProportion: route?.proportion ?? 0,
      requestedLeverage: undefined,
      requestedIsCross: undefined,
      filledSize: executed?.filledSize ?? "0",
      avgPrice: executed?.avgPrice ?? "0",
      success: executed?.success ?? false,
      error: executed?.error,
    };
  });
}

function buildHistoryLegs(
  splitPlan: SplitExecutionPlan,
  routeSummary: RouteSummary,
  result?: TradeResult,
): TradeHistoryLeg[] {
  const routeByCoin = new Map(
    routeSummary.legs.map((leg) => [leg.coin, leg]),
  );

  return splitPlan.legs.map((leg, i) => {
    const route = routeByCoin.get(leg.market.coin);
    const executed = result?.legs[i];
    return {
      coin: leg.market.coin,
      collateral: leg.market.collateral,
      requestedSize: leg.size,
      requestedPrice: leg.price,
      requestedProportion: route?.proportion ?? 0,
      requestedLeverage: leg.leverage,
      requestedIsCross: leg.isCross,
      filledSize: executed?.filledSize ?? "0",
      avgPrice: executed?.avgPrice ?? "0",
      success: executed?.success ?? false,
      error: executed?.error,
    };
  });
}

async function resolveSigner(
  service: ReturnType<typeof getClientService>,
  masterAddress: string,
  network: Network,
): Promise<{ signerAddress: `0x${string}`; signerType: "agent" | "master" }> {
  try {
    const stored = await service.getAgentStore().load(masterAddress, network);
    if (stored?.agentAddress) {
      return { signerAddress: stored.agentAddress, signerType: "agent" };
    }
  } catch {
    // Fall through to master signer.
  }

  return {
    signerAddress: normalizeAddress(masterAddress),
    signerType: "master",
  };
}

function createHistoryItem(params: {
  clickedAt: number;
  network: Network;
  masterAddress: string;
  signer: { signerAddress: `0x${string}`; signerType: "agent" | "master" };
  mode: "safe" | "quick";
  side: "buy" | "sell" | "close-long" | "close-short";
  asset: string;
  amountMode: "base" | "usd";
  requestedAmount: number;
  resolvedBaseSize: number;
  resolvedUsdNotional: number;
  routeSummary: RouteSummary;
  legs: TradeHistoryLeg[];
  success: boolean;
  error?: string;
  leverage?: number;
  isCross?: boolean;
  quoteId?: string;
}): TradeHistoryItem {
  return {
    intentId: uuid(),
    createdAt: params.clickedAt,
    network: params.network,
    masterAddress: normalizeAddress(params.masterAddress),
    signerAddress: params.signer.signerAddress,
    signerType: params.signer.signerType,
    mode: params.mode,
    side: params.side,
    asset: params.asset,
    amountMode: params.amountMode,
    requestedAmount: params.requestedAmount,
    resolvedBaseSize: params.resolvedBaseSize,
    resolvedUsdNotional: params.resolvedUsdNotional,
    leverage: params.leverage,
    isCross: params.isCross,
    quoteId: params.quoteId,
    routeSummary: params.routeSummary,
    legs: params.legs,
    success: params.success,
    error: params.error,
  } satisfies TradeHistoryItem;
}

async function resolveBaseSize(
  hp: any,
  asset: string,
  amountMode: "base" | "usd",
  amount: number,
): Promise<number> {
  if (amountMode === "base") return amount;

  // USD mode: convert to base using mid price
  const mids = await hp.api.allMids();
  const markets = hp.getMarkets(asset);
  if (markets.length === 0) throw new Error(`No markets found for ${asset}`);

  // Try to find a mid price for any market of this asset
  for (const market of markets) {
    const mid = mids[market.coin];
    if (mid) {
      const midPrice = parseFloat(mid);
      if (midPrice > 0) return amount / midPrice;
    }
  }

  // Fallback: use markPrice from registry (covers HIP-3 markets not in allMids)
  for (const market of markets) {
    if (market.markPrice) {
      const markPrice = parseFloat(market.markPrice);
      if (markPrice > 0) return amount / markPrice;
    }
  }

  throw new Error(`No price available for ${asset} to convert USD to base size`);
}

export function tradeRoutes(config: ServerConfig): Router {
  const router = Router();

  // GET /api/trade/history?masterAddress=0x...&network=mainnet&limit=50
  router.get("/history", async (req, res) => {
    let masterAddress: `0x${string}`;
    let network: Network;
    try {
      masterAddress = requireAddress(req.query.masterAddress, "masterAddress");
      network = parseNetwork(req.query.network, config.defaultNetwork) as Network;
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({
          error: err.message,
          code: "BAD_REQUEST",
        });
        return;
      }
      throw err;
    }
    const limit = parseLimit(req.query.limit, 50, 1, 200);

    if (!masterAddress) {
      res.status(400).json({
        error: "Missing masterAddress query parameter",
        code: "BAD_REQUEST",
      });
      return;
    }

      const response: TradeHistoryResponse = {
      items: await tradeHistoryStore(config).list({
        masterAddress,
        network,
        limit,
      }),
    };

    res.json(response);
  });

  // POST /api/trade/quote
  router.post("/quote", async (req, res) => {
    const timing = createTimingLogger(config.enableTimingLogs, "trade.quote");
    let body: QuoteRequest | undefined;
    let resolvedNetwork: Network | undefined;
    let hasAgent = false;
    let legsCount = 0;
    let swapsNeeded = false;
    try {
      cleanQuoteCache();
      body = req.body as QuoteRequest;
      const side = body.side;
      const asset = requireString(body.asset, "asset");
      const masterAddress = requireAddress(body.masterAddress, "masterAddress");
      const ownerPrivyUserId = (req as AuthenticatedRequest).auth?.privyUserId;
      const amountMode = body.amountMode ?? "base";
      const amount = parsePositiveNumber(body.amount, "amount");
      const leverage = parseLeverage(body.leverage);
      const isCross = body.isCross;
      resolvedNetwork = parseNetwork(body.network, config.defaultNetwork);

      if (side !== "buy" && side !== "sell") {
        throw new ValidationError("Invalid side. Expected buy or sell.");
      }
      if (amountMode !== "base" && amountMode !== "usd") {
        throw new ValidationError("Invalid amountMode. Expected base or usd.");
      }
      timing.mark("validate");

      const service = getClientService(config);

      // Avoid exception-based control flow on the hot quote path.
      let hp;
      const agentConfigured = await service.hasClient(masterAddress, resolvedNetwork);
      timing.mark("hasClient");
      if (agentConfigured) {
        try {
          hp = await service.getClient(masterAddress, resolvedNetwork);
          hasAgent = true;
        } catch {
          hp = await service.getPublicClient(resolvedNetwork);
        }
      } else {
        hp = await service.getPublicClient(resolvedNetwork);
      }
      timing.mark("client");

      const baseSize = await resolveBaseSize(hp, asset, amountMode ?? "base", amount);
      timing.mark("resolveBaseSize");

      const options = leverage ? { leverage, isCross: isCross ?? true } : undefined;
      const quote = await hp.quoteSplit(asset, side, baseSize, options);
      legsCount = quote.splitPlan.legs.length;
      timing.mark("quoteSplit");
      const routeSummary = ensureRouteSummaryMarkets(buildRouteSummary(quote, {
        address: config.defaultBuilderAddress,
        feeBps: config.defaultBuilderFeeBps,
      }), hp.getMarkets(asset) as PerpMarket[]);
      let collateralPreview: CollateralPreview | undefined;

      try {
        const preview = await hp.estimateSplitCollateral(quote.splitPlan, masterAddress);
        collateralPreview = toCollateralPreview(preview);
        swapsNeeded = collateralPreview.swapsNeeded;
        timing.mark("estimateSplitCollateral");
        if (config.enableCollateralInputDebug) {
          appendCollateralDebugWarnings(routeSummary, collateralPreview);
          await appendCollateralInputDebugWarning({
            routeSummary,
            hp,
            userAddress: masterAddress,
            stableTokens: config.stableTokens,
          });
          timing.mark("collateralDebug");
        }
        if (hasAgent && collateralPreview.swapsNeeded) {
          appendWarningOnce(routeSummary.warnings, AGENT_COLLATERAL_WARNING);
        }
      } catch (err) {
        timing.mark("estimateSplitCollateral");
        routeSummary.warnings.push(
          `Collateral preview unavailable: ${errorMessage(err)}`,
        );
      }

      const quoteId = uuid();
      const resolvedUsdNotional = baseSize * quote.estimatedAvgPrice;
      // Only cache for server-side execution if agent is available
      if (hasAgent) {
        runtimeState().putQuote(quoteId, {
          id: quoteId,
          quote,
          splitPlan: quote.splitPlan,
          routeSummary,
          side,
          asset,
          amountMode: amountMode ?? "base",
          requestedAmount: amount,
          leverage,
          isCross,
          resolvedBaseSize: baseSize,
          resolvedUsdNotional,
          masterAddress,
          network: resolvedNetwork,
          createdAt: Date.now(),
          ownerPrivyUserId,
        }, QUOTE_TTL_MS);
      }

      // Build execution legs for frontend direct execution
      const executionLegs = quote.splitPlan.legs.map((leg) => ({
        coin: leg.market.coin,
        assetIndex: leg.market.assetIndex,
        side: leg.side,
        size: leg.size,
        price: leg.price,
        orderType: leg.orderType as { limit: { tif: string } },
        leverage: leg.leverage,
        isCross: leg.isCross,
      }));

      const response: QuoteResponse = {
        quoteId,
        resolvedBaseSize: baseSize,
        resolvedUsdNotional,
        routeSummary,
        collateralPreview,
        executionLegs,
      };

      timing.end({
        status: "ok",
        route: "quote",
        network: resolvedNetwork,
        user: shortAddress(masterAddress),
        side,
        asset: asset.toUpperCase(),
        legs: legsCount,
        swapsNeeded,
        agent: hasAgent,
      });
      res.json(response);
    } catch (err) {
      if (err instanceof ValidationError) {
        timing.end({
          status: "bad_request",
          route: "quote",
          code: "BAD_REQUEST",
          network: resolvedNetwork ?? config.defaultNetwork,
          user: shortAddress(body?.masterAddress),
          side: body?.side,
          asset: body?.asset ? body.asset.toUpperCase() : undefined,
        });
        res.status(400).json({
          error: err.message,
          code: "BAD_REQUEST",
        });
        return;
      }
      console.error("[trade/quote] Quote failed:", errorMessage(err));
      const code = toTradeErrorCode(err, "QUOTE_FAILED");
      const status = toTradeErrorStatus(err, 500);
      timing.end({
        status: "error",
        route: "quote",
        code,
        network: resolvedNetwork ?? config.defaultNetwork,
        user: shortAddress(body?.masterAddress),
        side: body?.side,
        asset: body?.asset ? body.asset.toUpperCase() : undefined,
      });
      res.status(status).json({
        error: toTradeErrorMessage(err, "Quote failed. Please try again."),
        code,
      });
    }
  });

  // POST /api/trade/execute-preview
  router.post("/execute-preview", async (req, res) => {
    const timing = createTimingLogger(config.enableTimingLogs, "trade.executePreview");
    let quoteId = "";
    let cached: CachedQuote | undefined;
    try {
      cleanQuoteCache();
      const body = req.body as ExecutePreviewRequest;
      quoteId = body.quoteId;
      const requestedMasterAddress = requireAddress(body.masterAddress, "masterAddress");

      if (!quoteId) {
        timing.end({
          status: "bad_request",
          route: "execute_preview",
          code: "BAD_REQUEST",
        });
        res.status(400).json({ error: "Missing quoteId", code: "BAD_REQUEST" });
        return;
      }
      timing.mark("validate");

      cached = runtimeState().getQuote<CachedQuote>(quoteId) ?? undefined;
      timing.mark("lookupQuote");
      if (!cached) {
        timing.end({
          status: "not_found",
          route: "execute_preview",
          code: "QUOTE_NOT_FOUND",
          quoteId,
        });
        res.status(404).json({ error: "Quote expired or not found", code: "QUOTE_NOT_FOUND" });
        return;
      }
      assertCachedQuoteAccess({
        cached,
        auth: req as AuthenticatedRequest,
        requestedMasterAddress,
      });

      if (Date.now() - cached.createdAt > QUOTE_TTL_MS) {
        runtimeState().deleteQuote(quoteId);
        timing.end({
          status: "expired",
          route: "execute_preview",
          code: "QUOTE_EXPIRED",
          quoteId,
          network: cached.network,
          user: shortAddress(cached.masterAddress),
        });
        res.status(410).json({ error: "Quote expired", code: "QUOTE_EXPIRED" });
        return;
      }

      const service = getClientService(config);
      const hp = await service.getClient(cached.masterAddress, cached.network);
      timing.mark("client");

      const adjusted = await applyLegAdjustmentsToExecution({
        hp,
        splitPlan: cached.splitPlan,
        routeSummary: cached.routeSummary,
        legAdjustments: body.legAdjustments,
        asset: cached.asset,
        side: cached.side,
        leverage: cached.leverage,
        isCross: cached.isCross,
        resolvedBaseSize: cached.resolvedBaseSize,
      });
      timing.mark("applyLegAdjustments");

      let routeSummary = adjusted.routeSummary;
      let collateralPreview: CollateralPreview | undefined;
      try {
        const preview = await hp.estimateSplitCollateral(adjusted.splitPlan, cached.masterAddress);
        collateralPreview = toCollateralPreview(preview);
        timing.mark("estimateSplitCollateral");
      } catch (err) {
        appendWarningOnce(
          routeSummary.warnings,
          `Collateral preview unavailable: ${errorMessage(err)}`,
        );
        timing.mark("estimateSplitCollateral");
      }

      if (collateralPreview?.swapsNeeded) {
        appendWarningOnce(routeSummary.warnings, AGENT_COLLATERAL_WARNING);
      }

      // Refresh the quote TTL so it survives until execution.
      // This turns the TTL into an idle timeout — as long as the user is
      // actively previewing (adjusting legs), the quote stays alive.
      runtimeState().putQuote(quoteId, {
        ...cached,
        createdAt: Date.now(),
      }, QUOTE_TTL_MS);

      const response: ExecutePreviewResponse = {
        routeSummary,
        collateralPreview,
      };

      timing.end({
        status: "ok",
        route: "execute_preview",
        quoteId,
        network: cached.network,
        user: shortAddress(cached.masterAddress),
        legs: adjusted.splitPlan.legs.length,
        swapsNeeded: collateralPreview?.swapsNeeded ?? false,
        manual: adjusted.adjustmentsApplied,
      });
      res.json(response);
    } catch (err) {
      const isBadRequest = err instanceof BadRequestError || err instanceof ValidationError;
      const isForbidden = err instanceof ForbiddenError;
      const baseCode = isBadRequest ? "BAD_REQUEST" : isForbidden ? "FORBIDDEN" : "EXECUTE_PREVIEW_FAILED";
      const baseStatus = isBadRequest ? 400 : isForbidden ? 403 : 500;
      const code = toTradeErrorCode(err, baseCode);
      const status = toTradeErrorStatus(err, baseStatus);
      timing.end({
        status: "error",
        route: "execute_preview",
        code,
        quoteId,
        network: cached?.network,
        user: shortAddress(cached?.masterAddress),
      });
      res.status(status).json({
        error: status === 400 || status === 403
          ? errorMessage(err)
          : toTradeErrorMessage(err, "Execute preview failed."),
        code,
      });
    }
  });

  // POST /api/trade/execute
  router.post("/execute", async (req, res) => {
    const timing = createTimingLogger(config.enableTimingLogs, "trade.execute");
    let cached: CachedQuote | undefined;
    let quoteId = "";
    let executionSplitPlan: SplitExecutionPlan | undefined;
    let executionRouteSummary: RouteSummary | undefined;
    let manualAdjusted = false;
    let quoteTaken = false;
    const clickedAt = Date.now();
    try {
      const body = req.body as ExecuteRequest;
      quoteId = body.quoteId;
      const requestedMasterAddress = requireAddress(body.masterAddress, "masterAddress");

      if (!quoteId) {
        timing.end({
          status: "bad_request",
          route: "execute",
          code: "BAD_REQUEST",
        });
        res.status(400).json({ error: "Missing quoteId", code: "BAD_REQUEST" });
        return;
      }
      timing.mark("validate");

      cached = runtimeState().getQuote<CachedQuote>(quoteId) ?? undefined;
      timing.mark("lookupQuote");
      if (!cached) {
        timing.end({
          status: "not_found",
          route: "execute",
          code: "QUOTE_NOT_FOUND",
          quoteId,
        });
        res.status(404).json({ error: "Quote expired or not found", code: "QUOTE_NOT_FOUND" });
        return;
      }
      assertCachedQuoteAccess({
        cached,
        auth: req as AuthenticatedRequest,
        requestedMasterAddress,
      });

      if (Date.now() - cached.createdAt > QUOTE_TTL_MS) {
        runtimeState().deleteQuote(quoteId);
        const service = getClientService(config);
        const signer = await resolveSigner(service, cached.masterAddress, cached.network);
        timing.mark("resolveSigner");
        await tradeHistoryStore(config).append(createHistoryItem({
          clickedAt,
          network: cached.network,
          masterAddress: cached.masterAddress,
          signer,
          mode: "safe",
          side: cached.side,
          asset: cached.asset,
          amountMode: cached.amountMode,
          requestedAmount: cached.requestedAmount,
          resolvedBaseSize: cached.resolvedBaseSize,
          resolvedUsdNotional: cached.resolvedUsdNotional,
          leverage: cached.leverage,
          isCross: cached.isCross,
          quoteId: cached.id,
          routeSummary: cached.routeSummary,
          legs: buildHistoryLegs(cached.splitPlan, cached.routeSummary),
          success: false,
          error: "Quote expired before execution.",
        }));
        timing.mark("writeHistory");
        timing.end({
          status: "expired",
          route: "execute",
          code: "QUOTE_EXPIRED",
          network: cached.network,
          user: shortAddress(cached.masterAddress),
          side: cached.side,
          asset: cached.asset.toUpperCase(),
          quoteId,
        });
        res.status(410).json({ error: "Quote expired", code: "QUOTE_EXPIRED" });
        return;
      }

      // Atomic take after ownership validation: prevents double execution while
      // avoiding an ownership check that can be abused to consume another user's quote.
      cached = runtimeState().takeQuote<CachedQuote>(quoteId) ?? undefined;
      quoteTaken = true;
      if (!cached) {
        timing.end({
          status: "conflict",
          route: "execute",
          code: "QUOTE_UNAVAILABLE",
          quoteId,
        });
        res.status(409).json({ error: "Quote is no longer available", code: "QUOTE_UNAVAILABLE" });
        return;
      }

      const service = getClientService(config);
      const hp = await service.getClient(cached.masterAddress, cached.network);
      timing.mark("client");

      const adjusted = await applyLegAdjustmentsToExecution({
        hp,
        splitPlan: cached.splitPlan,
        routeSummary: cached.routeSummary,
        legAdjustments: body.legAdjustments,
        asset: cached.asset,
        side: cached.side,
        leverage: cached.leverage,
        isCross: cached.isCross,
        resolvedBaseSize: cached.resolvedBaseSize,
      });
      const splitPlanToExecute = adjusted.splitPlan;
      const routeSummaryToExecute = adjusted.routeSummary;
      executionSplitPlan = splitPlanToExecute;
      executionRouteSummary = routeSummaryToExecute;
      manualAdjusted = adjusted.adjustmentsApplied;
      timing.mark("applyLegAdjustments");

      await validatePriceFreshness(hp, splitPlanToExecute);
      timing.mark("priceFreshness");

      const receipt = await hp.executeSplit(splitPlanToExecute);
      timing.mark("executeSplit");
      const result = toTradeResult(receipt);
      const signer = await resolveSigner(service, cached.masterAddress, cached.network);
      timing.mark("resolveSigner");

      audit({
        event: result.success ? "trade.execute" : "trade.execute_failed",
        ip: req.ip,
        privyUserId: (req as AuthenticatedRequest).auth?.privyUserId,
        wallet: cached.masterAddress,
        network: cached.network,
        asset: cached.asset,
        side: cached.side,
        usdNotional: cached.resolvedUsdNotional,
        success: result.success,
        error: result.error,
        meta: { quoteId, legs: splitPlanToExecute.legs.length, manual: manualAdjusted },
      });

      const historyItem = createHistoryItem({
        clickedAt,
        network: cached.network,
        masterAddress: cached.masterAddress,
        signer,
        mode: "safe",
        side: cached.side,
        asset: cached.asset,
        amountMode: cached.amountMode,
        requestedAmount: cached.requestedAmount,
        resolvedBaseSize: cached.resolvedBaseSize,
        resolvedUsdNotional: cached.resolvedUsdNotional,
        leverage: cached.leverage,
        isCross: cached.isCross,
        quoteId: cached.id,
        routeSummary: routeSummaryToExecute,
        legs: buildHistoryLegs(splitPlanToExecute, routeSummaryToExecute, result),
        success: result.success,
        error: result.error,
      });
      await tradeHistoryStore(config).append(historyItem);
      timing.mark("writeHistory");

      timing.end({
        status: "ok",
        route: "execute",
        network: cached.network,
        user: shortAddress(cached.masterAddress),
        side: cached.side,
        asset: cached.asset.toUpperCase(),
        quoteId,
        success: result.success,
        legs: splitPlanToExecute.legs.length,
        manual: manualAdjusted,
      });
      res.json(result);
    } catch (err) {
      const isBadRequest = err instanceof BadRequestError || err instanceof ValidationError;
      const isForbidden = err instanceof ForbiddenError;
      if (cached && quoteTaken && !isBadRequest && !isForbidden) {
        try {
          const service = getClientService(config);
          const signer = await resolveSigner(service, cached.masterAddress, cached.network);
          const message = errorMessage(err);
          const historySplitPlan = executionSplitPlan ?? cached.splitPlan;
          const historyRouteSummary = executionRouteSummary ?? cached.routeSummary;
          await tradeHistoryStore(config).append(createHistoryItem({
            clickedAt,
            network: cached.network,
            masterAddress: cached.masterAddress,
            signer,
            mode: "safe",
            side: cached.side,
            asset: cached.asset,
            amountMode: cached.amountMode,
            requestedAmount: cached.requestedAmount,
            resolvedBaseSize: cached.resolvedBaseSize,
            resolvedUsdNotional: cached.resolvedUsdNotional,
            leverage: cached.leverage,
            isCross: cached.isCross,
            quoteId: cached.id,
            routeSummary: historyRouteSummary,
            legs: buildHistoryLegs(historySplitPlan, historyRouteSummary),
            success: false,
            error: message,
          }));
        } catch {
          // Indexing failure should not mask execute failure response.
        }
      }
      if (quoteId && quoteTaken && !isBadRequest && !isForbidden) {
        runtimeState().deleteQuote(quoteId);
      }
      const baseCode = isBadRequest ? "BAD_REQUEST" : isForbidden ? "FORBIDDEN" : "EXECUTE_FAILED";
      const baseStatus = isBadRequest ? 400 : isForbidden ? 403 : 500;
      const code = toTradeErrorCode(err, baseCode);
      const status = toTradeErrorStatus(err, baseStatus);
      timing.end({
        status: "error",
        route: "execute",
        code,
        quoteId,
        network: cached?.network,
        user: shortAddress(cached?.masterAddress),
        side: cached?.side,
        asset: cached?.asset ? cached.asset.toUpperCase() : undefined,
        manual: manualAdjusted,
      });
      res.status(status).json({
        error: status === 400 || status === 403
          ? errorMessage(err)
          : toTradeErrorMessage(err, "Trade execution failed."),
        code,
      });
    }
  });

  // POST /api/trade/quick
  router.post("/quick", async (req, res) => {
    const timing = createTimingLogger(config.enableTimingLogs, "trade.quick");
    const clickedAt = Date.now();
    let body: QuickTradeRequest | undefined;
    let resolvedNetwork: Network | undefined;
    let resolvedBaseSize = 0;
    let resolvedUsdNotional = 0;
    let routeSummary: RouteSummary | undefined;
    let splitPlan: SplitExecutionPlan | undefined;
    try {
      body = req.body as QuickTradeRequest;
      const side = body.side;
      const asset = requireString(body.asset, "asset");
      const masterAddress = requireAddress(body.masterAddress, "masterAddress");
      const amountMode = body.amountMode ?? "base";
      const amount = parsePositiveNumber(body.amount, "amount");
      const leverage = parseLeverage(body.leverage);
      const isCross = body.isCross;
      resolvedNetwork = parseNetwork(body.network, config.defaultNetwork);

      if (side !== "buy" && side !== "sell") {
        throw new ValidationError("Invalid side. Expected buy or sell.");
      }
      if (amountMode !== "base" && amountMode !== "usd") {
        throw new ValidationError("Invalid amountMode. Expected base or usd.");
      }
      timing.mark("validate");

      const service = getClientService(config);
      const hp = await service.getClient(masterAddress, resolvedNetwork);
      timing.mark("client");

      const baseSize = await resolveBaseSize(hp, asset, amountMode ?? "base", amount);
      resolvedBaseSize = baseSize;
      timing.mark("resolveBaseSize");
      const options = leverage ? { leverage, isCross: isCross ?? true } : undefined;
      const quote = await hp.quoteSplit(asset, side, baseSize, options);
      timing.mark("quoteSplit");
      routeSummary = buildRouteSummary(quote, {
        address: config.defaultBuilderAddress,
        feeBps: config.defaultBuilderFeeBps,
      });
      resolvedUsdNotional = baseSize * quote.estimatedAvgPrice;
      splitPlan = quote.splitPlan;

      const receipt = await hp.executeSplit(quote.splitPlan);
      timing.mark("executeSplit");
      const result = toTradeResult(receipt);
      const signer = await resolveSigner(service, masterAddress, resolvedNetwork);
      timing.mark("resolveSigner");

      audit({
        event: result.success ? "trade.quick" : "trade.quick_failed",
        ip: req.ip,
        privyUserId: (req as AuthenticatedRequest).auth?.privyUserId,
        wallet: masterAddress,
        network: resolvedNetwork,
        asset,
        side,
        usdNotional: resolvedUsdNotional,
        success: result.success,
        error: result.error,
        meta: { legs: splitPlan!.legs.length },
      });

      await tradeHistoryStore(config).append(createHistoryItem({
        clickedAt,
        network: resolvedNetwork,
        masterAddress,
        signer,
        mode: "quick",
        side,
        asset,
        amountMode: amountMode ?? "base",
        requestedAmount: amount,
        resolvedBaseSize: baseSize,
        resolvedUsdNotional,
        leverage,
        isCross,
        routeSummary,
        legs: buildHistoryLegs(quote.splitPlan, routeSummary, result),
        success: result.success,
        error: result.error,
      }));
      timing.mark("writeHistory");

      timing.end({
        status: "ok",
        route: "quick",
        network: resolvedNetwork,
        user: shortAddress(masterAddress),
        side,
        asset: asset.toUpperCase(),
        legs: splitPlan.legs.length,
        success: result.success,
      });
      res.json(result);
    } catch (err) {
      if (err instanceof ValidationError) {
        timing.end({
          status: "bad_request",
          route: "quick",
          code: "BAD_REQUEST",
          network: resolvedNetwork ?? config.defaultNetwork,
          user: shortAddress(body?.masterAddress),
          side: body?.side,
          asset: body?.asset ? body.asset.toUpperCase() : undefined,
          legs: splitPlan?.legs.length,
        });
        res.status(400).json({
          error: err.message,
          code: "BAD_REQUEST",
        });
        return;
      }
      if (body && body.masterAddress && body.side && body.asset && body.amount && resolvedNetwork) {
        try {
          const service = getClientService(config);
          const signer = await resolveSigner(service, body.masterAddress, resolvedNetwork);
          const fallbackRouteSummary: RouteSummary = routeSummary ?? {
            isSingleLeg: true,
            legs: [],
            estimatedImpactBps: 0,
            estimatedFundingRate: 0,
            builderFeeBps: config.defaultBuilderFeeBps,
            warnings: [],
          };

          await tradeHistoryStore(config).append(createHistoryItem({
            clickedAt,
            network: resolvedNetwork,
            masterAddress: body.masterAddress,
            signer,
            mode: "quick",
            side: body.side,
            asset: body.asset,
            amountMode: body.amountMode ?? "base",
            requestedAmount: body.amount,
            resolvedBaseSize,
            resolvedUsdNotional,
            leverage: body.leverage,
            isCross: body.isCross,
            routeSummary: fallbackRouteSummary,
            legs: splitPlan ? buildHistoryLegs(splitPlan, fallbackRouteSummary) : [],
            success: false,
            error: errorMessage(err),
          }));
        } catch {
          // Indexing failure should not mask quick-trade failure response.
        }
      }
      const code = toTradeErrorCode(err, "QUICK_TRADE_FAILED");
      const status = toTradeErrorStatus(err, 500);
      timing.end({
        status: "error",
        route: "quick",
        code,
        network: resolvedNetwork ?? config.defaultNetwork,
        user: shortAddress(body?.masterAddress),
        side: body?.side,
        asset: body?.asset ? body.asset.toUpperCase() : undefined,
        legs: splitPlan?.legs.length,
      });
      res.status(status).json({
        error: toTradeErrorMessage(err, "Quick trade failed. Please try again."),
        code,
      });
    }
  });

  // POST /api/trade/close
  router.post("/close", async (req, res) => {
    const timing = createTimingLogger(config.enableTimingLogs, "trade.close");
    const clickedAt = Date.now();
    let body: ClosePositionRequest | undefined;
    let resolvedNetwork: Network | undefined;
    let usedAgentFallback = false;
    let routeSummary: RouteSummary | undefined;
    try {
      body = req.body as ClosePositionRequest;
      const masterAddress = requireAddress(body.masterAddress, "masterAddress");
      const asset = requireString(body.asset, "asset");
      const coin = body.coin === undefined ? undefined : requireString(body.coin, "coin");
      const closeTarget = coin ?? asset;
      resolvedNetwork = parseNetwork(body.network, config.defaultNetwork);
      timing.mark("validate");

      const service = getClientService(config);
      const stored = await service.getAgentStore().load(masterAddress, resolvedNetwork);

      // Resolve the actual address holding the position.
      // Positions may live on a sub-account rather than the master address.
      // We query the raw HL info client first (same approach as portfolio) to
      // find which address actually holds the position before calling close().
      let effectiveAddress: string = masterAddress;
      const hp = await service.getClient(masterAddress, resolvedNetwork);
      timing.mark("client");

      const infoClient = (hp.api as any).info as any;
      let positionFoundOnMaster = false;

      // Step 1: Check master address directly via the raw info API
      if (infoClient && typeof infoClient.clearinghouseState === "function") {
        try {
          const masterState = await infoClient.clearinghouseState({ user: masterAddress });
          positionFoundOnMaster = hasMatchingOpenPosition(masterState, closeTarget);
          if (!positionFoundOnMaster) {
            const rawPositions = extractPositions(masterState);
            const coins = rawPositions
              .map((p: any) => {
                const pos = p?.position ?? p;
                return `${String(pos?.coin ?? "")}(szi=${String(pos?.szi ?? "0")})`;
              })
              .join(", ");
            console.warn(
              `[trade.close] No "${closeTarget}" on master ${shortAddress(masterAddress)}. ` +
              `Raw positions: [${coins || "none"}]`,
            );
          }
        } catch (err) {
          console.warn(`[trade.close] Master state check failed:`, err instanceof Error ? err.message : String(err));
        }
      }

      // Step 2: If not on master, check sub-accounts
      if (!positionFoundOnMaster && infoClient && typeof infoClient.subAccounts === "function") {
        try {
          const targetDexNames = getRelevantDexNamesForAsset(hp, closeTarget);
          const subAccountsRaw = await infoClient.subAccounts({ user: masterAddress });
          if (Array.isArray(subAccountsRaw)) {
            for (const item of subAccountsRaw) {
              const subUser = String((item as any)?.subAccountUser ?? "");
              if (!subUser) continue;
              const subState = (item as any)?.clearinghouseState;
              const hasTargetPosition = hasMatchingOpenPosition(subState, closeTarget)
                || await hasMatchingPositionOnDexes({
                  infoClient,
                  user: subUser,
                  dexNames: targetDexNames,
                  asset: closeTarget,
                });
              if (hasTargetPosition) {
                effectiveAddress = subUser;
                console.log(`[trade.close] Position for "${closeTarget}" found on sub-account ${shortAddress(subUser)}`);
                break;
              }
            }
          }
          timing.mark("resolveSubAccount");
        } catch (err) {
          timing.mark("resolveSubAccount");
          console.warn(`[trade.close] Sub-account check failed:`, err instanceof Error ? err.message : String(err));
        }
      }

      // Step 3: If not on master or sub-accounts, check agent address
      if (!positionFoundOnMaster && effectiveAddress.toLowerCase() === masterAddress.toLowerCase()) {
        if (stored?.agentAddress && infoClient && typeof infoClient.clearinghouseState === "function") {
          try {
            const agentState = await infoClient.clearinghouseState({ user: stored.agentAddress });
            if (hasMatchingOpenPosition(agentState, closeTarget)) {
              effectiveAddress = stored.agentAddress;
              console.log(`[trade.close] Position for "${closeTarget}" found on agent ${shortAddress(stored.agentAddress)}`);
            }
          } catch {
            // Agent address check is best-effort.
          }
        }
      }

      // If position is on a different address, create an HP targeting it
      let closeHp = hp;
      if (effectiveAddress.toLowerCase() !== masterAddress.toLowerCase()) {
        if (stored?.agentPrivateKey) {
          closeHp = new HyperliquidPrime({
            privateKey: stored.agentPrivateKey,
            walletAddress: normalizeAddress(effectiveAddress),
            testnet: resolvedNetwork === "testnet",
            logLevel: "warn",
          });
          await closeHp.connect();
          timing.mark("connectSubAccount");
        } else {
          console.warn(
            `[trade.close] Position on ${shortAddress(effectiveAddress)} but no agent private key. ` +
            `Falling back to master HP.`,
          );
        }
      }

      let receipts = await closeHp.close(closeTarget);
      timing.mark("closePrimary");
      let signer = await resolveSigner(service, masterAddress, resolvedNetwork);
      timing.mark("resolveSigner");

      // Fallback 1: if we targeted a sub-account but found nothing, retry on master
      if (receipts.length === 0 && effectiveAddress.toLowerCase() !== masterAddress.toLowerCase()) {
        console.warn(`[trade.close] Close on ${shortAddress(effectiveAddress)} returned empty, retrying on master`);
        receipts = await hp.close(closeTarget);
        timing.mark("closeMasterFallback");
      }

      // Fallback 2: try agent address as position owner (skip if already tried above)
      if (receipts.length === 0 && stored?.agentPrivateKey && stored.agentAddress
          && effectiveAddress.toLowerCase() !== stored.agentAddress.toLowerCase()) {
        console.warn(`[trade.close] Trying agent fallback on ${shortAddress(stored.agentAddress)}`);
        const fallbackHp = new HyperliquidPrime({
          privateKey: stored.agentPrivateKey,
          walletAddress: stored.agentAddress,
          testnet: resolvedNetwork === "testnet",
          logLevel: "warn",
        });
        try {
          await fallbackHp.connect();
          timing.mark("connectFallback");
          receipts = await fallbackHp.close(closeTarget);
          timing.mark("closeFallback");
          if (receipts.length > 0) {
            usedAgentFallback = true;
            signer = {
              signerAddress: normalizeAddress(stored.agentAddress),
              signerType: "agent",
            };
          }
        } finally {
          await fallbackHp.disconnect().catch(() => {});
          timing.mark("disconnectFallback");
        }
      }

      if (receipts.length === 0) {
        console.warn(
          `[trade.close] All close attempts failed for "${closeTarget}". ` +
          `master=${shortAddress(masterAddress)} effective=${shortAddress(effectiveAddress)} ` +
          `hasAgentKey=${Boolean(stored?.agentPrivateKey)} agentAddr=${shortAddress(stored?.agentAddress)}`,
        );
      }

      // Clean up sub-account HP if we created one
      if (closeHp !== hp) {
        await closeHp.disconnect().catch(() => {});
      }

      routeSummary = buildRouteSummaryFromReceipts(
        receipts,
        usedAgentFallback
          ? ["Closed using agent wallet fallback because no position was found on the master account."]
          : [],
      );
      const result = toCloseTradeResult(receipts);

      audit({
        event: result.success ? "trade.close" : "trade.close_failed",
        ip: req.ip,
        privyUserId: (req as AuthenticatedRequest).auth?.privyUserId,
        wallet: masterAddress,
        network: resolvedNetwork,
        asset: closeTarget,
        success: result.success,
        error: result.error,
        meta: { legs: result.legs.length, agentFallback: usedAgentFallback },
      });

      const requestedBaseSize = receipts.reduce(
        (sum, receipt) => sum + toFiniteNumber(String(receipt?.requestedSize ?? "0")),
        0,
      );
      // Close-long sells to exit, close-short buys to exit.
      // Use dedicated side values so the frontend can distinguish close from open.
      const legSide = result.legs[0]?.side;
      const side: "buy" | "sell" | "close-long" | "close-short" =
        legSide === "sell" ? "close-long" : "close-short";

      await tradeHistoryStore(config).append(createHistoryItem({
        clickedAt,
        network: resolvedNetwork,
        masterAddress,
        signer,
        mode: "quick",
        side,
        asset: closeTarget,
        amountMode: "base",
        requestedAmount: requestedBaseSize,
        resolvedBaseSize: requestedBaseSize,
        resolvedUsdNotional: requestedBaseSize * result.aggregateAvgPrice,
        routeSummary,
        legs: buildHistoryLegsFromReceipts(receipts, routeSummary, result),
        success: result.success,
        error: result.error,
      }));
      timing.mark("writeHistory");

      timing.end({
        status: "ok",
        route: "close",
        network: resolvedNetwork,
        user: shortAddress(masterAddress),
        asset: closeTarget.toUpperCase(),
        legs: result.legs.length,
        success: result.success,
        fallback: usedAgentFallback,
      });
      res.json(result);
    } catch (err) {
      if (err instanceof ValidationError) {
        timing.end({
          status: "bad_request",
          route: "close",
          code: "BAD_REQUEST",
          network: resolvedNetwork ?? config.defaultNetwork,
          user: shortAddress(body?.masterAddress),
          asset: typeof body?.coin === "string"
            ? body.coin.toUpperCase()
            : body?.asset
              ? body.asset.toUpperCase()
              : undefined,
          fallback: usedAgentFallback,
        });
        res.status(400).json({
          error: err.message,
          code: "BAD_REQUEST",
        });
        return;
      }
      if (body && body.masterAddress && body.asset && resolvedNetwork) {
        try {
          const service = getClientService(config);
          const signer = await resolveSigner(service, body.masterAddress, resolvedNetwork);
          const fallbackRouteSummary: RouteSummary = routeSummary ?? {
            isSingleLeg: true,
            legs: [],
            estimatedImpactBps: 0,
            estimatedFundingRate: 0,
            builderFeeBps: 0,
            warnings: [],
          };
          await tradeHistoryStore(config).append(createHistoryItem({
            clickedAt,
            network: resolvedNetwork,
            masterAddress: body.masterAddress,
            signer,
            mode: "quick",
            side: "close-long",
            asset: typeof body.coin === "string" ? body.coin : body.asset,
            amountMode: "base",
            requestedAmount: 0,
            resolvedBaseSize: 0,
            resolvedUsdNotional: 0,
            routeSummary: fallbackRouteSummary,
            legs: [],
            success: false,
            error: errorMessage(err),
          }));
        } catch {
          // Indexing failure should not mask close failure response.
        }
      }

      const code = toTradeErrorCode(err, "CLOSE_FAILED");
      const status = toTradeErrorStatus(err, 500);
      timing.end({
        status: "error",
        route: "close",
        code,
        network: resolvedNetwork ?? config.defaultNetwork,
        user: shortAddress(body?.masterAddress),
        asset: typeof body?.coin === "string"
          ? body.coin.toUpperCase()
          : body?.asset
            ? body.asset.toUpperCase()
            : undefined,
        fallback: usedAgentFallback,
      });
      res.status(status).json({
        error: toTradeErrorMessage(err, "Close position failed. Please try again."),
        code,
      });
    }
  });

  return router;
}
