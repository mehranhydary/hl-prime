import type { HLProvider } from "../provider/provider.js";
import type { MetaAsset, AssetCtx, SpotToken } from "../provider/types.js";
import type { Logger } from "../logging/logger.js";
import type { PerpMarket, MarketGroup } from "./types.js";

export class MarketRegistry {
  private groups = new Map<string, MarketGroup>();
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

    // Fetch all deployers and their metadata in parallel
    const [dexs, allMetas] = await Promise.all([
      this.provider.perpDexs(),
      this.provider.allPerpMetas(),
    ]);

    const ctxResults = await Promise.allSettled(
      allMetas.map((_, dexIndex) => {
        const dex = dexs[dexIndex];
        return this.provider.metaAndAssetCtxs(dex ? dex.name : "");
      }),
    );

    this.logger.info(
      { dexCount: dexs.length, spotTokens: spotMeta.tokens.length },
      "Discovering markets across all deployers",
    );

    let totalAssets = 0;
    let dexContextFailures = 0;

    for (const [dexIndex, meta] of allMetas.entries()) {
      const dex = dexs[dexIndex];
      const dexName = dex ? dex.name : "__native__";
      const collateral = this.resolveCollateralToken(meta.collateralToken, nextSpotTokens);
      const ctxResult = ctxResults[dexIndex];
      if (!ctxResult || ctxResult.status === "rejected") {
        dexContextFailures++;
        this.logger.warn(
          {
            dexName,
            reason: ctxResult?.status === "rejected" ? String(ctxResult.reason) : "missing context result",
          },
          "Skipping deployer due to missing asset contexts",
        );
        continue;
      }
      const [, assetCtxs] = ctxResult.value;

      for (const [i, asset] of meta.universe.entries()) {
        // Skip delisted markets
        if (asset.isDelisted) continue;

        const ctx = assetCtxs[i];
        if (!ctx) {
          this.logger.warn(
            { dexName, asset: asset.name, assetIndex: i },
            "Skipping asset due to missing context",
          );
          continue;
        }

        // Compute global asset ID:
        // Native (dexIndex 0): assetIndex = local index
        // HIP-3 (dexIndex > 0): assetIndex = 100000 + dexIndex * 10000 + local index
        const globalAssetIndex = dexIndex === 0 ? i : 100000 + dexIndex * 10000 + i;
        const parsed = this.parseAsset(asset, globalAssetIndex, ctx, dexName, collateral);
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
      funding: ctx.funding,
      openInterest: ctx.openInterest,
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
