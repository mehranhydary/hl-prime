/** Display-name mappings for tokens that differ from their on-chain symbol. */
const COIN_DISPLAY: Record<string, string> = {
  USDT0: "USDT",
};

/** Known HIP-3 deployer DEXes with local icons in /public/coins/ */
const KNOWN_DEPLOYERS = new Set(["cash", "xyz", "flx", "km", "hyna", "vntls"]);

/**
 * Returns a user-friendly display name for a coin/token.
 * e.g. "USDT0" → "USDT", everything else passes through unchanged.
 */
export function displayCoin(coin: string): string {
  return COIN_DISPLAY[coin] ?? coin;
}

/** URL for local collateral icon in /public/collateral (e.g. USDT0 -> /collateral/usdt.png). */
export function collateralIconUrl(coin: string): string {
  const normalized = displayCoin(coin).toLowerCase();
  return `/collateral/${normalized}.png`;
}

/** Extract deployer prefix from a HIP-3 coin name (e.g., "cash:BTC" → "cash") */
export function getDeployer(coin: string): string | null {
  const idx = coin.indexOf(":");
  return idx > 0 ? coin.slice(0, idx) : null;
}

/** Get the base token from a coin name (e.g., "cash:BTC" → "BTC", "ETH" → "ETH") */
export function getBaseToken(coin: string): string {
  const idx = coin.indexOf(":");
  return idx > 0 ? coin.slice(idx + 1) : coin;
}

/** URL for token icon from Hyperliquid CDN (uses full coin name, e.g. "xyz:TSLA") */
export function tokenIconUrl(coin: string): string {
  return `https://app.hyperliquid.xyz/coins/${coin}.svg`;
}

/** Fallback icon URL using just the base token name (e.g. "TSLA" without deployer prefix) */
export function tokenIconFallbackUrl(coin: string): string | null {
  const base = getBaseToken(coin);
  // Only useful as fallback if coin had a deployer prefix
  return base !== coin ? `https://app.hyperliquid.xyz/coins/${base}.svg` : null;
}

/** Hyperliquid brand icon URL (HYPE token icon doubles as the HL logo). */
const HL_ICON_URL = "https://app.hyperliquid.xyz/coins/HYPE.svg";

/** URL for a deployer's local icon (returns null for unknown deployers) */
export function deployerIconUrl(coin: string): string | null {
  const deployer = getDeployer(coin);
  if (deployer && KNOWN_DEPLOYERS.has(deployer)) {
    return `/perp-dexes/${deployer}.png`;
  }
  return null;
}

/** URL for a deployer icon by name — supports "HL" for native markets. */
export function deployerIconByName(name: string): string | null {
  if (name === "HL") return HL_ICON_URL;
  if (KNOWN_DEPLOYERS.has(name)) return `/perp-dexes/${name}.png`;
  return null;
}

/** Replace a failed <img> with a text-initials fallback using safe DOM APIs (no innerHTML). */
export function showIconFallback(img: HTMLImageElement, text: string, className: string): void {
  const parent = img.parentElement;
  if (!parent) return;
  img.style.display = "none";
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text.slice(0, 2);
  parent.appendChild(span);
}
