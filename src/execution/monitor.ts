import type { HLProvider } from "../provider/provider.js";
import type { Logger } from "../logging/logger.js";

/**
 * Monitors order status via WebSocket user events.
 * v0: Basic implementation — tracks fills for SDK-placed orders.
 */
export class OrderMonitor {
  private logger: Logger;
  private unsubscribe: (() => Promise<void>) | null = null;
  private orderCallbacks = new Map<number, (fill: OrderFillEvent) => void>();

  constructor(
    private provider: HLProvider,
    logger: Logger,
  ) {
    this.logger = logger.child({ module: "monitor" });
  }

  async start(userAddress: string): Promise<void> {
    this.unsubscribe = await this.provider.subscribeUserEvents(
      userAddress,
      (event) => {
        if (event.fills) {
          for (const fill of event.fills) {
            this.logger.debug(
              { oid: fill.oid, coin: fill.coin, sz: fill.sz },
              "Fill received",
            );
            const cb = this.orderCallbacks.get(fill.oid);
            if (cb) {
              cb({
                orderId: fill.oid,
                coin: fill.coin,
                side: fill.side,
                price: fill.px,
                size: fill.sz,
                timestamp: fill.time,
              });
            }
          }
        }
      },
    );
    this.logger.info("Order monitor started");
  }

  onFill(orderId: number, callback: (fill: OrderFillEvent) => void): void {
    this.orderCallbacks.set(orderId, callback);
  }

  removeFillListener(orderId: number): void {
    this.orderCallbacks.delete(orderId);
  }

  async stop(): Promise<void> {
    if (this.unsubscribe) {
      await this.unsubscribe();
      this.unsubscribe = null;
    }
    this.orderCallbacks.clear();
    this.logger.info("Order monitor stopped");
  }
}

export interface OrderFillEvent {
  orderId: number;
  coin: string;
  side: string;
  price: string;
  size: string;
  timestamp: number;
}
