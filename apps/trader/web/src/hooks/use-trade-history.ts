import { useQuery } from "@tanstack/react-query";
import { tradeHistory } from "../lib/api";
import type { Network } from "@shared/types";
import { useAuthSession } from "./use-auth-session";

export function useTradeHistory(address: `0x${string}` | null, network: Network, limit = 50) {
  const auth = useAuthSession();
  return useQuery({
    queryKey: ["trade-history", address, network, limit],
    queryFn: () => tradeHistory(address!, network, limit),
    enabled: !!address && auth.isAuthenticated,
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}
