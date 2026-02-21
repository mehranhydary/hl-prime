import type { HLProvider } from "../provider/provider.js";
import type { Logger } from "../logging/logger.js";
import type { MarketRegistry } from "../market/registry.js";
import type { LogicalPosition } from "./types.js";
import type { WithWarnings } from "../types/result.js";

export class PositionManager {
  private readonly logger: Logger;

  constructor(
    private provider: HLProvider,
    private registry: MarketRegistry,
    parentLogger: Logger,
  ) {
    this.logger = parentLogger.child({ module: "positions" });
  }

  /**
   * Get all positions, annotated with whether they were created by this SDK.
   * Queries both native and HIP-3 deployer clearinghouses.
   *
   * Returns WithWarnings so callers can see which deployers failed.
   */
  async getPositions(user: string): Promise<WithWarnings<LogicalPosition[]>> {
    this.logger.debug({ user }, "Fetching positions");
    const warnings: string[] = [];

    // Collect unique HIP-3 dex names from the registry
    const dexNames = new Set<string>();
    for (const group of this.registry.getAllGroups()) {
      for (const market of group.markets) {
        if (!market.isNative && market.dexName && market.dexName !== "__native__") {
          dexNames.add(market.dexName);
        }
      }
    }

    // Fetch native + all HIP-3 deployer clearinghouse states in parallel
    const dexList = [...dexNames];
    const [nativeState, ...hip3Results] = await Promise.all([
      this.provider.clearinghouseState(user),
      ...dexList.map((dex) =>
        this.provider.clearinghouseState(user, dex).catch((err) => {
          const msg = `Failed to fetch positions from deployer "${dex}": ${String(err)}`;
          this.logger.warn({ dex, error: String(err) }, "Failed to fetch HIP-3 clearinghouse state");
          warnings.push(msg);
          return null;
        }),
      ),
    ]);

    const positions: LogicalPosition[] = [];
    const allStates = [nativeState, ...hip3Results.filter(Boolean)];

    for (const state of allStates) {
      if (!state) continue;
      for (const pos of state.assetPositions) {
        const coin = pos.position.coin;
        const market = this.registry.findByCoin(coin);
        const baseAsset = market?.baseAsset ?? coin;

        positions.push({
          baseAsset,
          coin,
          market,
          side: parseFloat(pos.position.szi) >= 0 ? "long" : "short",
          size: Math.abs(parseFloat(pos.position.szi)),
          entryPrice: parseFloat(pos.position.entryPx),
          markPrice: parseFloat(pos.position.markPx ?? "0"),
          unrealizedPnl: parseFloat(pos.position.unrealizedPnl),
          leverage: parseFloat(pos.position.leverage?.value ?? "1"),
          liquidationPrice: pos.position.liquidationPx
            ? parseFloat(pos.position.liquidationPx)
            : null,
          managedBySDK: "unknown",
        });
      }
    }

    return { data: positions, warnings };
  }

  /**
   * Get positions grouped by base asset.
   * If ETH has positions across multiple HIP-3 markets, they appear together.
   */
  async getGroupedPositions(
    user: string,
  ): Promise<WithWarnings<Map<string, LogicalPosition[]>>> {
    const { data: positions, warnings } = await this.getPositions(user);
    const grouped = new Map<string, LogicalPosition[]>();

    for (const pos of positions) {
      const key = pos.baseAsset;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(pos);
    }

    return { data: grouped, warnings };
  }
}
