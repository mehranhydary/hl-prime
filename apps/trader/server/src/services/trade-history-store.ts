import fs from "node:fs/promises";
import path from "node:path";
import type { Network, TradeHistoryItem } from "../../../shared/types.js";

interface ListHistoryOptions {
  masterAddress: string;
  network: Network;
  limit: number;
}

/**
 * Simple append-only JSONL store for clicked trade intents.
 * This keeps a durable local index without requiring a DB migration.
 */
export class TradeHistoryStore {
  private storeDir: string;
  private filePath: string;
  private loaded = false;
  private loading: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private records: TradeHistoryItem[] = [];

  constructor(storeDir?: string) {
    this.storeDir = storeDir
      ?? process.env.TRADER_DATA_DIR
      ?? path.join(process.cwd(), ".data");
    this.filePath = path.join(this.storeDir, "trade-history.jsonl");
  }

  async append(item: TradeHistoryItem): Promise<void> {
    await this.ensureLoaded();
    this.records.push(item);
    this.writeQueue = this.writeQueue.then(async () => {
      await this.ensureDir();
      await fs.appendFile(this.filePath, `${JSON.stringify(item)}\n`, "utf8");
    });
    await this.writeQueue;
  }

  async list(options: ListHistoryOptions): Promise<TradeHistoryItem[]> {
    await this.ensureLoaded();
    const address = options.masterAddress.toLowerCase();
    const limit = Math.max(1, Math.min(200, options.limit));
    const out: TradeHistoryItem[] = [];

    for (let i = this.records.length - 1; i >= 0; i -= 1) {
      const record = this.records[i];
      if (record.network !== options.network) continue;
      if (record.masterAddress.toLowerCase() !== address) continue;
      out.push(record);
      if (out.length >= limit) break;
    }

    return out;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      try {
        const raw = await fs.readFile(this.filePath, "utf8");
        if (!raw.trim()) return;

        const lines = raw.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            this.records.push(JSON.parse(trimmed) as TradeHistoryItem);
          } catch {
            // Ignore corrupt lines to keep history resilient.
          }
        }
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code !== "ENOENT") throw error;
      } finally {
        this.loaded = true;
      }
    })();

    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.storeDir, { recursive: true });
  }
}
