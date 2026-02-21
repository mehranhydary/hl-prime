import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { referralData } from "../lib/api";
import {
  createReferralCode,
  enterReferralCode,
  claimReferralRewards,
} from "../lib/hl-referral";
import type { Network } from "@shared/types";
import { useAuthSession } from "./use-auth-session";

export function useReferralData(address: `0x${string}` | null, network: Network) {
  const auth = useAuthSession();
  return useQuery({
    queryKey: ["referral", address, network],
    queryFn: () => referralData(address!, network),
    enabled: !!address && auth.isAuthenticated,
    refetchInterval: 30_000,
    retry: 1,
  });
}

export function useCreateCode(address: `0x${string}` | null, network: Network) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => createReferralCode(code, address!, network),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["referral", address, network] }),
  });
}

export function useEnterCode(address: `0x${string}` | null, network: Network) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => enterReferralCode(code, address!, network),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["referral", address, network] }),
  });
}

export function useClaimRewards(address: `0x${string}` | null, network: Network) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => claimReferralRewards(address!, network),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["referral", address, network] }),
  });
}
