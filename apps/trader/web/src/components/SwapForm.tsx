import { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { useSwapQuote, useSwapExecute } from "../hooks/use-swap";
import { useWallet } from "../hooks/use-wallet";
import { useNetwork } from "../lib/network-context";
import { collateralIconUrl } from "../lib/display";
import { TokenSelectorModal } from "./TokenSelectorModal";
import type { UnifiedBalance } from "@shared/types";

interface SwapFormProps {
  balance: UnifiedBalance | null;
}

const SUPPORTED_TOKENS = ["USDC", "USDE", "USDH", "USDT0"] as const;
type SupportedToken = typeof SUPPORTED_TOKENS[number];

const QUOTE_DEBOUNCE_MS = 250;

function getTokenBalance(balance: UnifiedBalance | null, token: string): number {
  if (!balance) return 0;

  // Handle USDC specially - use spot balance only (not perp)
  if (token === "USDC") {
    const spotUsdc = balance.spotStableBreakdown.find((b) => b.coin === "USDC");
    return spotUsdc?.amount ?? 0;
  }

  // For other stables, find in spot breakdown
  const tokenBalance = balance.spotStableBreakdown.find((b) => b.coin === token);
  return tokenBalance?.amount ?? 0;
}

export function SwapForm({ balance }: SwapFormProps) {
  const { address } = useWallet();
  const { network } = useNetwork();

  const [fromToken, setFromToken] = useState<SupportedToken>("USDC");
  const [toToken, setToToken] = useState<SupportedToken>("USDE");
  const [amount, setAmount] = useState("");
  const [isFromModalOpen, setIsFromModalOpen] = useState(false);
  const [isToModalOpen, setIsToModalOpen] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fromBalance = getTokenBalance(balance, fromToken);
  const toBalance = getTokenBalance(balance, toToken);

  // Create balance map for modal
  const balanceMap = new Map<string, number>();
  SUPPORTED_TOKENS.forEach(token => {
    balanceMap.set(token, getTokenBalance(balance, token));
  });

  const parsedAmount = parseFloat(amount);
  const isValidAmount = !Number.isNaN(parsedAmount) && parsedAmount > 0;

  const quote = useSwapQuote({
    network,
    userAddress: address ?? "0x",
    fromToken,
    toToken,
    amount: parsedAmount,
    enabled: !!address && isValidAmount,
  });

  const executeMutation = useSwapExecute();

  // Debounced quote fetching
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (isValidAmount && address) {
      debounceRef.current = setTimeout(() => {
        quote.refetch();
      }, QUOTE_DEBOUNCE_MS);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [amount, fromToken, toToken]);

  function handleSwapDirection() {
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
    setAmount("");
  }

  function handleMaxAmount() {
    setAmount(fromBalance.toString());
  }

  async function handleSwap() {
    if (!address || !isValidAmount) return;

    const swapId = `swap-${fromToken}-${toToken}-${Date.now()}`;
    toast.loading(`Swapping ${parsedAmount.toFixed(2)} ${fromToken} → ${toToken}...`, { id: swapId });

    try {
      const result = await executeMutation.mutateAsync({
        network,
        userAddress: address,
        fromToken,
        toToken,
        amount: parsedAmount,
      });

      const filled = parseFloat(result.filled);
      const didFill = result.success && Number.isFinite(filled) && filled > 0;

      if (didFill) {
        toast.success(`Swapped ${result.filled} ${toToken} @ ${result.executedPrice}`, { id: swapId });
        setAmount("");
      } else {
        const reason = result.error ?? "Order did not fill — try again or adjust amount";
        toast.error(reason, { id: swapId });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Swap execution failed", { id: swapId });
    }
  }

  const canExecute = !executeMutation.isPending && isValidAmount && !quote.data?.insufficientBalance;

  // Get available tokens for each selector (exclude the other selected token)
  const availableFromTokens = SUPPORTED_TOKENS.filter(t => t !== toToken);
  const availableToTokens = SUPPORTED_TOKENS.filter(t => t !== fromToken);

  return (
    <div className="space-y-4">
      {/* From Section */}
      <div className="bg-surface-1 border border-border rounded-2xl p-6">
        <label className="block text-sm text-text-muted mb-4">Sell</label>

        <div className="flex items-start gap-4">
          {/* Input */}
          <div className="flex-1">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-full bg-transparent text-5xl font-heading text-text-primary focus:outline-none placeholder:text-text-dim"
              step="any"
              min="0"
            />
            <div className="text-sm text-text-dim mt-2">
              ${isValidAmount ? (parsedAmount * 1).toFixed(2) : "0"}
            </div>
          </div>

          {/* Token Selector */}
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={() => setIsFromModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-surface-2 hover:bg-surface-3 border border-border rounded-full transition-colors"
            >
              <img
                src={collateralIconUrl(fromToken)}
                alt={fromToken}
                className="w-6 h-6 rounded-full"
              />
              <span className="font-medium text-text-primary">{fromToken}</span>
              <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="text-xs text-text-dim">
              {fromBalance.toFixed(5)} {fromToken}
            </div>
            <button
              onClick={handleMaxAmount}
              className="text-xs text-accent hover:text-accent/80 transition-colors"
            >
              MAX
            </button>
          </div>
        </div>
      </div>

      {/* Swap Direction Button */}
      <div className="flex justify-center -my-6 relative z-10">
        <button
          onClick={handleSwapDirection}
          className="w-12 h-12 bg-surface-2 border-2 border-border rounded-full flex items-center justify-center hover:bg-surface-3 hover:border-accent transition-colors"
          aria-label="Swap direction"
        >
          <svg className="w-5 h-5 text-text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      </div>

      {/* To Section */}
      <div className="bg-surface-1 border border-border rounded-2xl p-6">
        <label className="block text-sm text-text-muted mb-4">Buy</label>

        <div className="flex items-start gap-4">
          {/* Estimated Amount */}
          <div className="flex-1">
            <div className="text-5xl font-heading text-text-primary">
              {quote.data?.estimatedReceive ? quote.data.estimatedReceive.toFixed(2) : "0"}
            </div>
            <div className="text-sm text-text-dim mt-2">
              ${quote.data?.estimatedReceive ? (quote.data.estimatedReceive * 1).toFixed(2) : "0"}
            </div>
          </div>

          {/* Token Selector */}
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={() => setIsToModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-surface-2 hover:bg-surface-3 border border-border rounded-full transition-colors"
            >
              <img
                src={collateralIconUrl(toToken)}
                alt={toToken}
                className="w-6 h-6 rounded-full"
              />
              <span className="font-medium text-text-primary">{toToken}</span>
              <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="text-xs text-text-dim">
              {toBalance.toFixed(5)} {toToken}
            </div>
          </div>
        </div>
      </div>

      {/* Quote Details */}
      {quote.data && (
        <div className="bg-surface-2 border border-border rounded-xl p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-text-muted">Market:</span>
            <span className="text-text-primary">{quote.data.spotMarket}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Swap Cost:</span>
            <span className={quote.data.estimatedCostBps > 50 ? "text-yellow-400" : "text-text-primary"}>
              {quote.data.estimatedCostBps.toFixed(1)} bps
            </span>
          </div>
        </div>
      )}

      {/* Warnings */}
      {quote.data?.warnings && quote.data.warnings.length > 0 && (
        <div className="space-y-2">
          {quote.data.warnings.map((warning, idx) => (
            <div key={idx} className="bg-short/10 border border-short/20 p-3 text-sm text-short rounded-xl">
              {warning}
            </div>
          ))}
        </div>
      )}

      {/* Execute Button */}
      <button
        onClick={handleSwap}
        disabled={!canExecute}
        className="w-full app-button-lg bg-accent text-surface-0 font-heading disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {executeMutation.isPending ? "Swapping..." : "Swap"}
      </button>

      {/* Token Selector Modals */}
      <TokenSelectorModal
        isOpen={isFromModalOpen}
        onClose={() => setIsFromModalOpen(false)}
        selectedToken={fromToken}
        availableTokens={availableFromTokens}
        balances={balanceMap}
        onSelectToken={setFromToken}
      />

      <TokenSelectorModal
        isOpen={isToModalOpen}
        onClose={() => setIsToModalOpen(false)}
        selectedToken={toToken}
        availableTokens={availableToTokens}
        balances={balanceMap}
        onSelectToken={setToToken}
      />
    </div>
  );
}
