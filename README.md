# Hyperliquid Prime

A TypeScript SDK that acts as a **prime broker layer** on top of Hyperliquid's HIP-3 markets. When multiple deployers list the same asset (e.g. TSLA) with different collateral types (USDC, USDH, USDT0), Hyperliquid Prime automatically discovers all markets, compares liquidity/funding/cost, and routes to the best execution — presenting a single unified trading interface.

## The Problem

HIP-3 allows anyone to deploy perpetual markets on Hyperliquid. This means TSLA can be traded across multiple venues — xyz, flx, km, and cash — each with different collateral, liquidity depth, and funding rates. Traders are left manually comparing across fragmented markets.

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

// What HIP-3 markets exist for TSLA?
const tslaMarkets = hp.getMarkets('TSLA')
// [
//   { coin: "xyz:TSLA", dexName: "xyz", collateral: "USDC", isNative: false },
//   { coin: "flx:TSLA", dexName: "flx", collateral: "USDH", isNative: false },
//   { coin: "km:TSLA", dexName: "km", collateral: "USDH", isNative: false },
//   { coin: "cash:TSLA", dexName: "cash", collateral: "USDT0", isNative: false },
// ]

// Where's the best execution for a 50 TSLA long?
const quote = await hp.quote('TSLA', 'buy', 50)
console.log(quote.selectedMarket.coin) // "xyz:TSLA"
console.log(quote.estimatedAvgPrice) // 431.56
console.log(quote.estimatedPriceImpact) // 0.8 (bps)
console.log(quote.alternativesConsidered) // All markets with scores

// Aggregated orderbook across all TSLA markets
const book = await hp.getAggregatedBook('TSLA')

// Funding rate comparison
const funding = await hp.getFundingComparison('TSLA')

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
const quote = await hp.quote('TSLA', 'buy', 50)
// Review the quote...
const receipt = await hp.execute(quote.plan)
console.log(receipt.success) // true
console.log(receipt.filledSize) // "50"
console.log(receipt.avgPrice) // "431.50"
console.log(receipt.market.coin) // "xyz:TSLA"

// One-step convenience
const receipt2 = await hp.long('TSLA', 50)
const receipt3 = await hp.short('TSLA', 25)

// Unified position view across all HIP-3 markets
const positions = await hp.getGroupedPositions()
const tslaPositions = positions.get('TSLA')
// Shows all TSLA positions across all HIP-3 markets in one group

// Account balance
const balance = await hp.getBalance()

await hp.disconnect()
```

### CLI

The `hp` CLI provides the same functionality from the terminal:

```bash
# Show all HIP-3 markets for an asset
hp markets TSLA
hp markets TSLA --json

# Aggregated orderbook
hp book TSLA
hp book TSLA --depth 10

# Compare funding rates across markets
hp funding TSLA

# Get a routing quote (does not execute)
hp quote TSLA buy 50

# Execute trades via best market
hp long TSLA 50 --key 0x...
hp short TSLA 25 --key 0x...

# View positions and balance
hp positions --key 0x...
hp balance --key 0x...

# Use testnet
hp markets TSLA --testnet
```

## How Routing Works

When you call `hp.quote("TSLA", "buy", 50)`, the router:

1. **Fetches** the orderbook for every TSLA market (xyz, flx, km, cash)
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

## OpenClaw Skill (AI-Assisted Trading)

Hyperliquid Prime includes an [OpenClaw](https://openclaw.ai) skill for AI-assisted trading via natural language.

### Installation

Install the skill via ClawHub:
```bash
clawhub install mehranhydary/hl-prime
```

Or manually clone to your OpenClaw skills directory:
```bash
cd ~/.openclaw/skills
git clone https://github.com/mehranhydary/hl-prime.git hyperliquid-prime
```

### What You Can Ask

Once the skill is installed, you can trade via conversational commands:

```
"What's the best market to buy 50 TSLA on Hyperliquid?"
"Show me all HIP-3 markets for GOLD"
"Compare funding rates across ETH markets"
"Get me a quote to short 100 NVDA"
"Execute that TSLA trade"
"Show my positions across all markets"
"Which market has the best price impact for buying 10 BTC?"
```

### How It Works

The OpenClaw skill provides:
- **Natural language market discovery** — "Find all markets for AAPL"
- **Intelligent routing guidance** — AI explains which market is best and why
- **Quote explanations** — "The xyz:TSLA market has lowest price impact (0.8 bps) and favorable funding"
- **Aggregated data access** — View combined orderbooks and funding comparisons conversationally
- **Position summaries** — "Show my TSLA exposure across all collateral types"

### Configuration

The skill works with your existing Hyperliquid Prime installation. No additional config needed — it uses the SDK directly.

For trading (not read-only), ensure your OpenClaw agent has access to your wallet or private key configuration.

### Example Session

```
You: Find the best market for buying 100 UNI
Agent: Found 4 HIP-3 markets for UNI. Analyzing...

Best route: xyz:UNI
- Price impact: 1.2 bps (lowest)
- Funding: -0.01% (you earn funding)
- Collateral: USDC (you hold USDC)

Alternative: cash:UNI
- Price impact: 2.8 bps
- Funding: +0.03%
- Collateral: USDT0

Recommendation: Route through xyz:UNI for lowest cost.

You: Execute it
Agent: Executed 100 UNI long on xyz:UNI
Filled: 100 UNI at avg price $12.34
Market: xyz:UNI
Status: success
```

See [openclaw/SKILL.md](./openclaw/SKILL.md) for full skill documentation.

## Development

```bash
npm install
npm run build          # Compile TypeScript
npm test               # Run unit tests
npm run test:watch     # Watch mode
npm run typecheck      # Type check without emitting
npm run hp -- markets TSLA --testnet   # Run CLI in dev mode
```

## License

MIT
