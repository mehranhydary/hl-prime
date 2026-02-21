import { useQuery } from "@tanstack/react-query";
import { agentStatus } from "../lib/api";
import type { Network } from "@shared/types";
import { useAuthSession } from "./use-auth-session";

export function useAgentStatus(address: `0x${string}` | null, network: Network) {
  const auth = useAuthSession();
  return useQuery({
    queryKey: ["agent-status", address, network],
    queryFn: () => agentStatus(address!, network),
    enabled: !!address && auth.isAuthenticated,
    staleTime: 30_000,
  });
}
