export function assetVariants(value: string): Set<string> {
  const normalized = String(value ?? "").trim().toUpperCase();
  const out = new Set<string>();
  if (!normalized) return out;

  out.add(normalized);
  const slashBase = normalized.includes("/") ? (normalized.split("/")[0] ?? normalized) : normalized;
  out.add(slashBase);

  const colonBase = slashBase.includes(":")
    ? slashBase.slice(slashBase.indexOf(":") + 1)
    : slashBase;
  out.add(colonBase);

  const stripped = colonBase.replace(/\d+$/, "");
  if (stripped) out.add(stripped);

  return out;
}

export function deriveBaseAsset(coin: string): string {
  if (coin.includes("/")) {
    return (coin.split("/")[0] ?? coin).toUpperCase();
  }
  const idx = coin.indexOf(":");
  return (idx >= 0 ? coin.slice(idx + 1) : coin).toUpperCase();
}
