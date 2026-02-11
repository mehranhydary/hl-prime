---
name: hyperliquid-prime
description: Trade on Hyperliquid's HIP-3 markets with intelligent order routing. Use when the user wants to trade crypto, stocks, or commodities on Hyperliquid, get best execution across fragmented markets, compare funding rates, view aggregated orderbooks, or manage positions across multiple collateral types. Provides unified access to Hyperliquid's prime broker layer for routing trades to optimal markets based on price impact, funding rates, and collateral matching.
---

# Hyperliquid Prime

A TypeScript SDK that acts as a **prime broker layer** on top of Hyperliquid's HIP-3 markets. Automatically discovers all markets for an asset, compares liquidity/funding/cost, and routes to the best execution — presenting a single unified trading interface.

## When to Use This Skill

- Trading crypto, stocks (AAPL, NVDA, TSLA), indexes, or commodities (GOLD, SILVER) on Hyperliquid
- Need best execution across multiple HIP-3 markets for the same asset
- Comparing funding rates across different collateral types
- Aggregated orderbook view across fragmented markets
- Managing positions that may be spread across multiple collateral types

## Quick Start

### Installation

```bash
npm install hyperliquid-prime
```

### Read-Only Usage (no wallet needed)

```typescript
import { HyperliquidPrime } from 'hyperliquid-prime'

const hp = new HyperliquidPrime({ testnet: true })
await hp.connect()

// Get all HIP-3 markets for an asset
const markets = hp.getMarkets('TSLA')

// Get routing quote for best execution
const quote = await hp.quote('TSLA', 'buy', 50)

// Aggregated orderbook
const book = await hp.getAggregatedBook('TSLA')

// Funding rate comparison
const funding = await hp.getFundingComparison('TSLA')

await hp.disconnect()
```

### Trading (wallet required)

```typescript
const hp = new HyperliquidPrime({
  privateKey: '0x...',
  testnet: true,
})
await hp.connect()

// Quote then execute (recommended)
const quote = await hp.quote('TSLA', 'buy', 50)
const receipt = await hp.execute(quote.plan)

// One-step convenience
const receipt2 = await hp.long('TSLA', 50)
const receipt3 = await hp.short('TSLA', 25)

// Unified position view
const positions = await hp.getGroupedPositions()

await hp.disconnect()
```

### CLI

```bash
# Show all HIP-3 markets for an asset
hp markets TSLA

# Aggregated orderbook
hp book TSLA

# Compare funding rates
hp funding TSLA

# Get routing quote
hp quote TSLA buy 50

# Execute trades
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

1. **Fetches** the orderbook for every TSLA market
2. **Simulates** walking each book to estimate average fill price and price impact
3. **Scores** each market using:
   - **Price impact** (dominant) — cost in basis points to fill
   - **Funding rate** (secondary) — prefers favorable funding direction
   - **Collateral match** (penalty) — penalizes markets where you don't hold the required collateral
4. **Selects** the lowest-score market and builds an execution plan

## Configuration

```typescript
interface HyperliquidPrimeConfig {
  privateKey?: `0x${string}` // Required for trading
  walletAddress?: string       // Derived from privateKey if not provided
  testnet?: boolean            // Default: false
  defaultSlippage?: number     // Default: 0.01 (1%)
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent'
  prettyLogs?: boolean         // Default: false
}
```

## Key Methods

### Read-Only
- `getMarkets(asset)` — All HIP-3 markets for an asset
- `getAggregatedMarkets()` — Asset groups with multiple markets
- `getAggregatedBook(asset)` — Merged orderbook across all markets
- `getFundingComparison(asset)` — Funding rates compared across markets
- `quote(asset, side, size)` — Routing quote (does not execute)

### Trading (wallet required)
- `execute(plan)` — Execute a previously generated quote
- `long(asset, size)` — Quote + execute a long in one call
- `short(asset, size)` — Quote + execute a short in one call
- `close(asset)` — Close all positions for an asset

### Position & Balance
- `getPositions()` — All positions with market metadata
- `getGroupedPositions()` — Positions grouped by base asset
- `getBalance()` — Account margin summary

## Repository

<https://github.com/mehranhydary/hl-prime>

## License

MIT
