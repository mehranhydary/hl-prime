import fs from "node:fs/promises";
import path from "node:path";
import type { Network } from "../../../shared/types.js";
import type { ServerConfig } from "../config.js";
import { AgentStore, type StoredAgent } from "./agent-store.js";

export interface StoredSignerRecord extends StoredAgent {
  backend?: "local" | "privy";
  /** Privy wallet identifier for server-side signing backends. */
  privyWalletId?: string;
}

export interface SignerStore {
  save(record: StoredSignerRecord): Promise<void>;
  load(masterAddress: string, network: Network): Promise<StoredSignerRecord | null>;
  exists(masterAddress: string, network: Network): Promise<boolean>;
  delete(masterAddress: string, network: Network): Promise<void>;
}

function signerKey(masterAddress: string, network: Network): string {
  return `${masterAddress.toLowerCase()}_${network}`;
}

class LocalSignerStore implements SignerStore {
  constructor(private readonly agentStore: AgentStore) {}

  async save(record: StoredSignerRecord): Promise<void> {
    await this.agentStore.save({
      ...record,
      backend: "local",
    });
  }

  async load(masterAddress: string, network: Network): Promise<StoredSignerRecord | null> {
    const stored = await this.agentStore.load(masterAddress, network);
    if (!stored) return null;
    return {
      ...stored,
      backend: "local",
    };
  }

  async exists(masterAddress: string, network: Network): Promise<boolean> {
    return this.agentStore.exists(masterAddress, network);
  }

  async delete(masterAddress: string, network: Network): Promise<void> {
    await this.agentStore.delete(masterAddress, network);
  }
}

interface MetadataPayload {
  byKey: Record<string, Omit<StoredSignerRecord, "agentPrivateKey">>;
}

class PrivySignerStore implements SignerStore {
  private readonly filePath: string;
  private loaded = false;
  private byKey = new Map<string, Omit<StoredSignerRecord, "agentPrivateKey">>();

  constructor(
    dataDir: string,
    private readonly localStore: AgentStore | null,
  ) {
    this.filePath = path.join(dataDir, "signers.json");
  }

  async save(record: StoredSignerRecord): Promise<void> {
    await this.ensureLoaded();
    const key = signerKey(record.masterAddress, record.network);
    this.byKey.set(key, {
      backend: "privy",
      agentAddress: record.agentAddress,
      masterAddress: record.masterAddress,
      network: record.network,
      agentName: record.agentName,
      createdAt: record.createdAt,
      privyWalletId: record.privyWalletId,
    });
    if (this.localStore && record.agentPrivateKey) {
      await this.localStore.save({
        ...record,
        backend: "local",
      });
    }
    await this.flush();
  }

  async load(masterAddress: string, network: Network): Promise<StoredSignerRecord | null> {
    await this.ensureLoaded();
    const key = signerKey(masterAddress, network);
    const meta = this.byKey.get(key);
    if (meta) return { ...meta };

    // One-way migration helper: keep existing local records discoverable while migrating.
    if (this.localStore) {
      const local = await this.localStore.load(masterAddress, network);
      if (local) {
        const migrated: Omit<StoredSignerRecord, "agentPrivateKey"> = {
          backend: "privy",
          agentAddress: local.agentAddress,
          masterAddress: local.masterAddress,
          network: local.network,
          agentName: local.agentName,
          createdAt: local.createdAt,
        };
        this.byKey.set(key, migrated);
        await this.flush();
        return { ...migrated };
      }
    }

    return null;
  }

  async exists(masterAddress: string, network: Network): Promise<boolean> {
    return (await this.load(masterAddress, network)) !== null;
  }

  async delete(masterAddress: string, network: Network): Promise<void> {
    await this.ensureLoaded();
    const key = signerKey(masterAddress, network);
    this.byKey.delete(key);
    await this.flush();
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as MetadataPayload;
      for (const [key, value] of Object.entries(parsed.byKey ?? {})) {
        this.byKey.set(key, value);
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") throw error;
    }
  }

  private async flush(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const payload: MetadataPayload = {
      byKey: Object.fromEntries(this.byKey.entries()),
    };
    await fs.writeFile(this.filePath, JSON.stringify(payload, null, 2), "utf8");
  }
}

export function createSignerStore(config: ServerConfig): {
  signerStore: SignerStore;
  localStore: AgentStore | null;
} {
  const shouldInitLocalStore = Boolean(config.storePassphrase) && (
    config.signerBackend === "local" || config.signerLocalFallback
  );
  const localStore = shouldInitLocalStore
    ? new AgentStore(config.storePassphrase as string, config.dataDir)
    : null;

  if (config.signerBackend === "privy") {
    return {
      signerStore: new PrivySignerStore(config.dataDir, localStore),
      localStore,
    };
  }

  if (!localStore) {
    throw new Error("Local signer backend requires TRADER_STORE_PASSPHRASE");
  }

  return {
    signerStore: new LocalSignerStore(localStore),
    localStore,
  };
}
