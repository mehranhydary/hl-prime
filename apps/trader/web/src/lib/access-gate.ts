export const PASSWORD_GATE_ENABLED =
  (import.meta.env.VITE_TRADER_PASSWORD_GATE_ENABLED ?? "true").toLowerCase() !== "false";

const STORAGE_KEY = "hl-prime:app-access:v2";

interface StoredAccess {
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

let accessExpiresAt = 0;
const listeners = new Set<AccessListener>();

function clearStoredAccess(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function persistAccess(expiresAt: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ expiresAt } satisfies StoredAccess));
  } catch {}
}

function clearAccessState(emitChange = true): void {
  accessExpiresAt = 0;
  clearStoredAccess();
  if (emitChange) emit();
}

function isAccessValid(): boolean {
  return accessExpiresAt > Date.now() + 60_000;
}

function snapshot(): AccessSnapshot {
  return {
    isUnlocked: !PASSWORD_GATE_ENABLED || isAccessValid(),
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
    if (typeof stored.expiresAt !== "number" || !Number.isFinite(stored.expiresAt)) {
      clearStoredAccess();
      return;
    }
    if (stored.expiresAt <= Date.now() + 60_000) {
      clearStoredAccess();
      return;
    }
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
  if (!isAccessValid() && accessExpiresAt > 0) {
    clearAccessState();
  }
  return {};
}

export function clearAccessToken(): void {
  clearAccessState();
}

export function lock(): void {
  clearAccessState();
  void fetch("/api/access/logout", {
    method: "POST",
    credentials: "same-origin",
  }).catch(() => {});
}

export async function unlock(password: string): Promise<UnlockResult> {
  if (!password) {
    return { ok: false, error: "Password is required", code: "BAD_REQUEST" };
  }

  try {
    const res = await fetch("/api/access/verify", {
      method: "POST",
      credentials: "same-origin",
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
    if (typeof payload.expiresAt !== "number" || !Number.isFinite(payload.expiresAt)) {
      return { ok: false, error: "Invalid unlock response", code: "REQUEST_FAILED" };
    }

    accessExpiresAt = payload.expiresAt;
    persistAccess(payload.expiresAt);
    emit();
    return { ok: true };
  } catch {
    return { ok: false, error: "Unable to reach server", code: "NETWORK_ERROR" };
  }
}
