import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { swapQuote, swapExecute } from "../lib/api";
import type { SwapQuoteRequest, SwapExecuteRequest } from "@shared/types";

function refreshSwapRelatedQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  const keys = [
    ["bootstrap"],
    ["portfolio"],
  ] as const;

  for (const queryKey of keys) {
    queryClient.invalidateQueries({ queryKey });
    queryClient.refetchQueries({ queryKey, type: "active" });
  }

  // Refresh again after a delay to catch any async balance updates
  setTimeout(() => {
    for (const queryKey of keys) {
      queryClient.invalidateQueries({ queryKey });
      queryClient.refetchQueries({ queryKey, type: "active" });
    }
  }, 1_500);
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
  return useMutation({
    mutationFn: (body: SwapExecuteRequest) => swapExecute(body),
    onSuccess: () => {
      refreshSwapRelatedQueries(queryClient);
    },
  });
}
