import { afterEach, describe, expect, it, vi } from "vitest";
import { RelayBridge, RelayBridgeError } from "../../src/bridge/relay.js";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("RelayBridge", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("filters and caches supported USDC origin chains", async () => {
    const fetchFn = vi.fn(async () => jsonResponse([
      {
        id: 1,
        name: "ethereum",
        displayName: "Ethereum",
        vmType: "evm",
        erc20Currencies: [
          { address: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", symbol: "USDC", decimals: 6, supportsPermit: true },
        ],
      },
      {
        id: 8453,
        name: "base",
        displayName: "Base",
        vmType: "evm",
        erc20Currencies: [
          { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", decimals: 6 },
        ],
      },
      {
        id: 1337,
        name: "hyperliquid",
        displayName: "Hyperliquid",
        vmType: "evm",
        erc20Currencies: [
          { address: "0x00000000000000000000000000000000", symbol: "USDC", decimals: 6 },
        ],
      },
      {
        id: 999,
        name: "solana-like",
        displayName: "Solana Like",
        vmType: "svm",
        erc20Currencies: [
          { address: "So11111111111111111111111111111111111111112", symbol: "USDC", decimals: 6 },
        ],
      },
    ]));

    const bridge = new RelayBridge({ fetchFn, chainsTtlMs: 60_000 });

    const first = await bridge.getSupportedChains();
    const second = await bridge.getSupportedChains();

    expect(first.map((chain) => chain.chainId)).toEqual([8453, 1]);
    expect(first[0]?.usdcAddress).toBe("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
    expect(first[1]?.supportsPermit).toBe(true);
    expect(second).toEqual(first);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("quotes a USDC bridge and falls back from /quote/v2 to /quote when needed", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse([
        {
          id: 8453,
          name: "base",
          displayName: "Base",
          vmType: "evm",
          erc20Currencies: [
            { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", decimals: 6 },
          ],
        },
      ]))
      .mockResolvedValueOnce(jsonResponse({ message: "not found" }, { status: 404 }))
      .mockResolvedValueOnce(jsonResponse({
        breakdown: { timeEstimate: 12 },
        details: {
          currencyIn: {
            amount: "10000000",
            amountUsd: "10",
            currency: { decimals: 6 },
          },
          currencyOut: {
            amount: "9950000",
            amountFormatted: "9.95",
            amountUsd: "9.95",
            currency: { decimals: 6 },
          },
        },
        fees: {
          gas: "20000",
          relayer: "30000",
          app: "0",
        },
        steps: [
          {
            id: "approve",
            items: [
              {
                check: { endpoint: "/intents/status/v3?requestId=req_123" },
                data: {
                  chainId: 8453,
                  to: "0x2222222222222222222222222222222222222222",
                  data: "0xabcdef",
                  value: "0",
                },
              },
            ],
          },
          {
            id: "deposit",
            requestId: "req_123",
            items: [
              {
                check: { endpoint: "/intents/status/v3?requestId=req_123" },
                data: {
                  chainId: 8453,
                  to: "0x3333333333333333333333333333333333333333",
                  data: "0x123456",
                  value: "0",
                  gas: "210000",
                },
              },
            ],
          },
        ],
      }));

    const bridge = new RelayBridge({ fetchFn });
    const quote = await bridge.quote({
      userAddress: "0x1111111111111111111111111111111111111111",
      originChainId: 8453,
      amount: "10",
    });

    expect(quote.requestId).toBe("req_123");
    expect(quote.outputAmount).toBe("9.95");
    expect(quote.fees.totalUsd).toBe("0.05");
    expect(quote.fees.gas).toBe("0.02");
    expect(quote.fees.relayer).toBe("0.03");
    expect(quote.steps).toHaveLength(2);
    expect(quote.steps[1]?.checkEndpoint).toBe("https://api.relay.link/intents/status/v3?requestId=req_123");

    const v2Call = fetchFn.mock.calls[1];
    const fallbackCall = fetchFn.mock.calls[2];
    expect(v2Call?.[0]).toBe("https://api.relay.link/quote/v2");
    expect(fallbackCall?.[0]).toBe("https://api.relay.link/quote");
    expect(v2Call?.[1]).toMatchObject({ method: "POST" });
    expect(fallbackCall?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(v2Call?.[1]?.body))).toMatchObject({
      originChainId: 8453,
      destinationChainId: 1337,
      toChainId: 1337,
      amount: "10000000",
    });
  });

  it("polls Relay status until a terminal bridge state is reached", async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ status: "pending", txHashes: [] }))
      .mockResolvedValueOnce(jsonResponse({ status: "submitted", txHashes: ["0xaaa"] }))
      .mockResolvedValueOnce(jsonResponse({
        requestId: "req_456",
        status: "success",
        txHashes: ["0xaaa", "0xbbb"],
        updatedAt: 123,
      }));

    const bridge = new RelayBridge({ fetchFn });
    const promise = bridge.pollStatus("req_456", { intervalMs: 1_000, timeoutMs: 10_000 });

    await vi.advanceTimersByTimeAsync(2_000);
    const status = await promise;

    expect(status.requestId).toBe("req_456");
    expect(status.status).toBe("success");
    expect(status.isTerminal).toBe(true);
    expect(status.txHashes).toEqual(["0xaaa", "0xbbb"]);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("throws on invalid human-readable bridge amounts", async () => {
    const fetchFn = vi.fn(async () => jsonResponse([
      {
        id: 8453,
        name: "base",
        displayName: "Base",
        vmType: "evm",
        erc20Currencies: [
          { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", decimals: 6 },
        ],
      },
    ]));

    const bridge = new RelayBridge({ fetchFn });

    await expect(
      bridge.quote({
        userAddress: "0x1111111111111111111111111111111111111111",
        originChainId: 8453,
        amount: "1.0000001",
      }),
    ).rejects.toBeInstanceOf(RelayBridgeError);
  });
});
