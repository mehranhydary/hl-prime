import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { AgentStore, PendingAgentStore } from "../../apps/trader/server/src/services/agent-store.js";

describe("AgentStore", () => {
  let tmpDir: string;
  let store: AgentStore;
  const passphrase = "test-passphrase-12345678";

  const agent = {
    agentPrivateKey: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" as `0x${string}`,
    agentAddress: "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`,
    masterAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as `0x${string}`,
    network: "mainnet" as const,
    agentName: "hlprime valid_until 1700000000000",
    createdAt: Date.now(),
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-store-test-"));
    store = new AgentStore(passphrase, tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("saves and loads agent credentials", async () => {
    await store.save(agent);
    const loaded = await store.load(agent.masterAddress, agent.network);

    expect(loaded).not.toBeNull();
    expect(loaded!.agentPrivateKey).toBe(agent.agentPrivateKey);
    expect(loaded!.agentAddress).toBe(agent.agentAddress);
    expect(loaded!.masterAddress).toBe(agent.masterAddress);
    expect(loaded!.network).toBe(agent.network);
    expect(loaded!.agentName).toBe(agent.agentName);
  });

  it("encrypts the stored file (not plain JSON)", async () => {
    await store.save(agent);
    const files = fs.readdirSync(tmpDir);
    expect(files).toHaveLength(1);
    const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf8");
    // Should be hex format: salt:iv:authTag:encrypted
    expect(content.split(":")).toHaveLength(4);
    // Should NOT be readable JSON
    expect(() => JSON.parse(content)).toThrow();
  });

  it("reports existence correctly", async () => {
    expect(await store.exists(agent.masterAddress, agent.network)).toBe(false);
    await store.save(agent);
    expect(await store.exists(agent.masterAddress, agent.network)).toBe(true);
  });

  it("returns null when loading non-existent agent", async () => {
    const loaded = await store.load("0xdeadbeef", "mainnet");
    expect(loaded).toBeNull();
  });

  it("deletes stored agent", async () => {
    await store.save(agent);
    expect(await store.exists(agent.masterAddress, agent.network)).toBe(true);
    await store.delete(agent.masterAddress, agent.network);
    expect(await store.exists(agent.masterAddress, agent.network)).toBe(false);
  });

  it("delete is idempotent for non-existent agent", async () => {
    await expect(store.delete("0xdeadbeef", "mainnet")).resolves.not.toThrow();
  });

  it("rejects wrong passphrase", async () => {
    await store.save(agent);
    const wrongStore = new AgentStore("wrong-passphrase-12345678", tmpDir);
    await expect(wrongStore.load(agent.masterAddress, agent.network)).rejects.toThrow();
  });

  it("normalizes address to lowercase for file path", async () => {
    await store.save(agent);
    const files = fs.readdirSync(tmpDir);
    expect(files[0]).toContain(agent.masterAddress.toLowerCase());
  });

  it("separates agents by network", async () => {
    await store.save(agent);
    const testnetAgent = { ...agent, network: "testnet" as const };
    await store.save(testnetAgent);

    const files = fs.readdirSync(tmpDir);
    expect(files).toHaveLength(2);

    const mainnet = await store.load(agent.masterAddress, "mainnet");
    const testnet = await store.load(agent.masterAddress, "testnet");
    expect(mainnet).not.toBeNull();
    expect(testnet).not.toBeNull();
  });

  it("overwrites existing agent on re-save", async () => {
    await store.save(agent);
    const updatedAgent = { ...agent, agentName: "updated name" };
    await store.save(updatedAgent);

    const loaded = await store.load(agent.masterAddress, agent.network);
    expect(loaded!.agentName).toBe("updated name");
  });
});

describe("PendingAgentStore", () => {
  it("adds and retrieves pending agent", () => {
    const store = new PendingAgentStore();
    const pending = {
      id: "test-id-123",
      agentPrivateKey: "0xdeadbeef" as `0x${string}`,
      agentAddress: "0x1234" as `0x${string}`,
      agentName: "test agent",
      createdAt: Date.now(),
    };

    store.add(pending);
    const retrieved = store.get(pending.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(pending.id);
    expect(retrieved!.agentAddress).toBe(pending.agentAddress);
  });

  it("removes pending agent", () => {
    const store = new PendingAgentStore();
    const pending = {
      id: "test-id-456",
      agentPrivateKey: "0xdeadbeef" as `0x${string}`,
      agentAddress: "0x1234" as `0x${string}`,
      agentName: "test agent",
      createdAt: Date.now(),
    };

    store.add(pending);
    store.remove(pending.id);
    expect(store.get(pending.id)).toBeUndefined();
  });

  it("returns undefined for unknown id", () => {
    const store = new PendingAgentStore();
    expect(store.get("unknown")).toBeUndefined();
  });

  it("expires entries after TTL", () => {
    // Use a very short TTL
    const store = new PendingAgentStore(1);
    const pending = {
      id: "expire-test",
      agentPrivateKey: "0xdeadbeef" as `0x${string}`,
      agentAddress: "0x1234" as `0x${string}`,
      agentName: "test agent",
      createdAt: Date.now() - 100, // Created 100ms ago, well past 1ms TTL
    };

    store.add(pending);
    // Cleanup triggers on next add/get
    expect(store.get(pending.id)).toBeUndefined();
  });

  it("does not expire recent entries", () => {
    const store = new PendingAgentStore(60_000);
    const pending = {
      id: "recent-test",
      agentPrivateKey: "0xdeadbeef" as `0x${string}`,
      agentAddress: "0x1234" as `0x${string}`,
      agentName: "test agent",
      createdAt: Date.now(),
    };

    store.add(pending);
    expect(store.get(pending.id)).toBeDefined();
  });
});
