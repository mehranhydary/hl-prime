const STORAGE_KEY = "hl-prime:app-access:v1";
const ACCESS_HEADER = "x-trader-access-token";

interface StoredAccess {
  token: string;
  expiresAt: number;
}

interface AccessErrorPayload {
  error?: string;
  code?: string;
}

export interface AccessSnapshot {
  isUnlocked: boolean;
  expiresAt: number;
}

export interface UnlockResult {
  ok: boolean;
  error?: string;
  code?: string;
}

type AccessListener = (snapshot: AccessSnapshot) => void;

let accessToken: string | null = null;
let accessExpiresAt = 0;
const listeners = new Set<AccessListener>();

function clearStoredAccess(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function persistAccess(token: string, expiresAt: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, expiresAt } satisfies StoredAccess));
  } catch {}
}

function clearAccessState(emitChange = true): void {
  accessToken = null;
  accessExpiresAt = 0;
  clearStoredAccess();
  if (emitChange) emit();
}

function isAccessValid(): boolean {
  return Boolean(accessToken) && accessExpiresAt > Date.now() + 60_000;
}

function snapshot(): AccessSnapshot {
  return {
    isUnlocked: isAccessValid(),
    expiresAt: accessExpiresAt,
  };
}

function emit(): void {
  const next = snapshot();
  for (const listener of listeners) {
    listener(next);
  }
}

function loadStoredAccess(): void {
  if (typeof window === "undefined") return;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw) as Partial<StoredAccess>;
    if (typeof stored.token !== "string" || typeof stored.expiresAt !== "number" || !Number.isFinite(stored.expiresAt)) {
      clearStoredAccess();
      return;
    }
    if (stored.expiresAt <= Date.now() + 60_000) {
      clearStoredAccess();
      return;
    }
    accessToken = stored.token;
    accessExpiresAt = stored.expiresAt;
  } catch {
    clearStoredAccess();
  }
}

function parseErrorPayload(data: unknown): AccessErrorPayload {
  if (!data || typeof data !== "object") return {};
  const obj = data as Record<string, unknown>;
  return {
    error: typeof obj.error === "string" ? obj.error : undefined,
    code: typeof obj.code === "string" ? obj.code : undefined,
  };
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

loadStoredAccess();

export function subscribeAccess(listener: AccessListener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}

export function getAccessSnapshot(): AccessSnapshot {
  return snapshot();
}

export function getAccessHeaders(): Record<string, string> {
  if (!isAccessValid()) {
    if (accessToken) clearAccessState();
    return {};
  }
  return { [ACCESS_HEADER]: accessToken as string };
}

export function clearAccessToken(): void {
  clearAccessState();
}

export function lock(): void {
  clearAccessState();
}

export async function unlock(password: string): Promise<UnlockResult> {
  if (!password) {
    return { ok: false, error: "Password is required", code: "BAD_REQUEST" };
  }

  try {
    const res = await fetch("/api/access/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    const data = await parseJsonSafe(res);
    if (!res.ok) {
      const { error, code } = parseErrorPayload(data);
      return {
        ok: false,
        error: error ?? "Unlock failed",
        code: code ?? "REQUEST_FAILED",
      };
    }

    const payload = data as Partial<StoredAccess>;
    if (typeof payload.token !== "string" || typeof payload.expiresAt !== "number" || !Number.isFinite(payload.expiresAt)) {
      return { ok: false, error: "Invalid unlock response", code: "REQUEST_FAILED" };
    }

    accessToken = payload.token;
    accessExpiresAt = payload.expiresAt;
    persistAccess(payload.token, payload.expiresAt);
    emit();
    return { ok: true };
  } catch {
    return { ok: false, error: "Unable to reach server", code: "NETWORK_ERROR" };
  }
}
