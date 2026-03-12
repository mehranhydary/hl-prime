import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { swapQuote, swapExecute } from "../lib/api";
import { useAgentApprovalModal, isAgentApprovalError } from "../lib/agent-approval-context";
import type { SwapQuoteRequest, SwapExecuteRequest } from "@shared/types";

function refreshSwapRelatedQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  const keys = [
    ["bootstrap"],
    ["portfolio"],
    ["swap-quote"], // Also invalidate quotes so they refresh with new balances
  ] as const;

  // Immediate refresh
  for (const queryKey of keys) {
    queryClient.invalidateQueries({ queryKey });
    queryClient.refetchQueries({ queryKey, type: "active" });
  }

  // Refresh again after delays to catch async balance updates
  setTimeout(() => {
    for (const queryKey of keys) {
      queryClient.invalidateQueries({ queryKey });
      queryClient.refetchQueries({ queryKey, type: "active" });
    }
  }, 1_000);

  setTimeout(() => {
    for (const queryKey of keys) {
      queryClient.invalidateQueries({ queryKey });
      queryClient.refetchQueries({ queryKey, type: "active" });
    }
  }, 2_500);
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
  const queryClient = useQueryClient();
  const { showApprovalModal } = useAgentApprovalModal();

  return useMutation({
    mutationFn: (body: SwapExecuteRequest) => swapExecute(body),
    onSuccess: () => {
      refreshSwapRelatedQueries(queryClient);
    },
    onError: (error) => {
      // Auto-show approval modal if agent is not approved
      if (isAgentApprovalError(error)) {
        showApprovalModal();
      }
    },
  });
}
