import * as hl from "@nktkas/hyperliquid";
import { formatPrice } from "@nktkas/hyperliquid/utils";
import type { CollateralPreview, RouteSummary, Network } from "@shared/types";
import { createExchangeClientFromInjected, getErrorChainMessage } from "./wallet-client";

const BUILDER_APPROVAL_CACHE = new Set<string>();
const BUILDER_APPROVAL_STORAGE_KEY = "hl-prime:builder-approval-cache:v1";
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

type SpotMetaToken = {
  name: string;
  index: number;
  szDecimals: number;
};

type SpotMetaPair = {
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
}): number {
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
  return Math.max(0, spendableStableUsd - nonUsdcStableSpotBalance - spotUsdcBalance);
}

function isStableCollateralToken(value: string): boolean {
  const token = normalizeToken(value);
  if (KNOWN_STABLE_COLLATERAL.has(token)) return true;
  return token.startsWith("USD");
}

function toDecimalString(value: number, decimals = 6): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return value.toFixed(decimals).replace(/\.?0+$/, "");
}

function isNonFatalBuilderError(message: string): boolean {
  return /already|exists|configured|unchanged|same|duplicate/i.test(message);
}

function isLikelyInsufficientBalanceError(message: string): boolean {
  return /insufficient|not enough|available|balance|margin/i.test(message);
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

function normalizedApprovalTenthsBps(rawApproval: number): number {
  if (!Number.isFinite(rawApproval) || rawApproval <= 0) return 0;
  const raw = Math.max(0, rawApproval);
  const candidates = [raw, raw * 10];
  if (raw < 1) {
    candidates.push(raw * 1000);
  }
  return Math.max(...candidates);
}

function isBuilderApprovalSufficient(
  rawApproval: number,
  requiredTenthsBps: number,
): boolean {
  return normalizedApprovalTenthsBps(rawApproval) >= requiredTenthsBps;
}

function readPersistentBuilderApprovalCache(): Set<string> {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = window.localStorage.getItem(BUILDER_APPROVAL_STORAGE_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set<string>();
  }
}

function writePersistentBuilderApprovalCache(values: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      BUILDER_APPROVAL_STORAGE_KEY,
      JSON.stringify([...values]),
    );
  } catch {
    // Ignore localStorage failures; memory cache still avoids repeated prompts in-session.
  }
}

function isBuilderApprovalCached(cacheKey: string): boolean {
  if (BUILDER_APPROVAL_CACHE.has(cacheKey)) return true;
  const persistent = readPersistentBuilderApprovalCache();
  if (persistent.has(cacheKey)) {
    BUILDER_APPROVAL_CACHE.add(cacheKey);
    return true;
  }
  return false;
}

function cacheBuilderApproval(cacheKey: string): void {
  BUILDER_APPROVAL_CACHE.add(cacheKey);
  const persistent = readPersistentBuilderApprovalCache();
  persistent.add(cacheKey);
  writePersistentBuilderApprovalCache(persistent);
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

function formatSpotLimitPrice(price: number, szDecimals: number): string {
  const safePrice = Number.isFinite(price) ? Math.max(price, 0) : 0;
  if (safePrice <= 0) {
    throw new Error("Invalid spot limit price after slippage adjustment.");
  }
  return formatPrice(safePrice, normalizeSzDecimals(szDecimals), "spot");
}

function hasAsks(book: { levels?: [Array<unknown>, Array<unknown>] } | null): boolean {
  return (book?.levels?.[1]?.length ?? 0) > 0;
}

function quotePriority(token: string, preferredQuotes: readonly string[]): number {
  const normalized = normalizeToken(token);
  const idx = preferredQuotes.indexOf(normalized);
  if (idx >= 0) return idx;
  if (isStableCollateralToken(normalized)) return preferredQuotes.length;
  return Number.POSITIVE_INFINITY;
}

function resolveSpotSwapMarket(
  tokenByIndex: Map<number, SpotMetaToken>,
  pairs: SpotMetaPair[],
  targetToken: string,
  swapFrom: string,
): ResolvedSpotSwapMarket {
  const target = normalizeToken(targetToken);
  const from = normalizeToken(swapFrom);
  const candidates: Array<{
    pair: SpotMetaPair;
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
  };
}

async function loadSpotBook(
  info: hl.InfoClient,
  pairId: string,
  pairLabel: string,
  priceSide: "asks" | "bids",
): Promise<Awaited<ReturnType<hl.InfoClient["l2Book"]>>> {
  const byId = await info.l2Book({ coin: pairId });
  if (
    (priceSide === "asks" && hasAsks(byId)) ||
    (priceSide === "bids" && (byId?.levels?.[0]?.length ?? 0) > 0)
  ) {
    return byId;
  }

  const normalizedId = normalizeToken(pairId);
  const normalizedLabel = normalizeToken(pairLabel);
  if (normalizedId !== normalizedLabel) {
    const byLabel = await info.l2Book({ coin: pairLabel });
    if (
      (priceSide === "asks" && hasAsks(byLabel)) ||
      (priceSide === "bids" && (byLabel?.levels?.[0]?.length ?? 0) > 0)
    ) {
      return byLabel;
    }
  }

  return byId;
}

function parseOrderStatusError(status: unknown): string | null {
  if (typeof status === "string") {
    if (status === "waitingForFill" || status === "waitingForTrigger") {
      return `Swap order did not fill immediately (${status}).`;
    }
    return `Unknown swap order status: ${status}`;
  }

  if (status && typeof status === "object" && "error" in status) {
    const error = (status as { error?: unknown }).error;
    return typeof error === "string" ? error : "Swap order was rejected.";
  }

  return null;
}

async function approveBuilderIfNeeded(
  exchange: hl.ExchangeClient,
  network: Network,
  address: `0x${string}`,
  routeSummary: RouteSummary | undefined,
): Promise<void> {
  if (!routeSummary?.builderApproval || routeSummary.builderFeeBps <= 0) {
    return;
  }

  const cacheKey = [
    network,
    address.toLowerCase(),
    routeSummary.builderApproval.builder.toLowerCase(),
    routeSummary.builderApproval.maxFeeRate,
  ].join(":");
  if (isBuilderApprovalCached(cacheKey)) {
    return;
  }

  const transport = new hl.HttpTransport({ isTestnet: network === "testnet" });
  const info = new hl.InfoClient({ transport });
  const requiredFeeTenthsBps = Math.max(0, Math.floor(routeSummary.builderFeeBps * 10));
  const isConfirmedApproved = async (): Promise<boolean> => {
    try {
      const confirmedApproval = await info.maxBuilderFee({
        user: address,
        builder: routeSummary.builderApproval!.builder,
      });
      return isBuilderApprovalSufficient(confirmedApproval, requiredFeeTenthsBps);
    } catch {
      return false;
    }
  };
  try {
    const currentApproval = await info.maxBuilderFee({
      user: address,
      builder: routeSummary.builderApproval.builder,
    });
    if (isBuilderApprovalSufficient(currentApproval, requiredFeeTenthsBps)) {
      cacheBuilderApproval(cacheKey);
      return;
    }
  } catch {
    // If this check fails, proceed to explicit approval attempt below.
  }

  let approvalAttempted = false;
  try {
    await exchange.approveBuilderFee({
      builder: routeSummary.builderApproval.builder,
      maxFeeRate: routeSummary.builderApproval.maxFeeRate,
    });
    approvalAttempted = true;
  } catch (error) {
    const message = getErrorChainMessage(error);
    if (isNonFatalBuilderError(message)) {
      approvalAttempted = true;
    } else {
      // Builder fee is optional for trade success; continue without blocking execution.
      return;
    }
  }

  if (!approvalAttempted) return;
  if (await isConfirmedApproved()) {
    cacheBuilderApproval(cacheKey);
  }
}

async function prepareCollateralIfNeeded(
  exchange: hl.ExchangeClient,
  network: Network,
  address: `0x${string}`,
  collateralPreview: CollateralPreview | undefined,
): Promise<void> {
  const requirements = collateralPreview?.requirements ?? [];
  const shortfalls = requirements.filter((req) => req.shortfall > 0);
  const unsupported = shortfalls.filter((req) => !isStableCollateralToken(req.token));
  if (unsupported.length > 0) {
    const tokens = unsupported.map((req) => normalizeToken(req.token)).join(", ");
    throw new Error(
      `Injected pre-trade collateral prep currently supports stablecoin collateral only. Unsupported: ${tokens}`,
    );
  }

  const needed = shortfalls;
  if (needed.length === 0) return;

  const transport = new hl.HttpTransport({ isTestnet: network === "testnet" });
  const info = new hl.InfoClient({ transport });
  const spotState = await info.spotClearinghouseState({ user: address });
  const perpState = await info.clearinghouseState({ user: address });
  const spotMeta = await info.spotMeta();

  const spotBalanceMap = new Map<string, number>();
  const rawBalances = (spotState as { balances?: Array<{ coin?: string; total?: string }> }).balances ?? [];
  for (const balance of rawBalances) {
    const coin = typeof balance.coin === "string" ? normalizeToken(balance.coin) : "";
    if (!coin) continue;
    const total = typeof balance.total === "string" ? parseFloat(balance.total) : 0;
    spotBalanceMap.set(coin, Number.isFinite(total) ? total : 0);
  }
  const spendableStableUsd = parsePerpSpendableStableUsd(
    perpState as {
      withdrawable?: string;
      marginSummary?: { totalRawUsd?: string; accountValue?: string };
    },
  );
  const perpUsdc = inferPerpUsdcBalanceFromSpot({
    spendableStableUsd,
    spotBalances: spotBalanceMap,
  });
  const sourceBalances = buildStableSourceBalances(
    spotBalanceMap,
    perpUsdc,
  );

  const tokenByIndex = new Map<number, SpotMetaToken>();
  for (const token of spotMeta.tokens as SpotMetaToken[]) {
    tokenByIndex.set(token.index, token);
  }
  const pairs = spotMeta.universe as SpotMetaPair[];

  for (const req of needed) {
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
    const spotBook = await loadSpotBook(
      info,
      market.pairId,
      market.pairLabel,
      market.priceSide,
    );
    const levels = market.priceSide === "asks"
      ? (spotBook?.levels?.[1] ?? [])
      : (spotBook?.levels?.[0] ?? []);
    if (levels.length === 0) {
      throw new Error(`No spot liquidity for ${req.token} (${market.pairLabel})`);
    }

    const topPrice = parseFloat(levels[0].px);
    if (!Number.isFinite(topPrice) || topPrice <= 0) {
      throw new Error(`Invalid spot top-of-book price for ${req.token} (${market.pairLabel})`);
    }
    const limitPriceRaw = market.side === "buy"
      ? topPrice * 1.005
      : topPrice * 0.995;
    const limitPrice = formatSpotLimitPrice(limitPriceRaw, market.baseSzDecimals);
    const orderSizeBase = market.side === "buy"
      ? req.shortfall
      : req.shortfall / topPrice;
    const finalOrderSizeRaw = orderSizeBase * market.sizeMultiplier / market.sizeDivisor;
    const finalOrderSize = quantizeSize(finalOrderSizeRaw, market.baseSzDecimals);
    if (!Number.isFinite(finalOrderSize) || finalOrderSize <= 0) {
      throw new Error(`Invalid spot size for ${req.token} (${market.pairLabel})`);
    }
    const finalOrderSizeStr = toDecimalString(
      finalOrderSize,
      normalizeSzDecimals(market.baseSzDecimals),
    );
    if (finalOrderSizeStr === "0") {
      throw new Error(`Spot size rounded to zero for ${req.token} (${market.pairLabel})`);
    }

    const placeSwapOrder = async () => {
      const result = await exchange.order({
        orders: [{
          a: market.assetIndex,
          b: market.side === "buy",
          p: limitPrice,
          s: finalOrderSizeStr,
          r: false,
          t: { limit: { tif: "Ioc" } },
        }],
        grouping: "na",
      });

      const status = result.response.data.statuses[0];
      const statusError = parseOrderStatusError(status);
      if (statusError) {
        throw new Error(
          `${statusError} (pair ${market.pairLabel}, side ${market.side}, px ${limitPrice}, size ${finalOrderSizeStr}, szDecimals ${market.baseSzDecimals})`,
        );
      }
    };

    // Unified account users can swap directly without usdClassTransfer.
    try {
      await placeSwapOrder();
      consumeSourceBalance(sourceBalances, swapFrom, sourceAmountNeeded);
      continue;
    } catch (error) {
      const message = getErrorChainMessage(error);
      if (!isLikelyInsufficientBalanceError(message)) {
        throw new Error(`Swap ${swapFrom}->${req.token} failed: ${message}`);
      }
      if (swapFrom !== "USDC") {
        throw new Error(`Swap ${swapFrom}->${req.token} failed: ${message}`);
      }
    }

    // Fallback for non-unified accounts: move USDC perp -> spot then retry.
    const transferAmount = sourceAmountNeeded;
    try {
      await exchange.usdClassTransfer({
        amount: toDecimalString(transferAmount),
        toPerp: false,
      });
    } catch (error) {
      const message = getErrorChainMessage(error);
      if (/action disabled when unified account is active/i.test(message)) {
        throw new Error(
          `Swap ${swapFrom}->${req.token} still needs spot balance, but transfer is disabled in unified mode.`,
        );
      }
      throw new Error(`Collateral transfer for ${req.token} failed: ${message}`);
    }

    try {
      await placeSwapOrder();
      consumeSourceBalance(sourceBalances, swapFrom, sourceAmountNeeded);
    } catch (error) {
      throw new Error(
        `Swap ${swapFrom}->${req.token} failed after transfer: ${getErrorChainMessage(error)}`,
      );
    }
  }
}

/**
 * Synchronous check: returns true if the builder fee for this
 * address/network/route has already been approved (in-memory or localStorage).
 * No network calls, no wallet popup.
 */
export function isBuilderFeeAlreadyApproved(params: {
  address: `0x${string}`;
  network: Network;
  routeSummary?: RouteSummary;
}): boolean {
  if (!params.routeSummary?.builderApproval || params.routeSummary.builderFeeBps <= 0) {
    return true; // no builder fee required
  }
  const cacheKey = [
    params.network,
    params.address.toLowerCase(),
    params.routeSummary.builderApproval.builder.toLowerCase(),
    params.routeSummary.builderApproval.maxFeeRate,
  ].join(":");
  return isBuilderApprovalCached(cacheKey);
}

export async function runMasterPreTradeActions(params: {
  address: `0x${string}`;
  network: Network;
  routeSummary?: RouteSummary;
  collateralPreview?: CollateralPreview;
}): Promise<void> {
  const exchange = await createExchangeClientFromInjected(
    params.address,
    params.network,
  );

  try {
    await approveBuilderIfNeeded(
      exchange,
      params.network,
      params.address,
      params.routeSummary,
    );
    await prepareCollateralIfNeeded(exchange, params.network, params.address, params.collateralPreview);
  } catch (error) {
    throw new Error(getErrorChainMessage(error));
  }
}
