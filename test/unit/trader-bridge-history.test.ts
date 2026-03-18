import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { BridgeHistoryStore } from "../../apps/trader/server/src/services/bridge-history-store.js";
import type { BridgeHistoryItem } from "../../apps/trader/shared/types.js";

function makeItem(overrides: Partial<BridgeHistoryItem> = {}): BridgeHistoryItem {
  return {
    requestId: "req-1",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    network: "mainnet",
    masterAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
    destinationAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
    originChainId: 8453,
    originChainName: "Base",
    originCurrency: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    destinationChainId: 1337,
    destinationCurrency: "0x00000000000000000000000000000000",
    amount: "25",
    outputAmount: "24.92",
    feeUsd: "0.08",
    timeEstimateSec: 12,
    status: "waiting",
    txHashes: ["0xaaa"],
    tradeStatus: "not-started",
    ...overrides,
  };
}

describe("BridgeHistoryStore", () => {
  let tmpDir: string;
  let store: BridgeHistoryStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-history-test-"));
    store = new BridgeHistoryStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("appends and lists snapshots", async () => {
    const item = makeItem();
    await store.append(item);

    const items = await store.list({
      masterAddress: item.masterAddress,
      network: "mainnet",
      limit: 10,
    });

    expect(items).toHaveLength(1);
    expect(items[0].requestId).toBe("req-1");
    expect(items[0].status).toBe("waiting");
  });

  it("returns only the latest snapshot for each requestId", async () => {
    await store.append(makeItem({
      requestId: "req-1",
      status: "waiting",
      tradeStatus: "not-started",
      updatedAt: 1,
    }));
    await store.append(makeItem({
      requestId: "req-1",
      status: "success",
      tradeStatus: "success",
      txHashes: ["0xaaa", "0xbbb"],
      updatedAt: 2,
    }));
    await store.append(makeItem({
      requestId: "req-2",
      originChainName: "Ethereum",
      updatedAt: 3,
    }));

    const items = await store.list({
      masterAddress: makeItem().masterAddress,
      network: "mainnet",
      limit: 10,
    });

    expect(items).toHaveLength(2);
    expect(items[0].requestId).toBe("req-2");
    expect(items[1].requestId).toBe("req-1");
    expect(items[1].status).toBe("success");
    expect(items[1].tradeStatus).toBe("success");
    expect(items[1].txHashes).toEqual(["0xaaa", "0xbbb"]);
  });

  it("writes JSONL snapshots to disk", async () => {
    await store.append(makeItem({ requestId: "req-1" }));
    await store.append(makeItem({ requestId: "req-1", status: "success", updatedAt: 2 }));

    const filePath = path.join(tmpDir, "bridge-history.jsonl");
    expect(fs.existsSync(filePath)).toBe(true);

    const lines = fs.readFileSync(filePath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).requestId).toBe("req-1");
    expect(JSON.parse(lines[1]).status).toBe("success");
  });

  it("loads persisted snapshots and skips corrupt lines", async () => {
    await store.append(makeItem({ requestId: "req-1" }));
    const filePath = path.join(tmpDir, "bridge-history.jsonl");
    fs.appendFileSync(filePath, "NOT VALID JSON\n", "utf8");
    await store.append(makeItem({ requestId: "req-2", originChainName: "Ethereum" }));

    const freshStore = new BridgeHistoryStore(tmpDir);
    const items = await freshStore.list({
      masterAddress: makeItem().masterAddress,
      network: "mainnet",
      limit: 10,
    });

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.requestId)).toEqual(["req-2", "req-1"]);
  });
});
