import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { TradeHistoryStore } from "../../apps/trader/server/src/services/trade-history-store.js";
import type { TradeHistoryItem } from "../../apps/trader/shared/types.js";

function makeItem(overrides: Partial<TradeHistoryItem> = {}): TradeHistoryItem {
  return {
    intentId: "intent-1",
    createdAt: Date.now(),
    network: "mainnet",
    masterAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
    signerAddress: "0x1111111111111111111111111111111111111111",
    signerType: "agent",
    mode: "safe",
    side: "buy",
    asset: "TSLA",
    amountMode: "base",
    requestedAmount: 5,
    resolvedBaseSize: 5,
    resolvedUsdNotional: 2157.5,
    routeSummary: {
      isSingleLeg: true,
      legs: [],
      estimatedImpactBps: 0.5,
      estimatedFundingRate: 0.00001,
      builderFeeBps: 1,
      warnings: [],
    },
    legs: [],
    success: true,
    ...overrides,
  };
}

describe("TradeHistoryStore", () => {
  let tmpDir: string;
  let store: TradeHistoryStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trade-history-test-"));
    store = new TradeHistoryStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("appends and lists items", async () => {
    const item = makeItem();
    await store.append(item);

    const items = await store.list({
      masterAddress: item.masterAddress,
      network: "mainnet",
      limit: 10,
    });

    expect(items).toHaveLength(1);
    expect(items[0].intentId).toBe("intent-1");
  });

  it("writes JSONL file to disk", async () => {
    await store.append(makeItem());
    await store.append(makeItem({ intentId: "intent-2" }));

    const filePath = path.join(tmpDir, "trade-history.jsonl");
    expect(fs.existsSync(filePath)).toBe(true);

    const lines = fs.readFileSync(filePath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).intentId).toBe("intent-1");
    expect(JSON.parse(lines[1]).intentId).toBe("intent-2");
  });

  it("filters by masterAddress (case-insensitive)", async () => {
    await store.append(makeItem({ masterAddress: "0xAABB" }));
    await store.append(makeItem({ masterAddress: "0xCCDD", intentId: "other" }));

    const items = await store.list({
      masterAddress: "0xaabb",
      network: "mainnet",
      limit: 10,
    });

    expect(items).toHaveLength(1);
    expect(items[0].masterAddress).toBe("0xAABB");
  });

  it("filters by network", async () => {
    await store.append(makeItem({ network: "mainnet" }));
    await store.append(makeItem({ network: "testnet", intentId: "testnet-1" }));

    const mainnet = await store.list({
      masterAddress: makeItem().masterAddress,
      network: "mainnet",
      limit: 10,
    });
    const testnet = await store.list({
      masterAddress: makeItem().masterAddress,
      network: "testnet",
      limit: 10,
    });

    expect(mainnet).toHaveLength(1);
    expect(testnet).toHaveLength(1);
    expect(testnet[0].intentId).toBe("testnet-1");
  });

  it("respects limit", async () => {
    for (let i = 0; i < 10; i++) {
      await store.append(makeItem({ intentId: `item-${i}` }));
    }

    const items = await store.list({
      masterAddress: makeItem().masterAddress,
      network: "mainnet",
      limit: 3,
    });

    expect(items).toHaveLength(3);
  });

  it("returns most recent items first (reverse chronological)", async () => {
    for (let i = 0; i < 5; i++) {
      await store.append(makeItem({ intentId: `item-${i}` }));
    }

    const items = await store.list({
      masterAddress: makeItem().masterAddress,
      network: "mainnet",
      limit: 5,
    });

    // List iterates backwards, so last appended is first returned
    expect(items[0].intentId).toBe("item-4");
    expect(items[4].intentId).toBe("item-0");
  });

  it("clamps limit to max 200", async () => {
    await store.append(makeItem());
    const items = await store.list({
      masterAddress: makeItem().masterAddress,
      network: "mainnet",
      limit: 500,
    });
    // Should not throw, just return what's available
    expect(items).toHaveLength(1);
  });

  it("loads from existing JSONL file on fresh instance", async () => {
    // Write to first store
    await store.append(makeItem({ intentId: "persisted-1" }));
    await store.append(makeItem({ intentId: "persisted-2" }));

    // Create fresh store pointing to same dir
    const freshStore = new TradeHistoryStore(tmpDir);
    const items = await freshStore.list({
      masterAddress: makeItem().masterAddress,
      network: "mainnet",
      limit: 10,
    });

    expect(items).toHaveLength(2);
  });

  it("skips corrupt lines in JSONL file", async () => {
    // Write valid data + inject corrupt line
    await store.append(makeItem({ intentId: "valid-1" }));
    const filePath = path.join(tmpDir, "trade-history.jsonl");
    fs.appendFileSync(filePath, "NOT VALID JSON\n", "utf8");
    await store.append(makeItem({ intentId: "valid-2" }));

    // Fresh store should load valid lines and skip corrupt
    const freshStore = new TradeHistoryStore(tmpDir);
    const items = await freshStore.list({
      masterAddress: makeItem().masterAddress,
      network: "mainnet",
      limit: 10,
    });

    expect(items).toHaveLength(2);
    expect(items.map((i) => i.intentId)).toContain("valid-1");
    expect(items.map((i) => i.intentId)).toContain("valid-2");
  });

  it("handles empty JSONL file", async () => {
    const filePath = path.join(tmpDir, "trade-history.jsonl");
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(filePath, "", "utf8");

    const freshStore = new TradeHistoryStore(tmpDir);
    const items = await freshStore.list({
      masterAddress: "0x0000",
      network: "mainnet",
      limit: 10,
    });

    expect(items).toHaveLength(0);
  });

  it("returns empty list for no matching records", async () => {
    await store.append(makeItem());
    const items = await store.list({
      masterAddress: "0xdifferent",
      network: "mainnet",
      limit: 10,
    });
    expect(items).toHaveLength(0);
  });
});
