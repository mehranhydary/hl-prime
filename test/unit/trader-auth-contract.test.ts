import { describe, it, expect } from "vitest";
import {
  AUTH_AUDIENCE,
  AUTH_ALLOWED_CHAIN_IDS,
  AUTH_CHALLENGE_TTL_MS,
  AUTH_DOMAIN,
  AUTH_TYPES,
  AUTH_SIGNATURE_MAX_AGE_MS,
  SESSION_TTL_MS,
} from "../../apps/trader/shared/auth.js";

describe("auth contract constants", () => {
  it("has correct EIP-712 domain", () => {
    expect(AUTH_DOMAIN.name).toBe("HyperliquidPrime Trader");
    expect(AUTH_DOMAIN.version).toBe("2");
  });

  it("has correct EIP-712 type structure", () => {
    expect(AUTH_TYPES.Auth).toHaveLength(4);
    const fieldNames = AUTH_TYPES.Auth.map((f) => f.name);
    expect(fieldNames).toContain("address");
    expect(fieldNames).toContain("nonce");
    expect(fieldNames).toContain("issuedAt");
    expect(fieldNames).toContain("audience");
  });

  it("has correct field types", () => {
    const byName = Object.fromEntries(AUTH_TYPES.Auth.map((f) => [f.name, f.type]));
    expect(byName.address).toBe("address");
    expect(byName.nonce).toBe("string");
    expect(byName.issuedAt).toBe("uint256");
    expect(byName.audience).toBe("string");
  });

  it("has app and chain bindings", () => {
    expect(AUTH_AUDIENCE).toBe("hl-prime-trader");
    expect(AUTH_ALLOWED_CHAIN_IDS).toEqual([42161, 421614]);
  });

  it("challenge TTL is 5 minutes", () => {
    expect(AUTH_CHALLENGE_TTL_MS).toBe(5 * 60 * 1000);
  });

  it("signature max age is 5 minutes", () => {
    expect(AUTH_SIGNATURE_MAX_AGE_MS).toBe(5 * 60 * 1000);
  });

  it("session TTL is 24 hours", () => {
    expect(SESSION_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});
