import { HyperliquidPrime } from "../index.js";
import type { HyperliquidPrimeConfig } from "../config.js";

/**
 * Build a HyperliquidPrime client from CLI options.
 */
export async function createContext(opts: {
  testnet?: boolean;
  key?: string;
  keyEnv?: string;
  logLevel?: string;
  builderFee?: boolean;
}): Promise<HyperliquidPrime> {
  const keyEnv = opts.keyEnv ?? "HP_PRIVATE_KEY";
  const keyFromCli = opts.key?.trim();
  const keyFromEnv = process.env[keyEnv]?.trim();
  const resolvedKey = keyFromCli || keyFromEnv;

  if (keyFromCli) {
    console.error(
      "Warning: --key exposes secrets in shell history/process listings. Prefer environment variables.",
    );
  }

  if (resolvedKey && !/^0x[0-9a-fA-F]{64}$/.test(resolvedKey)) {
    throw new Error(
      `Invalid private key format. Expected a 0x-prefixed 64-hex string (source: ${keyFromCli ? "--key" : keyEnv})`,
    );
  }

  const config: HyperliquidPrimeConfig = {
    testnet: opts.testnet ?? false,
    privateKey: resolvedKey as `0x${string}` | undefined,
    logLevel: (opts.logLevel as HyperliquidPrimeConfig["logLevel"]) ?? "warn",
    prettyLogs: true,
    builder: opts.builderFee === false ? null : undefined,
  };

  const hp = new HyperliquidPrime(config);
  await hp.connect();
  return hp;
}
