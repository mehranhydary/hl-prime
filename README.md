# Hyperliquid Prime

A TypeScript SDK that acts as a **prime broker layer** on top of Hyperliquid's perp markets — both native (ETH, BTC) and HIP-3 deployer markets (xyz's TSLA, Hyena's ETH). When multiple venues list the same asset with different collateral types (USDC, USDH, USDT0), Hyperliquid Prime automatically discovers all markets, compares liquidity/funding/cost, and routes to the best execution — presenting a single unified trading interface.

## The Problem

Hyperliquid has native perpetual markets (ETH, BTC, SOL) and HIP-3, which allows anyone to deploy additional perp markets. This means ETH can be traded on both the native HL market *and* third-party deployers like Hyena — each with different liquidity depth and funding rates. Similarly, TSLA exists across multiple HIP-3 venues (xyz, flx, km, cash) with different collateral types. Traders are left manually comparing across fragmented markets.

## What Hyperliquid Prime Does

- **Discovers** all perp markets per asset (native + HIP-3) and groups them
- **Aggregates** orderbooks across collateral types into a unified view
- **Routes** orders to the single best market based on price impact, funding rate, and collateral match
- **Splits** large orders across multiple markets for better fills when a single venue lacks depth
- **Swaps collateral** automatically (e.g., USDC → USDH) when the best liquidity lives on a non-USDC market
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

// What markets exist for ETH? (native HL + HIP-3 deployers)
const ethMarkets = hp.getMarkets('ETH')
// [
//   { coin: "ETH", dexName: "__native__", collateral: "USDC", isNative: true },
//   { coin: "hyena:ETH", dexName: "hyena", collateral: "USDC", isNative: false },
// ]

// HIP-3-only assets also work
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

// --- Split orders across multiple markets for better fills ---
const splitQuote = await hp.quoteSplit('TSLA', 'buy', 200)
console.log(splitQuote.allocations)
// [
//   { market: xyz:TSLA, size: 120, proportion: 0.6 },
//   { market: flx:TSLA, size: 50, proportion: 0.25 },
//   { market: km:TSLA, size: 30, proportion: 0.15 },
// ]
console.log(splitQuote.collateralPlan.swapsNeeded) // true (USDH needed)

const splitReceipt = await hp.executeSplit(splitQuote.splitPlan)
console.log(splitReceipt.totalFilledSize) // "200"
console.log(splitReceipt.aggregateAvgPrice) // "431.42"

// One-step split convenience
const splitReceipt2 = await hp.longSplit('TSLA', 200)
const splitReceipt3 = await hp.shortSplit('TSLA', 100)

// Unified position view across all perp markets
const positions = await hp.getGroupedPositions()
const tslaPositions = positions.get('TSLA')
// Shows all TSLA positions across all markets in one group

// Account balance
const balance = await hp.getBalance()

await hp.disconnect()
```

### CLI

The `hp` CLI provides the same functionality from the terminal:

```bash
# Show all perp markets for an asset (native + HIP-3)
hp markets ETH
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

### Single-Market Routing

When you call `hp.quote("TSLA", "buy", 50)`, the router:

1. **Fetches** the orderbook for every TSLA market (xyz, flx, km, cash)
2. **Simulates** walking each book to estimate average fill price and price impact at the requested size
3. **Scores** each market using three factors:
    - **Price impact** (dominant) — cost in basis points to fill
    - **Funding rate** (secondary) — prefers favorable funding direction
    - **Collateral match** (penalty) — penalizes markets by the estimated cost to swap into their collateral (e.g., ~50 bps for USDC → USDH)
4. **Selects** the lowest-score market and builds an execution plan with IOC limit order + slippage

The result is a `Quote` object containing the selected market, estimated cost, and a ready-to-execute `ExecutionPlan`. You review it, then call `execute(plan)` to place the order.

### Split Routing (Multi-Market)

When you call `hp.quoteSplit("TSLA", "buy", 200)`, the router:

1. **Aggregates** all orderbooks into a single merged book with source tracking
2. **Walks** the merged book greedily — always consuming the cheapest liquidity first, regardless of venue
3. **Distributes** fills proportionally across sources at each price level
4. **Estimates collateral costs** — checks your spot balances and simulates swap costs on the spot market for any non-USDC collateral you'd need
5. **Builds** a `SplitExecutionPlan` with one leg per market

On execution, the system automatically:
- Enables **DEX abstraction** (Hyperliquid's unified account mode)
- **Transfers** USDC from perp to spot if needed
- **Swaps** USDC → target tokens (e.g., USDH) via spot market
- **Places all leg orders** in a single atomic `batchOrders` call

If only one market has competitive liquidity, 100% routes there — equivalent to single-market behavior.

## Configuration

```typescript
interface HyperliquidPrimeConfig {
	privateKey?: `0x${string}` // Required for trading, optional for read-only
	walletAddress?: string // Derived from privateKey if not provided
	testnet?: boolean // Default: false
	defaultSlippage?: number // Default: 0.01 (1%)
	logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent'
	prettyLogs?: boolean // Default: false
	builder?: BuilderConfig | null // Builder fee config (see below)
}
```

### Builder Fee

Hyperliquid Prime includes a small builder fee (1 basis point = 0.01%) on all orders placed through the SDK's execution methods. This uses Hyperliquid's native [builder fee](https://hyperliquid.gitbook.io/hyperliquid-docs) mechanism.

The fee is automatically approved on the trader's first order (one-time on-chain action per wallet).

```typescript
// Default: 1 bps fee (no config needed)
const hp = new HyperliquidPrime({ privateKey: '0x...' })

// Custom builder address and fee
const hp = new HyperliquidPrime({
	privateKey: '0x...',
	builder: { address: '0xYourAddress', feeBps: 2 }, // 2 bps
})

// Disable builder fee entirely
const hp = new HyperliquidPrime({
	privateKey: '0x...',
	builder: null,
})
```

The builder fee only applies to orders placed through `execute()`, `executeSplit()`, and their convenience wrappers (`long`, `short`, `longSplit`, `shortSplit`). Raw provider calls via `hp.api` are never affected.

CLI flag to disable:
```bash
hp long TSLA 50 --key 0x... --no-builder-fee
```

## API Reference

### Read-Only Methods

| Method                           | Description                                  |
| -------------------------------- | -------------------------------------------- |
| `getMarkets(asset)`              | All perp markets for an asset (native + HIP-3) |
| `getAggregatedMarkets()`         | Asset groups with multiple markets            |
| `getAggregatedBook(asset)`       | Merged orderbook across all markets           |
| `getFundingComparison(asset)`    | Funding rates compared across markets         |
| `quote(asset, side, size)`       | Routing quote for single best market          |
| `quoteSplit(asset, side, size)`  | Split quote across multiple markets           |

### Trading Methods (wallet required)

| Method                    | Description                                       |
| ------------------------- | ------------------------------------------------- |
| `execute(plan)`           | Execute a single-market quote                     |
| `executeSplit(plan)`      | Execute a split quote (handles collateral swaps)  |
| `long(asset, size)`       | Quote + execute a long on best market             |
| `short(asset, size)`      | Quote + execute a short on best market            |
| `longSplit(asset, size)`  | Split quote + execute a long across markets       |
| `shortSplit(asset, size)` | Split quote + execute a short across markets      |
| `close(asset)`            | Close all positions for an asset                  |

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
│   ├── market/               # Perp market discovery (native + HIP-3)
│   │   ├── registry.ts       # Discovers & indexes all perp markets per asset
│   │   ├── book.ts           # Book normalization helpers
│   │   ├── aggregator.ts     # Merges books across collateral types
│   │   └── types.ts          # PerpMarket, MarketGroup, AggregatedBook
│   ├── router/               # Smart order routing
│   │   ├── router.ts         # Scores markets, picks best one (or splits across many)
│   │   ├── simulator.ts      # Walks books, estimates fill cost
│   │   ├── scorer.ts         # Ranks by impact + funding + collateral swap cost
│   │   ├── splitter.ts       # Optimizes order splits across aggregated book
│   │   └── types.ts          # Quote, SplitQuote, ExecutionPlan, MarketScore
│   ├── execution/            # Order lifecycle
│   │   ├── executor.ts       # Places orders via provider (single + batch)
│   │   ├── monitor.ts        # Tracks order status via WebSocket
│   │   └── types.ts          # ExecutionReceipt, SplitExecutionReceipt
│   ├── collateral/           # Collateral management for cross-market trading
│   │   ├── manager.ts        # Estimates swap costs, executes USDC→token swaps
│   │   └── types.ts          # CollateralPlan, CollateralRequirement
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
"Show me all markets for GOLD"
"Compare funding rates across ETH markets"
"Get me a quote to short 100 NVDA"
"Execute that TSLA trade"
"Split 200 TSLA across all markets for better fills"
"Show my positions across all markets"
"Which market has the best price impact for buying 10 BTC?"
```

### How It Works

The OpenClaw skill provides:
- **Natural language market discovery** — "Find all markets for AAPL"
- **Intelligent routing guidance** — AI explains which market is best and why
- **Split order optimization** — "Split 200 TSLA across venues for lowest cost"
- **Quote explanations** — "The xyz:TSLA market has lowest price impact (0.8 bps) and favorable funding"
- **Automatic collateral handling** — Swaps USDC to USDH/USDT0 when needed for best execution
- **Aggregated data access** — View combined orderbooks and funding comparisons conversationally
- **Position summaries** — "Show my TSLA exposure across all collateral types"

### Configuration

The skill works with your existing Hyperliquid Prime installation. No additional config needed — it uses the SDK directly.

For trading (not read-only), ensure your OpenClaw agent has access to your wallet or private key configuration.

### Example Session

```
You: Find the best market for buying 100 UNI
Agent: Found 4 markets for UNI. Analyzing...

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

You: Split 500 TSLA across all markets
Agent: Analyzing liquidity across 4 TSLA markets...

Split plan:
- xyz:TSLA → 300 (60%) — USDC, 0.9 bps impact
- flx:TSLA → 120 (24%) — USDH, 1.4 bps impact
- km:TSLA → 80 (16%) — USDH, 2.1 bps impact

Collateral: Need 86,240 USDH — will swap from USDC (~12 bps cost)
Aggregate avg price: $431.42 (vs $432.10 single-market)

You: Execute the split
Agent: Executed 3-leg split order for 500 TSLA
Total filled: 500 TSLA at avg $431.42
Legs: xyz:TSLA (300), flx:TSLA (120), km:TSLA (80)
Collateral swaps: USDC → USDH completed
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
