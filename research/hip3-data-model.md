# HIP-3 Data Model Research

> **Status**: RESOLVED — Validated against testnet (2026-02-11)

## Answers to Open Questions

### 1. How is collateral type exposed for HIP-3 markets?

**Answer**: The `collateralToken` field in the `meta` response is a **spot token index**.

```json
{
  "universe": [...],
  "marginTables": [...],
  "collateralToken": 0    // ← spot token index
}
```

To resolve it to a token name, call `spotMeta()` and find the token with the matching `index`:

```
collateralToken: 0  → spotMeta().tokens[index=0].name → "USDC"
collateralToken: 1452 → "USDH"
collateralToken: 1435 → "HORSE"
```

**Implementation**: `MarketRegistry.resolveCollateralToken()` now fetches `spotMeta()` on startup and maps indices to names.

### 2. Can you query all HIP-3 deployer configs?

**Answer**: Yes, three key endpoints:

| Endpoint | Purpose |
|----------|---------|
| `perpDexs()` | List all deployers (name, address, fee config) |
| `allPerpMetas()` | Get metadata for all dexes in one call |
| `metaAndAssetCtxs({ dex })` | Get metadata + live data for a specific dex |
| `perpDexStatus(dex)` | Net deposit status |
| `perpDexLimits(dex)` | OI caps and risk limits |

**Testnet result**: 186 deployers found on testnet. Most use USDC collateral, but others use USDH, TZERO, USDEEE, HORSE, TGUSD, etc.

### 3. How do HIP-3 fills appear in `userFills`?

**Answer**: The `coin` field uses the full `"dex:ASSET"` format (e.g., `"xyz:TSLA"`). This is consistent across all API responses — orders, fills, positions, and L2 books all use the same naming convention.

### 4. What happens when a HIP-3 deployer shuts down a market?

**Deferred** — Not relevant for v0.1. Markets have an `isDelisted: true` field when delisted. The registry now skips delisted markets during discovery.

### 5. Are there HIP-3 markets on testnet?

**Answer**: Yes — 186 deployers on testnet with hundreds of markets. Examples include `xyz` (stocks, commodities, forex), `felix`, `volmex`, and many more.

## Key Findings

### Naming Convention

Most HIP-3 asset names do **NOT** have trailing digits:
- `xyz:TSLA` (not `xyz:TSLA100`)
- `xyz:EUR`, `xyz:GOLD`, `xyz:SILVER`
- Some DO have digits: `xyz:XYZ100`, `felix:TEST1`

`extractBaseAsset()` strips trailing digits but falls back to the full name if that would produce an empty string.

### MetaAsset Fields (HIP-3 specific)

```typescript
{
  name: "xyz:TSLA",
  szDecimals: 3,
  maxLeverage: 10,
  marginTableId: 10,           // HIP-3 only
  onlyIsolated: true,          // HIP-3: always true
  marginMode: "strictIsolated" | "noCross",  // HIP-3 only
  isDelisted?: true,           // present when delisted
  growthMode?: "enabled",      // HIP-3 only
  lastGrowthModeChangeTime?: "ISO-8601"
}
```

### Discovery Flow

```
spotMeta() → build token index map
perpDexs() + allPerpMetas() → get all deployers + their metadata
For each dex: metaAndAssetCtxs(dexName) → get live funding/OI/prices
Skip isDelisted markets
Resolve collateralToken via spotMeta token index
```

### Collateral Distribution (Testnet)

| Collateral | Count |
|-----------|-------|
| USDC (index 0) | ~130 dexes |
| USDH (index 1452) | ~25 dexes |
| USDEEE (index 1295) | ~5 dexes |
| HORSE (index 1435) | ~4 dexes |
| TZERO (index 1204) | ~4 dexes |
| Other | Various |

## Real API Response Examples

### perpDexs() (first 5)

```json
[
  null,
  { "name": "test", "deployer": "0x5e89b26d8d66da9888c835c9bfcc2aa51813e152", ... },
  { "name": "unit", "deployer": "0x888888880c61928866d8fcd1ac8655b7760b9f71", ... },
  { "name": "scam", "deployer": "0xcc16ae2ffc076d7bcd5ec3fb1e9aa5c2984133a1", ... },
  { "name": "felix", "deployer": "0x3a4ca3a93fc224c0a073d087c19ba8f0f04c7f00", ... }
]
```

### spotMeta().tokens (first 3)

```json
[
  { "name": "USDC", "index": 0, "szDecimals": 8, "weiDecimals": 8, "isCanonical": true },
  { "name": "PURR", "index": 1, "szDecimals": 0, "weiDecimals": 5, "isCanonical": true },
  { "name": "TEST", "index": 2, "szDecimals": 1, "weiDecimals": 8, "isCanonical": true }
]
```

### metaAndAssetCtxs("xyz") — first market

```json
[
  {
    "universe": [
      {
        "szDecimals": 4,
        "name": "xyz:XYZ100",
        "maxLeverage": 25,
        "marginTableId": 25,
        "onlyIsolated": true,
        "marginMode": "noCross",
        "growthMode": "enabled"
      }
    ],
    "collateralToken": 0
  },
  [
    {
      "funding": "0.00000625",
      "openInterest": "4441.182",
      "oraclePx": "25290.0",
      "markPx": "25296.0",
      "midPx": "25296.5",
      "impactPxs": ["25296.0", "25297.0"]
    }
  ]
]
```
