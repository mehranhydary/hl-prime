import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { ServerConfig } from "../config.js";

export interface SessionState {
  token: string;
  address: string;
  expiresAt: number;
}

export interface PendingAgentState {
  id: string;
  agentPrivateKey: `0x${string}`;
  agentAddress: `0x${string}`;
  agentName: string;
  createdAt: number;
}

export interface RuntimeStateStore {
  putSession(session: SessionState): void;
  getSession(token: string): SessionState | null;
  deleteSession(token: string): void;
  cleanupSessions(now?: number): void;

  putPendingAgent(agent: PendingAgentState, ttlMs: number): void;
  getPendingAgent(id: string): PendingAgentState | null;
  deletePendingAgent(id: string): void;
  cleanupPendingAgents(now?: number): void;

  putQuote<T>(id: string, quote: T, ttlMs: number): void;
  getQuote<T>(id: string): T | null;
  deleteQuote(id: string): void;
  cleanupQuotes(now?: number): void;

  clearAllForTests(): void;
}

class MemoryRuntimeStateStore implements RuntimeStateStore {
  private sessions = new Map<string, SessionState>();
  private pendingAgents = new Map<string, { payload: PendingAgentState; expiresAt: number }>();
  private quotes = new Map<string, { payload: unknown; expiresAt: number }>();

  putSession(session: SessionState): void {
    this.sessions.set(session.token, session);
  }

  getSession(token: string): SessionState | null {
    return this.sessions.get(token) ?? null;
  }

  deleteSession(token: string): void {
    this.sessions.delete(token);
  }

  cleanupSessions(now = Date.now()): void {
    for (const [token, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) this.sessions.delete(token);
    }
  }

  putPendingAgent(agent: PendingAgentState, ttlMs: number): void {
    this.pendingAgents.set(agent.id, { payload: agent, expiresAt: Date.now() + ttlMs });
  }

  getPendingAgent(id: string): PendingAgentState | null {
    const found = this.pendingAgents.get(id);
    if (!found) return null;
    if (found.expiresAt <= Date.now()) {
      this.pendingAgents.delete(id);
      return null;
    }
    return found.payload;
  }

  deletePendingAgent(id: string): void {
    this.pendingAgents.delete(id);
  }

  cleanupPendingAgents(now = Date.now()): void {
    for (const [id, value] of this.pendingAgents.entries()) {
      if (value.expiresAt <= now) this.pendingAgents.delete(id);
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

  deleteQuote(id: string): void {
    this.quotes.delete(id);
  }

  cleanupQuotes(now = Date.now()): void {
    for (const [id, value] of this.quotes.entries()) {
      if (value.expiresAt <= now) this.quotes.delete(id);
    }
  }

  clearAllForTests(): void {
    this.sessions.clear();
    this.pendingAgents.clear();
    this.quotes.clear();
  }
}

class SqliteRuntimeStateStore implements RuntimeStateStore {
  private db: Database.Database;

  constructor(sqlitePath: string) {
    const resolved = path.resolve(sqlitePath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(resolved);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        address TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pending_agents (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS quotes (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_pending_agents_expires_at ON pending_agents(expires_at);
      CREATE INDEX IF NOT EXISTS idx_quotes_expires_at ON quotes(expires_at);
    `);
  }

  putSession(session: SessionState): void {
    this.db.prepare(`
      INSERT INTO sessions(token, address, expires_at)
      VALUES(@token, @address, @expiresAt)
      ON CONFLICT(token) DO UPDATE SET address=@address, expires_at=@expiresAt
    `).run(session);
  }

  getSession(token: string): SessionState | null {
    const row = this.db.prepare(`
      SELECT token, address, expires_at as expiresAt
      FROM sessions
      WHERE token = ?
    `).get(token) as SessionState | undefined;
    return row ?? null;
  }

  deleteSession(token: string): void {
    this.db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }

  cleanupSessions(now = Date.now()): void {
    this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
  }

  putPendingAgent(agent: PendingAgentState, ttlMs: number): void {
    const expiresAt = Date.now() + ttlMs;
    this.db.prepare(`
      INSERT INTO pending_agents(id, payload, expires_at)
      VALUES(@id, @payload, @expiresAt)
      ON CONFLICT(id) DO UPDATE SET payload=@payload, expires_at=@expiresAt
    `).run({
      id: agent.id,
      payload: JSON.stringify(agent),
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
    return JSON.parse(row.payload) as PendingAgentState;
  }

  deletePendingAgent(id: string): void {
    this.db.prepare("DELETE FROM pending_agents WHERE id = ?").run(id);
  }

  cleanupPendingAgents(now = Date.now()): void {
    this.db.prepare("DELETE FROM pending_agents WHERE expires_at <= ?").run(now);
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

  deleteQuote(id: string): void {
    this.db.prepare("DELETE FROM quotes WHERE id = ?").run(id);
  }

  cleanupQuotes(now = Date.now()): void {
    this.db.prepare("DELETE FROM quotes WHERE expires_at <= ?").run(now);
  }

  clearAllForTests(): void {
    this.db.exec(`
      DELETE FROM sessions;
      DELETE FROM pending_agents;
      DELETE FROM quotes;
    `);
  }
}

let runtimeStateStore: RuntimeStateStore | null = null;

export function getRuntimeStateStore(config?: ServerConfig): RuntimeStateStore {
  if (runtimeStateStore) return runtimeStateStore;

  const backend = config?.runtimeStateBackend
    ?? ((process.env.TRADER_RUNTIME_STATE_BACKEND ?? "sqlite").trim().toLowerCase() === "memory" ? "memory" : "sqlite");
  if (backend === "memory") {
    runtimeStateStore = new MemoryRuntimeStateStore();
    return runtimeStateStore;
  }

  const sqlitePath = config?.runtimeStateSqlitePath
    ?? process.env.TRADER_RUNTIME_STATE_SQLITE_PATH
    ?? path.join(process.env.TRADER_DATA_DIR ?? ".data", "runtime-state.db");
  runtimeStateStore = new SqliteRuntimeStateStore(sqlitePath);
  return runtimeStateStore;
}

export function __resetRuntimeStateStoreForTests(): void {
  runtimeStateStore = null;
}
