import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import type { ServerConfig } from "../config.js";
import type { Network } from "../../../shared/types.js";

export interface SessionState {
  token: string;
  address: string;
  expiresAt: number;
}

export interface AuthChallengeState {
  nonce: string;
  address: string;
  chainId: number;
  issuedAt: number;
}

export interface PendingAgentState {
  id: string;
  agentPrivateKey?: `0x${string}`;
  agentAddress: `0x${string}`;
  agentName: string;
  createdAt: number;
  privyWalletId?: string;
  ownerPrivyUserId?: string;
  masterAddress?: `0x${string}`;
  network?: Network;
}

export interface WSTicketState {
  token: string;
  address: string;
  network: Network;
  expiresAt: number;
}

export interface RuntimeStateStore {
  putSession(session: SessionState): void;
  getSession(token: string): SessionState | null;
  deleteSession(token: string): void;
  cleanupSessions(now?: number): void;

  putAccessGrant(id: string, expiresAt: number): void;
  hasAccessGrant(id: string, now?: number): boolean;
  deleteAccessGrant(id: string): void;
  cleanupAccessGrants(now?: number): void;

  putAuthChallenge(challenge: AuthChallengeState, ttlMs: number): void;
  takeAuthChallenge(nonce: string, now?: number): AuthChallengeState | null;
  cleanupAuthChallenges(now?: number): void;

  putPendingAgent(agent: PendingAgentState, ttlMs: number): void;
  getPendingAgent(id: string): PendingAgentState | null;
  findPendingAgent(
    masterAddress: `0x${string}`,
    network: Network,
    ownerPrivyUserId?: string,
  ): PendingAgentState | null;
  /** Atomic get-and-delete: returns the pending agent and scrubs the key in one step. */
  takePendingAgent(id: string): PendingAgentState | null;
  deletePendingAgent(id: string): void;
  cleanupPendingAgents(now?: number): void;

  putWSTicket(ticket: WSTicketState): void;
  takeWSTicket(token: string, now?: number): WSTicketState | null;
  cleanupWSTickets(now?: number): void;

  putQuote<T>(id: string, quote: T, ttlMs: number): void;
  getQuote<T>(id: string): T | null;
  /** Atomic get-and-delete: returns the quote and removes it in one step. */
  takeQuote<T>(id: string): T | null;
  deleteQuote(id: string): void;
  cleanupQuotes(now?: number): void;

  close(): void;
  clearAllForTests(): void;
}

const STATE_CIPHER = "aes-256-gcm";
const STATE_KEY_BYTES = 32;
const STATE_SALT_BYTES = 16;
const STATE_IV_BYTES = 12;
const STATE_PBKDF2_ITERS = 120_000;
const STATE_ENC_PREFIX = "v1";

function deriveStateKey(secret: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(secret, salt, STATE_PBKDF2_ITERS, STATE_KEY_BYTES, "sha256");
}

function encryptStatePayload(payload: string, secret: string): string {
  const salt = crypto.randomBytes(STATE_SALT_BYTES);
  const iv = crypto.randomBytes(STATE_IV_BYTES);
  const key = deriveStateKey(secret, salt);
  const cipher = crypto.createCipheriv(STATE_CIPHER, key, iv);
  const ciphertext = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    STATE_ENC_PREFIX,
    salt.toString("hex"),
    iv.toString("hex"),
    authTag.toString("hex"),
    ciphertext.toString("hex"),
  ].join(":");
}

function decryptStatePayload(encoded: string, secret: string): string {
  const parts = encoded.split(":");
  if (parts[0] !== STATE_ENC_PREFIX || parts.length !== 5) {
    // Legacy plaintext payloads (before runtime-state encryption rollout).
    return encoded;
  }
  const [, saltHex, ivHex, authTagHex, ciphertextHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const key = deriveStateKey(secret, salt);
  const decipher = crypto.createDecipheriv(STATE_CIPHER, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext, undefined, "utf8") + decipher.final("utf8");
}

function tokenHash(token: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(token).digest("hex");
}

/** Best-effort: overwrite the key property so the plaintext reference is no longer reachable via the store. */
function scrubAgentKey(agent: PendingAgentState): void {
  if (agent.agentPrivateKey) {
    (agent as { agentPrivateKey: string }).agentPrivateKey = "0x" + "0".repeat(64);
  }
}

function warnIfOrphanedPendingAgent(agent: PendingAgentState): void {
  if (agent.privyWalletId && !agent.agentPrivateKey) {
    console.warn(
      `[runtime-state] Pending Privy agent expired without completion: walletId=${agent.privyWalletId} address=${agent.agentAddress}`,
    );
  }
}

function matchesPendingAgent(params: {
  agent: PendingAgentState;
  masterAddress: `0x${string}`;
  network: Network;
  ownerPrivyUserId?: string;
}): boolean {
  const { agent, masterAddress, network, ownerPrivyUserId } = params;
  if (!agent.masterAddress || !agent.network) return false;
  if (agent.masterAddress.toLowerCase() !== masterAddress.toLowerCase()) return false;
  if (agent.network !== network) return false;
  if (ownerPrivyUserId && agent.ownerPrivyUserId !== ownerPrivyUserId) return false;
  return true;
}

class MemoryRuntimeStateStore implements RuntimeStateStore {
  private sessions = new Map<string, SessionState>();
  private accessGrants = new Map<string, number>();
  private authChallenges = new Map<string, { payload: AuthChallengeState; expiresAt: number }>();
  private pendingAgents = new Map<string, { payload: PendingAgentState; expiresAt: number }>();
  private wsTickets = new Map<string, WSTicketState>();
  private quotes = new Map<string, { payload: unknown; expiresAt: number }>();
  private readonly secret: string;

  constructor(secret: string) {
    this.secret = secret;
  }

  putSession(session: SessionState): void {
    this.sessions.set(tokenHash(session.token, this.secret), session);
  }

  getSession(token: string): SessionState | null {
    return this.sessions.get(tokenHash(token, this.secret)) ?? null;
  }

  deleteSession(token: string): void {
    this.sessions.delete(tokenHash(token, this.secret));
  }

  cleanupSessions(now = Date.now()): void {
    for (const [token, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) this.sessions.delete(token);
    }
  }

  putAccessGrant(id: string, expiresAt: number): void {
    this.accessGrants.set(id, expiresAt);
  }

  hasAccessGrant(id: string, now = Date.now()): boolean {
    const expiresAt = this.accessGrants.get(id);
    if (expiresAt === undefined) return false;
    if (expiresAt <= now) {
      this.accessGrants.delete(id);
      return false;
    }
    return true;
  }

  deleteAccessGrant(id: string): void {
    this.accessGrants.delete(id);
  }

  cleanupAccessGrants(now = Date.now()): void {
    for (const [id, expiresAt] of this.accessGrants.entries()) {
      if (expiresAt <= now) this.accessGrants.delete(id);
    }
  }

  putAuthChallenge(challenge: AuthChallengeState, ttlMs: number): void {
    this.authChallenges.set(challenge.nonce, { payload: challenge, expiresAt: Date.now() + ttlMs });
  }

  takeAuthChallenge(nonce: string, now = Date.now()): AuthChallengeState | null {
    const found = this.authChallenges.get(nonce);
    if (!found) return null;
    this.authChallenges.delete(nonce);
    if (found.expiresAt <= now) return null;
    return found.payload;
  }

  cleanupAuthChallenges(now = Date.now()): void {
    for (const [nonce, value] of this.authChallenges.entries()) {
      if (value.expiresAt <= now) this.authChallenges.delete(nonce);
    }
  }

  putPendingAgent(agent: PendingAgentState, ttlMs: number): void {
    this.pendingAgents.set(agent.id, { payload: agent, expiresAt: Date.now() + ttlMs });
  }

  getPendingAgent(id: string): PendingAgentState | null {
    const found = this.pendingAgents.get(id);
    if (!found) return null;
    if (found.expiresAt <= Date.now()) {
      warnIfOrphanedPendingAgent(found.payload);
      scrubAgentKey(found.payload);
      this.pendingAgents.delete(id);
      return null;
    }
    return found.payload;
  }

  findPendingAgent(
    masterAddress: `0x${string}`,
    network: Network,
    ownerPrivyUserId?: string,
  ): PendingAgentState | null {
    let newest: PendingAgentState | null = null;
    const now = Date.now();
    for (const [id, found] of this.pendingAgents.entries()) {
      if (found.expiresAt <= now) {
        warnIfOrphanedPendingAgent(found.payload);
        scrubAgentKey(found.payload);
        this.pendingAgents.delete(id);
        continue;
      }
      if (!matchesPendingAgent({ agent: found.payload, masterAddress, network, ownerPrivyUserId })) {
        continue;
      }
      if (!newest || found.payload.createdAt > newest.createdAt) {
        newest = found.payload;
      }
    }
    return newest;
  }

  takePendingAgent(id: string): PendingAgentState | null {
    const found = this.pendingAgents.get(id);
    if (!found) return null;
    this.pendingAgents.delete(id);
    if (found.expiresAt <= Date.now()) {
      warnIfOrphanedPendingAgent(found.payload);
      scrubAgentKey(found.payload);
      return null;
    }
    return found.payload;
  }

  deletePendingAgent(id: string): void {
    const found = this.pendingAgents.get(id);
    if (found) {
      warnIfOrphanedPendingAgent(found.payload);
      scrubAgentKey(found.payload);
    }
    this.pendingAgents.delete(id);
  }

  cleanupPendingAgents(now = Date.now()): void {
    for (const [id, value] of this.pendingAgents.entries()) {
      if (value.expiresAt <= now) {
        warnIfOrphanedPendingAgent(value.payload);
        scrubAgentKey(value.payload);
        this.pendingAgents.delete(id);
      }
    }
  }

  putWSTicket(ticket: WSTicketState): void {
    this.wsTickets.set(ticket.token, ticket);
  }

  takeWSTicket(token: string, now = Date.now()): WSTicketState | null {
    const found = this.wsTickets.get(token);
    if (!found) return null;
    this.wsTickets.delete(token);
    if (found.expiresAt <= now) return null;
    return found;
  }

  cleanupWSTickets(now = Date.now()): void {
    for (const [token, ticket] of this.wsTickets.entries()) {
      if (ticket.expiresAt <= now) this.wsTickets.delete(token);
    }
  }

  putQuote<T>(id: string, quote: T, ttlMs: number): void {
    this.quotes.set(id, { payload: quote, expiresAt: Date.now() + ttlMs });
  }

  getQuote<T>(id: string): T | null {
    const found = this.quotes.get(id);
    if (!found) return null;
    if (found.expiresAt <= Date.now()) {
      this.quotes.delete(id);
      return null;
    }
    return found.payload as T;
  }

  takeQuote<T>(id: string): T | null {
    const found = this.quotes.get(id);
    if (!found) return null;
    this.quotes.delete(id);
    if (found.expiresAt <= Date.now()) return null;
    return found.payload as T;
  }

  deleteQuote(id: string): void {
    this.quotes.delete(id);
  }

  cleanupQuotes(now = Date.now()): void {
    for (const [id, value] of this.quotes.entries()) {
      if (value.expiresAt <= now) this.quotes.delete(id);
    }
  }

  close(): void {
    // No-op for in-memory store.
  }

  clearAllForTests(): void {
    this.sessions.clear();
    this.accessGrants.clear();
    this.authChallenges.clear();
    this.pendingAgents.clear();
    this.wsTickets.clear();
    this.quotes.clear();
  }
}

class SqliteRuntimeStateStore implements RuntimeStateStore {
  private db: Database.Database;
  private readonly storageSecret: string;

  constructor(sqlitePath: string, storageSecret: string) {
    let resolved = path.resolve(sqlitePath);
    try {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        resolved = path.join(resolved, "runtime-state.db");
      }
    } catch {
      // Best-effort normalization; sqlite open error is handled by caller.
    }
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.storageSecret = storageSecret;
    this.db = new Database(resolved);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS auth_challenges (
        nonce TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS access_grants (
        id TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pending_agents (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ws_tickets (
        token_hash TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS quotes (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_auth_challenges_expires_at ON auth_challenges(expires_at);
      CREATE INDEX IF NOT EXISTS idx_access_grants_expires_at ON access_grants(expires_at);
      CREATE INDEX IF NOT EXISTS idx_pending_agents_expires_at ON pending_agents(expires_at);
      CREATE INDEX IF NOT EXISTS idx_ws_tickets_expires_at ON ws_tickets(expires_at);
      CREATE INDEX IF NOT EXISTS idx_quotes_expires_at ON quotes(expires_at);
    `);
    this.migrateLegacySessionsSchema();
    this.migrateLegacyPendingAgentPayloads();
  }

  putSession(session: SessionState): void {
    const payload = encryptStatePayload(JSON.stringify(session), this.storageSecret);
    const tokenDigest = tokenHash(session.token, this.storageSecret);
    this.db.prepare(`
      INSERT INTO sessions(token_hash, payload, expires_at)
      VALUES(@tokenHash, @payload, @expiresAt)
      ON CONFLICT(token_hash) DO UPDATE SET payload=@payload, expires_at=@expiresAt
    `).run({
      tokenHash: tokenDigest,
      payload,
      expiresAt: session.expiresAt,
    });
  }

  getSession(token: string): SessionState | null {
    const tokenDigest = tokenHash(token, this.storageSecret);
    const row = this.db.prepare(`
      SELECT payload, expires_at as expiresAt
      FROM sessions
      WHERE token_hash = ?
    `).get(tokenDigest) as { payload: string; expiresAt: number } | undefined;
    if (!row) return null;
    const decoded = JSON.parse(
      decryptStatePayload(row.payload, this.storageSecret),
    ) as SessionState;
    if (!decoded || typeof decoded.token !== "string") return null;
    return decoded;
  }

  deleteSession(token: string): void {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token, this.storageSecret));
  }

  cleanupSessions(now = Date.now()): void {
    this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
  }

  putAccessGrant(id: string, expiresAt: number): void {
    this.db.prepare(`
      INSERT INTO access_grants(id, expires_at)
      VALUES(@id, @expiresAt)
      ON CONFLICT(id) DO UPDATE SET expires_at=@expiresAt
    `).run({
      id,
      expiresAt,
    });
  }

  hasAccessGrant(id: string, now = Date.now()): boolean {
    const row = this.db.prepare(`
      SELECT expires_at as expiresAt
      FROM access_grants
      WHERE id = ?
    `).get(id) as { expiresAt: number } | undefined;
    if (!row) return false;
    if (row.expiresAt <= now) {
      this.deleteAccessGrant(id);
      return false;
    }
    return true;
  }

  deleteAccessGrant(id: string): void {
    this.db.prepare("DELETE FROM access_grants WHERE id = ?").run(id);
  }

  cleanupAccessGrants(now = Date.now()): void {
    this.db.prepare("DELETE FROM access_grants WHERE expires_at <= ?").run(now);
  }

  putAuthChallenge(challenge: AuthChallengeState, ttlMs: number): void {
    const expiresAt = Date.now() + ttlMs;
    this.db.prepare(`
      INSERT INTO auth_challenges(nonce, payload, expires_at)
      VALUES(@nonce, @payload, @expiresAt)
      ON CONFLICT(nonce) DO UPDATE SET payload=@payload, expires_at=@expiresAt
    `).run({
      nonce: challenge.nonce,
      payload: JSON.stringify(challenge),
      expiresAt,
    });
  }

  takeAuthChallenge(nonce: string, now = Date.now()): AuthChallengeState | null {
    const tx = this.db.transaction((nonceArg: string, nowArg: number): AuthChallengeState | null => {
      const row = this.db.prepare(`
        SELECT payload, expires_at as expiresAt
        FROM auth_challenges
        WHERE nonce = ?
      `).get(nonceArg) as { payload: string; expiresAt: number } | undefined;
      if (!row) return null;

      this.db.prepare("DELETE FROM auth_challenges WHERE nonce = ?").run(nonceArg);
      if (row.expiresAt <= nowArg) return null;
      return JSON.parse(row.payload) as AuthChallengeState;
    });

    return tx(nonce, now);
  }

  cleanupAuthChallenges(now = Date.now()): void {
    this.db.prepare("DELETE FROM auth_challenges WHERE expires_at <= ?").run(now);
  }

  putPendingAgent(agent: PendingAgentState, ttlMs: number): void {
    const expiresAt = Date.now() + ttlMs;
    this.db.prepare(`
      INSERT INTO pending_agents(id, payload, expires_at)
      VALUES(@id, @payload, @expiresAt)
      ON CONFLICT(id) DO UPDATE SET payload=@payload, expires_at=@expiresAt
    `).run({
      id: agent.id,
      payload: encryptStatePayload(JSON.stringify(agent), this.storageSecret),
      expiresAt,
    });
  }

  getPendingAgent(id: string): PendingAgentState | null {
    const row = this.db.prepare(`
      SELECT payload, expires_at as expiresAt
      FROM pending_agents
      WHERE id = ?
    `).get(id) as { payload: string; expiresAt: number } | undefined;
    if (!row) return null;
    if (row.expiresAt <= Date.now()) {
      this.deletePendingAgent(id);
      return null;
    }
    return JSON.parse(
      decryptStatePayload(row.payload, this.storageSecret),
    ) as PendingAgentState;
  }

  findPendingAgent(
    masterAddress: `0x${string}`,
    network: Network,
    ownerPrivyUserId?: string,
  ): PendingAgentState | null {
    const rows = this.db.prepare(`
      SELECT payload, expires_at as expiresAt
      FROM pending_agents
      WHERE expires_at > ?
    `).all(Date.now()) as Array<{ payload: string; expiresAt: number }>;

    let newest: PendingAgentState | null = null;
    for (const row of rows) {
      let agent: PendingAgentState;
      try {
        agent = JSON.parse(
          decryptStatePayload(row.payload, this.storageSecret),
        ) as PendingAgentState;
      } catch {
        continue;
      }
      if (!matchesPendingAgent({ agent, masterAddress, network, ownerPrivyUserId })) continue;
      if (!newest || agent.createdAt > newest.createdAt) {
        newest = agent;
      }
    }
    return newest;
  }

  takePendingAgent(id: string): PendingAgentState | null {
    const tx = this.db.transaction((agentId: string, now: number): PendingAgentState | null => {
      const row = this.db.prepare(`
        SELECT payload, expires_at as expiresAt
        FROM pending_agents
        WHERE id = ?
      `).get(agentId) as { payload: string; expiresAt: number } | undefined;
      if (!row) return null;
      this.db.prepare("DELETE FROM pending_agents WHERE id = ?").run(agentId);
      if (row.expiresAt <= now) return null;
      return JSON.parse(
        decryptStatePayload(row.payload, this.storageSecret),
      ) as PendingAgentState;
    });
    return tx(id, Date.now());
  }

  deletePendingAgent(id: string): void {
    this.db.prepare("DELETE FROM pending_agents WHERE id = ?").run(id);
  }

  cleanupPendingAgents(now = Date.now()): void {
    const expired = this.db.prepare(`
      SELECT payload
      FROM pending_agents
      WHERE expires_at <= ?
    `).all(now) as Array<{ payload: string }>;
    for (const row of expired) {
      try {
        const payload = JSON.parse(
          decryptStatePayload(row.payload, this.storageSecret),
        ) as PendingAgentState;
        warnIfOrphanedPendingAgent(payload);
      } catch {
        // Ignore malformed rows during cleanup.
      }
    }
    this.db.prepare("DELETE FROM pending_agents WHERE expires_at <= ?").run(now);
  }

  putWSTicket(ticket: WSTicketState): void {
    const payload = encryptStatePayload(JSON.stringify(ticket), this.storageSecret);
    this.db.prepare(`
      INSERT INTO ws_tickets(token_hash, payload, expires_at)
      VALUES(@tokenHash, @payload, @expiresAt)
      ON CONFLICT(token_hash) DO UPDATE SET payload=@payload, expires_at=@expiresAt
    `).run({
      tokenHash: tokenHash(ticket.token, this.storageSecret),
      payload,
      expiresAt: ticket.expiresAt,
    });
  }

  takeWSTicket(token: string, now = Date.now()): WSTicketState | null {
    const tx = this.db.transaction((rawToken: string, currentTime: number): WSTicketState | null => {
      const tokenDigest = tokenHash(rawToken, this.storageSecret);
      const row = this.db.prepare(`
        SELECT payload, expires_at as expiresAt
        FROM ws_tickets
        WHERE token_hash = ?
      `).get(tokenDigest) as { payload: string; expiresAt: number } | undefined;
      if (!row) return null;
      this.db.prepare("DELETE FROM ws_tickets WHERE token_hash = ?").run(tokenDigest);
      if (row.expiresAt <= currentTime) return null;
      return JSON.parse(
        decryptStatePayload(row.payload, this.storageSecret),
      ) as WSTicketState;
    });
    return tx(token, now);
  }

  cleanupWSTickets(now = Date.now()): void {
    this.db.prepare("DELETE FROM ws_tickets WHERE expires_at <= ?").run(now);
  }

  putQuote<T>(id: string, quote: T, ttlMs: number): void {
    const expiresAt = Date.now() + ttlMs;
    this.db.prepare(`
      INSERT INTO quotes(id, payload, expires_at)
      VALUES(@id, @payload, @expiresAt)
      ON CONFLICT(id) DO UPDATE SET payload=@payload, expires_at=@expiresAt
    `).run({
      id,
      payload: JSON.stringify(quote),
      expiresAt,
    });
  }

  getQuote<T>(id: string): T | null {
    const row = this.db.prepare(`
      SELECT payload, expires_at as expiresAt
      FROM quotes
      WHERE id = ?
    `).get(id) as { payload: string; expiresAt: number } | undefined;
    if (!row) return null;
    if (row.expiresAt <= Date.now()) {
      this.deleteQuote(id);
      return null;
    }
    return JSON.parse(row.payload) as T;
  }

  takeQuote<T>(id: string): T | null {
    const tx = this.db.transaction((qid: string, now: number): T | null => {
      const row = this.db.prepare(`
        SELECT payload, expires_at as expiresAt
        FROM quotes WHERE id = ?
      `).get(qid) as { payload: string; expiresAt: number } | undefined;
      if (!row) return null;
      this.db.prepare("DELETE FROM quotes WHERE id = ?").run(qid);
      if (row.expiresAt <= now) return null;
      return JSON.parse(row.payload) as T;
    });
    return tx(id, Date.now());
  }

  deleteQuote(id: string): void {
    this.db.prepare("DELETE FROM quotes WHERE id = ?").run(id);
  }

  cleanupQuotes(now = Date.now()): void {
    this.db.prepare("DELETE FROM quotes WHERE expires_at <= ?").run(now);
  }

  close(): void {
    if (this.db.open) this.db.close();
  }

  clearAllForTests(): void {
    this.db.exec(`
      DELETE FROM sessions;
      DELETE FROM access_grants;
      DELETE FROM auth_challenges;
      DELETE FROM pending_agents;
      DELETE FROM ws_tickets;
      DELETE FROM quotes;
    `);
  }

  private migrateLegacySessionsSchema(): void {
    const columns = this.db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
    const names = new Set(columns.map((c) => c.name));
    if (names.has("token_hash") && names.has("payload")) {
      return;
    }
    if (!names.has("token") || !names.has("address")) {
      throw new Error("Unsupported sessions table schema.");
    }

    this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE sessions_v2 (
          token_hash TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        );
      `);

      const legacyRows = this.db.prepare(`
        SELECT token, address, expires_at as expiresAt
        FROM sessions
      `).all() as Array<{ token: string; address: string; expiresAt: number }>;

      const insert = this.db.prepare(`
        INSERT OR REPLACE INTO sessions_v2(token_hash, payload, expires_at)
        VALUES(@tokenHash, @payload, @expiresAt)
      `);
      for (const row of legacyRows) {
        const payload = encryptStatePayload(JSON.stringify({
          token: row.token,
          address: row.address,
          expiresAt: row.expiresAt,
        } satisfies SessionState), this.storageSecret);
        insert.run({
          tokenHash: tokenHash(row.token, this.storageSecret),
          payload,
          expiresAt: row.expiresAt,
        });
      }

      this.db.exec(`
        DROP TABLE sessions;
        ALTER TABLE sessions_v2 RENAME TO sessions;
        CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
      `);
    })();
  }

  private migrateLegacyPendingAgentPayloads(): void {
    const rows = this.db.prepare(`
      SELECT id, payload
      FROM pending_agents
    `).all() as Array<{ id: string; payload: string }>;

    const update = this.db.prepare(`
      UPDATE pending_agents
      SET payload = @payload
      WHERE id = @id
    `);

    for (const row of rows) {
      if (row.payload.startsWith(`${STATE_ENC_PREFIX}:`)) continue;
      // Legacy plaintext rows are JSON payloads; re-encrypt in place.
      const encrypted = encryptStatePayload(row.payload, this.storageSecret);
      update.run({
        id: row.id,
        payload: encrypted,
      });
    }
  }
}

let runtimeStateStore: RuntimeStateStore | null = null;

export function getRuntimeStateStore(config?: ServerConfig): RuntimeStateStore {
  if (runtimeStateStore) return runtimeStateStore;

  const backend = config?.runtimeStateBackend
    ?? ((process.env.TRADER_RUNTIME_STATE_BACKEND ?? "sqlite").trim().toLowerCase() === "memory" ? "memory" : "sqlite");
  if (backend === "memory") {
    const memSecret = config?.storePassphrase
      ?? process.env.TRADER_STORE_PASSPHRASE
      ?? process.env.TRADER_APP_PASSWORD
      ?? crypto.randomBytes(32).toString("hex");
    runtimeStateStore = new MemoryRuntimeStateStore(memSecret);
    return runtimeStateStore;
  }

  const envSqlitePath = process.env.TRADER_RUNTIME_STATE_SQLITE_PATH?.trim();
  const envDataDir = process.env.TRADER_DATA_DIR?.trim();
  const sqlitePath = config?.runtimeStateSqlitePath
    ?? (envSqlitePath && envSqlitePath.length > 0
      ? envSqlitePath
      : path.join(envDataDir && envDataDir.length > 0 ? envDataDir : ".data", "runtime-state.db"));
  const storageSecret = config?.storePassphrase
    ?? process.env.TRADER_STORE_PASSPHRASE
    ?? process.env.TRADER_APP_PASSWORD
    ?? "";
  if (storageSecret.length < 8) {
    throw new Error(
      "SQLite runtime state requires TRADER_STORE_PASSPHRASE or TRADER_APP_PASSWORD (min 8 chars).",
    );
  }
  runtimeStateStore = new SqliteRuntimeStateStore(sqlitePath, storageSecret);
  return runtimeStateStore;
}

export function closeRuntimeStateStore(): void {
  if (runtimeStateStore) {
    runtimeStateStore.close();
    runtimeStateStore = null;
  }
}

export function __resetRuntimeStateStoreForTests(): void {
  runtimeStateStore = null;
}
