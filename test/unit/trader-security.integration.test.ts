import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { createApp } from "../../apps/trader/server/src/app.js";
import { loadConfig } from "../../apps/trader/server/src/config.js";
import { __resetSessionsForTests } from "../../apps/trader/server/src/middleware/auth.js";
import { __resetRuntimeStateStoreForTests } from "../../apps/trader/server/src/services/runtime-state.js";
import { AUTH_DOMAIN, AUTH_TYPES } from "../../apps/trader/shared/auth.js";

const TEST_APP_PASSWORD = "integration-test-password";
const TEST_PASS_PHRASE = "integration-test-passphrase-12345";
const TEST_WEB_INDEX = path.join(process.cwd(), "dist", "web", "index.html");
const TEST_WEB_MARKER = "trader-security-test-web-index";
const TEST_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f094538f29f3de0d4f5fd04f7f2c0f3e5b8f52a1";

const originalEnv = { ...process.env };

interface RunningServer {
  baseUrl: string;
  close: () => Promise<void>;
}

function getSetCookieHeaders(response: Response): string[] {
  const typed = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof typed.getSetCookie === "function") {
    return typed.getSetCookie();
  }
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

function cookieValueFromSetCookie(setCookies: string[], cookieName: string): string | null {
  for (const entry of setCookies) {
    const firstPart = entry.split(";")[0] ?? "";
    const index = firstPart.indexOf("=");
    if (index <= 0) continue;
    const name = firstPart.slice(0, index).trim();
    if (name !== cookieName) continue;
    return firstPart.slice(index + 1).trim();
  }
  return null;
}

function upsertCookies(jar: Map<string, string>, response: Response): void {
  for (const entry of getSetCookieHeaders(response)) {
    const firstPart = entry.split(";")[0] ?? "";
    const index = firstPart.indexOf("=");
    if (index <= 0) continue;
    const name = firstPart.slice(0, index).trim();
    const value = firstPart.slice(index + 1).trim();
    if (!name || !value) continue;
    jar.set(name, value);
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function startServer(): Promise<RunningServer> {
  __resetRuntimeStateStoreForTests();
  const config = loadConfig();
  const app = createApp(config);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo | string | null;
  if (!address || typeof address === "string") {
    throw new Error("Test server did not expose a TCP address");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

async function createAccessAndSession(baseUrl: string): Promise<{
  cookies: Map<string, string>;
  accountAddress: `0x${string}`;
}> {
  const cookies = new Map<string, string>();
  const account = privateKeyToAccount(TEST_PRIVATE_KEY);

  const accessRes = await fetch(`${baseUrl}/api/access/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: TEST_APP_PASSWORD }),
  });
  expect(accessRes.status).toBe(200);
  upsertCookies(cookies, accessRes);

  const challengeRes = await fetch(`${baseUrl}/api/auth/challenge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: cookieHeader(cookies),
    },
    body: JSON.stringify({
      address: account.address,
      chainId: 42161,
    }),
  });
  expect(challengeRes.status).toBe(200);
  const challenge = await challengeRes.json() as {
    nonce: string;
    issuedAt: number;
    chainId: number;
    audience: string;
  };

  const signature = await account.signTypedData({
    domain: {
      ...AUTH_DOMAIN,
      chainId: challenge.chainId,
    },
    types: AUTH_TYPES,
    primaryType: "Auth",
    message: {
      address: account.address,
      nonce: challenge.nonce,
      issuedAt: BigInt(challenge.issuedAt),
      audience: challenge.audience,
    },
  });

  const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: cookieHeader(cookies),
    },
    body: JSON.stringify({
      address: account.address,
      chainId: challenge.chainId,
      nonce: challenge.nonce,
      signature,
    }),
  });
  expect(sessionRes.status).toBe(200);
  upsertCookies(cookies, sessionRes);

  return {
    cookies,
    accountAddress: account.address,
  };
}

function ensureWebIndexFixture(): () => void {
  if (fs.existsSync(TEST_WEB_INDEX)) {
    return () => {};
  }

  fs.mkdirSync(path.dirname(TEST_WEB_INDEX), { recursive: true });
  fs.writeFileSync(
    TEST_WEB_INDEX,
    `<!doctype html><html><body>${TEST_WEB_MARKER}</body></html>`,
    "utf8",
  );

  return () => {
    if (!fs.existsSync(TEST_WEB_INDEX)) return;
    const content = fs.readFileSync(TEST_WEB_INDEX, "utf8");
    if (content.includes(TEST_WEB_MARKER)) {
      fs.unlinkSync(TEST_WEB_INDEX);
    }
  };
}

describe("trader security integration", () => {
  let cleanupWebFixture: (() => void) | null = null;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NODE_ENV = "test";
    delete process.env.RAILWAY_PROJECT_ID;
    delete process.env.RAILWAY_ENVIRONMENT;
    delete process.env.RAILWAY_ENVIRONMENT_NAME;

    process.env.TRADER_PORT = "0";
    process.env.TRADER_HOST = "127.0.0.1";
    process.env.TRADER_ALLOWED_ORIGINS = "http://127.0.0.1";
    process.env.TRADER_APP_PASSWORD = TEST_APP_PASSWORD;
    process.env.TRADER_STORE_PASSPHRASE = TEST_PASS_PHRASE;
    process.env.TRADER_SIGNER_BACKEND = "local";
    process.env.TRADER_SIGNER_LOCAL_FALLBACK = "false";
    process.env.TRADER_AUTH_ENABLED = "true";
    process.env.TRADER_DEV_INSECURE = "false";
    process.env.TRADER_RUNTIME_STATE_BACKEND = "memory";
    process.env.TRADER_DEFAULT_NETWORK = "mainnet";
    process.env.VITE_TRADER_AUTH_ENABLED = "true";
  });

  afterEach(() => {
    if (cleanupWebFixture) {
      cleanupWebFixture();
      cleanupWebFixture = null;
    }
    __resetSessionsForTests();
    __resetRuntimeStateStoreForTests();
    process.env = { ...originalEnv };
  });

  it("issues HttpOnly access/session cookies and accepts cookie-based auth on protected APIs", async () => {
    const running = await startServer();
    try {
      const cookies = new Map<string, string>();
      const account = privateKeyToAccount(TEST_PRIVATE_KEY);

      const accessRes = await fetch(`${running.baseUrl}/api/access/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: TEST_APP_PASSWORD }),
      });
      expect(accessRes.status).toBe(200);
      const accessSetCookies = getSetCookieHeaders(accessRes);
      expect(accessSetCookies.some((value) => value.startsWith("trader_access_token="))).toBe(true);
      expect(accessSetCookies.some((value) => value.includes("HttpOnly"))).toBe(true);
      expect(accessSetCookies.some((value) => value.includes("Path=/"))).toBe(true);
      upsertCookies(cookies, accessRes);

      const challengeRes = await fetch(`${running.baseUrl}/api/auth/challenge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: cookieHeader(cookies),
        },
        body: JSON.stringify({
          address: account.address,
          chainId: 42161,
        }),
      });
      expect(challengeRes.status).toBe(200);
      const challenge = await challengeRes.json() as {
        nonce: string;
        issuedAt: number;
        chainId: number;
        audience: string;
      };
      const signature = await account.signTypedData({
        domain: {
          ...AUTH_DOMAIN,
          chainId: challenge.chainId,
        },
        types: AUTH_TYPES,
        primaryType: "Auth",
        message: {
          address: account.address,
          nonce: challenge.nonce,
          issuedAt: BigInt(challenge.issuedAt),
          audience: challenge.audience,
        },
      });

      const sessionRes = await fetch(`${running.baseUrl}/api/auth/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: cookieHeader(cookies),
        },
        body: JSON.stringify({
          address: account.address,
          chainId: challenge.chainId,
          nonce: challenge.nonce,
          signature,
        }),
      });
      expect(sessionRes.status).toBe(200);
      const sessionSetCookies = getSetCookieHeaders(sessionRes);
      expect(sessionSetCookies.some((value) => value.startsWith("trader_session_token="))).toBe(true);
      expect(sessionSetCookies.some((value) => value.includes("HttpOnly"))).toBe(true);
      expect(sessionSetCookies.some((value) => value.includes("Path=/api"))).toBe(true);
      upsertCookies(cookies, sessionRes);

      const protectedRes = await fetch(
        `${running.baseUrl}/api/agent/status?masterAddress=${account.address}&network=mainnet`,
        {
          headers: {
            cookie: cookieHeader(cookies),
          },
        },
      );
      expect(protectedRes.status).toBe(200);
      const protectedBody = await protectedRes.json() as { configured: boolean };
      expect(protectedBody.configured).toBe(false);
    } finally {
      await running.close();
    }
  });

  it("revokes access grants on /api/access/logout so old access cookies are not replayable", async () => {
    const running = await startServer();
    try {
      const { cookies, accountAddress } = await createAccessAndSession(running.baseUrl);
      const staleAccessCookie = cookies.get("trader_access_token");
      const staleSessionCookie = cookies.get("trader_session_token");
      expect(staleAccessCookie).toBeTruthy();
      expect(staleSessionCookie).toBeTruthy();

      const logoutRes = await fetch(`${running.baseUrl}/api/access/logout`, {
        method: "POST",
        headers: {
          cookie: cookieHeader(cookies),
        },
      });
      expect(logoutRes.status).toBe(200);

      const replayRes = await fetch(
        `${running.baseUrl}/api/agent/status?masterAddress=${accountAddress}&network=mainnet`,
        {
          headers: {
            cookie: `trader_access_token=${staleAccessCookie}; trader_session_token=${staleSessionCookie}`,
          },
        },
      );
      expect(replayRes.status).toBe(401);
      const replayBody = await replayRes.json() as { code: string };
      expect(replayBody.code).toBe("APP_LOCKED");
    } finally {
      await running.close();
    }
  });

  it("revokes session tokens on /api/auth/logout so old session cookies are not replayable", async () => {
    const running = await startServer();
    try {
      const { cookies, accountAddress } = await createAccessAndSession(running.baseUrl);
      const staleSessionCookie = cookies.get("trader_session_token");
      expect(staleSessionCookie).toBeTruthy();

      const logoutRes = await fetch(`${running.baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: {
          cookie: cookieHeader(cookies),
        },
      });
      expect(logoutRes.status).toBe(200);

      const accessCookie = cookies.get("trader_access_token");
      const replayRes = await fetch(
        `${running.baseUrl}/api/agent/status?masterAddress=${accountAddress}&network=mainnet`,
        {
          headers: {
            cookie: `trader_access_token=${accessCookie}; trader_session_token=${staleSessionCookie}`,
          },
        },
      );
      expect(replayRes.status).toBe(401);
      const replayBody = await replayRes.json() as { code: string };
      expect(replayBody.code).toBe("AUTH_FAILED");
    } finally {
      await running.close();
    }
  });

  it("redirects locked non-landing web routes to /unlock and serves them after app unlock", async () => {
    cleanupWebFixture = ensureWebIndexFixture();
    const running = await startServer();
    try {
      const lockedRes = await fetch(`${running.baseUrl}/markets`, {
        redirect: "manual",
      });
      expect(lockedRes.status).toBe(302);
      expect(lockedRes.headers.get("location")).toBe("/unlock?from=%2Fmarkets");

      const cookies = new Map<string, string>();
      const accessRes = await fetch(`${running.baseUrl}/api/access/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: TEST_APP_PASSWORD }),
      });
      expect(accessRes.status).toBe(200);
      upsertCookies(cookies, accessRes);

      const unlockedRes = await fetch(`${running.baseUrl}/markets`, {
        headers: {
          cookie: cookieHeader(cookies),
        },
      });
      expect(unlockedRes.status).toBe(200);
      const html = await unlockedRes.text();
      expect(html).toContain(TEST_WEB_MARKER);
    } finally {
      await running.close();
    }
  });

  it("invalidates session cookie immediately after auth logout in route-level checks", async () => {
    // Extra regression check: /api/auth/logout should clear only session and keep access gate active.
    const running = await startServer();
    try {
      const { cookies, accountAddress } = await createAccessAndSession(running.baseUrl);
      const logoutRes = await fetch(`${running.baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: { cookie: cookieHeader(cookies) },
      });
      expect(logoutRes.status).toBe(200);

      const setCookies = getSetCookieHeaders(logoutRes);
      const clearedSession = cookieValueFromSetCookie(setCookies, "trader_session_token");
      expect(clearedSession).toBe("");

      const routeRes = await fetch(
        `${running.baseUrl}/api/agent/status?masterAddress=${accountAddress}&network=mainnet`,
        {
          headers: { cookie: cookieHeader(cookies) },
        },
      );
      expect(routeRes.status).toBe(401);
    } finally {
      await running.close();
    }
  });
});
