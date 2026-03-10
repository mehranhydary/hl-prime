import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { sessionAuth, __createSessionTokenForTests, __resetSessionsForTests } from "../../apps/trader/server/src/middleware/auth.js";
import { loadConfig } from "../../apps/trader/server/src/config.js";

type MockResponse = Response & {
  statusCode: number;
  body?: unknown;
};

function createMockResponse(): MockResponse {
  const res = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  } as MockResponse;
  return res;
}

function createRequest(
  token?: string,
  body: Record<string, unknown> = {},
  query: Record<string, unknown> = {},
): Request {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body,
    query,
  } as unknown as Request;
}

beforeEach(() => {
  vi.stubEnv("TRADER_RUNTIME_STATE_BACKEND", "memory");
  vi.stubEnv("TRADER_APP_PASSWORD", "test-app-password-1234");
  vi.stubEnv("TRADER_STORE_PASSPHRASE", "test-passphrase-1234");
});

afterEach(() => {
  __resetSessionsForTests();
  vi.unstubAllEnvs();
});

describe("Trader auth authorization integration", () => {
  it("rejects requests without bearer token when auth is enabled", () => {
    const middleware = sessionAuth();
    const req = createRequest();
    const res = createMockResponse();
    const nextSpy = vi.fn();
    const next = nextSpy as unknown as NextFunction;

    middleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(nextSpy).not.toHaveBeenCalled();
  });

  it("rejects mismatched masterAddress even with a valid bearer token", () => {
    const token = __createSessionTokenForTests("0x1234567890123456789012345678901234567890");
    const middleware = sessionAuth();
    const req = createRequest(
      token,
      { masterAddress: "0x1111111111111111111111111111111111111111" },
      {},
    );
    const res = createMockResponse();
    const nextSpy = vi.fn();
    const next = nextSpy as unknown as NextFunction;

    middleware(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(nextSpy).not.toHaveBeenCalled();
  });

  it("allows matching masterAddress with a valid bearer token", () => {
    const address = "0x1234567890123456789012345678901234567890";
    const token = __createSessionTokenForTests(address);
    const middleware = sessionAuth();
    const req = createRequest(token, { masterAddress: address }, {});
    const res = createMockResponse();
    const nextSpy = vi.fn();
    const next = nextSpy as unknown as NextFunction;

    middleware(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(nextSpy).toHaveBeenCalledTimes(1);
  });

  it("supports explicit insecure dev mode config with auth disabled", () => {
    vi.stubEnv("TRADER_DEV_INSECURE", "true");
    vi.stubEnv("TRADER_AUTH_ENABLED", "false");
    vi.stubEnv("TRADER_ALLOWED_ORIGINS", "");

    const config = loadConfig();
    expect(config.devInsecure).toBe(true);
    expect(config.authEnabled).toBe(false);
    expect(config.allowedOrigins).toEqual([]);
  });
});
