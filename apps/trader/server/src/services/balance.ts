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
  // totalRawUsd is the USDC balance after realized PNL — it can go negative
  // when realized losses exceed deposits (even if unrealized gains keep the
  // account healthy).  accountValue (= totalRawUsd + unrealizedPnl) reflects
  // the true perps equity the user sees.
  const perpRawUsd = parseFloat(perpState.marginSummary.totalRawUsd);

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
    // Use accountValue (total equity including unrealized PNL) for the headline
    // balance.  totalRawUsd can go deeply negative when realized losses exceed
    // deposits, even though the account is healthy due to unrealized gains.
    totalUsd: perpAccountValueUsd + spotStableUsd,
    perpAccountValueUsd,
    perpRawUsd,
    spotStableUsd,
    spotStableBreakdown,
    stableTokenSet: stableTokens,
  };
}
