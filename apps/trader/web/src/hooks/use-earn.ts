import { useQuery } from "@tanstack/react-query";
import { earnData } from "../lib/api";
import type { Network } from "@shared/types";
import { useAuthSession } from "./use-auth-session";

export function useEarn(address: `0x${string}` | null, network: Network) {
  const auth = useAuthSession();
  return useQuery({
    queryKey: ["earn", address, network],
    queryFn: () => earnData(address!, network),
    enabled: !!address && auth.isAuthenticated,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
