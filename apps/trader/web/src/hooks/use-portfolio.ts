import { useQuery } from "@tanstack/react-query";
import { accountPortfolio } from "../lib/api";
import type { Network } from "@shared/types";
import { useAuthSession } from "./use-auth-session";

export function usePortfolio(address: `0x${string}` | null, network: Network) {
  const auth = useAuthSession();
  return useQuery({
    queryKey: ["portfolio", address, network],
    queryFn: () => accountPortfolio(address!, network),
    enabled: !!address && auth.isAuthenticated,
    refetchInterval: 5_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}
