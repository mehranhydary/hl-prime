import { Router } from "express";
import type { ServerConfig } from "../config.js";
import { getClientService } from "./agent.js";
import type { CandleData, CandleInterval, Network } from "../../../shared/types.js";
import { parseNetwork, requireString, ValidationError } from "../utils/validation.js";

export function marketRoutes(config: ServerConfig): Router {
  const router = Router();

  // GET /api/market/candles?coin=ETH&interval=1h&network=mainnet
  router.get("/candles", async (req, res) => {
    try {
      const coin = requireString(req.query.coin, "coin");
      const rawInterval = (req.query.interval as string) ?? "1h";
      const network = parseNetwork(req.query.network, config.defaultNetwork) as Network;

      // Fetch last 300 candles
      const intervalMs: Record<string, number> = {
        "1m": 60_000, "3m": 180_000, "5m": 300_000,
        "15m": 900_000, "30m": 1_800_000, "1h": 3_600_000,
        "2h": 7_200_000, "4h": 14_400_000, "8h": 28_800_000,
        "12h": 43_200_000, "1d": 86_400_000, "3d": 259_200_000,
        "1w": 604_800_000, "1M": 2_592_000_000,
      };

      if (!(rawInterval in intervalMs)) {
        throw new ValidationError(`Invalid interval: ${rawInterval}. Valid: ${Object.keys(intervalMs).join(", ")}`);
      }
      const interval = rawInterval as CandleInterval;

      const service = getClientService(config);
      const publicHp = await service.getPublicClient(network);

      const periodMs = intervalMs[interval];
      const startTime = Date.now() - periodMs * 300;

      const raw = await publicHp.api.candleSnapshot(coin, interval, startTime);

      const candles: CandleData[] = raw.map((c) => ({
        time: Math.floor(c.t / 1000),
        open: parseFloat(c.o),
        high: parseFloat(c.h),
        low: parseFloat(c.l),
        close: parseFloat(c.c),
        volume: parseFloat(c.v),
      }));

      res.json(candles);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message, code: "BAD_REQUEST" });
        return;
      }
      console.error("[market/candles] Candle fetch failed:", err instanceof Error ? err.message : String(err));
      res.status(500).json({ error: "Candle data unavailable.", code: "CANDLE_FETCH_FAILED" });
    }
  });

  return router;
}
