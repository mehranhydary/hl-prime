import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NktkasProvider } from "../../src/provider/nktkas.js";
import { MarketRegistry } from "../../src/market/registry.js";
import { createLogger } from "../../src/logging/logger.js";

const runLive = process.env.LIVE_HL_TESTS === "1";
const describeLive = runLive ? describe : describe.skip;

describeLive("MarketRegistry (testnet live)", () => {
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
