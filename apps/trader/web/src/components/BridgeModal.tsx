import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createPublicClient, http, parseUnits } from "viem";
import type { BridgeHistoryUpsertRequest, BridgeStatus, BridgeStep, Network, UnifiedBalance } from "@shared/types";
import { getBridgeWalletAddChainParameter, type WalletAddChainParameter } from "../lib/bridge-chain-config";
import { useWallet } from "../hooks/use-wallet";
import {
  pickSuggestedBridgeComparison,
  pickSuggestedBridgeBalance,
  refreshBridgeRelatedQueries,
  useBridgeBalances,
  useBridgeHistoryMutation,
  useBridgeQuoteComparisons,
  useBridgeStatus,
} from "../hooks/use-bridge";

interface BridgeModalProps {
  isOpen: boolean;
  amount: string;
  network: Network;
  hyperliquidBalance?: UnifiedBalance | null;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

type BridgePhase =
  | "idle"
  | "signing-approve"
  | "signing-deposit"
  | "waiting"
  | "executing-trade"
  | "failure";

function toRpcHex(value: string | number | bigint | undefined): `0x${string}` | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return undefined;
    if (normalized.startsWith("0x") || normalized.startsWith("0X")) {
      return normalized as `0x${string}`;
    }
    return `0x${BigInt(normalized).toString(16)}` as `0x${string}`;
  }
  if (typeof value === "number") {
    return `0x${BigInt(Math.max(0, Math.floor(value))).toString(16)}` as `0x${string}`;
  }
  return `0x${value.toString(16)}` as `0x${string}`;
}

function formatUsd(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return parsed.toLocaleString("en-US", {
    minimumFractionDigits: parsed >= 100 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function hasEnoughBalance(balanceRaw: string, amount: string, decimals: number): boolean {
  try {
    return BigInt(balanceRaw) >= parseUnits(amount, decimals);
  } catch {
    return false;
  }
}

function phaseLabel(phase: BridgePhase, bridgeCompleted = false): string {
  switch (phase) {
    case "signing-approve":
      return "Waiting for approval signature";
    case "signing-deposit":
      return "Waiting for bridge deposit signature";
    case "waiting":
      return "Bridge in flight";
    case "executing-trade":
      return "Bridge complete, executing trade";
    case "failure":
      return bridgeCompleted ? "Bridge complete, trade needs retry" : "Bridge failed";
    case "idle":
    default:
      return "Ready to bridge";
  }
}

async function sendBridgeStep(params: {
  address: `0x${string}`;
  step: BridgeStep;
  rpcUrl?: string;
  addChain?: WalletAddChainParameter | null;
  switchChain: (chainId: number, addChain?: WalletAddChainParameter | null) => Promise<void>;
  getEthereumProvider: () => Promise<any>;
}): Promise<`0x${string}`> {
  const { address, step, rpcUrl, addChain, switchChain, getEthereumProvider } = params;
  await switchChain(step.chainId, addChain);
  const provider = await getEthereumProvider();
  const txHash = await provider.request({
    method: "eth_sendTransaction",
    params: [{
      from: address,
      to: step.to,
      data: step.data,
      value: toRpcHex(step.value) ?? "0x0",
      ...(step.gas ? { gas: toRpcHex(step.gas) } : {}),
      ...(step.maxFeePerGas ? { maxFeePerGas: toRpcHex(step.maxFeePerGas) } : {}),
      ...(step.maxPriorityFeePerGas ? { maxPriorityFeePerGas: toRpcHex(step.maxPriorityFeePerGas) } : {}),
    }],
  });
  if (typeof txHash !== "string" || !txHash.startsWith("0x")) {
    throw new Error(`Wallet returned an invalid transaction hash for ${step.id}.`);
  }

  if (rpcUrl) {
    const client = createPublicClient({
      transport: http(rpcUrl, {
        timeout: 5_000,
        retryCount: 0,
      }),
    });
    await client.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
      confirmations: 1,
      timeout: 120_000,
      retryCount: 0,
    });
  }

  return txHash as `0x${string}`;
}

export function BridgeModal({
  isOpen,
  amount,
  network,
  hyperliquidBalance,
  onClose,
  onSuccess,
}: BridgeModalProps) {
  const queryClient = useQueryClient();
  const { address, activeWallet, activeChainId, switchChain } = useWallet();

  // Keep a stable address reference across wallet state flickers during chain switches.
  // Privy can briefly emit null address when the wallet updates its chainId, which
  // would otherwise unmount the modal mid-bridge and lose all in-progress state.
  const stableAddressRef = useRef<`0x${string}` | null>(null);
  if (address) stableAddressRef.current = address;
  const stableAddress = address ?? stableAddressRef.current;
  const queryAddress = isOpen ? stableAddress : address;
  const balancesQuery = useBridgeBalances(queryAddress, isOpen);
  const historyMutation = useBridgeHistoryMutation();
  const suggestedBalance = useMemo(
    () => pickSuggestedBridgeBalance(balancesQuery.data, amount, activeChainId),
    [activeChainId, amount, balancesQuery.data],
  );
  const [selectedChainId, setSelectedChainId] = useState<number | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [phase, setPhase] = useState<BridgePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHashes, setTxHashes] = useState<string[]>([]);
  const successHandledRef = useRef(false);
  const selectionLockedRef = useRef(false);
  const bridgeStartedAtRef = useRef<number | null>(null);
  const historyFingerprintRef = useRef<string | null>(null);

  const allBalances = balancesQuery.data?.balances ?? [];
  const selectedBalance = useMemo(
    () => allBalances.find((balance) => balance.chainId === selectedChainId) ?? null,
    [allBalances, selectedChainId],
  );
  const { candidates: visibleBalances, comparisons } = useBridgeQuoteComparisons({
    address: queryAddress,
    amount,
    balancesResponse: balancesQuery.data,
    activeChainId,
    selectedChainId,
    enabled: isOpen,
  });
  const statusQuery = useBridgeStatus(requestId, isOpen && !!requestId);
  const selectedComparison = useMemo(
    () => comparisons.find((comparison) => comparison.balance.chainId === selectedChainId) ?? null,
    [comparisons, selectedChainId],
  );
  const comparisonByChainId = useMemo(
    () => new Map(comparisons.map((comparison) => [comparison.balance.chainId, comparison])),
    [comparisons],
  );
  const bestComparison = useMemo(
    () => pickSuggestedBridgeComparison(comparisons, activeChainId),
    [activeChainId, comparisons],
  );
  const fastestComparison = useMemo(() => {
    const viable = comparisons.filter((comparison) => comparison.quote && !comparison.error);
    if (viable.length === 0) return null;
    return [...viable].sort((a, b) => {
      const aEta = a.timeEstimateSec ?? Number.POSITIVE_INFINITY;
      const bEta = b.timeEstimateSec ?? Number.POSITIVE_INFINITY;
      if (aEta !== bEta) return aEta - bEta;
      return (a.feeUsd ?? Number.POSITIVE_INFINITY) - (b.feeUsd ?? Number.POSITIVE_INFINITY);
    })[0] ?? null;
  }, [comparisons]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedChainId(null);
      setRequestId(null);
      setPhase("idle");
      setError(null);
      setTxHashes([]);
      successHandledRef.current = false;
      selectionLockedRef.current = false;
      bridgeStartedAtRef.current = null;
      historyFingerprintRef.current = null;
      return;
    }

    if (selectionLockedRef.current) return;

    const nextSuggestedChainId = bestComparison?.balance.chainId ?? suggestedBalance?.chainId ?? null;
    if (nextSuggestedChainId && nextSuggestedChainId !== selectedChainId) {
      setSelectedChainId(nextSuggestedChainId);
    }
  }, [bestComparison?.balance.chainId, isOpen, selectedChainId, suggestedBalance]);

  const quote = selectedComparison?.quote ?? null;
  const isBusy = phase === "signing-approve"
    || phase === "signing-deposit"
    || phase === "waiting"
    || phase === "executing-trade";
  const bridgeCompleted = statusQuery.data?.status === "success";
  const canDismiss = !isBusy;
  const canRetryTrade = bridgeCompleted && phase === "failure";
  const canBridge = Boolean(
    selectedBalance
    && activeWallet
    && hasEnoughBalance(selectedBalance.balanceRaw, amount, selectedBalance.usdcDecimals)
    && quote
    && !selectedComparison?.error,
  );

  async function recordHistory(params: {
    status: BridgeStatus;
    txHashes?: string[];
    tradeStatus?: BridgeHistoryUpsertRequest["tradeStatus"];
    error?: string;
    tradeError?: string;
  }): Promise<void> {
    if (!stableAddress || !quote || !selectedBalance) return;

    const startedAt = bridgeStartedAtRef.current ?? Date.now();
    if (!bridgeStartedAtRef.current) {
      bridgeStartedAtRef.current = startedAt;
    }

    const payload: BridgeHistoryUpsertRequest = {
      requestId: requestId ?? quote.requestId,
      createdAt: startedAt,
      network,
      masterAddress: stableAddress,
      destinationAddress: stableAddress,
      originChainId: quote.originChainId,
      originChainName: selectedBalance.displayName,
      originCurrency: quote.originCurrency,
      destinationChainId: quote.destinationChainId,
      destinationCurrency: quote.destinationCurrency,
      amount,
      outputAmount: quote.outputAmount,
      feeUsd: quote.fees.totalUsd,
      timeEstimateSec: quote.timeEstimateSec,
      status: params.status,
      txHashes: params.txHashes ?? txHashes,
      tradeStatus: params.tradeStatus ?? "not-started",
      error: params.error,
      tradeError: params.tradeError,
    };

    const fingerprint = JSON.stringify(payload);
    if (historyFingerprintRef.current === fingerprint) return;
    historyFingerprintRef.current = fingerprint;

    try {
      await historyMutation.mutateAsync(payload);
    } catch {
      // Best-effort tracking: history write failures should not block the bridge flow.
    }
  }

  function handleDismiss(): void {
    if (!canDismiss) return;
    onClose();
  }

  async function executeTradeAfterBridge(): Promise<void> {
    const relayHashes = statusQuery.data?.txHashes?.length ? statusQuery.data.txHashes : txHashes;
    setPhase("executing-trade");
    setError(null);
    await recordHistory({
      status: "success",
      txHashes: relayHashes,
      tradeStatus: "pending",
    });
    refreshBridgeRelatedQueries(queryClient);

    try {
      await Promise.resolve(onSuccess());
      await recordHistory({
        status: "success",
        txHashes: relayHashes,
        tradeStatus: "success",
      });
      onClose();
    } catch (err) {
      const tradeMessage = err instanceof Error ? err.message : String(err);
      setPhase("failure");
      setError(`Bridge completed, but trade execution failed. Funds are now on Hyperliquid. ${tradeMessage}`);
      await recordHistory({
        status: "success",
        txHashes: relayHashes,
        tradeStatus: "failure",
        tradeError: tradeMessage,
      });
    }
  }

  useEffect(() => {
    if (!statusQuery.data) return;
    if (statusQuery.data.status === "success" && !successHandledRef.current) {
      successHandledRef.current = true;
      void executeTradeAfterBridge();
      return;
    }

    if (statusQuery.data.isTerminal && statusQuery.data.status !== "success") {
      const failureMessage = statusQuery.data.details
        ? `Relay reported ${statusQuery.data.status}: ${statusQuery.data.details}`
        : `Relay reported ${statusQuery.data.status}.`;
      setPhase("failure");
      setError(failureMessage);
      void recordHistory({
        status: statusQuery.data.status,
        txHashes: statusQuery.data.txHashes,
        tradeStatus: "not-started",
        error: failureMessage,
      });
    }
  }, [statusQuery.data]);

  async function handleBridge(): Promise<void> {
    if (!activeWallet || !quote || !selectedBalance || isBusy || bridgeCompleted) return;
    const userAddress = stableAddress;
    if (!userAddress) return;
    setError(null);
    setTxHashes([]);
    successHandledRef.current = false;
    selectionLockedRef.current = true;
    bridgeStartedAtRef.current = Date.now();
    historyFingerprintRef.current = null;

    try {
      const getEthereumProvider = () => activeWallet.getEthereumProvider();
      const submittedHashes: string[] = [];
      void recordHistory({
        status: "pending",
        txHashes: submittedHashes,
        tradeStatus: "not-started",
      });
      for (const step of quote.steps) {
        setPhase(step.id === "approve" ? "signing-approve" : "signing-deposit");
        const stepBalance = allBalances.find((balance) => balance.chainId === step.chainId) ?? selectedBalance;
        const txHash = await sendBridgeStep({
          address: userAddress,
          step,
          rpcUrl: stepBalance?.rpcUrl,
          addChain: stepBalance ? getBridgeWalletAddChainParameter(stepBalance) : null,
          switchChain,
          getEthereumProvider,
        });
        submittedHashes.push(txHash);
        setTxHashes([...submittedHashes]);
        void recordHistory({
          status: step.id === "approve" ? "depositing" : "waiting",
          txHashes: submittedHashes,
          tradeStatus: "not-started",
        });
      }
      setRequestId(quote.requestId);
      setPhase("waiting");
      void recordHistory({
        status: "waiting",
        txHashes: submittedHashes,
        tradeStatus: "not-started",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setPhase("failure");
      setError(message);
      void recordHistory({
        status: "failure",
        tradeStatus: "not-started",
        error: message,
      });
    }
  }

  async function handleRetryTrade(): Promise<void> {
    if (!bridgeCompleted || isBusy) return;
    await executeTradeAfterBridge();
  }

  const balances = visibleBalances.length > 0 ? visibleBalances : allBalances.slice(0, 5);

  if (!isOpen || !stableAddress) return null;

  return (
    <div className="fixed inset-0 z-[10002] flex items-center justify-center" onClick={handleDismiss}>
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-md mx-4 bg-surface-1 border border-border rounded-sm p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          onClick={handleDismiss}
          disabled={!canDismiss}
          className="absolute top-3 right-3 text-text-muted hover:text-text-primary transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Close bridge modal"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-lg font-semibold text-text-primary font-heading mb-1">Bridge & Trade</h2>
        <p className="text-xs text-text-muted mb-4">
          Bridge {formatUsd(amount)} USDC to Hyperliquid, then continue the trade automatically.
        </p>

        <div className="bg-surface-2 border border-border rounded-sm p-3 mb-4 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-muted">Status</span>
            <span className={phase === "failure" && !bridgeCompleted ? "text-short" : "text-text-primary"}>
              {phaseLabel(phase, bridgeCompleted)}
            </span>
          </div>
          {requestId && (
            <div className="text-[11px] text-text-dim break-all">
              Request ID: {requestId}
            </div>
          )}
          {txHashes.length > 0 && (
            <div className="text-[11px] text-text-dim">
              {txHashes.length} transaction{txHashes.length === 1 ? "" : "s"} submitted
            </div>
          )}
          {isBusy && (
            <div className="text-[11px] text-text-dim">
              Keep this window open until the bridge finishes so the trade can continue automatically.
            </div>
          )}
        </div>

        {(bridgeCompleted || canRetryTrade) && hyperliquidBalance && (
          <div className="bg-accent/10 border border-accent/20 rounded-sm p-3 mb-4 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-text-muted">Hyperliquid perps balance</span>
              <span className="text-text-primary">${formatUsd(String(hyperliquidBalance.perpRawUsd))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Available to trade</span>
              <span className="text-text-primary">${formatUsd(String(hyperliquidBalance.availableUsd))}</span>
            </div>
          </div>
        )}

        <div className="space-y-2 mb-4">
          <div className="text-[10px] uppercase tracking-widest text-text-muted">Origin chain</div>
          {balancesQuery.isLoading && balances.length === 0 ? (
            <div className="bg-surface-2 border border-border rounded-sm p-3 text-xs text-text-dim">
              Loading supported balances...
            </div>
          ) : balances.length === 0 ? (
            <div className="bg-surface-2 border border-border rounded-sm p-3 text-xs text-text-dim">
              No supported origin-chain USDC balances found yet.
            </div>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {balances.map((balance) => {
                const enough = hasEnoughBalance(balance.balanceRaw, amount, balance.usdcDecimals);
                const isSelected = balance.chainId === selectedChainId;
                const comparison = comparisonByChainId.get(balance.chainId) ?? null;
                const feeText = comparison?.quote ? `$${formatUsd(comparison.quote.fees.totalUsd)} fee` : null;
                const etaText = comparison?.quote ? `${comparison.quote.timeEstimateSec}s` : null;
                const needsMoreUsd = Math.max(0, Number(amount) - Number(balance.balance));
                const badges = [
                  bestComparison?.balance.chainId === balance.chainId ? "Best fee" : null,
                  fastestComparison?.balance.chainId === balance.chainId ? "Fastest" : null,
                  activeChainId === balance.chainId ? "Active" : null,
                ].filter((badge): badge is string => Boolean(badge));
                return (
                  <button
                    key={balance.chainId}
                    onClick={() => {
                      selectionLockedRef.current = true;
                      setSelectedChainId(balance.chainId);
                    }}
                    disabled={isBusy}
                    className={`w-full flex items-center justify-between rounded-sm border px-3 py-2 text-left transition-colors ${
                      isSelected ? "border-accent bg-accent/10" : "border-border bg-surface-2 hover:border-accent/40"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {balance.logoUrl || balance.iconUrl ? (
                        <img
                          src={balance.logoUrl ?? balance.iconUrl}
                          alt={balance.displayName}
                          className="w-5 h-5 rounded-full shrink-0"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-surface-3 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm text-text-primary truncate">{balance.displayName}</div>
                        <div className="text-[11px] text-text-dim truncate">
                          {formatUsd(balance.balance)} USDC available
                          {comparison?.isLoading || comparison?.isFetching
                            ? " · Loading quote..."
                            : comparison?.quote
                              ? ` · ${feeText} · ${etaText}`
                              : comparison?.error
                                ? " · Quote unavailable"
                                : !comparison?.hasPositiveBalance
                                  ? " · No USDC detected"
                                  : enough
                                    ? " · Quote loading..."
                                    : ` · Need $${formatUsd(needsMoreUsd.toFixed(2))} more`}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-[11px] ${enough ? "text-long" : "text-text-dim"}`}>
                        {enough ? "Enough" : "Low"}
                      </div>
                      {badges.length > 0 && (
                        <div className="text-[10px] text-accent">{badges.join(" · ")}</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-surface-2 border border-border rounded-sm p-3 mb-4 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-text-muted">Bridge amount</span>
            <span className="text-text-primary">{formatUsd(amount)} USDC</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Estimated arrival</span>
            <span className="text-text-primary">
              {selectedComparison?.isLoading || selectedComparison?.isFetching
                ? "Loading..."
                : quote
                  ? `${quote.outputAmount} USDC`
                  : "Unavailable"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Estimated fee</span>
            <span className="text-text-primary">
              {selectedComparison?.isLoading || selectedComparison?.isFetching
                ? "Loading..."
                : quote
                  ? `$${formatUsd(quote.fees.totalUsd)}`
                  : "Unavailable"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">ETA</span>
            <span className="text-text-primary">
              {selectedComparison?.isLoading || selectedComparison?.isFetching
                ? "Loading..."
                : quote
                  ? `${quote.timeEstimateSec}s`
                  : "Unavailable"}
            </span>
          </div>
        </div>

        {(error || selectedComparison?.error || balancesQuery.error || statusQuery.error) && (
          <div className="bg-short/10 border border-short/20 rounded-sm p-2.5 text-xs text-short mb-4">
            {error
              ?? selectedComparison?.error
              ?? (balancesQuery.error instanceof Error ? balancesQuery.error.message : null)
              ?? (statusQuery.error instanceof Error ? statusQuery.error.message : "Bridge request failed")}
          </div>
        )}

        <button
          onClick={() => {
            if (canRetryTrade) {
              void handleRetryTrade();
              return;
            }
            void handleBridge();
          }}
          disabled={canRetryTrade ? isBusy : !canBridge || isBusy || bridgeCompleted}
          className="app-button-lg w-full font-semibold text-sm rounded-sm transition-all disabled:opacity-30 bg-accent text-surface-0"
        >
          {canRetryTrade
            ? "Retry trade"
            : phase === "signing-approve"
            ? "Confirm approval..."
            : phase === "signing-deposit"
              ? "Confirm bridge..."
              : phase === "waiting"
                ? "Waiting for bridge..."
                : phase === "executing-trade"
                  ? "Executing trade..."
                  : bridgeCompleted
                    ? "Bridge completed"
                  : "Bridge now"}
        </button>
      </div>
    </div>
  );
}
