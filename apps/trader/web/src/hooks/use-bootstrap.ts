import { useQuery } from "@tanstack/react-query";
import { accountBootstrap } from "../lib/api";
import type { Network } from "@shared/types";
import { useAuthSession } from "./use-auth-session";

export function useBootstrap(address: `0x${string}` | null, network: Network) {
  const auth = useAuthSession();
  return useQuery({
    queryKey: ["bootstrap", address, network],
    queryFn: () => accountBootstrap(address!, network),
    enabled: !!address && auth.isAuthenticated,
    refetchInterval: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}
