import { Router } from "express";
import type { ServerConfig } from "../config.js";
import { getClientService } from "./agent.js";
import type {
  ReferralDataResponse,
  ReferralRow,
  Network,
} from "../../../shared/types.js";
import { parseNetwork, requireAddress, ValidationError } from "../utils/validation.js";

export function referralRoutes(config: ServerConfig): Router {
  const router = Router();

  // GET /api/referral?masterAddress=0x...&network=mainnet
  router.get("/", async (req, res) => {
    try {
      const masterAddress = requireAddress(req.query.masterAddress, "masterAddress");
      const network = parseNetwork(req.query.network, config.defaultNetwork) as Network;

      const service = getClientService(config);
      const publicHp = await service.getPublicClient(network);

      // Try SDK method first, then fall back to raw provider
      let raw: any;
      try {
        raw = await (publicHp as any).getReferral(masterAddress);
      } catch {
        raw = await (publicHp as any).api.referral(masterAddress);
      }

      // Map referrer state defensively
      let referrerStage: ReferralDataResponse["referrerStage"] = "none";
      let referrerCode: string | null = null;
      let referralCount = 0;
      const referrals: ReferralRow[] = [];

      const rs = raw?.referrerState;
      if (rs) {
        if (rs.stage === "ready" && rs.data) {
          referrerStage = "ready";
          referrerCode = rs.data.code ?? null;
          referralCount = rs.data.nReferrals ?? 0;

          const states = rs.data.referralStates ?? [];
          for (const r of states) {
            referrals.push({
              address: r.user,
              dateJoined: r.timeJoined ?? 0,
              totalVolume: r.cumVlm ?? "0",
              feesPaid: r.cumRewardedFeesSinceReferred ?? "0",
              yourRewards: r.cumFeesRewardedToReferrer ?? "0",
            });
          }

          referrals.sort(
            (a, b) => parseFloat(b.totalVolume) - parseFloat(a.totalVolume),
          );
        } else if (rs.stage === "needToCreateCode") {
          referrerStage = "needToCreateCode";
        } else if (rs.stage === "needToTrade") {
          referrerStage = "needToTrade";
        }
      }

      const response: ReferralDataResponse = {
        referredBy: raw?.referredBy ?? null,
        cumVlm: raw?.cumVlm ?? "0",
        unclaimedRewards: raw?.unclaimedRewards ?? "0",
        claimedRewards: raw?.claimedRewards ?? "0",
        referrerStage,
        referrerCode,
        referralCount,
        referrals,
        rewardHistory: raw?.rewardHistory ?? [],
      };

      res.json(response);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({
          error: err.message,
          code: "BAD_REQUEST",
        });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      console.error("Referral route error:", message);
      res.status(500).json({
        error: message,
        code: "REFERRAL_FAILED",
      });
    }
  });

  return router;
}
