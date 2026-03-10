import { Router } from "express";
import type { ServerConfig } from "../config.js";
import { getClientService } from "./agent.js";
import { getUnifiedBalance } from "../services/balance.js";
import type {
  BootstrapResponse,
  DedupedAsset,
  GroupedPosition,
  Network,
  PortfolioBalanceRow,
  PortfolioFundingRow,
  PortfolioOpenOrderRow,
  PortfolioOrderHistoryRow,
  PortfolioPositionRow,
  PortfolioResponse,
  PortfolioTradeRow,
} from "../../../shared/types.js";
import { deriveBaseAsset } from "../../../shared/asset.js";
import { groupBy, weightedAverage, sumField, maxField } from "../utils/aggregation.js";
import { parseNetwork, requireAddress, ValidationError } from "../utils/validation.js";

interface CoinMeta {
  market: string;
  baseAsset: string;
  collateral: string;
}

interface ParsedPosition {
  coin: string;
  baseAsset: string;
  collateral: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  markPrice: number;
  notionalUsd: number;
  marginUsedUsd: number;
  unrealizedPnlUsd: number;
  leverage: number;
  liquidationPrice: number | null;
  updatedAt: number;
}

interface FillLike {
  coin: string;
  side: "B" | "A";
  px: string;
  sz: string;
  fee: string;
  builderFee?: string;
  closedPnl: string;
  time: number;
  hash: string;
  tid: number;
}

interface FundingLike {
  time: number;
  hash: string;
  delta: {
    coin: string;
    usdc: string;
    szi: string;
    fundingRate: string;
  };
}

interface FrontendOrderLike {
  coin: string;
  side: "B" | "A";
  limitPx: string;
  sz: string;
  oid: number;
  timestamp: number;
  origSz: string;
  reduceOnly: boolean;
  orderType: string;
  tif: string | null;
}

interface HistoricalOrderLike {
  order: FrontendOrderLike;
  status: string;
  statusTimestamp: number;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : fallback;
  }
  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    if ("value" in candidate) {
      return toNumber(candidate.value, fallback);
    }
    if ("val" in candidate) {
      return toNumber(candidate.val, fallback);
    }
    const text = String(value);
    if (text && text !== "[object Object]") {
      const parsed = parseFloat(text);
      return Number.isFinite(parsed) ? parsed : fallback;
    }
  }
  return fallback;
}

function getCoinMeta(
  perpLookup: Map<string, CoinMeta>,
  spotLookup: Map<string, CoinMeta>,
  coin: string,
): CoinMeta {
  const perp = perpLookup.get(coin);
  if (perp) return perp;

  const spot = spotLookup.get(coin);
  if (spot) return spot;

  return { market: coin, baseAsset: deriveBaseAsset(coin), collateral: "USD" };
}

/** Extract unique HIP-3 deployer names from market groups (excludes native). */
function getHip3DexNames(groups: any[]): string[] {
  const dexNames = new Set<string>();
  for (const group of groups) {
    for (const market of group.markets) {
      if (market.isNative) continue;
      const dexName = market.dexName as string | undefined;
      if (dexName && dexName !== "__native__") {
        dexNames.add(dexName);
      }
    }
  }
  return [...dexNames];
}

/** Fetch clearing states for all HIP-3 deployers and merge their positions. */
async function fetchHip3Positions(
  infoClient: any,
  userAddress: string,
  dexNames: string[],
  allMids: Record<string, string>,
  coinLookup: Map<string, CoinMeta>,
): Promise<ParsedPosition[]> {
  if (dexNames.length === 0) return [];
  const results = await Promise.allSettled(
    dexNames.map((dex) =>
      infoClient.clearinghouseState({ user: userAddress, dex }),
    ),
  );
  const all: ParsedPosition[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      all.push(...parsePositions(result.value, allMids, coinLookup));
    }
  }
  return all;
}

function buildCoinLookup(groups: any[]): Map<string, CoinMeta> {
  const map = new Map<string, CoinMeta>();
  for (const group of groups) {
    const baseAsset = String(group.baseAsset).toUpperCase();
    for (const market of group.markets) {
      map.set(market.coin, {
        market: market.coin,
        baseAsset,
        collateral: String(market.collateral ?? "USD").toUpperCase(),
      });
    }
  }
  return map;
}

function buildSpotPairLookup(spotMeta: any): Map<string, CoinMeta> {
  const map = new Map<string, CoinMeta>();
  if (!spotMeta || !Array.isArray(spotMeta.tokens) || !Array.isArray(spotMeta.universe)) {
    return map;
  }

  const tokenByIndex = new Map<number, string>();
  for (const token of spotMeta.tokens) {
    tokenByIndex.set(Number(token.index), String(token.name).toUpperCase());
  }

  for (const pair of spotMeta.universe) {
    const tokenIndexes = Array.isArray(pair.tokens) ? pair.tokens : [];
    if (tokenIndexes.length < 2) continue;

    const base = tokenByIndex.get(Number(tokenIndexes[0]));
    const quote = tokenByIndex.get(Number(tokenIndexes[1]));
    if (!base || !quote) continue;

    const market = `${base}/${quote}`;
    const pairMeta: CoinMeta = {
      market,
      baseAsset: base,
      collateral: quote,
    };

    const pairName = String(pair.name);
    map.set(pairName, pairMeta);
    map.set(`@${String(pair.index)}`, pairMeta);
    map.set(String(pair.index), pairMeta);
  }

  return map;
}

/**
 * Build a comprehensive token→USD price map from allMids + spotMeta.
 *
 * allMids keys for perps are coin symbols ("BTC", "ETH", "HYPE") and
 * for spot pairs are "@{pairIndex}".  Spot token names from
 * spotClearinghouseState may only match via the @-prefixed index,
 * so we resolve through spotMeta when a direct name lookup misses.
 */
function buildSpotPriceMap(
  allMids: Record<string, string>,
  spotMeta?: any,
): Map<string, number> {
  const map = new Map<string, number>();

  // 1. Add all perp mid prices (case-insensitive key)
  for (const [key, value] of Object.entries(allMids)) {
    if (key.startsWith("@")) continue;
    const price = parseFloat(String(value));
    if (Number.isFinite(price) && price > 0) {
      map.set(key.toUpperCase(), price);
    }
  }

  // 2. Resolve spot pair @index prices for tokens not found above
  if (spotMeta?.tokens && spotMeta?.universe) {
    const tokenByIndex = new Map<number, string>();
    for (const token of spotMeta.tokens) {
      tokenByIndex.set(Number(token.index), String(token.name).toUpperCase());
    }
    for (const pair of spotMeta.universe) {
      const pairTokens = Array.isArray(pair.tokens) ? pair.tokens : [];
      if (pairTokens.length < 2) continue;
      const baseName = tokenByIndex.get(Number(pairTokens[0]));
      if (!baseName || map.has(baseName)) continue; // already priced from perps
      const pairMid = allMids[`@${pair.index}`];
      if (pairMid) {
        const price = parseFloat(String(pairMid));
        if (Number.isFinite(price) && price > 0) {
          map.set(baseName, price);
        }
      }
    }
  }

  return map;
}

interface AccountCandidate {
  user: string;
  clearinghouseState: any;
  spotState?: any;
}

function parseSubAccountCandidates(raw: unknown): AccountCandidate[] {
  if (!Array.isArray(raw)) return [];
  const out: AccountCandidate[] = [];
  for (const item of raw) {
    const user = String((item as any)?.subAccountUser ?? "");
    if (!user) continue;
    out.push({
      user,
      clearinghouseState: (item as any)?.clearinghouseState ?? null,
      spotState: (item as any)?.spotState ?? null,
    });
  }
  return out;
}

function candidateScore(
  candidate: AccountCandidate,
  allMids: Record<string, string>,
  perpLookup: Map<string, CoinMeta>,
): number {
  const parsed = parsePositions(candidate.clearinghouseState, allMids, perpLookup);
  const openNotional = parsed.reduce((sum, p) => sum + Math.abs(p.notionalUsd), 0);
  if (openNotional > 0) {
    // Prioritize whichever account currently carries open positions.
    return 1_000_000_000 + openNotional;
  }

  const marginUsed = Math.max(toNumber(candidate.clearinghouseState?.marginSummary?.totalMarginUsed), 0);
  const accountValue = Math.max(toNumber(candidate.clearinghouseState?.marginSummary?.accountValue), 0);
  return marginUsed * 1_000 + accountValue;
}

function resolvePrimaryUserAddress(params: {
  masterAddress: string;
  masterClearinghouseState: any;
  subAccountCandidates: AccountCandidate[];
  allMids: Record<string, string>;
  perpLookup: Map<string, CoinMeta>;
}): string {
  const candidates: AccountCandidate[] = [
    {
      user: params.masterAddress,
      clearinghouseState: params.masterClearinghouseState,
    },
    ...params.subAccountCandidates,
  ].filter((c) => c.clearinghouseState);

  if (candidates.length === 0) return params.masterAddress;

  let best = candidates[0];
  let bestScore = candidateScore(best, params.allMids, params.perpLookup);
  for (let i = 1; i < candidates.length; i += 1) {
    const next = candidates[i];
    const score = candidateScore(next, params.allMids, params.perpLookup);
    if (score > bestScore) {
      best = next;
      bestScore = score;
    }
  }

  return best.user;
}

function parsePositions(
  clearinghouseState: any,
  allMids: Record<string, string>,
  perpLookup: Map<string, CoinMeta>,
): ParsedPosition[] {
  const out: ParsedPosition[] = [];
  const positions = Array.isArray(clearinghouseState?.assetPositions)
    ? clearinghouseState.assetPositions
    : Array.isArray(clearinghouseState?.positions)
      ? clearinghouseState.positions
      : [];

  for (const item of positions) {
    const pos = item?.position ?? item;
    if (!pos) continue;

    const coin = String(pos.coin ?? "");
    if (!coin) continue;

    const signedSize = toNumber(pos.szi);
    if (Math.abs(signedSize) < 1e-9) continue;

    const size = Math.abs(signedSize);
    const side: "long" | "short" = signedSize >= 0 ? "long" : "short";
    const entryPrice = Math.max(toNumber(pos.entryPx), 0);
    const markPrice = toNumber(pos.markPx, toNumber(allMids[coin], entryPrice));
    const notionalUsd = Math.abs(toNumber(pos.positionValue, markPrice * size));
    const marginUsedUsd = Math.max(toNumber(pos.marginUsed), 0);
    const liquidationPxRaw = toNumber(pos.liquidationPx, NaN);
    const meta = perpLookup.get(coin) ?? {
      market: coin,
      baseAsset: deriveBaseAsset(coin),
      collateral: "USD",
    };

    out.push({
      coin,
      baseAsset: meta.baseAsset,
      collateral: meta.collateral,
      side,
      size,
      entryPrice,
      markPrice,
      notionalUsd,
      marginUsedUsd,
      unrealizedPnlUsd: toNumber(pos.unrealizedPnl),
      leverage: Math.max(toNumber(pos?.leverage?.value), 0),
      liquidationPrice: Number.isFinite(liquidationPxRaw) && liquidationPxRaw > 0 ? liquidationPxRaw : null,
      updatedAt: Date.now(),
    });
  }

  return out;
}

function aggregatePositions(rows: PortfolioPositionRow[]): PortfolioPositionRow[] {
  const groups = groupBy(rows, (r) => `${r.baseAsset}:${r.side}`);

  return [...groups.entries()]
    .map(([key, items]) => {
      const first = items[0];
      const totalSize = sumField(items, (i) => i.size);
      const totalNotional = sumField(items, (i) => i.notionalUsd);
      const totalMargin = sumField(items, (i) => i.marginUsedUsd);
      const markets = new Set(items.map((i) => i.market));

      return {
        ...first,
        key,
        market: first.baseAsset,
        collateral: "USD" as const,
        size: totalSize,
        entryPrice: weightedAverage(items, (i) => i.entryPrice, (i) => i.size, first.entryPrice),
        markPrice: weightedAverage(items, (i) => i.markPrice, (i) => i.size, first.markPrice),
        notionalUsd: totalNotional,
        marginUsedUsd: totalMargin,
        unrealizedPnlUsd: sumField(items, (i) => i.unrealizedPnlUsd),
        leverage: totalMargin > 0 ? totalNotional / totalMargin : first.leverage,
        liquidationPrice: items.length > 1 ? null : first.liquidationPrice,
        marketCount: markets.size,
        updatedAt: maxField(items, (i) => i.updatedAt),
      };
    })
    .sort((a, b) => b.notionalUsd - a.notionalUsd);
}

function aggregateOpenOrders(rows: PortfolioOpenOrderRow[]): PortfolioOpenOrderRow[] {
  const groups = groupBy(rows, (r) =>
    [r.baseAsset, r.side, r.orderType, r.tif ?? "na", r.reduceOnly ? "ro" : "nr"].join(":"),
  );

  return [...groups.entries()]
    .map(([key, items]) => {
      const first = items[0];
      const totalRemaining = sumField(items, (i) => i.remainingSize);

      return {
        ...first,
        key,
        market: first.baseAsset,
        collateral: "USD" as const,
        size: sumField(items, (i) => i.size),
        remainingSize: totalRemaining,
        limitPrice: weightedAverage(items, (i) => i.limitPrice, (i) => i.remainingSize, first.limitPrice),
        notionalUsd: sumField(items, (i) => i.notionalUsd),
        orderCount: sumField(items, (i) => i.orderCount),
        timestamp: maxField(items, (i) => i.timestamp),
      };
    })
    .sort((a, b) => b.timestamp - a.timestamp);
}

function aggregateTrades(rows: PortfolioTradeRow[]): PortfolioTradeRow[] {
  const groups = groupBy(rows, (r) => `${r.hash}:${r.baseAsset}:${r.side}`);

  return [...groups.entries()]
    .map(([key, items]) => {
      const first = items[0];
      const totalSize = sumField(items, (i) => i.size);
      const totalNotional = sumField(items, (i) => i.notionalUsd);

      return {
        ...first,
        key,
        market: first.baseAsset,
        collateral: "USD" as const,
        size: totalSize,
        price: totalSize > 0 ? totalNotional / totalSize : first.price,
        notionalUsd: totalNotional,
        feeUsd: sumField(items, (i) => i.feeUsd),
        realizedPnlUsd: sumField(items, (i) => i.realizedPnlUsd),
        tradeCount: sumField(items, (i) => i.tradeCount),
        timestamp: maxField(items, (i) => i.timestamp),
      };
    })
    .sort((a, b) => b.timestamp - a.timestamp);
}

function aggregateFunding(rows: PortfolioFundingRow[]): PortfolioFundingRow[] {
  const groups = groupBy(rows, (r) => `${r.timestamp}:${r.baseAsset}`);

  return [...groups.entries()]
    .map(([key, items]) => {
      const first = items[0];

      return {
        ...first,
        key,
        market: first.baseAsset,
        collateral: "USD" as const,
        fundingRate: weightedAverage(items, (i) => i.fundingRate, (i) => Math.abs(i.positionSize), first.fundingRate),
        positionSize: sumField(items, (i) => i.positionSize),
        fundingUsd: sumField(items, (i) => i.fundingUsd),
        eventCount: sumField(items, (i) => i.eventCount),
      };
    })
    .sort((a, b) => b.timestamp - a.timestamp);
}

function aggregateOrderHistory(rows: PortfolioOrderHistoryRow[]): PortfolioOrderHistoryRow[] {
  const groups = groupBy(rows, (r) =>
    [r.statusTimestamp, r.baseAsset, r.side, r.status, r.orderType, r.tif ?? "na"].join(":"),
  );

  return [...groups.entries()]
    .map(([key, items]) => {
      const first = items[0];

      return {
        ...first,
        key,
        market: first.baseAsset,
        collateral: "USD" as const,
        size: sumField(items, (i) => i.size),
        filledSize: sumField(items, (i) => i.filledSize),
        limitPrice: weightedAverage(items, (i) => i.limitPrice, (i) => i.size, first.limitPrice),
        notionalUsd: sumField(items, (i) => i.notionalUsd),
        orderCount: sumField(items, (i) => i.orderCount),
        timestamp: maxField(items, (i) => i.timestamp),
        statusTimestamp: maxField(items, (i) => i.statusTimestamp),
      };
    })
    .sort((a, b) => b.statusTimestamp - a.statusTimestamp);
}

export function accountRoutes(config: ServerConfig): Router {
  const router = Router();

  // GET /api/account/debug-prices?masterAddress=0x...&network=mainnet
  // Diagnostic endpoint — shows raw API data and price resolution steps.
  router.get("/debug-prices", async (req, res) => {
    try {
      const masterAddress = requireAddress(req.query.masterAddress, "masterAddress");
      const network = parseNetwork(req.query.network, config.defaultNetwork);

      const service = getClientService(config);
      const publicHp = await service.getPublicClient(network);
      const [allMids, spotMeta, spotState, clearingState] = await Promise.all([
        publicHp.api.allMids(),
        publicHp.api.spotMeta().catch(() => null),
        publicHp.api.spotClearinghouseState(masterAddress),
        publicHp.api.clearinghouseState(masterAddress),
      ]);

      // Show a few sample allMids entries (perp and spot)
      const samplePerps: Record<string, string> = {};
      const sampleSpot: Record<string, string> = {};
      for (const [key, value] of Object.entries(allMids)) {
        if (key.startsWith("@")) {
          if (Object.keys(sampleSpot).length < 20) sampleSpot[key] = String(value);
        } else {
          if (Object.keys(samplePerps).length < 20) samplePerps[key] = String(value);
        }
      }

      // Build spotPriceMap and track resolution path
      const spotPriceMap = buildSpotPriceMap(allMids, spotMeta);
      const priceMapEntries: Record<string, number> = {};
      for (const [k, v] of spotPriceMap) priceMapEntries[k] = v;

      // Spot balances and how they'd be priced
      const stableSet = new Set(config.stableTokens.map((t) => t.toUpperCase()));
      const balancePricing = (spotState?.balances ?? []).map((b: any) => {
        const coin = String(b.coin).toUpperCase();
        const amount = toNumber(b.total);
        const isStable = stableSet.has(coin);
        const resolvedPrice = isStable ? 1 : (spotPriceMap.get(coin) ?? 0);
        const directAllMids = allMids[b.coin] ?? allMids[coin] ?? null;
        return {
          rawCoin: b.coin,
          normalizedCoin: coin,
          rawTotal: b.total,
          amount,
          isStable,
          directAllMidsLookup: directAllMids,
          spotPriceMapLookup: spotPriceMap.get(coin) ?? null,
          resolvedPrice,
          usdValue: amount * resolvedPrice,
        };
      });

      const perpRawUsd = toNumber(clearingState?.marginSummary?.totalRawUsd);
      const accountValue = toNumber(clearingState?.marginSummary?.accountValue);
      let unrealizedPnl = 0;
      for (const ap of clearingState?.assetPositions ?? []) {
        unrealizedPnl += toNumber(ap?.position?.unrealizedPnl);
      }
      const spotTotalUsd = balancePricing.reduce((s: number, b: any) => s + b.usdValue, 0);

      res.json({
        masterAddress,
        stableTokens: config.stableTokens,
        allMidsKeyCount: Object.keys(allMids).length,
        samplePerpMids: samplePerps,
        sampleSpotMids: sampleSpot,
        spotMetaAvailable: !!spotMeta,
        spotMetaTokenCount: spotMeta?.tokens?.length ?? 0,
        spotMetaUniverseCount: spotMeta?.universe?.length ?? 0,
        spotPriceMapSize: spotPriceMap.size,
        spotPriceMapEntries: priceMapEntries,
        clearingState: {
          accountValue,
          totalRawUsd: perpRawUsd,
          totalMarginUsed: toNumber(clearingState?.marginSummary?.totalMarginUsed),
          withdrawable: toNumber(clearingState?.withdrawable),
          positionCount: clearingState?.assetPositions?.length ?? 0,
          unrealizedPnl,
        },
        balancePricing,
        computed: {
          perpRawUsd,
          unrealizedPnl,
          spotTotalUsd,
          totalUsd: perpRawUsd + unrealizedPnl + spotTotalUsd,
          formula: "perpRawUsd + unrealizedPnl + spotTotalUsd",
        },
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message, code: "BAD_REQUEST" });
        return;
      }
      res.status(500).json({ error: "Debug prices failed.", code: "DEBUG_PRICES_FAILED" });
    }
  });

  // GET /api/account/bootstrap?masterAddress=0x...&network=mainnet
  // Returns market data and wallet-level read-only balance/positions.
  router.get("/bootstrap", async (req, res) => {
    try {
      const masterAddress = requireAddress(req.query.masterAddress, "masterAddress");
      const network = parseNetwork(req.query.network, config.defaultNetwork);

      const service = getClientService(config);
      const publicHp = await service.getPublicClient(network);
      const [allMids, spotMeta] = await Promise.all([
        publicHp.api.allMids(),
        publicHp.api.spotMeta().catch(() => null),
      ]);
      const spotPriceMap = buildSpotPriceMap(allMids, spotMeta);

      const agentConfigured = await service.hasClient(masterAddress, network);
      const infoClient = (publicHp.api as any).info as any;

      let masterClearinghouseState: any = null;
      try {
        masterClearinghouseState = await publicHp.api.clearinghouseState(masterAddress);
      } catch (err) {
        console.warn("Failed to fetch bootstrap master clearinghouse state:", err);
      }

      const NATIVE_ALLOW = new Set(["BTC", "ETH", "SOL", "HYPE"]);
      const allGroups = publicHp.markets.getAllGroups();
      const coinLookup = buildCoinLookup(allGroups);

      let subAccountCandidates: AccountCandidate[] = [];
      if (infoClient && typeof infoClient.subAccounts === "function") {
        try {
          const subAccountsRaw = await infoClient.subAccounts({ user: masterAddress });
          subAccountCandidates = parseSubAccountCandidates(subAccountsRaw);
        } catch {
          // Ignore sub-account lookup failures; default to master account.
        }
      }

      const primaryUserAddress = resolvePrimaryUserAddress({
        masterAddress,
        masterClearinghouseState,
        subAccountCandidates,
        allMids,
        perpLookup: coinLookup,
      });
      const normalizedMaster = masterAddress.toLowerCase();
      let clearinghouseState: any =
        primaryUserAddress.toLowerCase() === normalizedMaster
          ? masterClearinghouseState
          : subAccountCandidates.find((c) => c.user.toLowerCase() === primaryUserAddress.toLowerCase())?.clearinghouseState ?? null;
      if (!clearinghouseState) {
        try {
          clearinghouseState = await publicHp.api.clearinghouseState(primaryUserAddress);
        } catch {
          clearinghouseState = null;
        }
      }

      let balance: BootstrapResponse["balance"] = null;
      try {
        balance = await getUnifiedBalance(publicHp, primaryUserAddress, config.stableTokens, spotPriceMap);
      } catch (err) {
        console.warn("Failed to fetch bootstrap balance state:", err);
      }

      // Fetch native + HIP-3 deployer positions in parallel
      const hip3DexNames = getHip3DexNames(allGroups);
      const [nativePositions, hip3Positions] = await Promise.all([
        Promise.resolve(parsePositions(clearinghouseState, allMids, coinLookup)),
        fetchHip3Positions(infoClient, primaryUserAddress, hip3DexNames, allMids, coinLookup),
      ]);
      const parsedPositions = [...nativePositions, ...hip3Positions];
      const positionAssets = new Set(parsedPositions.map((p) => p.baseAsset));
      const marketCountByBase = new Map<string, number>();
      for (const p of parsedPositions) {
        marketCountByBase.set(p.baseAsset, (marketCountByBase.get(p.baseAsset) ?? 0) + 1);
      }

      const assets: DedupedAsset[] = [];
      for (const group of allGroups) {
        const hasHip3 = group.markets.some((m: any) => !m.isNative);
        const isAllowedNative = NATIVE_ALLOW.has(group.baseAsset);

        if (!hasHip3 && !isAllowedNative) continue;

        const primary = isAllowedNative
          ? group.markets.find((m: any) => m.isNative) ?? group.markets[0]
          : group.markets.find((m: any) => !m.isNative) ?? group.markets[0];

        const midPrice = allMids[primary.coin] ?? primary.markPrice;
        const collaterals = [...new Set(group.markets.map((m: any) => m.collateral))];
        const deployers = group.markets.map((m: any) => {
          if (m.isNative) return "HL";
          const idx = m.coin.indexOf(":");
          return idx > 0 ? m.coin.slice(0, idx) : m.coin;
        });
        const maxLeverage = Math.max(...group.markets.map((m: any) => m.maxLeverage));

        assets.push({
          baseAsset: group.baseAsset,
          primaryCoin: primary.coin,
          price: midPrice ? parseFloat(midPrice) : null,
          prevDayPx: primary.prevDayPx ? parseFloat(primary.prevDayPx) : null,
          fundingRate: primary.funding ? parseFloat(primary.funding) : null,
          dayNtlVlm: primary.dayNtlVlm ? parseFloat(primary.dayNtlVlm) : 0,
          marketCount: group.markets.length,
          deployers,
          collaterals,
          maxLeverage,
          hasPosition: positionAssets.has(group.baseAsset.toUpperCase()),
          isHip3: hasHip3,
        });
      }

      assets.sort((a, b) => b.dayNtlVlm - a.dayNtlVlm);

      const positions: GroupedPosition[] = parsedPositions.map((p) => ({
        baseAsset: p.baseAsset,
        primaryCoin: p.coin,
        side: p.side,
        size: p.size,
        entryPrice: p.entryPrice,
        markPrice: p.markPrice,
        unrealizedPnl: p.unrealizedPnlUsd,
        leverage: p.leverage,
        liquidationPrice: p.liquidationPrice,
        marketCount: marketCountByBase.get(p.baseAsset) ?? 1,
      }));

      const response: BootstrapResponse = { balance, assets, positions, agentConfigured };
      res.json(response);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({
          error: err.message,
          code: "BAD_REQUEST",
        });
        return;
      }
      console.error("[account/bootstrap] Bootstrap failed:", err instanceof Error ? err.message : String(err));
      res.status(500).json({
        error: "Account bootstrap failed. Please try again.",
        code: "BOOTSTRAP_FAILED",
      });
    }
  });

  // GET /api/account/portfolio?masterAddress=0x...&network=mainnet&historyDays=30
  router.get("/portfolio", async (req, res) => {
    try {
      const masterAddress = requireAddress(req.query.masterAddress, "masterAddress");
      const network = parseNetwork(req.query.network, config.defaultNetwork) as Network;
      const historyDaysQuery = req.query.historyDays;

      const parsedDays = typeof historyDaysQuery === "string"
        ? Number.parseInt(historyDaysQuery, 10)
        : NaN;
      const historyDays = Number.isFinite(parsedDays)
        ? Math.min(90, Math.max(1, parsedDays))
        : 30;

      const now = Date.now();
      const historyStart = now - historyDays * 24 * 60 * 60 * 1000;

      const service = getClientService(config);
      const publicHp = await service.getPublicClient(network);
      const agentConfigured = await service.hasClient(masterAddress, network);
      const infoClient = (publicHp.api as any).info as any;
      if (!infoClient) {
        throw new Error("Hyperliquid info client unavailable");
      }

      const allGroups = publicHp.markets.getAllGroups();
      const coinLookup = buildCoinLookup(allGroups);

      const [midsResult, masterClearingResult, spotMetaResult, subAccountsResult] = await Promise.allSettled([
        publicHp.api.allMids(),
        publicHp.api.clearinghouseState(masterAddress),
        publicHp.api.spotMeta(),
        typeof infoClient.subAccounts === "function"
          ? infoClient.subAccounts({ user: masterAddress })
          : Promise.resolve(null),
      ]);

      const allMids = midsResult.status === "fulfilled" ? midsResult.value : {};
      const masterClearinghouseState = masterClearingResult.status === "fulfilled"
        ? masterClearingResult.value
        : null;
      const resolvedSpotMeta = spotMetaResult.status === "fulfilled" ? spotMetaResult.value : null;
      const spotPairLookup = buildSpotPairLookup(resolvedSpotMeta);
      const portfolioSpotPriceMap = buildSpotPriceMap(allMids, resolvedSpotMeta);
      const subAccountCandidates = parseSubAccountCandidates(
        subAccountsResult.status === "fulfilled" ? subAccountsResult.value : null,
      );
      const effectiveUserAddress = resolvePrimaryUserAddress({
        masterAddress,
        masterClearinghouseState,
        subAccountCandidates,
        allMids,
        perpLookup: coinLookup,
      });

      const normalizedEffectiveUser = effectiveUserAddress.toLowerCase();
      const normalizedMaster = masterAddress.toLowerCase();
      const selectedSubAccount = subAccountCandidates.find(
        (candidate) => candidate.user.toLowerCase() === normalizedEffectiveUser,
      );
      const selectedClearingState = normalizedEffectiveUser === normalizedMaster
        ? masterClearinghouseState
        : selectedSubAccount?.clearinghouseState ?? null;

      const [
        clearingResult,
        spotResult,
        openOrdersResult,
        orderHistoryResult,
        fillsResult,
        fundingResult,
      ] = await Promise.allSettled([
        selectedClearingState
          ? Promise.resolve(selectedClearingState)
          : publicHp.api.clearinghouseState(effectiveUserAddress),
        selectedSubAccount?.spotState
          ? Promise.resolve(selectedSubAccount.spotState)
          : publicHp.api.spotClearinghouseState(effectiveUserAddress),
        infoClient.frontendOpenOrders({ user: effectiveUserAddress }),
        infoClient.historicalOrders({ user: effectiveUserAddress }),
        infoClient.userFillsByTime({
          user: effectiveUserAddress,
          startTime: historyStart,
          endTime: now,
          aggregateByTime: true,
        }),
        infoClient.userFunding({ user: effectiveUserAddress, startTime: historyStart, endTime: now }),
      ]);

      const clearinghouseState = clearingResult.status === "fulfilled" ? clearingResult.value : null;
      const spotState = spotResult.status === "fulfilled" ? spotResult.value : { balances: [] };
      const openOrdersRaw = openOrdersResult.status === "fulfilled" ? openOrdersResult.value as FrontendOrderLike[] : [];
      const orderHistoryRaw = orderHistoryResult.status === "fulfilled" ? orderHistoryResult.value as HistoricalOrderLike[] : [];
      const fillsRaw = fillsResult.status === "fulfilled" ? fillsResult.value as FillLike[] : [];
      const fundingRaw = fundingResult.status === "fulfilled" ? fundingResult.value as FundingLike[] : [];

      const stableSet = new Set(config.stableTokens.map((t) => t.toUpperCase()));
      const perpsAccountValue = toNumber(clearinghouseState?.marginSummary?.accountValue);

      // Value ALL spot tokens at mark price (stables at 1:1, others via spotPriceMap).
      // spotPriceMap resolves prices from both perp allMids keys AND spot pair @index
      // keys, which is critical because some tokens (e.g. HYPE) may only be reachable
      // through the spot pair index when allMids keys don't match spot token names.
      const spotAllRows = (spotState?.balances ?? [])
        .map((b: any) => {
          const coin = String(b.coin).toUpperCase();
          const amount = toNumber(b.total);
          if (amount <= 0.0001) return null;
          const isStable = stableSet.has(coin);
          const markPrice = isStable ? 1 : (portfolioSpotPriceMap.get(coin) ?? 0);
          const usdValue = amount * markPrice;
          if (usdValue <= 0.0001) return null;
          return { coin, amount, usdValue, isStable };
        })
        .filter((r: any): r is { coin: string; amount: number; usdValue: number; isStable: boolean } => r !== null)
        .sort((a: any, b: any) => b.usdValue - a.usdValue);

      const spotTotalUsd = spotAllRows.reduce((sum: number, b: any) => sum + b.usdValue, 0);

      // Fetch native + HIP-3 deployer positions
      const hip3DexNames = getHip3DexNames(allGroups);
      const hip3Positions = await fetchHip3Positions(
        infoClient, effectiveUserAddress, hip3DexNames, allMids, coinLookup,
      );
      const nativePositions = parsePositions(clearinghouseState, allMids, coinLookup);
      const allParsedPositions = [...nativePositions, ...hip3Positions];

      const toPositionRow = (p: ParsedPosition): PortfolioPositionRow => ({
        key: `${p.coin}:${p.side}`,
        market: p.coin,
        baseAsset: p.baseAsset,
        collateral: p.collateral,
        side: p.side,
        size: p.size,
        entryPrice: p.entryPrice,
        markPrice: p.markPrice,
        notionalUsd: p.notionalUsd,
        marginUsedUsd: p.marginUsedUsd,
        unrealizedPnlUsd: p.unrealizedPnlUsd,
        leverage: p.marginUsedUsd > 0 ? p.notionalUsd / p.marginUsedUsd : p.leverage,
        liquidationPrice: p.liquidationPrice,
        marketCount: 1,
        updatedAt: p.updatedAt,
      });

      let positionsBreakdown: PortfolioPositionRow[] = allParsedPositions
        .map(toPositionRow)
        .sort((a, b) => b.notionalUsd - a.notionalUsd);

      if (positionsBreakdown.length === 0 && agentConfigured) {
        try {
          const stored = await service.getAgentStore().load(masterAddress, network);
          if (stored?.agentAddress) {
            const agentNative = parsePositions(
              await publicHp.api.clearinghouseState(stored.agentAddress),
              allMids, coinLookup,
            );
            const agentHip3 = await fetchHip3Positions(
              infoClient, stored.agentAddress, hip3DexNames, allMids, coinLookup,
            );
            const agentPositions = [...agentNative, ...agentHip3]
              .map(toPositionRow)
              .sort((a, b) => b.notionalUsd - a.notionalUsd);

            if (agentPositions.length > 0) {
              positionsBreakdown = agentPositions;
            }
          }
        } catch {
          // Keep empty positions list if fallback lookups fail.
        }
      }

      const openOrdersBreakdown: PortfolioOpenOrderRow[] = openOrdersRaw
        .map((order) => {
          const meta = getCoinMeta(coinLookup, spotPairLookup, order.coin);
          const remainingSize = Math.max(toNumber(order.sz), 0);
          const originalSize = Math.max(toNumber(order.origSz, remainingSize), remainingSize);
          const limitPrice = Math.max(toNumber(order.limitPx), 0);
          const side: "buy" | "sell" = order.side === "B" ? "buy" : "sell";

          return {
            key: `open:${order.oid}`,
            market: meta.market,
            baseAsset: meta.baseAsset,
            collateral: meta.collateral,
            side,
            orderType: order.orderType,
            tif: order.tif,
            reduceOnly: Boolean(order.reduceOnly),
            size: originalSize,
            remainingSize,
            limitPrice,
            notionalUsd: remainingSize * limitPrice,
            timestamp: toNumber(order.timestamp),
            orderCount: 1,
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp);

      const tradeHistoryBreakdown: PortfolioTradeRow[] = fillsRaw
        .map((fill) => {
          const meta = getCoinMeta(coinLookup, spotPairLookup, fill.coin);
          const size = Math.abs(toNumber(fill.sz));
          const price = Math.max(toNumber(fill.px), 0);
          const feeUsd = Math.abs(toNumber(fill.fee)) + Math.abs(toNumber(fill.builderFee));
          const timestamp = toNumber(fill.time);
          const side: "buy" | "sell" = fill.side === "B" ? "buy" : "sell";

          return {
            key: `trade:${fill.hash}:${fill.tid}`,
            market: meta.market,
            baseAsset: meta.baseAsset,
            collateral: meta.collateral,
            side,
            size,
            price,
            notionalUsd: size * price,
            feeUsd,
            realizedPnlUsd: toNumber(fill.closedPnl),
            timestamp,
            hash: fill.hash,
            tradeCount: 1,
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp);

      const fundingHistoryBreakdown: PortfolioFundingRow[] = fundingRaw
        .map((event) => {
          const coin = String(event?.delta?.coin ?? "");
          const meta = getCoinMeta(coinLookup, spotPairLookup, coin);
          const timestamp = toNumber(event.time);

          return {
            key: `funding:${event.hash}:${timestamp}:${coin}`,
            market: meta.market,
            baseAsset: meta.baseAsset,
            collateral: meta.collateral,
            fundingRate: toNumber(event?.delta?.fundingRate),
            positionSize: toNumber(event?.delta?.szi),
            fundingUsd: toNumber(event?.delta?.usdc),
            timestamp,
            hash: event.hash,
            eventCount: 1,
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp);

      const latestOrderHistory = new Map<string, HistoricalOrderLike>();
      for (const item of orderHistoryRaw) {
        const coin = String(item?.order?.coin ?? "");
        const oid = toNumber(item?.order?.oid, NaN);
        if (!coin || !Number.isFinite(oid)) continue;
        const key = `${coin}:${oid}`;
        const current = latestOrderHistory.get(key);
        if (!current || toNumber(item.statusTimestamp) >= toNumber(current.statusTimestamp)) {
          latestOrderHistory.set(key, item);
        }
      }

      const orderHistoryBreakdown: PortfolioOrderHistoryRow[] = [...latestOrderHistory.values()]
        .map((item) => {
          const order = item.order;
          const meta = getCoinMeta(coinLookup, spotPairLookup, order.coin);
          const size = Math.max(toNumber(order.origSz), 0);
          const remainingSize = Math.max(toNumber(order.sz), 0);
          const filledSize = Math.max(size - remainingSize, 0);
          const limitPrice = Math.max(toNumber(order.limitPx), 0);
          const side: "buy" | "sell" = order.side === "B" ? "buy" : "sell";

          return {
            key: `hist:${order.oid}:${item.statusTimestamp}`,
            market: meta.market,
            baseAsset: meta.baseAsset,
            collateral: meta.collateral,
            side,
            status: item.status,
            orderType: order.orderType,
            tif: order.tif,
            size,
            filledSize,
            limitPrice,
            notionalUsd: size * limitPrice,
            timestamp: toNumber(order.timestamp),
            statusTimestamp: toNumber(item.statusTimestamp),
            orderCount: 1,
          };
        })
        .sort((a, b) => b.statusTimestamp - a.statusTimestamp);

      // Balance breakdown: only stablecoins (USDC, USDE, USDH, USDT).
      // Non-stable spot tokens (HYPE, ETH, etc.) are NOT shown here.
      const stableRows = spotAllRows.filter((r: any) => r.isStable);
      const balanceAmountByAsset = new Map<string, number>();
      const balanceUsdByAsset = new Map<string, number>();
      for (const row of stableRows) {
        const normalized = row.coin === "USD" ? "USDC" : row.coin;
        balanceAmountByAsset.set(normalized, (balanceAmountByAsset.get(normalized) ?? 0) + row.amount);
        balanceUsdByAsset.set(normalized, (balanceUsdByAsset.get(normalized) ?? 0) + row.usdValue);
      }

      const balancesBreakdown: PortfolioBalanceRow[] = [...balanceUsdByAsset.entries()]
        .map(([asset, usdValue]) => ({
          key: `balance:${asset}`,
          source: "spot" as const,
          asset,
          amount: balanceAmountByAsset.get(asset) ?? 0,
          usdValue,
        }))
        .sort((a, b) => b.usdValue - a.usdValue);

      const stableTotalUsd = [...balanceUsdByAsset.values()].reduce((s, v) => s + v, 0);
      const balancesAggregate: PortfolioBalanceRow[] = [{
        key: "balance:total",
        source: "spot",
        asset: "USD",
        amount: stableTotalUsd,
        usdValue: stableTotalUsd,
      }];

      const unrealizedPnlUsd = positionsBreakdown.reduce((sum, p) => sum + p.unrealizedPnlUsd, 0);
      const maintenanceMarginUsd = Math.max(
        toNumber(clearinghouseState?.crossMaintenanceMarginUsed),
        0,
      );
      const crossTotalNtlPos = Math.abs(toNumber(clearinghouseState?.crossMarginSummary?.totalNtlPos));

      // Total = Spot + Perps (accountValue from clearinghouse)
      const portfolioValueUsd = spotTotalUsd + perpsAccountValue;

      const response: PortfolioResponse = {
        agentConfigured,
        requestedAt: now,
        summary: {
          accountEquityUsd: portfolioValueUsd,
          spotUsd: spotTotalUsd,
          perpsUsd: perpsAccountValue,
          unrealizedPnlUsd,
          crossMarginRatio: portfolioValueUsd > 0 ? maintenanceMarginUsd / portfolioValueUsd : 0,
          maintenanceMarginUsd,
          crossAccountLeverage: portfolioValueUsd > 0 ? crossTotalNtlPos / portfolioValueUsd : 0,
        },
        balances: {
          aggregate: balancesAggregate,
          breakdown: balancesBreakdown,
        },
        positions: {
          aggregate: aggregatePositions(positionsBreakdown),
          breakdown: positionsBreakdown,
        },
        openOrders: {
          aggregate: aggregateOpenOrders(openOrdersBreakdown),
          breakdown: openOrdersBreakdown,
        },
        tradeHistory: {
          aggregate: aggregateTrades(tradeHistoryBreakdown),
          breakdown: tradeHistoryBreakdown,
        },
        fundingHistory: {
          aggregate: aggregateFunding(fundingHistoryBreakdown),
          breakdown: fundingHistoryBreakdown,
        },
        orderHistory: {
          aggregate: aggregateOrderHistory(orderHistoryBreakdown),
          breakdown: orderHistoryBreakdown,
        },
      };

      res.json(response);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({
          error: err.message,
          code: "BAD_REQUEST",
        });
        return;
      }
      console.error("[account/portfolio] Portfolio failed:", err instanceof Error ? err.message : String(err));
      res.status(500).json({
        error: "Portfolio data unavailable. Please try again.",
        code: "PORTFOLIO_FAILED",
      });
    }
  });

  return router;
}
