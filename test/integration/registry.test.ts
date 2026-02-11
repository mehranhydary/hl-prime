import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NktkasProvider } from "../../src/provider/nktkas.js";
import { MarketRegistry } from "../../src/market/registry.js";
import { createLogger } from "../../src/logging/logger.js";

describe("MarketRegistry (testnet)", () => {
  let registry: MarketRegistry;
  let provider: NktkasProvider;

  beforeAll(async () => {
    provider = new NktkasProvider({ testnet: true });
    await provider.connect();
    registry = new MarketRegistry(
      provider,
      createLogger({ level: "silent" }),
    );
    await registry.discover();
  });

  afterAll(async () => {
    await provider.disconnect();
  });

  it("discovers at least one market", () => {
    const groups = registry.getAllGroups();
    expect(groups.length).toBeGreaterThan(0);
  });

  it("finds BTC and ETH markets", () => {
    expect(registry.getMarkets("BTC").length).toBeGreaterThan(0);
    expect(registry.getMarkets("ETH").length).toBeGreaterThan(0);
  });
});
