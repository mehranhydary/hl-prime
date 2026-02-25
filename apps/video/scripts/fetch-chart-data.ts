#!/usr/bin/env npx tsx
/**
 * Fetches real candle data from Hyperliquid and writes apps/video/src/lib/chart-data.ts.
 * Run: npx tsx scripts/fetch-chart-data.ts
 */

const API = "https://api.hyperliquid.xyz/info";
const CANDLE_COUNT = 120;
const INTERVAL = "1h";
const INTERVAL_MS = 3_600_000;

const ASSETS: { coin: string; varName: string }[] = [
  { coin: "BTC", varName: "BTC" },
  { coin: "ETH", varName: "ETH" },
  { coin: "SOL", varName: "SOL" },
  { coin: "xyz:TSLA", varName: "XYZ_TSLA" },
  { coin: "xyz:NVDA", varName: "XYZ_NVDA" },
  { coin: "xyz:GOLD", varName: "XYZ_GOLD" },
  { coin: "xyz:SILVER", varName: "XYZ_SILVER" },
  { coin: "xyz:AAPL", varName: "XYZ_AAPL" },
];

interface RawCandle {
  t: number;
  T: number;
  s: string;
  i: string;
  o: string;
  c: string;
  h: string;
  l: string;
  v: string;
  n: number;
}

async function fetchCandles(coin: string): Promise<RawCandle[]> {
  const startTime = Date.now() - INTERVAL_MS * 200;
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "candleSnapshot",
      req: { coin, interval: INTERVAL, startTime },
    }),
  });
  if (!res.ok) throw new Error(`Failed to fetch ${coin}: ${res.status}`);
  return res.json();
}

async function main() {
  console.log("Fetching candle data from Hyperliquid...\n");

  const results = await Promise.all(
    ASSETS.map(async ({ coin, varName }) => {
      const raw = await fetchCandles(coin);
      const candles = raw.slice(-CANDLE_COUNT);
      const latest = parseFloat(candles[candles.length - 1].c);
      console.log(`  ${coin.padEnd(15)} ${candles.length} candles  latest: $${latest.toLocaleString()}`);
      return { coin, varName, candles };
    }),
  );

  // Generate TypeScript
  const lines: string[] = [];
  const now = new Date().toISOString();

  lines.push("/**");
  lines.push(" * Real chart data fetched from Hyperliquid candleSnapshot API.");
  lines.push(` * ${CANDLE_COUNT} x ${INTERVAL} candles per asset.`);
  lines.push(` * Generated: ${now}`);
  lines.push(" *");
  lines.push(" * Re-fetch with: npx tsx scripts/fetch-chart-data.ts");
  lines.push(" */");
  lines.push("");
  lines.push("export interface OHLCPoint {");
  lines.push("  time: number;");
  lines.push("  open: number;");
  lines.push("  high: number;");
  lines.push("  low: number;");
  lines.push("  close: number;");
  lines.push("  volume: number;");
  lines.push("}");
  lines.push("");

  // Type union
  lines.push("export type ChartAssetKey =");
  results.forEach(({ coin }, i) => {
    const sep = i === results.length - 1 ? ";" : "";
    lines.push(`  | "${coin}"${sep}`);
  });
  lines.push("");

  // Data arrays
  for (const { coin, varName, candles } of results) {
    lines.push(`/** ${coin} \u2014 ${candles.length} hourly candles */`);
    lines.push(`const DATA_${varName}: OHLCPoint[] = [`);
    for (const c of candles) {
      const t = Math.floor(c.t / 1000);
      const o = parseFloat(c.o);
      const h = parseFloat(c.h);
      const l = parseFloat(c.l);
      const cl = parseFloat(c.c);
      const v = parseFloat(c.v);
      lines.push(`  { time: ${t}, open: ${o}, high: ${h}, low: ${l}, close: ${cl}, volume: ${v} },`);
    }
    lines.push("];");
    lines.push("");
  }

  // Index map
  lines.push("/** Indexed chart data \u2014 access by coin key (e.g. \"xyz:TSLA\", \"BTC\") */");
  lines.push("export const CHART_DATA: Record<ChartAssetKey, OHLCPoint[]> = {");
  for (const { coin, varName } of results) {
    lines.push(`  "${coin}": DATA_${varName},`);
  }
  lines.push("};");
  lines.push("");

  // Helpers
  lines.push("/** Get the latest close price for an asset */");
  lines.push("export function latestPrice(coin: ChartAssetKey): number {");
  lines.push("  const data = CHART_DATA[coin];");
  lines.push("  return data[data.length - 1].close;");
  lines.push("}");
  lines.push("");
  lines.push("/** Get the 24h price change % for an asset */");
  lines.push("export function priceChange24h(coin: ChartAssetKey): { change: number; positive: boolean } {");
  lines.push("  const data = CHART_DATA[coin];");
  lines.push("  const now = data[data.length - 1].close;");
  lines.push("  const h24 = data[Math.max(0, data.length - 25)].close;");
  lines.push("  const change = ((now - h24) / h24) * 100;");
  lines.push("  return { change: Math.round(change * 100) / 100, positive: change >= 0 };");
  lines.push("}");
  lines.push("");

  const output = lines.join("\n");

  // Write file
  const path = new URL("../src/lib/chart-data.ts", import.meta.url);
  const fs = await import("node:fs");
  fs.writeFileSync(path, output, "utf-8");
  console.log(`\nWrote ${output.length.toLocaleString()} chars to src/lib/chart-data.ts`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
