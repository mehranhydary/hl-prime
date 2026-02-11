import type { HLProvider } from "../provider/provider.js";
import type { MetaAsset, AssetCtx, SpotToken } from "../provider/types.js";
import type { Logger } from "../logging/logger.js";
import type { HIP3Market, MarketGroup } from "./types.js";

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
    // Fetch spot token metadata for collateral resolution
    const spotMeta = await this.provider.spotMeta();
    for (const token of spotMeta.tokens) {
      this.spotTokens.set(token.index, token);
    }

    // Fetch all deployers and their metadata in parallel
    const [dexs, allMetas] = await Promise.all([
      this.provider.perpDexs(),
      this.provider.allPerpMetas(),
    ]);

    this.logger.info(
      { dexCount: dexs.length, spotTokens: spotMeta.tokens.length },
      "Discovering markets across all deployers",
    );

    let totalAssets = 0;

    for (const [dexIndex, meta] of allMetas.entries()) {
      const dex = dexs[dexIndex];
      const dexName = dex ? dex.name : "__native__";
      const collateral = this.resolveCollateralToken(meta.collateralToken);

      // Fetch asset contexts for this dex
      const [, assetCtxs] = await this.provider.metaAndAssetCtxs(
        dex ? dex.name : "",
      );

      for (const [i, asset] of meta.universe.entries()) {
        // Skip delisted markets
        if (asset.isDelisted) continue;

        const ctx = assetCtxs[i];
        const parsed = this.parseAsset(asset, i, ctx, dexName, collateral);
        if (!parsed) continue;

        const key = parsed.baseAsset.toUpperCase();
        if (!this.groups.has(key)) {
          this.groups.set(key, {
            baseAsset: key,
            markets: [],
            hasAlternatives: false,
          });
        }

        const group = this.groups.get(key)!;
        group.markets.push(parsed);
        group.hasAlternatives = group.markets.length > 1;
        totalAssets++;
      }
    }

    this.logger.info(
      {
        totalAssets,
        totalGroups: this.groups.size,
        groupsWithAlts: [...this.groups.values()].filter(
          (g) => g.hasAlternatives,
        ).length,
      },
      "Market discovery complete",
    );
  }

  getMarkets(baseAsset: string): HIP3Market[] {
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
  ): HIP3Market | null {
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

  private resolveCollateralToken(tokenIndex: number): string {
    const token = this.spotTokens.get(tokenIndex);
    if (token) return token.name;
    return `TOKEN_${tokenIndex}`;
  }
}
