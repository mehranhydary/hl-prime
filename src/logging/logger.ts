import pino from "pino";

export function createLogger(opts: { level?: string; pretty?: boolean } = {}): Logger {
  return pino({
    level: opts.level ?? "info",
    transport: opts.pretty
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  });
}

export type Logger = pino.Logger;
