import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NktkasProvider } from "../../src/provider/nktkas.js";

const runLive = process.env.LIVE_HL_TESTS === "1";
const describeLive = runLive ? describe : describe.skip;

describeLive("NktkasProvider (testnet live)", () => {
  let provider: NktkasProvider;

  beforeAll(async () => {
    provider = new NktkasProvider({ testnet: true });
    await provider.connect();
  });

  afterAll(async () => {
    await provider.disconnect();
  });

  it("fetches meta", async () => {
    const meta = await provider.meta();
    expect(meta.universe.length).toBeGreaterThan(0);
  });

  it("fetches metaAndAssetCtxs", async () => {
    const [meta, ctxs] = await provider.metaAndAssetCtxs();
    expect(meta.universe.length).toBeGreaterThan(0);
    expect(ctxs.length).toBe(meta.universe.length);
  });

  it("fetches l2Book for BTC", async () => {
    const book = await provider.l2Book("BTC");
    expect(book.coin).toBe("BTC");
    expect(book.levels[0].length).toBeGreaterThan(0); // bids
    expect(book.levels[1].length).toBeGreaterThan(0); // asks
  });

  it("fetches allMids", async () => {
    const mids = await provider.allMids();
    expect(Object.keys(mids).length).toBeGreaterThan(0);
  });
});
