import { useState, useEffect, useRef, useMemo } from "react";
import toast from "react-hot-toast";
import { useQuote, useExecute, useQuickTrade } from "../hooks/use-trade";
import { useWallet } from "../hooks/use-wallet";
import { pickSuggestedBridgeBalance, useBridgeBalances } from "../hooks/use-bridge";
import { useNetwork } from "../lib/network-context";
import { useBootstrap } from "../hooks/use-bootstrap";
import {
  displayCoin,
  collateralIconUrl,
  deployerIconUrl,
  tokenIconUrl,
  tokenIconFallbackUrl,
  getDeployer,
  showIconFallback,
} from "../lib/display";
import type { QuoteResponse, ExecuteLegAdjustment, ExecuteRequest, ExecutePreviewResponse } from "@shared/types";
import { useNavigate } from "react-router-dom";
import { runMasterPreTradeActions, isBuilderFeeAlreadyApproved, type PreTradeProgress } from "../lib/hl-master-actions";
import { ApiError, tradeExecutePreview } from "../lib/api";
import { BridgeModal } from "./BridgeModal";

function createSwapProgressToasts(): PreTradeProgress {
  return {
    onSwapStart(fromToken, toToken, amount) {
      toast.loading(`Swapping ~${amount.toFixed(2)} ${fromToken} → ${toToken}...`, {
        id: `swap-${fromToken}-${toToken}`,
      });
    },
    onSwapComplete(fromToken, toToken, filled) {
      toast.success(`Swapped ${filled} ${toToken}`, {
        id: `swap-${fromToken}-${toToken}`,
      });
    },
    onSwapError(fromToken, toToken, error) {
      toast.error(`${fromToken} → ${toToken}: ${error}`, {
        id: `swap-${fromToken}-${toToken}`,
      });
    },
  };
}

interface TradeFormProps {
  asset: string;
  currentPrice: number | null;
  maxLeverage: number;
}

interface LegOverride {
  enabled: boolean;
  weight: number; // raw weight; effective proportion = weight / sum(enabled weights)
}

interface TradeExecutionOutcome {
  success: boolean;
  error?: string;
}

const QUOTE_DEBOUNCE_MS = 250;

function getEffectiveProportions(overrides: LegOverride[]): number[] {
  const totalWeight = overrides.reduce(
    (sum, o) => sum + (o.enabled ? o.weight : 0),
    0,
  );
  if (totalWeight === 0) return overrides.map(() => 0);
  return overrides.map((o) => (o.enabled ? o.weight / totalWeight : 0));
}

export function TradeForm({ asset, currentPrice, maxLeverage }: TradeFormProps) {
  const navigate = useNavigate();
  const { address, activeChainId } = useWallet();
  const { network } = useNetwork();
  const bootstrap = useBootstrap(address, network);
  const bridgeBalances = useBridgeBalances(address, network === "mainnet");
  const agentConfigured = bootstrap.data?.agentConfigured ?? false;

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amountMode, setAmountMode] = useState<"base" | "usd">("usd");
  const [amount, setAmount] = useState("");
  const [leverage, setLeverage] = useState("5");
  const [mode, setMode] = useState<"safe" | "quick">("safe");
  const [activeQuote, setActiveQuote] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteFetching, setQuoteFetching] = useState(false);
  const [legOverrides, setLegOverrides] = useState<LegOverride[]>([]);
  const [preTradeError, setPreTradeError] = useState<string | null>(null);
  const [adjustedPreview, setAdjustedPreview] = useState<ExecutePreviewResponse | null>(null);
  const [bridgeOpen, setBridgeOpen] = useState(false);

  const quoteMutation = useQuote();
  const executeMutation = useExecute();
  const quickMutation = useQuickTrade();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quoteVersionRef = useRef(0);
  const lastQuoteIdRef = useRef<string | null>(null);

  const isLoading = executeMutation.isPending || quickMutation.isPending;
  const isBuy = side === "buy";
  const leverageNum = parseInt(leverage, 10);
  const isMultiLeg = (activeQuote?.routeSummary.legs.length ?? 0) > 1;
  const effectiveCollateralPreview = useMemo(
    () => adjustedPreview?.collateralPreview ?? activeQuote?.collateralPreview ?? undefined,
    [adjustedPreview, activeQuote],
  );
  const plannedCollateralSwaps = useMemo(() => {
    if (!effectiveCollateralPreview) return [];
    return effectiveCollateralPreview.requirements.filter((req) => req.shortfall > 0);
  }, [effectiveCollateralPreview]);
  const bridgeRequired = effectiveCollateralPreview?.bridgeRequired ?? 0;
  const bridgeAmount = useMemo(
    () => bridgeRequired.toFixed(2),
    [bridgeRequired],
  );
  const suggestedBridgeBalance = useMemo(
    () => pickSuggestedBridgeBalance(bridgeBalances.data, bridgeAmount, activeChainId),
    [activeChainId, bridgeAmount, bridgeBalances.data],
  );
  const bridgeFlowRequired = network === "mainnet" && bridgeRequired > 0.009;
  const bridgeNeedsSetup = bridgeFlowRequired && !agentConfigured;

  // Reset leg overrides and adjusted preview when a new quote arrives
  useEffect(() => {
    if (activeQuote && activeQuote.quoteId !== lastQuoteIdRef.current) {
      lastQuoteIdRef.current = activeQuote.quoteId;
      setLegOverrides(
        activeQuote.routeSummary.legs.map((leg) => ({
          enabled: leg.proportion > 0,
          weight: leg.proportion > 0 ? leg.proportion * 100 : 0,
        })),
      );
      setAdjustedPreview(null);
    }
    if (!activeQuote) {
      lastQuoteIdRef.current = null;
      setLegOverrides([]);
      setAdjustedPreview(null);
    }
  }, [activeQuote]);

  // Clamp leverage when maxLeverage changes (e.g. switching assets)
  useEffect(() => {
    if (parseInt(leverage, 10) > maxLeverage) {
      setLeverage(String(maxLeverage));
    }
  }, [maxLeverage]);

  const effectiveProportions = useMemo(
    () => getEffectiveProportions(legOverrides),
    [legOverrides],
  );

  // Detect when user has adjusted proportions away from the original quote
  const proportionsModified = useMemo(() => {
    if (!activeQuote || legOverrides.length === 0) return false;
    const origLegs = activeQuote.routeSummary.legs;
    if (origLegs.length <= 1) return false;
    return origLegs.some((leg, i) => {
      const orig = leg.proportion;
      const current = effectiveProportions[i] ?? orig;
      return Math.abs(orig - current) > 0.005; // >0.5% deviation
    });
  }, [activeQuote, legOverrides, effectiveProportions]);

  const hasManualLegAdjustments = useMemo(() => {
    if (!activeQuote || legOverrides.length === 0) return false;
    const origLegs = activeQuote.routeSummary.legs;
    if (origLegs.length <= 1) return false;
    return origLegs.some((leg, i) => {
      const orig = leg.proportion;
      const current = effectiveProportions[i] ?? orig;
      return Math.abs(orig - current) > 1e-6;
    });
  }, [activeQuote, legOverrides, effectiveProportions]);

  const legAdjustments = useMemo((): ExecuteLegAdjustment[] => {
    if (!activeQuote || legOverrides.length === 0) return [];
    return activeQuote.routeSummary.legs.map((leg, i) => ({
      coin: leg.coin,
      enabled: legOverrides[i]?.enabled ?? true,
      proportion: effectiveProportions[i] ?? leg.proportion,
    }));
  }, [activeQuote, legOverrides, effectiveProportions]);

  // Stable serialized key to control debounced preview calls
  const legAdjustmentsKey = useMemo(() => {
    if (!hasManualLegAdjustments) return "";
    return legAdjustments.map(a => `${a.coin}:${a.enabled}:${a.proportion.toFixed(6)}`).join(",");
  }, [hasManualLegAdjustments, legAdjustments]);

  // Keep a ref to legAdjustments so the debounced effect reads the latest value
  const latestLegAdjustments = useRef(legAdjustments);
  latestLegAdjustments.current = legAdjustments;

  // Debounced execute-preview when legs are manually adjusted.
  // This serves two purposes:
  //   1. Updates the collateral preview shown to the user
  //   2. Refreshes the server-side quote TTL so it doesn't expire while adjusting
  useEffect(() => {
    if (!activeQuote || !address || !legAdjustmentsKey) {
      setAdjustedPreview(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const preview = await tradeExecutePreview({
          quoteId: activeQuote.quoteId,
          masterAddress: address,
          legAdjustments: latestLegAdjustments.current,
        });
        setAdjustedPreview(preview);
      } catch {
        // Preview failed — keep showing original collateral data.
        // Server may still have refreshed the TTL before the error.
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [activeQuote?.quoteId, address, legAdjustmentsKey]);

  function toggleLeg(index: number) {
    setLegOverrides((prev) => {
      const enabledCount = prev.filter((l) => l.enabled).length;
      // Don't disable the last enabled leg
      if (prev[index].enabled && enabledCount <= 1) return prev;
      const next = [...prev];
      const nextEnabled = !next[index].enabled;
      next[index] = {
        ...next[index],
        enabled: nextEnabled,
        weight: nextEnabled && next[index].weight <= 0 ? 1 : next[index].weight,
      };
      return next;
    });
  }

  function setLegEffectivePct(index: number, targetPct: number) {
    setLegOverrides((prev) => {
      const target = Math.max(0, Math.min(99.99, targetPct)) / 100;
      const sumOther = prev.reduce(
        (sum, o, i) => sum + (i !== index && o.enabled ? o.weight : 0),
        0,
      );
      const next = [...prev];
      if (target <= 0) {
        if (sumOther <= 0) return prev;
        next[index] = { ...next[index], weight: 0 };
        return next;
      }
      if (sumOther <= 0) return prev;
      next[index] = { ...next[index], weight: (target * sumOther) / (1 - target), enabled: true };
      return next;
    });
  }

  // Auto-fetch quote when inputs change (debounced)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const numAmount = parseFloat(amount);
    if (!address || !amount || isNaN(numAmount) || numAmount <= 0) {
      setActiveQuote(null);
      setQuoteError(null);
      setQuoteFetching(false);
      return;
    }

    setQuoteFetching(true);
    setQuoteError(null);
    const version = ++quoteVersionRef.current;

    debounceRef.current = setTimeout(async () => {
      try {
        const result = await quoteMutation.mutateAsync({
          network,
          masterAddress: address,
          side,
          asset,
          amountMode,
          amount: numAmount,
          leverage: leverageNum,
          isCross: true,
        });
        if (quoteVersionRef.current === version) {
          setActiveQuote(result);
          setQuoteError(null);
          setQuoteFetching(false);
        }
      } catch (err) {
        if (quoteVersionRef.current === version) {
          setActiveQuote(null);
          setQuoteError(err instanceof Error ? err.message : "Quote failed");
          setQuoteFetching(false);
        }
      }
    }, QUOTE_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [amount, side, leverage, amountMode, address, network, asset]);

  async function executeSafeTrade(quoteOverride?: QuoteResponse): Promise<TradeExecutionOutcome> {
    const quoteToExecute = quoteOverride ?? activeQuote;
    if (!quoteToExecute || !address) {
      return { success: false, error: "Trade quote is no longer available." };
    }
    setPreTradeError(null);

    if (!agentConfigured) {
      navigate("/setup");
      return { success: false, error: "Agent setup is required before trading." };
    }

    const executeBody: ExecuteRequest = {
      quoteId: quoteToExecute.quoteId,
      masterAddress: address,
    };
    let executionRouteSummary = quoteToExecute.routeSummary;
    let executionCollateralPreview = quoteToExecute.collateralPreview;
    const usingFreshQuoteOverride = Boolean(quoteOverride && quoteOverride.quoteId !== activeQuote?.quoteId);

    try {
      if (!usingFreshQuoteOverride && hasManualLegAdjustments && legAdjustments.length > 0) {
        const preview = await tradeExecutePreview({
          quoteId: quoteToExecute.quoteId,
          masterAddress: address,
          legAdjustments,
        });
        executionRouteSummary = preview.routeSummary;
        executionCollateralPreview = preview.collateralPreview;
        executeBody.legAdjustments = legAdjustments;
      }

      const builderAlreadyApproved = isBuilderFeeAlreadyApproved({
        address,
        network,
        routeSummary: executionRouteSummary,
      });
      const needsMasterActions = Boolean(
        executionCollateralPreview?.swapsNeeded ||
        (!builderAlreadyApproved && executionRouteSummary.builderApproval && executionRouteSummary.builderFeeBps > 0),
      );
      if (needsMasterActions) {
        await runMasterPreTradeActions({
          address,
          network,
          routeSummary: executionRouteSummary,
          collateralPreview: executionCollateralPreview,
          progress: createSwapProgressToasts(),
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setPreTradeError(msg);
      toast.error(msg);
      return { success: false, error: msg };
    }

    try {
      const result = await executeMutation.mutateAsync(executeBody);
      if (result.totalFilledSize > 0) {
        toast.success(`Filled ${result.totalFilledSize} ${asset} @ $${result.aggregateAvgPrice.toFixed(2)}`);
        setActiveQuote(null);
        setAmount("");
        return { success: true };
      } else {
        toast("Order did not fill — try smaller size or wider slippage", { icon: "\u26A0\uFE0F" });
        return { success: false, error: "Order did not fill. Try a smaller size or retry the trade." };
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === "AGENT_NOT_APPROVED") {
        toast.error("Agent not approved — redirecting to Setup");
        navigate("/setup");
        return { success: false, error: "Agent not approved. Complete setup and retry the trade." };
      }
      const message = error instanceof Error ? error.message : "Trade failed";
      toast.error(message);
      return { success: false, error: message };
    }
  }

  async function runQuickTrade(quoteOverride?: QuoteResponse): Promise<TradeExecutionOutcome> {
    if (!address || !amount) {
      return { success: false, error: "Trade details are incomplete." };
    }
    setPreTradeError(null);

    const quoteForPreTrade = quoteOverride ?? activeQuote;
    if (agentConfigured && quoteForPreTrade) {
      const builderAlreadyApproved = isBuilderFeeAlreadyApproved({
        address,
        network,
        routeSummary: quoteForPreTrade.routeSummary,
      });
      const needsMasterActions = Boolean(
        quoteForPreTrade.collateralPreview?.swapsNeeded ||
        (!builderAlreadyApproved && quoteForPreTrade.routeSummary.builderApproval && quoteForPreTrade.routeSummary.builderFeeBps > 0),
      );
      if (needsMasterActions) {
        try {
          await runMasterPreTradeActions({
            address,
            network,
            routeSummary: quoteForPreTrade.routeSummary,
            collateralPreview: quoteForPreTrade.collateralPreview,
            progress: createSwapProgressToasts(),
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          setPreTradeError(msg);
          toast.error(msg);
          return { success: false, error: msg };
        }
      }
    }

    try {
      const result = await quickMutation.mutateAsync({
        network,
        masterAddress: address,
        side,
        asset,
        amountMode,
        amount: parseFloat(amount),
        leverage: leverageNum,
        isCross: true,
      });
      if (result.totalFilledSize > 0) {
        toast.success(`Filled ${result.totalFilledSize} ${asset} @ $${result.aggregateAvgPrice.toFixed(2)}`);
        setAmount("");
        return { success: true };
      } else {
        toast("Order did not fill — try smaller size or wider slippage", { icon: "\u26A0\uFE0F" });
        return { success: false, error: "Order did not fill. Try a smaller size or retry the trade." };
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === "AGENT_NOT_APPROVED") {
        toast.error("Agent not approved — redirecting to Setup");
        navigate("/setup");
        return { success: false, error: "Agent not approved. Complete setup and retry the trade." };
      }
      const message = error instanceof Error ? error.message : "Trade failed";
      toast.error(message);
      return { success: false, error: message };
    }
  }

  async function handleExecute() {
    await executeSafeTrade();
  }

  async function handleQuickTrade() {
    await runQuickTrade();
  }

  async function handleBridgeSuccess() {
    if (!address || !amount) {
      throw new Error("Trade details are incomplete. Re-enter the trade and try again.");
    }

    const refreshedQuote = await quoteMutation.mutateAsync({
      network,
      masterAddress: address,
      side,
      asset,
      amountMode,
      amount: parseFloat(amount),
      leverage: leverageNum,
      isCross: true,
    });

    setActiveQuote(refreshedQuote);
    setAdjustedPreview(null);
    setQuoteError(null);
    setQuoteOpen(true);

    const tradeOutcome = mode === "safe"
      ? await executeSafeTrade(refreshedQuote)
      : await runQuickTrade(refreshedQuote);
    if (!tradeOutcome.success) {
      throw new Error(tradeOutcome.error ?? "Trade failed after bridge completion.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Long / Short toggle */}
      <div className="grid grid-cols-2 gap-px bg-surface-3 p-0.5 rounded-sm">
        <button
          onClick={() => setSide("buy")}
          className={`py-2 text-sm font-semibold transition-all rounded-sm ${
            isBuy
              ? "bg-long text-surface-0 shadow-[0_0_12px_rgba(34,197,94,0.15)]"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          Long
        </button>
        <button
          onClick={() => setSide("sell")}
          className={`py-2 text-sm font-semibold transition-all rounded-sm ${
            !isBuy
              ? "bg-short text-white shadow-[0_0_12px_rgba(239,68,68,0.15)]"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          Short
        </button>
      </div>

      {/* Amount input — fixed height: always reserves space for conversion hint */}
      <div className="bg-surface-1 border border-border rounded-sm p-3 focus-within:border-accent/30 transition-colors">
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="any"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="bg-transparent text-xl font-semibold text-text-primary w-full focus:outline-none placeholder-text-dim min-w-0"
          />
          <button
            onClick={() => setAmountMode(amountMode === "usd" ? "base" : "usd")}
            className="shrink-0 flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text-primary transition-colors bg-surface-3 px-2.5 py-1 rounded-sm"
          >
            {amountMode === "usd" ? "USD" : asset}
            <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </button>
        </div>
        <div className="text-[11px] text-text-dim mt-1.5 h-4">
          {amount && currentPrice
            ? amountMode === "usd"
              ? `\u2248 ${(parseFloat(amount) / currentPrice).toFixed(6)} ${asset}`
              : `\u2248 $${(parseFloat(amount) * currentPrice).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : "\u00A0"}
        </div>
      </div>

      {/* Leverage */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted font-medium">Leverage</span>
          <span className="text-sm font-bold text-text-primary">{leverage}x</span>
        </div>
        <input
          type="range"
          min="1"
          max={maxLeverage}
          value={leverage}
          onChange={(e) => setLeverage(e.target.value)}
          className="w-full"
        />
      </div>

      {/* Quote box — always present, shows placeholder when empty */}
      <div className="bg-surface-1 border border-border rounded-sm overflow-hidden">
        <button
          onClick={() => activeQuote && setQuoteOpen(!quoteOpen)}
          className="w-full flex items-center justify-between px-3 py-2.5 text-sm"
        >
          <div className="flex items-center gap-2">
            <span className="text-text-muted text-xs">Quote</span>
            {activeQuote ? (
              <>
                <span className="text-text-primary font-medium text-xs">
                  {activeQuote.resolvedBaseSize.toFixed(6)} {asset}
                </span>
                <span className="text-text-dim text-xs">
                  ~${activeQuote.resolvedUsdNotional.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </>
            ) : quoteFetching && amount ? (
              <span className="text-text-dim text-xs">Fetching...</span>
            ) : quoteError ? (
              <span className="text-short text-xs truncate max-w-[200px]">{quoteError}</span>
            ) : (
              <span className="text-text-dim text-xs">Enter amount above</span>
            )}
          </div>
          <svg
            className={`w-3.5 h-3.5 text-text-muted transition-transform ${quoteOpen && activeQuote ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {quoteOpen && activeQuote && (
          <div className="px-3 pb-3 text-sm space-y-2.5 border-t border-border pt-2.5">
            {/* Per-leg breakdown with interactive editor */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="text-[10px] text-text-muted uppercase tracking-widest">
                  Route — {activeQuote.routeSummary.legs.length} {activeQuote.routeSummary.legs.length === 1 ? "leg" : "legs"}
                </div>
                {isMultiLeg && (
                  <span className="text-[9px] text-text-dim">adjust routing below</span>
                )}
              </div>
              {activeQuote.routeSummary.legs.map((leg, i) => {
                const override = legOverrides[i];
                const isEnabled = override?.enabled ?? true;
                const effPct = effectiveProportions[i] ?? leg.proportion;
                const effSize = activeQuote.resolvedBaseSize * effPct;
                const dexIcon = deployerIconUrl(leg.coin);
                const deployer = getDeployer(leg.coin);

                return (
                  <div
                    key={i}
                    className={`rounded-sm transition-opacity ${
                      isEnabled ? "bg-surface-2" : "bg-surface-2/50 opacity-50"
                    }`}
                  >
                    <div className="p-2.5 space-y-2">
                      {/* Leg header: toggle + icon + name + proportion */}
                      <div className="flex items-center gap-2">
                        {/* Toggle (only for multi-leg) */}
                        {isMultiLeg && (
                          <button
                            onClick={() => toggleLeg(i)}
                            className={`w-7 h-4 rounded-full relative transition-colors shrink-0 ${
                              isEnabled ? "bg-accent" : "bg-surface-3"
                            }`}
                          >
                            <div
                              className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                                isEnabled ? "left-3.5" : "left-0.5"
                              }`}
                            />
                          </button>
                        )}

                        {/* Deployer icon (for HIP-3) or token icon (for native) */}
                        <div className="w-5 h-5 rounded-full bg-surface-3 flex items-center justify-center overflow-hidden shrink-0">
                          {dexIcon ? (
                            <img
                              src={dexIcon}
                              alt={deployer ?? ""}
                              className="w-5 h-5 object-cover"
                              onError={(e) => {
                                const el = e.currentTarget;
                                showIconFallback(el, deployer ?? "", "text-[7px] font-bold text-text-muted");
                              }}
                            />
                          ) : (
                            <img
                              src={tokenIconUrl(leg.coin)}
                              alt={leg.coin}
                              className="w-5 h-5"
                              onError={(e) => {
                                const el = e.currentTarget;
                                const fallback = tokenIconFallbackUrl(leg.coin);
                                if (fallback && el.src !== fallback) {
                                  el.src = fallback;
                                  return;
                                }
                                showIconFallback(el, leg.coin, "text-[7px] font-bold text-text-muted");
                              }}
                            />
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className="font-medium text-text-primary text-xs truncate">{leg.coin}</span>
                          {deployer && (
                            <span className="text-[8px] text-text-dim bg-surface-3 px-1 py-px rounded-sm shrink-0">
                              {deployer}
                            </span>
                          )}
                        </div>

                        <span className="text-xs text-text-primary font-medium shrink-0">
                          {(effPct * 100).toFixed(1)}%
                        </span>
                      </div>

                      {/* Proportion slider (only for multi-leg + enabled) */}
                      {isMultiLeg && isEnabled && (
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={Math.round(effPct * 100)}
                            onChange={(e) => setLegEffectivePct(i, parseInt(e.target.value, 10))}
                            className="w-full h-1 accent-accent"
                          />
                        </div>
                      )}

                      {/* Leg stats */}
                      {isEnabled && (
                        <div className="grid grid-cols-3 gap-2 text-[10px]">
                          <div>
                            <div className="text-text-dim">Size</div>
                            <div className="text-text-secondary tabular-nums">{effSize.toFixed(6)}</div>
                          </div>
                          <div>
                            <div className="text-text-dim">Est. Price</div>
                            <div className="text-text-secondary tabular-nums">${leg.estimatedAvgPrice.toFixed(4)}</div>
                          </div>
                          <div>
                            <div className="text-text-dim">Collateral</div>
                            <div className="text-text-secondary flex items-center gap-1">
                              <img
                                src={collateralIconUrl(leg.collateral)}
                                alt={displayCoin(leg.collateral)}
                                className="w-3.5 h-3.5 rounded-full"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                              <span>{displayCoin(leg.collateral)}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Warning when user has adjusted proportions from quoted values */}
            {proportionsModified && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 px-2.5 py-1.5 rounded-sm text-[11px] text-yellow-400">
                Routing adjusted — impact and pricing estimates below may differ from actual execution.
              </div>
            )}

            {/* Aggregate metrics */}
            <div className="space-y-1 pt-2 border-t border-border text-xs">
              <div className="flex justify-between">
                <span className="text-text-muted">Leverage</span>
                <span className="text-text-primary">{leverageNum}x</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Margin Required</span>
                <span className="text-text-primary">
                  ${(activeQuote.resolvedUsdNotional / leverageNum).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Est. Avg Price</span>
                <span className="text-text-primary">
                  ${activeQuote.routeSummary.legs.length === 1
                    ? activeQuote.routeSummary.legs[0].estimatedAvgPrice.toFixed(4)
                    : (activeQuote.routeSummary.legs.reduce(
                        (sum, l, i) => sum + l.estimatedAvgPrice * (effectiveProportions[i] ?? l.proportion),
                        0,
                      )).toFixed(4)
                  }
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Impact</span>
                <span className={`${activeQuote.routeSummary.estimatedImpactBps > 10 ? "text-short" : "text-text-secondary"}`}>
                  {activeQuote.routeSummary.estimatedImpactBps.toFixed(2)} bps
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Funding Rate</span>
                <span className="text-text-secondary">
                  {(activeQuote.routeSummary.estimatedFundingRate * 100).toFixed(4)}%
                </span>
              </div>
              {activeQuote.routeSummary.builderFeeBps > 0 && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Builder Fee</span>
                  <span className="text-text-secondary">
                    {activeQuote.routeSummary.builderFeeBps} bps
                  </span>
                </div>
              )}
            </div>

            {effectiveCollateralPreview && (
              <div className="space-y-1 pt-2 border-t border-border text-xs">
                <div className="flex justify-between">
                  <span className="text-text-muted">Collateral Prep</span>
                  <span className={effectiveCollateralPreview.swapsNeeded ? "text-short" : "text-text-secondary"}>
                    {effectiveCollateralPreview.swapsNeeded ? "Swaps needed" : "No swaps needed"}
                  </span>
                </div>

                {plannedCollateralSwaps.length > 0 ? (
                  <div className="space-y-1.5">
                    {plannedCollateralSwaps.map((req, i) => (
                      <div key={`${req.token}-${i}`} className="bg-surface-2 rounded-sm px-2 py-1.5 space-y-0.5">
                        <div className="flex justify-between">
                          <div className="text-text-secondary flex items-center gap-1.5 min-w-0">
                            <img
                              src={collateralIconUrl(req.swapFrom)}
                              alt={displayCoin(req.swapFrom)}
                              className="w-3.5 h-3.5 rounded-full shrink-0"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                            <span className="truncate">{displayCoin(req.swapFrom)}</span>
                            <span className="text-text-dim">→</span>
                            <img
                              src={collateralIconUrl(req.token)}
                              alt={displayCoin(req.token)}
                              className="w-3.5 h-3.5 rounded-full shrink-0"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                            <span className="truncate">{displayCoin(req.token)}</span>
                          </div>
                          <span className="text-text-primary">
                            ~${req.shortfall.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] text-text-dim">
                          <span>
                            Need ${req.amountNeeded.toFixed(2)} · Have ${req.currentBalance.toFixed(2)}
                          </span>
                          <span>{req.estimatedSwapCostBps.toFixed(1)} bps est</span>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between text-[11px] text-text-dim">
                      <span>Weighted swap impact</span>
                      <span>{effectiveCollateralPreview.totalSwapCostBps.toFixed(2)} bps</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-text-muted">
                    No collateral swaps expected with current balances.
                  </div>
                )}

                <div className="text-[10px] text-text-dim">
                  Preview uses balances at quote time; final swap amounts are recalculated at execution.
                </div>
              </div>
            )}

            {activeQuote.routeSummary.warnings.length > 0 && (
              <div className="bg-short/10 border border-short/20 p-2 rounded-sm text-xs text-short">
                {activeQuote.routeSummary.warnings.map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Details */}
      <div className="space-y-0 text-xs">
        <div className="flex justify-between py-2 border-b border-border/50">
          <span className="text-text-muted">Max Slippage</span>
          <span className="text-text-secondary">5%</span>
        </div>
        <div className="flex justify-between py-2">
          <span className="text-text-muted">Mode</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setMode("safe")}
              className={`px-2 py-0.5 rounded-sm text-[11px] transition-colors ${
                mode === "safe"
                  ? "bg-surface-3 text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              Safe
            </button>
            <button
              onClick={() => setMode("quick")}
              disabled={!agentConfigured}
              className={`px-2 py-0.5 rounded-sm text-[11px] transition-colors ${
                !agentConfigured
                  ? "text-text-dim cursor-not-allowed"
                  : mode === "quick"
                    ? "bg-surface-3 text-text-primary"
                    : "text-text-muted hover:text-text-secondary"
              }`}
            >
              Quick
            </button>
            {!agentConfigured && (
              <span className="text-text-dim text-[10px]">agent required</span>
            )}
          </div>
        </div>
      </div>

      {!agentConfigured && (
        <div className="bg-accent/10 border border-accent/20 rounded-sm p-2.5 text-xs text-text-secondary flex items-center justify-between gap-3">
          <span>Agent setup is required to place orders from this app.</span>
          <button
            onClick={() => navigate("/setup")}
            className="app-control text-accent hover:text-accent/80 font-medium whitespace-nowrap px-2"
          >
            Open setup
          </button>
        </div>
      )}

      {/* Action button */}
      {mode === "safe" ? (
        bridgeFlowRequired ? (
          bridgeNeedsSetup ? (
            <button
              onClick={() => navigate("/setup")}
              disabled={isLoading}
              className="app-button-lg w-full font-semibold text-sm rounded-sm transition-all disabled:opacity-30 bg-accent text-surface-0"
            >
              Set up agent to bridge & trade
            </button>
          ) : (
            <button
              onClick={() => setBridgeOpen(true)}
              disabled={isLoading || !activeQuote || !address}
              className="app-button-lg w-full font-semibold text-sm rounded-sm transition-all disabled:opacity-30 bg-accent text-surface-0"
            >
              {suggestedBridgeBalance
                ? `Bridge $${bridgeAmount} from ${suggestedBridgeBalance.displayName}`
                : `Bridge $${bridgeAmount} USDC`}
            </button>
          )
        ) : (
          <button
            onClick={handleExecute}
            disabled={isLoading || !activeQuote || !address}
            className={`app-button-lg w-full font-semibold text-sm rounded-sm transition-all disabled:opacity-30 ${
              isBuy
                ? "bg-long text-surface-0 shadow-[0_0_20px_rgba(34,197,94,0.12)]"
                : "bg-short text-white shadow-[0_0_20px_rgba(239,68,68,0.12)]"
            }`}
          >
            {executeMutation.isPending
              ? "Executing..."
              : !agentConfigured
                ? "Set up agent to trade"
              : activeQuote
                ? `${isBuy ? "Long" : "Short"} ${asset}`
                : amount
                  ? "Waiting for quote..."
                  : "Enter amount"
            }
          </button>
        )
      ) : (
        bridgeFlowRequired ? (
          <button
            onClick={() => setBridgeOpen(true)}
            disabled={isLoading || !amount || !address || !agentConfigured}
            className="app-button-lg w-full font-semibold text-sm rounded-sm transition-all disabled:opacity-30 bg-accent text-surface-0"
          >
            {suggestedBridgeBalance
              ? `Bridge $${bridgeAmount} from ${suggestedBridgeBalance.displayName}`
              : `Bridge $${bridgeAmount} USDC`}
          </button>
        ) : (
          <button
            onClick={handleQuickTrade}
            disabled={isLoading || !amount || !address || !agentConfigured}
            className={`app-button-lg w-full font-semibold text-sm rounded-sm transition-all disabled:opacity-30 ${
              isBuy
                ? "bg-long text-surface-0 shadow-[0_0_20px_rgba(34,197,94,0.12)]"
                : "bg-short text-white shadow-[0_0_20px_rgba(239,68,68,0.12)]"
            }`}
          >
            {quickMutation.isPending ? "Executing..." : `Quick ${isBuy ? "Long" : "Short"} ${asset}`}
          </button>
        )
      )}

      {bridgeFlowRequired && (
        <div className="bg-accent/10 border border-accent/20 rounded-sm p-2.5 text-xs text-text-secondary">
          {bridgeNeedsSetup
            ? "This trade needs bridged USDC on Hyperliquid first, and agent setup has to be completed before the app can finish the bridge-then-trade flow."
            : suggestedBridgeBalance
            ? `Detected ${parseFloat(suggestedBridgeBalance.balance).toFixed(2)} USDC on ${suggestedBridgeBalance.displayName}. Bridge is required before this trade can execute on Hyperliquid.`
            : `This trade needs ${bridgeAmount} USDC on Hyperliquid first. Open the bridge flow to move funds in and continue automatically.`}
        </div>
      )}

      {/* Trade result feedback */}
      {(executeMutation.isSuccess || quickMutation.isSuccess) && (() => {
        const result = executeMutation.data ?? quickMutation.data;
        if (!result) return null;
        const hasFill = result.totalFilledSize > 0;
        const hasLegErrors = result.legs.some((l) => l.error);
        const showFailureTone = !hasFill || !result.success || hasLegErrors || !!result.error;
        const statusLabel = hasFill ? "Filled" : "No Fill";
        return (
          <div className={`bg-surface-1 border p-3 rounded-sm text-sm space-y-2 ${
            showFailureTone ? "border-short/20" : "border-long/20"
          }`}>
            <div className="flex justify-between items-center">
              <span className={`font-semibold text-xs ${showFailureTone ? "text-short" : "text-long"}`}>
                {statusLabel}
              </span>
              <span className="text-text-primary text-xs">
                {result.totalFilledSize} @ ${result.aggregateAvgPrice.toFixed(4)}
              </span>
            </div>
            {result.legs.length > 1 && (
              <>
                <div className="h-px bg-border" />
                <div className="space-y-1">
                  {result.legs.map((leg, i) => (
                    <div key={i} className="flex justify-between text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1 h-1 rounded-full ${leg.success ? "bg-long" : "bg-short"}`} />
                        <span className="text-text-secondary">{leg.market}</span>
                      </div>
                      <span className="text-text-muted">
                        {leg.filledSize} @ ${parseFloat(leg.avgPrice).toFixed(4)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {!hasFill && !hasLegErrors && !result.error && (
              <div className="text-[11px] text-text-muted">
                Order did not fill immediately. Try a smaller size, wider slippage, or retry.
              </div>
            )}
            {(result.error || hasLegErrors) && (
              <div className="text-[11px] text-short">
                {result.error && <div>{result.error}</div>}
                {result.legs.filter((l) => l.error).map((l, i) => (
                  <div key={i}>{l.market}: {l.error}</div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
      {(executeMutation.isError || quickMutation.isError) && (
        <div className="bg-short/10 border border-short/20 p-2.5 rounded-sm text-xs text-short">
          {(executeMutation.error ?? quickMutation.error)?.message ?? "Trade failed"}
        </div>
      )}
      {preTradeError && (
        <div className="bg-short/10 border border-short/20 p-2.5 rounded-sm text-xs text-short">
          {preTradeError}
        </div>
      )}

      <BridgeModal
        isOpen={bridgeOpen}
        amount={bridgeAmount}
        network={network}
        hyperliquidBalance={bootstrap.data?.balance ?? null}
        onClose={() => setBridgeOpen(false)}
        onSuccess={handleBridgeSuccess}
      />
    </div>
  );
}
