import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderMonitor } from "../../src/execution/monitor.js";
import type { HLProvider } from "../../src/provider/provider.js";
import type { UserEvent } from "../../src/provider/types.js";
import pino from "pino";

const logger = pino({ level: "silent" });
const USER = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01";

function makeProvider(overrides: Partial<HLProvider> = {}): HLProvider {
  return {
    meta: vi.fn(),
    metaAndAssetCtxs: vi.fn(),
    perpDexs: vi.fn(),
    allPerpMetas: vi.fn(),
    spotMeta: vi.fn(),
    allMids: vi.fn(),
    l2Book: vi.fn(),
    clearinghouseState: vi.fn(),
    spotClearinghouseState: vi.fn(),
    openOrders: vi.fn(),
    frontendOpenOrders: vi.fn(),
    historicalOrders: vi.fn(),
    userFills: vi.fn(),
    userFillsByTime: vi.fn(),
    userFunding: vi.fn(),
    fundingHistory: vi.fn(),
    candleSnapshot: vi.fn(),
    referral: vi.fn(),
    subscribeL2Book: vi.fn(),
    subscribeAllMids: vi.fn(),
    subscribeTrades: vi.fn(),
    subscribeUserEvents: vi.fn(),
    placeOrder: vi.fn(),
    cancelOrder: vi.fn(),
    batchOrders: vi.fn(),
    setLeverage: vi.fn(),
    usdClassTransfer: vi.fn(),
    setDexAbstraction: vi.fn(),
    approveBuilderFee: vi.fn(),
    maxBuilderFee: vi.fn(),
    approveAgent: vi.fn(),
    extraAgents: vi.fn(),
    userSetAbstraction: vi.fn(),
    agentSetAbstraction: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    ...overrides,
  };
}

describe("OrderMonitor", () => {
  let capturedCallback: ((event: UserEvent) => void) | null;
  let mockUnsubscribe: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    capturedCallback = null;
    mockUnsubscribe = vi.fn().mockResolvedValue(undefined);
  });

  function makeMonitorWithProvider(): { monitor: OrderMonitor; provider: HLProvider } {
    const provider = makeProvider({
      subscribeUserEvents: vi.fn().mockImplementation((_user, cb) => {
        capturedCallback = cb;
        return Promise.resolve(mockUnsubscribe);
      }),
    });
    const monitor = new OrderMonitor(provider, logger);
    return { monitor, provider };
  }

  it("starts and subscribes to user events", async () => {
    const { monitor, provider } = makeMonitorWithProvider();
    await monitor.start(USER);

    expect(provider.subscribeUserEvents).toHaveBeenCalledWith(USER, expect.any(Function));
    expect(capturedCallback).not.toBeNull();
  });

  it("invokes fill callback when matching fill arrives", async () => {
    const { monitor } = makeMonitorWithProvider();
    await monitor.start(USER);

    const fillHandler = vi.fn();
    monitor.onFill(12345, fillHandler);

    capturedCallback!({
      fills: [{
        oid: 12345,
        coin: "BTC",
        side: "B",
        px: "42000",
        sz: "1.0",
        time: 1700000000000,
        startPosition: "0",
        dir: "Open Long",
        closedPnl: "0",
        hash: "0xabc",
        crossed: true,
        fee: "4.2",
        feeToken: "USDC",
        tid: 67890,
      }],
    });

    expect(fillHandler).toHaveBeenCalledOnce();
    expect(fillHandler).toHaveBeenCalledWith({
      orderId: 12345,
      coin: "BTC",
      side: "B",
      price: "42000",
      size: "1.0",
      timestamp: 1700000000000,
    });
  });

  it("does not invoke callback for untracked order IDs", async () => {
    const { monitor } = makeMonitorWithProvider();
    await monitor.start(USER);

    const fillHandler = vi.fn();
    monitor.onFill(99999, fillHandler);

    capturedCallback!({
      fills: [{
        oid: 12345,
        coin: "BTC",
        side: "B",
        px: "42000",
        sz: "1.0",
        time: 1700000000000,
        startPosition: "0",
        dir: "Open Long",
        closedPnl: "0",
        hash: "0xabc",
        crossed: true,
        fee: "4.2",
        feeToken: "USDC",
        tid: 67890,
      }],
    });

    expect(fillHandler).not.toHaveBeenCalled();
  });

  it("ignores events without fills", async () => {
    const { monitor } = makeMonitorWithProvider();
    await monitor.start(USER);

    const fillHandler = vi.fn();
    monitor.onFill(12345, fillHandler);

    // Funding event, no fills
    capturedCallback!({
      funding: {
        coin: "BTC",
        fundingRate: "0.00005",
        szi: "1.0",
        usdc: "-0.5",
        time: 1700000000000,
        hash: "0xabc",
        nSamples: 12,
      },
    });

    expect(fillHandler).not.toHaveBeenCalled();
  });

  it("handles multiple fills in one event", async () => {
    const { monitor } = makeMonitorWithProvider();
    await monitor.start(USER);

    const handler1 = vi.fn();
    const handler2 = vi.fn();
    monitor.onFill(100, handler1);
    monitor.onFill(200, handler2);

    capturedCallback!({
      fills: [
        { oid: 100, coin: "BTC", side: "B", px: "42000", sz: "0.5", time: 100, startPosition: "0", dir: "Open Long", closedPnl: "0", hash: "0xa", crossed: true, fee: "1", feeToken: "USDC", tid: 1 },
        { oid: 200, coin: "ETH", side: "A", px: "3200", sz: "2.0", time: 101, startPosition: "0", dir: "Open Short", closedPnl: "0", hash: "0xb", crossed: false, fee: "0.5", feeToken: "USDC", tid: 2 },
      ],
    });

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledWith(expect.objectContaining({ coin: "ETH", side: "A" }));
  });

  it("removeFillListener stops callbacks for that order", async () => {
    const { monitor } = makeMonitorWithProvider();
    await monitor.start(USER);

    const fillHandler = vi.fn();
    monitor.onFill(12345, fillHandler);
    monitor.removeFillListener(12345);

    capturedCallback!({
      fills: [
        { oid: 12345, coin: "BTC", side: "B", px: "42000", sz: "1.0", time: 100, startPosition: "0", dir: "Open Long", closedPnl: "0", hash: "0xa", crossed: true, fee: "1", feeToken: "USDC", tid: 1 },
      ],
    });

    expect(fillHandler).not.toHaveBeenCalled();
  });

  it("stop() unsubscribes and clears callbacks", async () => {
    const { monitor } = makeMonitorWithProvider();
    await monitor.start(USER);

    const fillHandler = vi.fn();
    monitor.onFill(12345, fillHandler);
    await monitor.stop();

    expect(mockUnsubscribe).toHaveBeenCalledOnce();
  });

  it("stop() is safe to call when not started", async () => {
    const { monitor } = makeMonitorWithProvider();
    // No start() call
    await expect(monitor.stop()).resolves.toBeUndefined();
  });

  it("stop() is safe to call twice", async () => {
    const { monitor } = makeMonitorWithProvider();
    await monitor.start(USER);
    await monitor.stop();
    await expect(monitor.stop()).resolves.toBeUndefined();
    expect(mockUnsubscribe).toHaveBeenCalledOnce();
  });
});
