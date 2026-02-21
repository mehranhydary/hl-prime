import type { HyperliquidPrime } from "hyperliquid-prime";
import type { UnifiedBalance } from "../../../shared/types.js";

export async function getUnifiedBalance(
  hp: HyperliquidPrime,
  masterAddress: string,
  stableTokens: string[],
): Promise<UnifiedBalance> {
  const stableSet = new Set(stableTokens.map((t) => t.toUpperCase()));

  const [perpState, spotState] = await Promise.all([
    hp.api.clearinghouseState(masterAddress),
    hp.api.spotClearinghouseState(masterAddress),
  ]);

  const perpAccountValueUsd = parseFloat(perpState.marginSummary.accountValue);

  const spotStableBreakdown: UnifiedBalance["spotStableBreakdown"] = [];
  let spotStableUsd = 0;

  for (const bal of spotState.balances) {
    const coin = bal.coin.toUpperCase();
    if (stableSet.has(coin)) {
      const amount = parseFloat(bal.total);
      if (amount > 0.001) {
        // Treat all stablecoins as 1:1 USD for MVP
        spotStableBreakdown.push({ coin: bal.coin, amount, usd: amount });
        spotStableUsd += amount;
      }
    }
  }

  return {
    totalUsd: perpAccountValueUsd + spotStableUsd,
    perpAccountValueUsd,
    spotStableUsd,
    spotStableBreakdown,
    stableTokenSet: stableTokens,
  };
}
