import { useQuery } from "@tanstack/react-query";
import { marketCandles } from "../lib/api";
import type { CandleInterval, Network } from "@shared/types";
import { useAuthSession } from "./use-auth-session";

export function useCandles(
  coin: string | undefined,
  interval: CandleInterval,
  network: Network,
) {
  const auth = useAuthSession();
  return useQuery({
    queryKey: ["candles", coin, interval, network],
    queryFn: () => marketCandles(coin!, interval, network),
    enabled: !!coin && auth.isAuthenticated,
    refetchInterval: 60_000,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}
