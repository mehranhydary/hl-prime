import type { Request, Response } from "express";

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};

  const out: Record<string, string> = {};
  const parts = header.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const valueRaw = trimmed.slice(eqIdx + 1).trim();
    if (!key) continue;

    try {
      out[key] = decodeURIComponent(valueRaw);
    } catch {
      out[key] = valueRaw;
    }
  }

  return out;
}

export function readCookie(req: Request, cookieName: string): string | null {
  const cookies = parseCookieHeader(req.headers.cookie);
  const value = cookies[cookieName];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function setAuthCookie(
  res: Response,
  params: {
    name: string;
    value: string;
    expiresAt: number;
    secure: boolean;
    path?: string;
  },
): void {
  res.cookie(params.name, params.value, {
    httpOnly: true,
    secure: params.secure,
    sameSite: "strict",
    path: params.path ?? "/api",
    expires: new Date(params.expiresAt),
  });
}

export function clearAuthCookie(
  res: Response,
  params: {
    name: string;
    secure: boolean;
    path?: string;
  },
): void {
  res.clearCookie(params.name, {
    httpOnly: true,
    secure: params.secure,
    sameSite: "strict",
    path: params.path ?? "/api",
  });
}
