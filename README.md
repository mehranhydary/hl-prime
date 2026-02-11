# Hyperliquid Prime

A TypeScript SDK that acts as a **prime broker layer** on top of Hyperliquid's HIP-3 markets. When multiple deployers list the same asset (e.g. ETH) with different collateral types (USDT, USDC, USDE), Hyperliquid Prime automatically discovers all markets, compares liquidity/funding/cost, and routes to the best execution — presenting a single unified trading interface.

## The Problem

HIP-3 allows anyone to deploy perpetual markets on Hyperliquid. This means ETH can be traded across multiple venues — the native HL perp, plus HIP-3 markets from various deployers, each with different collateral, liquidity depth, and funding rates. Traders are left manually comparing across fragmented markets.

## What Hyperliquid Prime Does

- **Discovers** all HIP-3 markets per asset and groups them
- **Aggregates** orderbooks across collateral types into a unified view
- **Routes** orders to the single best market based on price impact, funding rate, and collateral match
- **Executes** via an explicit quote-then-execute flow
- **Tracks** positions across all markets in a unified view

## Install

```bash
npm install hyperliquid-prime
```

## Quick Start

### SDK Usage (TypeScript)

```typescript
import { HyperliquidPrime } from 'hyperliquid-prime'

// --- Read-only (no wallet needed) ---
const hp = new HyperliquidPrime({ testnet: true })
await hp.connect()

// What HIP-3 markets exist for ETH?
const ethMarkets = hp.getMarkets('ETH')
// [
//   { coin: "ETH", dexName: "__native__", collateral: "USDC", isNative: true },
//   { coin: "xyz:ETH100", dexName: "xyz", collateral: "USDT", isNative: false },
//   ...
// ]

// Where's the best execution for a 10 ETH long?
const quote = await hp.quote('ETH', 'buy', 10)
console.log(quote.selectedMarket.coin) // "xyz:ETH100"
console.log(quote.estimatedAvgPrice) // 3201.45
console.log(quote.estimatedPriceImpact) // 1.2 (bps)
console.log(quote.alternativesConsidered) // All markets with scores

// Aggregated orderbook across all ETH markets
const book = await hp.getAggregatedBook('ETH')

// Funding rate comparison
const funding = await hp.getFundingComparison('ETH')

await hp.disconnect()
```

### Trading

```typescript
const hp = new HyperliquidPrime({
	privateKey: '0x...',
	testnet: true,
})
await hp.connect()

// Two-step: quote then execute (recommended)
const quote = await hp.quote('ETH', 'buy', 10)
// Review the quote...
const receipt = await hp.execute(quote.plan)
console.log(receipt.success) // true
console.log(receipt.filledSize) // "10"
console.log(receipt.avgPrice) // "3201.50"
console.log(receipt.market.coin) // "xyz:ETH100"

// One-step convenience
const receipt2 = await hp.long('ETH', 10)
const receipt3 = await hp.short('BTC', 0.5)

// Unified position view across all HIP-3 markets
const positions = await hp.getGroupedPositions()
const ethPositions = positions.get('ETH')
// Shows all ETH positions across all HIP-3 markets in one group

// Account balance
const balance = await hp.getBalance()

await hp.disconnect()
```

### CLI

The `hp` CLI provides the same functionality from the terminal:

```bash
# Show all HIP-3 markets for an asset
hp markets ETH
hp markets ETH --json

# Aggregated orderbook
hp book ETH
hp book ETH --depth 10

# Compare funding rates across markets
hp funding ETH

# Get a routing quote (does not execute)
hp quote ETH buy 10

# Execute trades via best market
hp long ETH 10 --key 0x...
hp short BTC 0.5 --key 0x...

# View positions and balance
hp positions --key 0x...
hp balance --key 0x...

# Use testnet
hp markets ETH --testnet
```

## How Routing Works

When you call `hp.quote("ETH", "buy", 10)`, the router:

1. **Fetches** the orderbook for every ETH market (native + all HIP-3 deployers)
2. **Simulates** walking each book to estimate average fill price and price impact at the requested size
3. **Scores** each market using three factors:
    - **Price impact** (dominant) — cost in basis points to fill
    - **Funding rate** (secondary) — prefers favorable funding direction
    - **Collateral match** (penalty) — heavily penalizes markets where you don't hold the required collateral (no auto-swap in v0)
4. **Selects** the lowest-score market and builds an execution plan with IOC limit order + slippage

The result is a `Quote` object containing the selected market, estimated cost, and a ready-to-execute `ExecutionPlan`. You review it, then call `execute(plan)` to place the order.

## Configuration

```typescript
interface HyperliquidPrimeConfig {
	privateKey?: `0x${string}` // Required for trading, optional for read-only
	walletAddress?: string // Derived from privateKey if not provided
	testnet?: boolean // Default: false
	defaultSlippage?: number // Default: 0.01 (1%)
	logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent'
	prettyLogs?: boolean // Default: false
}
```

## API Reference

### Read-Only Methods

| Method                        | Description                           |
| ----------------------------- | ------------------------------------- |
| `getMarkets(asset)`           | All HIP-3 markets for an asset        |
| `getAggregatedMarkets()`      | Asset groups with multiple markets    |
| `getAggregatedBook(asset)`    | Merged orderbook across all markets   |
| `getFundingComparison(asset)` | Funding rates compared across markets |
| `quote(asset, side, size)`    | Routing quote (does not execute)      |

### Trading Methods (wallet required)

| Method               | Description                          |
| -------------------- | ------------------------------------ |
| `execute(plan)`      | Execute a previously generated quote |
| `long(asset, size)`  | Quote + execute a long in one call   |
| `short(asset, size)` | Quote + execute a short in one call  |
| `close(asset)`       | Close all positions for an asset     |

### Position & Balance

| Method                  | Description                        |
| ----------------------- | ---------------------------------- |
| `getPositions()`        | All positions with market metadata |
| `getGroupedPositions()` | Positions grouped by base asset    |
| `getBalance()`          | Account margin summary             |

### Escape Hatches

| Property     | Description                                         |
| ------------ | --------------------------------------------------- |
| `hp.api`     | Direct access to the `HLProvider` for raw API calls |
| `hp.markets` | Direct access to the `MarketRegistry`               |

## Architecture

```
hyperliquid-prime/
├── src/
│   ├── index.ts              # HyperliquidPrime class — public API surface
│   ├── config.ts             # Configuration types
│   ├── provider/             # Wraps @nktkas/hyperliquid
│   │   ├── provider.ts       # HLProvider interface
│   │   ├── nktkas.ts         # Implementation
│   │   └── types.ts          # Normalized types
│   ├── market/               # HIP-3 market discovery
│   │   ├── registry.ts       # Discovers & indexes markets per asset
│   │   ├── book.ts           # Book normalization helpers
│   │   ├── aggregator.ts     # Merges books across collateral types
│   │   └── types.ts          # HIP3Market, MarketGroup, AggregatedBook
│   ├── router/               # Smart order routing
│   │   ├── router.ts         # Scores markets, picks best one
│   │   ├── simulator.ts      # Walks books, estimates fill cost
│   │   ├── scorer.ts         # Ranks by impact + funding + collateral
│   │   └── types.ts          # Quote, ExecutionPlan, MarketScore
│   ├── execution/            # Order lifecycle
│   │   ├── executor.ts       # Places orders via provider
│   │   ├── monitor.ts        # Tracks order status via WebSocket
│   │   └── types.ts          # ExecutionReceipt
│   ├── position/             # Position tracking
│   │   ├── manager.ts        # Read-only position tracking
│   │   ├── risk.ts           # Per-position risk math
│   │   └── types.ts          # LogicalPosition, RiskProfile
│   ├── cli/                  # CLI commands
│   │   ├── index.ts          # Entry point
│   │   ├── program.ts        # Commander setup + all commands
│   │   ├── context.ts        # Builds HyperliquidPrime from CLI flags
│   │   └── output.ts         # JSON / table formatting
│   ├── logging/              # Structured logging (pino)
│   └── utils/                # Math helpers, error types
└── test/
    ├── fixtures/             # Deterministic test data
    ├── unit/                 # Unit tests (mock provider)
    └── integration/          # Testnet integration tests
```

The provider interface (`HLProvider`) is the only module that imports `@nktkas/hyperliquid` directly. Swapping to a different SDK or going direct is a one-file change.

## Development

```bash
npm install
npm run build          # Compile TypeScript
npm test               # Run unit tests
npm run test:watch     # Watch mode
npm run typecheck      # Type check without emitting
npm run hp -- markets ETH --testnet   # Run CLI in dev mode
```

## License

MIT
