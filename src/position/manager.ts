import type { HLProvider } from "../provider/provider.js";
import type { Logger } from "../logging/logger.js";
import type { MarketRegistry } from "../market/registry.js";
import type { HIP3Market } from "../market/types.js";
import type { LogicalPosition } from "./types.js";

export class PositionManager {
  // Positions the SDK created — tracked by orderId
  private managedOrders = new Set<string>();
  private readonly logger: Logger;

  constructor(
    private provider: HLProvider,
    private registry: MarketRegistry,
    parentLogger: Logger,
  ) {
    this.logger = parentLogger.child({ module: "positions" });
  }

  /**
   * Record that the SDK created this position.
   */
  trackOrder(orderId: string) {
    this.managedOrders.add(orderId);
  }

  /**
   * Get all positions, annotated with whether they were created by this SDK.
   */
  async getPositions(user: string): Promise<LogicalPosition[]> {
    this.logger.debug({ user }, "Fetching positions");
    const state = await this.provider.clearinghouseState(user);
    const positions: LogicalPosition[] = [];

    for (const pos of state.assetPositions) {
      const coin = pos.position.coin;
      const market = this.findMarket(coin);
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
        managedBySDK: false, // v0: we don't track this yet
      });
    }

    return positions;
  }

  /**
   * Get positions grouped by base asset.
   * If ETH has positions across multiple HIP-3 markets, they appear together.
   */
  async getGroupedPositions(
    user: string,
  ): Promise<Map<string, LogicalPosition[]>> {
    const positions = await this.getPositions(user);
    const grouped = new Map<string, LogicalPosition[]>();

    for (const pos of positions) {
      const key = pos.baseAsset;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(pos);
    }

    return grouped;
  }

  private findMarket(coin: string): HIP3Market | undefined {
    for (const group of this.registry.getAllGroups()) {
      const match = group.markets.find((m) => m.coin === coin);
      if (match) return match;
    }
    return undefined;
  }
}
