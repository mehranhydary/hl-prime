import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerConfig } from "../../apps/trader/server/src/config.js";
import {
  __createAppAccessTokenForTests,
  requireAppAccess,
  requireWebAppAccess,
} from "../../apps/trader/server/src/middleware/password-gate.js";
import { __resetRuntimeStateStoreForTests } from "../../apps/trader/server/src/services/runtime-state.js";

type MockResponse = Response & {
  statusCode: number;
  body?: unknown;
  redirectedTo?: string;
};

const APP_PASSWORD = "test-app-password";

function createConfig(): ServerConfig {
  return {
    appPassword: APP_PASSWORD,
  } as unknown as ServerConfig;
}

function createRequest(token?: string, originalUrl = "/markets"): Request {
  const headers: Record<string, string> = {};
  if (token) {
    headers.cookie = `trader_access_token=${encodeURIComponent(token)}`;
  }
  return {
    headers,
    get(name: string) {
      const key = name.toLowerCase();
      return headers[key] ?? headers[name] ?? undefined;
    },
    originalUrl,
    path: originalUrl.split("?")[0],
  } as unknown as Request;
}

function createMockResponse(): MockResponse {
  return {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    redirect(statusOrUrl: number | string, urlMaybe?: string) {
      if (typeof statusOrUrl === "number") {
        this.statusCode = statusOrUrl;
        this.redirectedTo = urlMaybe;
      } else {
        this.statusCode = 302;
        this.redirectedTo = statusOrUrl;
      }
      return this;
    },
  } as MockResponse;
}

describe("password gate middleware", () => {
  beforeEach(() => {
    process.env.TRADER_RUNTIME_STATE_BACKEND = "memory";
    __resetRuntimeStateStoreForTests();
  });

  afterEach(() => {
    delete process.env.TRADER_RUNTIME_STATE_BACKEND;
    __resetRuntimeStateStoreForTests();
    vi.unstubAllEnvs();
  });

  it("rejects API access when no token is present", () => {
    const middleware = requireAppAccess(createConfig());
    const req = createRequest();
    const res = createMockResponse();
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      error: "App access required",
      code: "APP_LOCKED",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts API access with a valid stateful app-access token", () => {
    const token = __createAppAccessTokenForTests(APP_PASSWORD);
    const middleware = requireAppAccess(createConfig());
    const req = createRequest(token);
    const res = createMockResponse();
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("rejects tokens missing an active access grant", () => {
    const token = __createAppAccessTokenForTests(APP_PASSWORD);
    __resetRuntimeStateStoreForTests();

    const middleware = requireAppAccess(createConfig());
    const req = createRequest(token);
    const res = createMockResponse();
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("redirects web routes to unlock with a preserved path when locked", () => {
    const middleware = requireWebAppAccess(createConfig());
    const req = createRequest(undefined, "/markets?tab=all");
    const res = createMockResponse();
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, res, next);

    expect(res.statusCode).toBe(302);
    expect(res.redirectedTo).toBe("/unlock?from=%2Fmarkets%3Ftab%3Dall");
    expect(next).not.toHaveBeenCalled();
  });

  it("allows web routes with valid app-access token", () => {
    const token = __createAppAccessTokenForTests(APP_PASSWORD);
    const middleware = requireWebAppAccess(createConfig());
    const req = createRequest(token, "/markets");
    const res = createMockResponse();
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
