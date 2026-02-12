import pino from "pino";

function hasPinoPretty(): boolean {
  try {
    import.meta.resolve("pino-pretty");
    return true;
  } catch {
    return false;
  }
}

export function createLogger(opts: { level?: string; pretty?: boolean } = {}): Logger {
  return pino({
    level: opts.level ?? "info",
    transport: opts.pretty && hasPinoPretty()
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  });
}

export type Logger = pino.Logger;
