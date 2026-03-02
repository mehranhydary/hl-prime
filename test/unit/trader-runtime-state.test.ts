import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetRuntimeStateStoreForTests,
  getRuntimeStateStore,
} from "../../apps/trader/server/src/services/runtime-state.js";

describe("trader runtime state auth challenges", () => {
  beforeEach(() => {
    __resetRuntimeStateStoreForTests();
    process.env.TRADER_RUNTIME_STATE_BACKEND = "memory";
  });

  afterEach(() => {
    delete process.env.TRADER_RUNTIME_STATE_BACKEND;
    __resetRuntimeStateStoreForTests();
  });

  it("consumes each auth challenge nonce at most once", () => {
    const store = getRuntimeStateStore();
    const challenge = {
      nonce: "challenge-once",
      address: "0x1234567890123456789012345678901234567890",
      chainId: 42161,
      issuedAt: Date.now(),
    };

    store.putAuthChallenge(challenge, 60_000);

    expect(store.takeAuthChallenge(challenge.nonce)).toEqual(challenge);
    expect(store.takeAuthChallenge(challenge.nonce)).toBeNull();
  });

  it("does not return expired auth challenges", () => {
    const store = getRuntimeStateStore();
    const challenge = {
      nonce: "challenge-expired",
      address: "0x1234567890123456789012345678901234567890",
      chainId: 42161,
      issuedAt: Date.now(),
    };

    store.putAuthChallenge(challenge, 1_000);
    expect(store.takeAuthChallenge(challenge.nonce, Date.now() + 5_000)).toBeNull();
  });

  it("tracks and expires app access grants", () => {
    const store = getRuntimeStateStore();
    const id = "access-grant-1";
    const expiresAt = Date.now() + 1_000;

    store.putAccessGrant(id, expiresAt);
    expect(store.hasAccessGrant(id)).toBe(true);
    expect(store.hasAccessGrant(id, expiresAt + 1)).toBe(false);
  });
});
