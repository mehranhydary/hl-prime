export const tokenIconUrl = (coin: string): string => `https://app.hyperliquid.xyz/coins/${coin}.svg`;

export const getBaseToken = (coin: string): string => {
  const idx = coin.indexOf(":");
  return idx > 0 ? coin.slice(idx + 1) : coin;
};

export const tokenIconFallbackUrl = (coin: string): string | null => {
  const base = getBaseToken(coin);
  return base !== coin ? `https://app.hyperliquid.xyz/coins/${base}.svg` : null;
};

export const needsLightIconBackplate = (coin: string): boolean => {
  const base = getBaseToken(coin);
  return base === "ETH" || base === "XRP";
};

// Snapshot from Hyperliquid info API `type: "perpDexs"` (fetched on 2026-03-07),
// filtered to coins whose icon URL returns `image/svg+xml` on 2026-03-07.
// Show each base asset once, always preferring the xyz market when one exists.
const HIP3_MARKETS_BY_DEPLOYER = {
  xyz: [
    "xyz:AAPL", "xyz:ALUMINIUM", "xyz:AMD", "xyz:AMZN", "xyz:BABA", "xyz:CL",
    "xyz:COIN", "xyz:CRCL", "xyz:CRWV", "xyz:EUR", "xyz:GOLD", "xyz:GOOGL",
    "xyz:HOOD", "xyz:HYUNDAI", "xyz:INTC", "xyz:JPY", "xyz:KR200", "xyz:META",
    "xyz:MSFT", "xyz:MSTR", "xyz:MU", "xyz:NFLX", "xyz:NVDA", "xyz:ORCL",
    "xyz:PALLADIUM", "xyz:PLATINUM", "xyz:PLTR", "xyz:RIVN", "xyz:SILVER",
    "xyz:SKHX", "xyz:SMSN", "xyz:SNDK", "xyz:TSLA", "xyz:TSM", "xyz:URANIUM",
    "xyz:USAR", "xyz:XYZ100",
  ],
  flx: [
    "flx:COIN", "flx:COPPER", "flx:CRCL", "flx:GOLD", "flx:NVDA", "flx:OIL",
    "flx:SILVER", "flx:TSLA", "flx:XMR",
  ],
  vntl: [
    "vntl:ANTHROPIC", "vntl:BIOTECH", "vntl:DEFENSE", "vntl:ENERGY", "vntl:INFOTECH",
    "vntl:MAG7", "vntl:NUCLEAR", "vntl:OPENAI", "vntl:ROBOT", "vntl:SEMIS", "vntl:SPACEX",
  ],
  hyna: [
    "hyna:BTC", "hyna:ETH", "hyna:HYPE", "hyna:SOL", "hyna:XRP", "hyna:ZEC",
  ],
  km: [
    "km:BABA", "km:SMALL2000", "km:TSLA", "km:US500", "km:USBOND", "km:USOIL", "km:USTECH",
  ],
  cash: [
    "cash:AMZN", "cash:GOLD", "cash:GOOGL", "cash:HOOD", "cash:META", "cash:NVDA",
    "cash:SILVER", "cash:TSLA", "cash:USA500",
  ],
} as const;

const NATIVE_FALLBACK_MARKETS = [
  "BTC", "ETH", "SOL", "DOGE", "LINK", "AVAX", "ARB", "XRP", "SUI", "LTC", "BNB", "BCH", "HYPE",
];

const CRYPTO_PRIORITY_BASES = [
  "BTC", "ETH", "SOL", "XRP", "DOGE", "LINK", "AVAX", "ARB",
  "SUI", "LTC", "BNB", "BCH", "HYPE", "XMR", "ZEC",
] as const;

const DEPLOYER_PRIORITY = ["xyz", "flx", "vntl", "hyna", "km", "cash"] as const;

const orderedHip3Markets = (): string[] => {
  const buckets = Object.values(HIP3_MARKETS_BY_DEPLOYER).map((coins) => [...coins]);
  const ordered: string[] = [];
  let hasMore = true;

  while (hasMore) {
    hasMore = false;
    for (const bucket of buckets) {
      const next = bucket.shift();
      if (next) {
        ordered.push(next);
        hasMore = true;
      }
    }
  }

  return ordered;
};

const buildPreferredMarketByBase = (): Map<string, string> => {
  const preferred = new Map<string, string>();

  for (const deployer of DEPLOYER_PRIORITY) {
    for (const coin of HIP3_MARKETS_BY_DEPLOYER[deployer]) {
      const base = getBaseToken(coin);
      if (!preferred.has(base)) {
        preferred.set(base, coin);
      }
    }
  }

  return preferred;
};

const orderedUniqueMarkets = (): string[] => {
  const preferredByBase = buildPreferredMarketByBase();
  const seenBases = new Set<string>();
  const ordered: string[] = [];
  const addBase = (base: string, fallbackCoin?: string) => {
    if (seenBases.has(base)) {
      return;
    }

    seenBases.add(base);
    ordered.push(preferredByBase.get(base) ?? fallbackCoin ?? base);
  };

  for (const base of CRYPTO_PRIORITY_BASES) {
    addBase(base);
  }

  for (const coin of [...orderedHip3Markets(), ...NATIVE_FALLBACK_MARKETS]) {
    const base = getBaseToken(coin);
    addBase(base, coin);
  }

  return ordered;
};

export const MARKET_ICON_ASSETS = orderedUniqueMarkets();
