import { describe, expect, it } from "vitest";
import type { BridgeQuoteComparison } from "../../apps/trader/web/src/hooks/use-bridge";
import {
  pickSuggestedBridgeBalance,
  pickSuggestedBridgeComparison,
} from "../../apps/trader/web/src/hooks/use-bridge";
import { getBridgeWalletAddChainParameter } from "../../apps/trader/web/src/lib/bridge-chain-config";

describe("bridge selection helpers", () => {
  it("prefers a funded chain over an active chain with zero USDC", () => {
    const picked = pickSuggestedBridgeBalance({
      refreshedAt: Date.now(),
      balances: [
        {
          chainId: 8453,
          name: "base",
          displayName: "Base",
          usdcAddress: "0x1",
          usdcDecimals: 6,
          balance: "12.50",
          balanceRaw: "12500000",
          supportsPermit: false,
        },
        {
          chainId: 42161,
          name: "arbitrum",
          displayName: "Arbitrum One",
          usdcAddress: "0x2",
          usdcDecimals: 6,
          balance: "0",
          balanceRaw: "0",
          supportsPermit: false,
        },
      ],
    }, "10", 42161);

    expect(picked?.chainId).toBe(8453);
  });

  it("keeps the active chain selected when it is close to the best quote", () => {
    const comparisons: BridgeQuoteComparison[] = [
      {
        balance: {
          chainId: 8453,
          name: "base",
          displayName: "Base",
          usdcAddress: "0x1",
          usdcDecimals: 6,
          balance: "100",
          balanceRaw: "100000000",
          supportsPermit: false,
        },
        quote: {
          requestId: "req-base",
          steps: [],
          fees: { gas: "0.01", relayer: "0.04", totalUsd: "0.05" },
          outputAmount: "9.95",
          outputAmountRaw: "9950000",
          originChainId: 8453,
          originCurrency: "0x1",
          destinationChainId: 1337,
          destinationCurrency: "0x0",
          timeEstimateSec: 12,
        },
        isLoading: false,
        isFetching: false,
        error: null,
        hasPositiveBalance: true,
        hasEnoughBalance: true,
        feeUsd: 0.05,
        outputAmount: 9.95,
        timeEstimateSec: 12,
      },
      {
        balance: {
          chainId: 42161,
          name: "arbitrum",
          displayName: "Arbitrum One",
          usdcAddress: "0x2",
          usdcDecimals: 6,
          balance: "100",
          balanceRaw: "100000000",
          supportsPermit: false,
        },
        quote: {
          requestId: "req-arb",
          steps: [],
          fees: { gas: "0.02", relayer: "0.05", totalUsd: "0.09" },
          outputAmount: "9.91",
          outputAmountRaw: "9910000",
          originChainId: 42161,
          originCurrency: "0x2",
          destinationChainId: 1337,
          destinationCurrency: "0x0",
          timeEstimateSec: 18,
        },
        isLoading: false,
        isFetching: false,
        error: null,
        hasPositiveBalance: true,
        hasEnoughBalance: true,
        feeUsd: 0.09,
        outputAmount: 9.91,
        timeEstimateSec: 18,
      },
    ];

    const picked = pickSuggestedBridgeComparison(comparisons, 8453);
    expect(picked?.balance.chainId).toBe(8453);
  });

  it("switches away from the active chain when another quote is materially better", () => {
    const comparisons: BridgeQuoteComparison[] = [
      {
        balance: {
          chainId: 8453,
          name: "base",
          displayName: "Base",
          usdcAddress: "0x1",
          usdcDecimals: 6,
          balance: "100",
          balanceRaw: "100000000",
          supportsPermit: false,
        },
        quote: {
          requestId: "req-base",
          steps: [],
          fees: { gas: "0.01", relayer: "0.12", totalUsd: "0.13" },
          outputAmount: "9.87",
          outputAmountRaw: "9870000",
          originChainId: 8453,
          originCurrency: "0x1",
          destinationChainId: 1337,
          destinationCurrency: "0x0",
          timeEstimateSec: 28,
        },
        isLoading: false,
        isFetching: false,
        error: null,
        hasPositiveBalance: true,
        hasEnoughBalance: true,
        feeUsd: 0.13,
        outputAmount: 9.87,
        timeEstimateSec: 28,
      },
      {
        balance: {
          chainId: 42161,
          name: "arbitrum",
          displayName: "Arbitrum One",
          usdcAddress: "0x2",
          usdcDecimals: 6,
          balance: "100",
          balanceRaw: "100000000",
          supportsPermit: false,
        },
        quote: {
          requestId: "req-arb",
          steps: [],
          fees: { gas: "0.01", relayer: "0.03", totalUsd: "0.04" },
          outputAmount: "9.96",
          outputAmountRaw: "9960000",
          originChainId: 42161,
          originCurrency: "0x2",
          destinationChainId: 1337,
          destinationCurrency: "0x0",
          timeEstimateSec: 10,
        },
        isLoading: false,
        isFetching: false,
        error: null,
        hasPositiveBalance: true,
        hasEnoughBalance: true,
        feeUsd: 0.04,
        outputAmount: 9.96,
        timeEstimateSec: 10,
      },
    ];

    const picked = pickSuggestedBridgeComparison(comparisons, 8453);
    expect(picked?.balance.chainId).toBe(42161);
  });

  it("builds wallet_addEthereumChain params for known and fallback chains", () => {
    const polygonConfig = getBridgeWalletAddChainParameter({
      chainId: 137,
      displayName: "Polygon",
      rpcUrl: "https://polygon-rpc.com",
      explorerUrl: "https://polygonscan.com",
    });
    const fallbackConfig = getBridgeWalletAddChainParameter({
      chainId: 99999,
      displayName: "Custom Chain",
      rpcUrl: "https://rpc.custom.example",
      explorerUrl: "https://explorer.custom.example",
    });

    expect(polygonConfig?.nativeCurrency.symbol).toBe("POL");
    expect(fallbackConfig).toMatchObject({
      chainName: "Custom Chain",
      rpcUrls: ["https://rpc.custom.example"],
      blockExplorerUrls: ["https://explorer.custom.example"],
      nativeCurrency: { symbol: "ETH" },
    });
  });
});
