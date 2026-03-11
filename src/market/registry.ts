import type { HLProvider } from "../provider/provider.js";
import type { MetaAsset, AssetCtx, SpotToken } from "../provider/types.js";
import type { Logger } from "../logging/logger.js";
import type { PerpMarket, MarketGroup } from "./types.js";

export class MarketRegistry {
  private groups = new Map<string, MarketGroup>();
  private coinIndex = new Map<string, PerpMarket>();
  private spotTokens = new Map<number, SpotToken>();
  private logger: Logger;

  constructor(
    private provider: HLProvider,
    logger: Logger,
  ) {
    this.logger = logger.child({ module: "registry" });
  }

  async discover(): Promise<void> {
    const nextGroups = new Map<string, MarketGroup>();
    const nextSpotTokens = new Map<number, SpotToken>();

    // Fetch spot token metadata for collateral resolution
    const spotMeta = await this.provider.spotMeta();
    for (const token of spotMeta.tokens) {
      nextSpotTokens.set(token.index, token);
    }

    // Fetch deployer list — indices in this array ARE the canonical dex indices
    // used by the exchange for global asset ID computation.
    // Previously we iterated allPerpMetas() which can have different array
    // indices than perpDexs(), causing wrong asset IDs (e.g. 110003 instead
    // of 170009 for xyz:GOLD).
    const dexs = await this.provider.perpDexs();

    // Build (dexIndex, dexName) pairs from perpDexs.
    // In the real API, perpDexs[0] is always null (native perps).
    // null entries → native deployer, non-null → HIP-3 deployer.
    const dexEntries: { dexIndex: number; dexName: string; apiDex: string; isNative: boolean }[] = [];
    for (let i = 0; i < dexs.length; i++) {
      const dex = dexs[i];
      if (dex === null) {
        dexEntries.push({ dexIndex: i, dexName: "__native__", apiDex: "", isNative: true });
      } else if (dex.name && dex.name.length > 0) {
        dexEntries.push({ dexIndex: i, dexName: dex.name, apiDex: dex.name, isNative: false });
      }
    }

    // Fetch metaAndAssetCtxs for each deployer in parallel
    const ctxResults = await Promise.allSettled(
      dexEntries.map((entry) => this.provider.metaAndAssetCtxs(entry.apiDex)),
    );

    this.logger.info(
      { dexCount: dexEntries.length, spotTokens: spotMeta.tokens.length },
      "Discovering markets across all deployers",
    );

    let totalAssets = 0;
    let dexContextFailures = 0;

    for (const [idx, entry] of dexEntries.entries()) {
      const ctxResult = ctxResults[idx];
      if (!ctxResult || ctxResult.status === "rejected") {
        dexContextFailures++;
        this.logger.warn(
          {
            dexName: entry.dexName,
            dexIndex: entry.dexIndex,
            reason: ctxResult?.status === "rejected" ? String(ctxResult.reason) : "missing context result",
          },
          "Skipping deployer due to missing asset contexts",
        );
        continue;
      }
      const [meta, assetCtxs] = ctxResult.value;
      const collateral = this.resolveCollateralToken(meta.collateralToken, nextSpotTokens);

      for (const [i, asset] of meta.universe.entries()) {
        // Skip delisted markets
        if (asset.isDelisted) continue;

        const ctx = assetCtxs[i];
        if (!ctx) {
          this.logger.warn(
            { dexName: entry.dexName, asset: asset.name, assetIndex: i },
            "Skipping asset due to missing context",
          );
          continue;
        }

        // Compute global asset ID using the CANONICAL dex index from perpDexs():
        // Native: assetIndex = local index
        // HIP-3: assetIndex = 100000 + dexIndex * 10000 + local index
        const globalAssetIndex = entry.isNative ? i : 100000 + entry.dexIndex * 10000 + i;
        const parsed = this.parseAsset(asset, globalAssetIndex, ctx, entry.dexName, collateral);
        if (!parsed) continue;

        const key = parsed.baseAsset.toUpperCase();
        if (!nextGroups.has(key)) {
          nextGroups.set(key, {
            baseAsset: key,
            markets: [],
            hasAlternatives: false,
          });
        }

        const group = nextGroups.get(key)!;
        group.markets.push(parsed);
        group.hasAlternatives = group.markets.length > 1;
        totalAssets++;
      }
    }

    this.groups = nextGroups;
    this.spotTokens = nextSpotTokens;

    // Build coin→market index for O(1) lookup by coin name
    const nextCoinIndex = new Map<string, PerpMarket>();
    for (const group of nextGroups.values()) {
      for (const market of group.markets) {
        nextCoinIndex.set(market.coin, market);
      }
    }
    this.coinIndex = nextCoinIndex;

    this.logger.info(
      {
        totalAssets,
        totalGroups: nextGroups.size,
        groupsWithAlts: [...nextGroups.values()].filter(
          (g) => g.hasAlternatives,
        ).length,
        dexContextFailures,
      },
      "Market discovery complete",
    );
  }

  getMarkets(baseAsset: string): PerpMarket[] {
    return this.groups.get(baseAsset.toUpperCase())?.markets ?? [];
  }

  getGroup(baseAsset: string): MarketGroup | undefined {
    return this.groups.get(baseAsset.toUpperCase());
  }

  getAllGroups(): MarketGroup[] {
    return [...this.groups.values()];
  }

  getGroupsWithAlternatives(): MarketGroup[] {
    return [...this.groups.values()].filter((g) => g.hasAlternatives);
  }

  /** O(1) lookup of a market by its full coin name (e.g. "xyz:TSLA"). */
  findByCoin(coin: string): PerpMarket | undefined {
    return this.coinIndex.get(coin);
  }

  private parseAsset(
    asset: MetaAsset,
    index: number,
    ctx: AssetCtx,
    dexName: string,
    collateral: string,
  ): PerpMarket | null {
    const isNative = dexName === "__native__";

    return {
      baseAsset: isNative
        ? asset.name
        : this.extractBaseAsset(asset.name),
      coin: asset.name,
      assetIndex: index,
      dexName,
      collateral,
      isNative,
      maxLeverage: asset.maxLeverage,
      szDecimals: asset.szDecimals,
      onlyIsolated: asset.onlyIsolated,
      marginMode: asset.marginMode,
      funding: ctx.funding,
      openInterest: ctx.openInterest,
      prevDayPx: ctx.prevDayPx,
      dayNtlVlm: ctx.dayNtlVlm,
      markPrice: ctx.markPx,
      oraclePx: ctx.oraclePx,
    };
  }

  private extractBaseAsset(hip3Name: string): string {
    // HIP-3 format: "dexName:ASSET" or "dexName:ASSET123"
    // Most names have no trailing digits (e.g., xyz:TSLA, xyz:EUR)
    // Some have trailing digits (e.g., xyz:XYZ100)
    const afterColon = hip3Name.split(":")[1];
    // Strip trailing digits only — validated against real testnet data
    return afterColon.replace(/\d+$/, "") || afterColon;
  }

  private resolveCollateralToken(
    tokenIndex: number,
    tokens: Map<number, SpotToken> = this.spotTokens,
  ): string {
    const token = tokens.get(tokenIndex);
    if (token) return token.name;
    return `TOKEN_${tokenIndex}`;
  }
}
