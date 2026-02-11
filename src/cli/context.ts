import { HyperliquidPrime } from "../index.js";
import type { HyperliquidPrimeConfig } from "../config.js";

/**
 * Build a HyperliquidPrime client from CLI options.
 */
export async function createContext(opts: {
  testnet?: boolean;
  key?: string;
  logLevel?: string;
}): Promise<HyperliquidPrime> {
  const config: HyperliquidPrimeConfig = {
    testnet: opts.testnet ?? false,
    privateKey: opts.key as `0x${string}` | undefined,
    logLevel: (opts.logLevel as HyperliquidPrimeConfig["logLevel"]) ?? "warn",
    prettyLogs: true,
  };

  const hp = new HyperliquidPrime(config);
  await hp.connect();
  return hp;
}
