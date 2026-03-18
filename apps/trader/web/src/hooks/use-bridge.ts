import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseUnits } from "viem";
import type {
  BridgeBalancesResponse,
  BridgeChainBalance,
  BridgeHistoryUpsertRequest,
  BridgeQuote,
  BridgeQuoteRequest,
  Network,
} from "@shared/types";
import { bridgeBalances, bridgeChains, bridgeHistory, bridgeHistoryUpdate, bridgeQuote, bridgeStatus } from "../lib/api";
import { useAuthSession } from "./use-auth-session";

const BRIDGE_BALANCE_QUERY_KEY = ["bridge-balances"] as const;

export interface BridgeQuoteComparison {
  balance: BridgeChainBalance;
  quote: BridgeQuote | null;
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  hasPositiveBalance: boolean;
  hasEnoughBalance: boolean;
  feeUsd: number | null;
  outputAmount: number | null;
  timeEstimateSec: number | null;
}

function hasPositiveBalance(balanceRaw: string): boolean {
  try {
    return BigInt(balanceRaw) > 0n;
  } catch {
    return false;
  }
}

function hasEnoughBridgeBalance(balance: BridgeChainBalance, amount: string): boolean {
  try {
    return BigInt(balance.balanceRaw) >= parseUnits(amount, balance.usdcDecimals);
  } catch {
    return false;
  }
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function uniqueBalancesByChainId(balances: BridgeChainBalance[]): BridgeChainBalance[] {
  const seen = new Set<number>();
  const unique: BridgeChainBalance[] = [];
  for (const balance of balances) {
    if (seen.has(balance.chainId)) continue;
    seen.add(balance.chainId);
    unique.push(balance);
  }
  return unique;
}

function buildQuoteComparisonCandidates(params: {
  balancesResponse: BridgeBalancesResponse | undefined;
  amount: string;
  activeChainId?: number | null;
  selectedChainId?: number | null;
}): BridgeChainBalance[] {
  const { balancesResponse, amount, activeChainId, selectedChainId } = params;
  const balances = balancesResponse?.balances ?? [];
  if (balances.length === 0) return [];

  const positiveBalances = balances.filter((balance) => hasPositiveBalance(balance.balanceRaw));
  const enoughBalances = positiveBalances.filter((balance) => hasEnoughBridgeBalance(balance, amount));

  const prioritized = enoughBalances.length > 0
    ? enoughBalances
    : positiveBalances.length > 0
      ? positiveBalances
      : balances.slice(0, 5);

  const extras = [activeChainId, selectedChainId]
    .map((chainId) => balances.find((balance) => balance.chainId === chainId))
    .filter((balance): balance is BridgeChainBalance => Boolean(balance));

  return uniqueBalancesByChainId([...prioritized, ...extras]).slice(0, 6);
}

export function refreshBridgeRelatedQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  const keys = [
    ["bridge-balances"],
    ["bridge-history"],
    ["bootstrap"],
    ["portfolio"],
    ["trade-history"],
  ] as const;

  for (const queryKey of keys) {
    queryClient.invalidateQueries({ queryKey });
    queryClient.refetchQueries({ queryKey, type: "active" });
  }

  for (const delayMs of [1_500, 4_000]) {
    setTimeout(() => {
      for (const queryKey of keys) {
        queryClient.invalidateQueries({ queryKey });
        queryClient.refetchQueries({ queryKey, type: "active" });
      }
    }, delayMs);
  }
}

export function useBridgeChains(enabled = true) {
  const auth = useAuthSession();
  return useQuery({
    queryKey: ["bridge-chains"],
    queryFn: bridgeChains,
    enabled: enabled && auth.isAuthenticated,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useBridgeBalances(address: `0x${string}` | null, enabled = true) {
  const auth = useAuthSession();
  return useQuery({
    queryKey: [...BRIDGE_BALANCE_QUERY_KEY, address],
    queryFn: () => bridgeBalances(address!),
    enabled: enabled && !!address && auth.isAuthenticated,
    staleTime: 20_000,
    refetchInterval: enabled && !!address && auth.isAuthenticated ? 60_000 : false,
    refetchOnWindowFocus: true,
  });
}

export function useBridgeQuote(params: (BridgeQuoteRequest & { enabled: boolean }) | null) {
  const auth = useAuthSession();
  return useQuery({
    queryKey: params
      ? ["bridge-quote", params.userAddress, params.originChainId, params.amount, params.destinationAddress, params.slippageTolerance]
      : ["bridge-quote", "idle"],
    queryFn: () => bridgeQuote(params!),
    enabled: Boolean(params?.enabled) && auth.isAuthenticated,
    staleTime: 15_000,
    retry: false,
  });
}

export function useBridgeQuoteComparisons(params: {
  address: `0x${string}` | null;
  amount: string;
  balancesResponse: BridgeBalancesResponse | undefined;
  activeChainId?: number | null;
  selectedChainId?: number | null;
  enabled?: boolean;
}) {
  const auth = useAuthSession();
  const candidates = buildQuoteComparisonCandidates({
    balancesResponse: params.balancesResponse,
    amount: params.amount,
    activeChainId: params.activeChainId,
    selectedChainId: params.selectedChainId,
  });
  const queryResults = useQueries({
    queries: candidates.map((balance) => ({
      queryKey: ["bridge-quote-comparison", params.address, balance.chainId, params.amount],
      queryFn: () => bridgeQuote({
        userAddress: params.address!,
        originChainId: balance.chainId,
        amount: params.amount,
      }),
      enabled: Boolean(params.enabled ?? true) && !!params.address && auth.isAuthenticated,
      staleTime: 15_000,
      retry: false,
      refetchOnWindowFocus: false,
    })),
  });

  const comparisons: BridgeQuoteComparison[] = candidates.map((balance, index) => {
    const result = queryResults[index];
    const quote = result?.data ?? null;
    return {
      balance,
      quote,
      isLoading: Boolean(result?.isLoading),
      isFetching: Boolean(result?.isFetching),
      error: result?.error instanceof Error ? result.error.message : null,
      hasPositiveBalance: hasPositiveBalance(balance.balanceRaw),
      hasEnoughBalance: hasEnoughBridgeBalance(balance, params.amount),
      feeUsd: toFiniteNumber(quote?.fees.totalUsd),
      outputAmount: toFiniteNumber(quote?.outputAmount),
      timeEstimateSec: quote?.timeEstimateSec ?? null,
    };
  });

  return {
    candidates,
    comparisons,
  };
}

export function useBridgeStatus(requestId: string | null, enabled = true) {
  const auth = useAuthSession();
  return useQuery({
    queryKey: ["bridge-status", requestId],
    queryFn: () => bridgeStatus(requestId!),
    enabled: enabled && !!requestId && auth.isAuthenticated,
    staleTime: 0,
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data;
      if (!enabled || !requestId) return false;
      if (!status || !status.isTerminal) return 2_000;
      return false;
    },
  });
}

export function useBridgeHistory(address: `0x${string}` | null, network: Network, limit = 50) {
  const auth = useAuthSession();
  return useQuery({
    queryKey: ["bridge-history", address, network, limit],
    queryFn: () => bridgeHistory(address!, network, limit),
    enabled: !!address && auth.isAuthenticated,
    staleTime: 10_000,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });
}

export function useBridgeQuoteMutation() {
  return useMutation({
    mutationFn: (body: BridgeQuoteRequest) => bridgeQuote(body),
  });
}

export function useBridgeHistoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BridgeHistoryUpsertRequest) => bridgeHistoryUpdate(body),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["bridge-history", variables.masterAddress, variables.network],
      });
      queryClient.refetchQueries({
        queryKey: ["bridge-history", variables.masterAddress, variables.network],
        type: "active",
      });
    },
  });
}

export function pickSuggestedBridgeBalance(
  balancesResponse: BridgeBalancesResponse | undefined,
  amount: string,
  activeChainId?: number | null,
): BridgeChainBalance | null {
  const balances = balancesResponse?.balances ?? [];
  if (balances.length === 0) return null;

  const balancesWithPositive = balances.filter((balance) => hasPositiveBalance(balance.balanceRaw));
  const balancesWithEnough = balances.filter((balance) => hasEnoughBridgeBalance(balance, amount));

  if (activeChainId) {
    const exactActive = balancesWithEnough.find((balance) => balance.chainId === activeChainId)
      ?? balancesWithPositive.find((balance) => balance.chainId === activeChainId);
    if (exactActive) return exactActive;
  }

  return balancesWithEnough[0] ?? balancesWithPositive[0] ?? balances[0] ?? null;
}

function bridgeComparisonSort(a: BridgeQuoteComparison, b: BridgeQuoteComparison): number {
  const aFee = a.feeUsd ?? Number.POSITIVE_INFINITY;
  const bFee = b.feeUsd ?? Number.POSITIVE_INFINITY;
  if (aFee !== bFee) return aFee - bFee;

  const aOutput = a.outputAmount ?? 0;
  const bOutput = b.outputAmount ?? 0;
  if (aOutput !== bOutput) return bOutput - aOutput;

  const aEta = a.timeEstimateSec ?? Number.POSITIVE_INFINITY;
  const bEta = b.timeEstimateSec ?? Number.POSITIVE_INFINITY;
  if (aEta !== bEta) return aEta - bEta;

  const aBalance = toFiniteNumber(a.balance.balance) ?? 0;
  const bBalance = toFiniteNumber(b.balance.balance) ?? 0;
  if (aBalance !== bBalance) return bBalance - aBalance;

  const aName = typeof a.balance.displayName === "string" ? a.balance.displayName : String(a.balance.chainId);
  const bName = typeof b.balance.displayName === "string" ? b.balance.displayName : String(b.balance.chainId);
  return aName.localeCompare(bName);
}

export function pickSuggestedBridgeComparison(
  comparisons: BridgeQuoteComparison[],
  activeChainId?: number | null,
): BridgeQuoteComparison | null {
  const viable = comparisons
    .filter((comparison) => comparison.hasEnoughBalance && comparison.quote && !comparison.error)
    .sort(bridgeComparisonSort);

  if (viable.length === 0) return null;

  const best = viable[0];
  if (!activeChainId) return best;

  const active = viable.find((comparison) => comparison.balance.chainId === activeChainId);
  if (!active) return best;

  const activeFee = active.feeUsd ?? Number.POSITIVE_INFINITY;
  const bestFee = best.feeUsd ?? Number.POSITIVE_INFINITY;
  const activeEta = active.timeEstimateSec ?? Number.POSITIVE_INFINITY;
  const bestEta = best.timeEstimateSec ?? Number.POSITIVE_INFINITY;

  if (activeFee <= bestFee + 0.10 && activeEta <= bestEta + 10) {
    return active;
  }

  return best;
}
