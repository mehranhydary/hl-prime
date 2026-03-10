import type { HyperliquidPrime } from "hyperliquid-prime";
import type { UnifiedBalance } from "../../../shared/types.js";

export async function getUnifiedBalance(
  hp: HyperliquidPrime,
  masterAddress: string,
  stableTokens: string[],
  spotPriceMap?: Map<string, number>,
): Promise<UnifiedBalance> {
  const stableSet = new Set(stableTokens.map((t) => t.toUpperCase()));

  const [perpState, spotState] = await Promise.all([
    hp.api.clearinghouseState(masterAddress),
    hp.api.spotClearinghouseState(masterAddress),
  ]);

  const perpAccountValueUsd = parseFloat(perpState.marginSummary.accountValue);
  const perpRawUsd = parseFloat(perpState.marginSummary.totalRawUsd);

  // Value ALL spot tokens — stables at 1:1, non-stables at mid price.
  const spotStableBreakdown: UnifiedBalance["spotStableBreakdown"] = [];
  let spotStableUsd = 0;
  let spotTotalUsd = 0;

  for (const bal of spotState.balances) {
    const coin = bal.coin.toUpperCase();
    const amount = parseFloat(bal.total);
    if (amount <= 0.001) continue;

    const isStable = stableSet.has(coin);
    const markPrice = isStable ? 1 : (spotPriceMap?.get(coin) ?? 0);
    const usdValue = amount * markPrice;
    if (usdValue <= 0.001) continue;

    spotTotalUsd += usdValue;
    if (isStable) {
      spotStableBreakdown.push({ coin: bal.coin, amount, usd: amount });
      spotStableUsd += amount;
    }
  }

  // Total = Spot + Perps (accountValue from clearinghouse)
  const totalUsd = spotTotalUsd + perpAccountValueUsd;

  return {
    totalUsd,
    availableUsd: spotStableUsd,
    perpAccountValueUsd,
    perpRawUsd,
    spotStableUsd,
    spotStableBreakdown,
    stableTokenSet: stableTokens,
  };
}
