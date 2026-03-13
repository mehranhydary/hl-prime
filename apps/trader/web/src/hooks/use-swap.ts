import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { swapQuote, swapExecute } from "../lib/api";
import { useAgentApprovalModal, isAgentApprovalError } from "../lib/agent-approval-context";
import type { SwapQuoteRequest, SwapExecuteRequest } from "@shared/types";

const BALANCE_QUERY_KEYS = [
  ["bootstrap"],
  ["portfolio"],
  ["swap-quote"],
] as const;

/**
 * Refresh balance-related queries with staggered retries.
 * Call this only after a confirmed fill — not on every mutation success.
 */
export function refreshBalancesAfterSwap(queryClient: ReturnType<typeof useQueryClient>): void {
  for (const queryKey of BALANCE_QUERY_KEYS) {
    queryClient.invalidateQueries({ queryKey });
    queryClient.refetchQueries({ queryKey, type: "active" });
  }

  // Staggered retries to catch async on-chain balance updates
  for (const delayMs of [1_000, 2_500]) {
    setTimeout(() => {
      for (const queryKey of BALANCE_QUERY_KEYS) {
        queryClient.invalidateQueries({ queryKey });
        queryClient.refetchQueries({ queryKey, type: "active" });
      }
    }, delayMs);
  }
}

export function useSwapQuote(params: SwapQuoteRequest & { enabled: boolean }) {
  return useQuery({
    queryKey: ["swap-quote", params.network, params.userAddress, params.fromToken, params.toToken, params.amount],
    queryFn: () => swapQuote({
      network: params.network,
      userAddress: params.userAddress,
      fromToken: params.fromToken,
      toToken: params.toToken,
      amount: params.amount,
    }),
    enabled: params.enabled,
    staleTime: 10_000, // 10 seconds
    retry: false,
  });
}

export function useSwapExecute() {
  const { showApprovalModal } = useAgentApprovalModal();

  return useMutation({
    mutationFn: (body: SwapExecuteRequest) => swapExecute(body),
    // Balance refresh is done by the component only on confirmed fills.
    onError: (error) => {
      if (isAgentApprovalError(error)) {
        showApprovalModal();
      }
    },
  });
}
