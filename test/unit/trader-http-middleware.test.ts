import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { memoryRateLimit } from "../../apps/trader/server/src/middleware/http.js";

type MockResponse = Response & {
  statusCode: number;
  body?: unknown;
};

function createMockResponse(): MockResponse {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  } as MockResponse & { headers: Record<string, string> };
  return res;
}

function createRequest(ip: string, forwardedFor?: string): Request {
  return {
    ip,
    socket: { remoteAddress: ip },
    headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
  } as unknown as Request;
}

describe("memoryRateLimit", () => {
  it("keys by req.ip and ignores spoofed x-forwarded-for headers", () => {
    const middleware = memoryRateLimit({
      keyPrefix: "limit",
      windowMs: 60_000,
      max: 1,
    });

    const nextSpy = vi.fn() as unknown as NextFunction;

    const req1 = createRequest("203.0.113.9", "1.1.1.1");
    const res1 = createMockResponse();
    middleware(req1, res1, nextSpy);
    expect(nextSpy).toHaveBeenCalledTimes(1);
    expect(res1.statusCode).toBe(200);

    // Different spoofed forwarded IP but same req.ip should still be limited.
    const req2 = createRequest("203.0.113.9", "8.8.8.8");
    const res2 = createMockResponse();
    middleware(req2, res2, nextSpy);
    expect(res2.statusCode).toBe(429);
  });

  it("allows distinct req.ip values independently", () => {
    const middleware = memoryRateLimit({
      keyPrefix: "limit2",
      windowMs: 60_000,
      max: 1,
    });

    const nextA = vi.fn() as unknown as NextFunction;
    const nextB = vi.fn() as unknown as NextFunction;

    middleware(createRequest("198.51.100.10"), createMockResponse(), nextA);
    middleware(createRequest("198.51.100.11"), createMockResponse(), nextB);

    expect(nextA).toHaveBeenCalledTimes(1);
    expect(nextB).toHaveBeenCalledTimes(1);
  });
});
