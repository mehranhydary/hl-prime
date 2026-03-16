import { Router } from "express";
import type { ServerConfig } from "../config.js";
import { getClientService } from "./agent.js";
import type {
  EarnResponse,
  EarnUserState,
  EarnReserveRow,
  EarnTokenPosition,
  AbstractionMode,
  Network,
} from "../../../shared/types.js";
import { parseNetwork, requireAddress, ValidationError } from "../utils/validation.js";

export function earnRoutes(config: ServerConfig): Router {
  const router = Router();

  // GET /api/earn?masterAddress=0x...&network=mainnet
  router.get("/", async (req, res) => {
    try {
      const masterAddress = requireAddress(req.query.masterAddress, "masterAddress");
      const network = parseNetwork(req.query.network, config.defaultNetwork) as Network;

      const service = getClientService(config);
      const publicHp = await service.getPublicClient(network);

      // Parallel fetch: user borrow/lend state, all reserves, spot meta (names), abstraction mode
      const [userStateResult, reservesResult, spotMetaResult, abstractionResult] =
        await Promise.allSettled([
          publicHp.getBorrowLendState(masterAddress),
          publicHp.getAllReserveStates(),
          publicHp.api.spotMeta(),
          publicHp.getAbstractionMode(masterAddress),
        ]);

      // Build token name lookup from spotMeta
      const tokenNameByIndex = new Map<number, string>();
      if (spotMetaResult.status === "fulfilled" && spotMetaResult.value?.tokens) {
        for (const t of spotMetaResult.value.tokens) {
          tokenNameByIndex.set(Number(t.index), String(t.name).toUpperCase());
        }
      }

      // Parse reserves
      const reservesRaw =
        reservesResult.status === "fulfilled" ? reservesResult.value : [];
      const reserves: EarnReserveRow[] = reservesRaw.map(
        ([tokenIndex, state]) => ({
          tokenIndex,
          tokenName: tokenNameByIndex.get(tokenIndex) ?? `Token${tokenIndex}`,
          supplyApy: parseFloat(state.supplyYearlyRate || "0") * 100,
          borrowApy: parseFloat(state.borrowYearlyRate || "0") * 100,
          utilization: parseFloat(state.utilization || "0"),
          ltv: parseFloat(state.ltv || "0"),
          totalSupplied: parseFloat(state.totalSupplied || "0"),
          totalBorrowed: parseFloat(state.totalBorrowed || "0"),
          oraclePrice: parseFloat(state.oraclePx || "0"),
        }),
      );

      // Build reserve lookup for pricing user positions
      const reserveByToken = new Map(reserves.map((r) => [r.tokenIndex, r]));

      // Parse user state
      let userState: EarnUserState | null = null;
      if (userStateResult.status === "fulfilled" && userStateResult.value) {
        const raw = userStateResult.value;
        const supplies: EarnTokenPosition[] = [];
        const borrows: EarnTokenPosition[] = [];

        for (const [tokenIndex, tokenState] of raw.tokenToState) {
          const reserve = reserveByToken.get(tokenIndex);
          const price = reserve?.oraclePrice ?? 0;
          const name =
            tokenNameByIndex.get(tokenIndex) ?? `Token${tokenIndex}`;

          const supplyVal = parseFloat(tokenState.supply?.value ?? "0");
          if (supplyVal > 0.0001) {
            supplies.push({
              tokenIndex,
              tokenName: name,
              amount: supplyVal,
              valueUsd: supplyVal * price,
              apy: reserve?.supplyApy ?? 0,
            });
          }

          const borrowVal = parseFloat(tokenState.borrow?.value ?? "0");
          if (borrowVal > 0.0001) {
            borrows.push({
              tokenIndex,
              tokenName: name,
              amount: borrowVal,
              valueUsd: borrowVal * price,
              apy: reserve?.borrowApy ?? 0,
            });
          }
        }

        const totalSuppliedUsd = supplies.reduce((s, p) => s + p.valueUsd, 0);
        const totalBorrowedUsd = borrows.reduce((s, p) => s + p.valueUsd, 0);

        userState = {
          health: raw.health ?? "unknown",
          healthFactor: raw.healthFactor ?? null,
          supplies,
          borrows,
          totalSuppliedUsd,
          totalBorrowedUsd,
        };
      }

      // Parse abstraction mode
      const abstractionMode: AbstractionMode =
        abstractionResult.status === "fulfilled"
          ? abstractionResult.value
          : null;

      const response: EarnResponse = {
        abstractionMode,
        userState,
        reserves,
      };
      res.json(response);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message, code: "BAD_REQUEST" });
        return;
      }
      console.error(
        "[earn] Failed:",
        err instanceof Error ? err.message : String(err),
      );
      res.status(500).json({
        error: "Earn data unavailable.",
        code: "EARN_FAILED",
      });
    }
  });

  return router;
}
