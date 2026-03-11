import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetRuntimeStateStoreForTests,
  getRuntimeStateStore,
} from "../../apps/trader/server/src/services/runtime-state.js";

describe("trader runtime state sqlite encryption", () => {
  const sqlitePath = path.join(os.tmpdir(), `hl-prime-runtime-${Date.now()}.db`);

  beforeEach(() => {
    __resetRuntimeStateStoreForTests();
    process.env.TRADER_RUNTIME_STATE_BACKEND = "sqlite";
    process.env.TRADER_RUNTIME_STATE_SQLITE_PATH = sqlitePath;
    process.env.TRADER_APP_PASSWORD = "runtime-state-test-password";
  });

  afterEach(() => {
    __resetRuntimeStateStoreForTests();
    delete process.env.TRADER_RUNTIME_STATE_BACKEND;
    delete process.env.TRADER_RUNTIME_STATE_SQLITE_PATH;
    delete process.env.TRADER_APP_PASSWORD;
    for (const suffix of ["", "-wal", "-shm"]) {
      const fp = `${sqlitePath}${suffix}`;
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
  });

  it("stores session tokens and pending-agent payloads encrypted at rest", () => {
    const store = getRuntimeStateStore();
    const sessionToken = "session-token-plain";
    const sessionAddress = "0x1234567890123456789012345678901234567890";
    store.putSession({
      token: sessionToken,
      address: sessionAddress,
      expiresAt: Date.now() + 60_000,
    });
    store.putPendingAgent({
      id: "pending-1",
      agentPrivateKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      agentAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      agentName: "hlprime valid_until 999999999",
      createdAt: Date.now(),
    }, 60_000);

    const db = new Database(sqlitePath, { readonly: true });
    const sessionRow = db.prepare("SELECT token_hash as tokenHash, payload FROM sessions LIMIT 1").get() as
      | { tokenHash: string; payload: string }
      | undefined;
    const pendingRow = db.prepare("SELECT payload FROM pending_agents WHERE id = ?").get("pending-1") as
      | { payload: string }
      | undefined;
    db.close();

    expect(sessionRow).toBeDefined();
    expect(sessionRow?.tokenHash).not.toContain(sessionToken);
    expect(sessionRow?.payload).not.toContain(sessionToken);
    expect(sessionRow?.payload).not.toContain(sessionAddress);

    expect(pendingRow).toBeDefined();
    expect(pendingRow?.payload).not.toContain("agentPrivateKey");
    expect(pendingRow?.payload).not.toContain("aaaaaaaaaaaaaaaa");

    const loadedSession = store.getSession(sessionToken);
    expect(loadedSession?.address).toBe(sessionAddress);
    const loadedPending = store.getPendingAgent("pending-1");
    expect(loadedPending?.agentPrivateKey).toBe(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
  });

  it("takePendingAgent atomically retrieves and deletes", () => {
    const store = getRuntimeStateStore();
    store.putPendingAgent({
      id: "take-1",
      agentPrivateKey: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      agentAddress: "0xdddddddddddddddddddddddddddddddddddddddd",
      agentName: "hlprime take test",
      createdAt: Date.now(),
    }, 60_000);

    const taken = store.takePendingAgent("take-1");
    expect(taken).not.toBeNull();
    expect(taken!.agentPrivateKey).toBe(
      "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    );
    // Second take returns null (already deleted)
    expect(store.takePendingAgent("take-1")).toBeNull();
    expect(store.getPendingAgent("take-1")).toBeNull();
  });

  it("persists app access grants and expires them correctly", () => {
    const store = getRuntimeStateStore();
    const id = "grant-1";
    const expiresAt = Date.now() + 5_000;

    store.putAccessGrant(id, expiresAt);
    expect(store.hasAccessGrant(id)).toBe(true);
    expect(store.hasAccessGrant(id, expiresAt + 1)).toBe(false);
  });
});
