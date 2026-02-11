import type { LogicalPosition } from "./types.js";
import type { RiskProfile } from "./types.js";

/**
 * Compute risk profile for a position.
 */
export function computeRisk(position: LogicalPosition): RiskProfile {
  const distanceToLiquidation =
    position.liquidationPrice !== null && position.markPrice > 0
      ? Math.abs(
          (position.markPrice - position.liquidationPrice) /
            position.markPrice,
        ) * 100
      : null;

  const marginUsed =
    position.size * position.entryPrice / position.leverage;

  return {
    coin: position.coin,
    side: position.side,
    size: position.size,
    entryPrice: position.entryPrice,
    markPrice: position.markPrice,
    leverage: position.leverage,
    liquidationPrice: position.liquidationPrice,
    marginUsed,
    unrealizedPnl: position.unrealizedPnl,
    distanceToLiquidation,
  };
}
