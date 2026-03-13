/**
 * Structured audit logger for security-sensitive events.
 *
 * All entries are JSON-formatted to stdout/stderr so they can be ingested by
 * log aggregators (Railway logs, Datadog, etc.) without extra configuration.
 */

export type AuditEvent =
  | "password_gate.verify"
  | "password_gate.verify_failed"
  | "password_gate.logout"
  | "auth.session_created"
  | "auth.session_failed"
  | "auth.forbidden"
  | "trade.execute"
  | "trade.execute_failed"
  | "trade.quick"
  | "trade.quick_failed"
  | "trade.close"
  | "trade.close_failed"
  | "swap.execute"
  | "swap.execute_failed"
  | "rate_limit.exceeded"
  | "ip_blocked";

export interface AuditEntry {
  event: AuditEvent;
  ip?: string;
  user?: string;
  privyUserId?: string;
  /** Short-form wallet address for log readability. */
  wallet?: string;
  network?: string;
  /** Asset or coin involved. */
  asset?: string;
  side?: string;
  /** USD notional value of the operation. */
  usdNotional?: number;
  success?: boolean;
  error?: string;
  /** Additional context specific to the event. */
  meta?: Record<string, string | number | boolean>;
}

function shortAddr(address: string | undefined): string | undefined {
  if (!address) return undefined;
  const normalized = address.toLowerCase();
  if (!normalized.startsWith("0x") || normalized.length < 12) return normalized;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

export function audit(entry: AuditEntry): void {
  const payload = {
    level: "audit",
    type: "security_event",
    ts: new Date().toISOString(),
    ...entry,
    // Replace full wallet with short form in the top-level log line.
    wallet: entry.wallet ? shortAddr(entry.wallet) : undefined,
  };

  // Remove undefined keys for cleaner JSON.
  const cleaned = Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined),
  );

  const line = JSON.stringify(cleaned);
  if (entry.success === false || entry.event.endsWith("_failed") || entry.event === "ip_blocked") {
    console.warn(line);
  } else {
    console.info(line);
  }
}
