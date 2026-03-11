import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Network } from "../../../shared/types.js";
import { getRuntimeStateStore } from "./runtime-state.js";

export interface StoredAgent {
  agentPrivateKey?: `0x${string}`;
  agentAddress: `0x${string}`;
  masterAddress: `0x${string}`;
  network: Network;
  agentName: string;
  createdAt: number;
  backend?: "local" | "privy";
  privyWalletId?: string;
}

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(passphrase, salt, 100_000, KEY_LENGTH, "sha256");
}

function encrypt(data: string, passphrase: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(passphrase, salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: salt:iv:authTag:encrypted (all hex)
  return [
    salt.toString("hex"),
    iv.toString("hex"),
    authTag.toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
}

function decrypt(encoded: string, passphrase: string): string {
  const [saltHex, ivHex, authTagHex, encryptedHex] = encoded.split(":");
  const salt = Buffer.from(saltHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const key = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

export class AgentStore {
  private storeDir: string;
  private passphrase: string;

  constructor(passphrase: string, storeDir?: string) {
    this.passphrase = passphrase;
    this.storeDir = storeDir
      ?? process.env.TRADER_DATA_DIR
      ?? path.join(process.cwd(), ".data");
  }

  private filePath(masterAddress: string, network: Network): string {
    const key = `${masterAddress.toLowerCase()}_${network}`;
    return path.join(this.storeDir, `${key}.enc`);
  }

  async save(agent: StoredAgent): Promise<void> {
    await fs.mkdir(this.storeDir, { recursive: true });
    const data = JSON.stringify(agent);
    const encrypted = encrypt(data, this.passphrase);
    await fs.writeFile(this.filePath(agent.masterAddress, agent.network), encrypted, "utf8");
  }

  async load(masterAddress: string, network: Network): Promise<StoredAgent | null> {
    const fp = this.filePath(masterAddress, network);
    let encrypted: string;
    try {
      encrypted = await fs.readFile(fp, "utf8");
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") return null;
      throw error;
    }
    const data = decrypt(encrypted, this.passphrase);
    return JSON.parse(data) as StoredAgent;
  }

  async exists(masterAddress: string, network: Network): Promise<boolean> {
    try {
      await fs.access(this.filePath(masterAddress, network));
      return true;
    } catch {
      return false;
    }
  }

  async delete(masterAddress: string, network: Network): Promise<void> {
    const fp = this.filePath(masterAddress, network);
    try {
      await fs.unlink(fp);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") throw error;
    }
  }
}

// Pending agent store (in-memory, short-lived)
interface PendingAgent {
  id: string;
  agentPrivateKey: `0x${string}`;
  agentAddress: `0x${string}`;
  agentName: string;
  createdAt: number;
}

export class PendingAgentStore {
  private ttlMs: number;

  constructor(ttlMs = 3 * 60 * 1000) { // 3 min default
    this.ttlMs = ttlMs;
  }

  add(agent: PendingAgent): void {
    const store = getRuntimeStateStore();
    store.cleanupPendingAgents();
    const ageMs = Math.max(0, Date.now() - agent.createdAt);
    const remainingTtlMs = Math.max(0, this.ttlMs - ageMs);
    store.putPendingAgent(agent, remainingTtlMs);
  }

  get(id: string): PendingAgent | undefined {
    const store = getRuntimeStateStore();
    store.cleanupPendingAgents();
    return store.getPendingAgent(id) ?? undefined;
  }

  /** Atomic get-and-delete. Preferred over get()+remove() to minimize key exposure window. */
  take(id: string): PendingAgent | undefined {
    const store = getRuntimeStateStore();
    store.cleanupPendingAgents();
    return store.takePendingAgent(id) ?? undefined;
  }

  remove(id: string): void {
    getRuntimeStateStore().deletePendingAgent(id);
  }
}
