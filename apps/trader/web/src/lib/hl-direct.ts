/**
 * Browser-side direct execution via injected wallet (MetaMask).
 * Used when no agent wallet is configured — the user signs orders directly.
 */
import type { DirectExecutionLeg, TradeResult, Network } from "@shared/types";
import { createExchangeClientFromInjected, getErrorChainMessage } from "./wallet-client";

/**
 * Execute trade legs directly using the injected wallet (MetaMask).
 * Each order triggers a MetaMask signing popup.
 */
export async function executeDirectly(
  legs: DirectExecutionLeg[],
  address: `0x${string}`,
  network: Network,
): Promise<TradeResult> {
  if (!window.ethereum) {
    throw new Error("No wallet provider found. Install MetaMask or similar.");
  }

  if (legs.length === 0) {
    throw new Error("No execution legs provided");
  }

  try {
    const exchange = await createExchangeClientFromInjected(address, network);

    // Step 1: Set leverage for each unique market (if specified)
    const leverageApplied = new Set<string>();
    for (const leg of legs) {
      if (leg.leverage === undefined) continue;
      const key = `${leg.assetIndex}:${leg.leverage}:${leg.isCross ?? true}`;
      if (leverageApplied.has(key)) continue;

      await exchange.updateLeverage({
        asset: leg.assetIndex,
        leverage: leg.leverage,
        isCross: leg.isCross ?? true,
      });
      leverageApplied.add(key);
    }

    // Step 2: Place orders
    const orders = legs.map((leg) => ({
      a: leg.assetIndex,
      b: leg.side === "buy",
      p: leg.price,
      s: leg.size,
      r: false,
      t: { limit: { tif: leg.orderType.limit.tif as "Ioc" | "Gtc" | "Alo" } } as const,
    }));

    const result = await exchange.order({
      orders,
      grouping: "na",
    });

    // Step 3: Parse results into TradeResult format
    const resultLegs: TradeResult["legs"] = [];
    let totalFilledSize = 0;
    let totalFilledCost = 0;
    let allSuccess = true;

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      const status = result.response.data.statuses[i];
      let filledSize = "0";
      let avgPrice = "0";
      let success = false;
      let error: string | undefined;

      if (status && typeof status === "object") {
        if ("filled" in status) {
          const filled = status.filled as { totalSz: string; avgPx: string };
          filledSize = filled.totalSz;
          avgPrice = filled.avgPx;
          success = true;
          totalFilledSize += parseFloat(filledSize);
          totalFilledCost += parseFloat(filledSize) * parseFloat(avgPrice);
        } else if ("resting" in status) {
          success = true;
          avgPrice = leg.price;
        } else if ("error" in status) {
          error = (status as { error: string }).error;
          allSuccess = false;
        }
      }

      resultLegs.push({
        market: leg.coin,
        side: leg.side,
        filledSize,
        avgPrice,
        success,
        error,
      });
    }

    const aggregateAvgPrice = totalFilledSize > 0
      ? totalFilledCost / totalFilledSize
      : 0;

    return {
      success: allSuccess,
      totalFilledSize: totalFilledSize,
      aggregateAvgPrice,
      legs: resultLegs,
    };
  } catch (error) {
    const message = getErrorChainMessage(error);

    if (/chain.?id/i.test(message) && /1337/.test(message)) {
      throw new Error(
        `Wallet rejected Hyperliquid signing because this action uses EIP-712 chainId 1337 in direct wallet mode. Complete agent setup and retry. ${message}`,
      );
    }

    if (/Failed to sign typed data with viem wallet/i.test(message)) {
      throw new Error(
        `Wallet failed to sign Hyperliquid typed data in direct wallet mode. Complete agent setup and retry. ${message}`,
      );
    }

    throw new Error(message);
  }
}
