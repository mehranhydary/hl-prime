---
name: hyperliquid-prime
description: Trade on Hyperliquid's perp markets (native + HIP-3) with intelligent order routing and cross-market splitting. Use when the user wants to trade crypto, stocks, or commodities on Hyperliquid, get best execution across fragmented markets, split large orders across multiple venues, compare funding rates, view aggregated orderbooks, or manage positions across multiple collateral types. Routes across both native HL perps (ETH, BTC) and HIP-3 deployer markets. Handles collateral swaps (USDC→USDH/USDT0) automatically when the best liquidity requires it.
---

# Hyperliquid Prime

A TypeScript SDK that acts as a **prime broker layer** on top of Hyperliquid's perp markets — both native (ETH, BTC) and HIP-3 deployer markets. Automatically discovers all markets for an asset, compares liquidity/funding/cost, and routes to the best execution — or splits across multiple venues for optimal fills with automatic collateral swaps.

## When to Use This Skill

- Trading crypto, stocks (AAPL, NVDA, TSLA), indexes, or commodities (GOLD, SILVER) on Hyperliquid
- Need best execution across multiple perp markets (native + HIP-3) for the same asset
- Splitting large orders across venues for better fills and lower price impact
- Comparing funding rates across different collateral types
- Aggregated orderbook view across fragmented markets
- Managing positions that may be spread across multiple collateral types
- Automatic collateral swaps (USDC → USDH, USDT0) when non-USDC markets offer better prices

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

// Get all perp markets for an asset (native + HIP-3)
const markets = hp.getMarkets('ETH') // or 'TSLA', 'BTC', etc.

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

// Split across multiple markets for better fills
const splitQuote = await hp.quoteSplit('TSLA', 'buy', 200)
const splitReceipt = await hp.executeSplit(splitQuote.splitPlan)
// Or one-step: await hp.longSplit('TSLA', 200)

// Unified position view
const positions = await hp.getGroupedPositions()

await hp.disconnect()
```

### CLI

```bash
# Show all perp markets for an asset (native + HIP-3)
hp markets ETH
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
   - **Collateral swap cost** (penalty) — estimated cost to swap into the required collateral
4. **Selects** the lowest-score market and builds an execution plan

For split orders (`quoteSplit`), the router merges all orderbooks, walks the combined book greedily to consume the cheapest liquidity first across all venues, and handles collateral swaps automatically.

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
- `getMarkets(asset)` — All perp markets for an asset (native + HIP-3)
- `getAggregatedMarkets()` — Asset groups with multiple markets
- `getAggregatedBook(asset)` — Merged orderbook across all markets
- `getFundingComparison(asset)` — Funding rates compared across markets
- `quote(asset, side, size)` — Routing quote for single best market
- `quoteSplit(asset, side, size)` — Split quote across multiple markets

### Trading (wallet required)
- `execute(plan)` — Execute a single-market quote
- `executeSplit(plan)` — Execute a split quote (handles collateral swaps)
- `long(asset, size)` — Quote + execute a long on best market
- `short(asset, size)` — Quote + execute a short on best market
- `longSplit(asset, size)` — Split quote + execute a long across markets
- `shortSplit(asset, size)` — Split quote + execute a short across markets
- `close(asset)` — Close all positions for an asset

### Position & Balance
- `getPositions()` — All positions with market metadata
- `getGroupedPositions()` — Positions grouped by base asset
- `getBalance()` — Account margin summary

## Repository

<https://github.com/mehranhydary/hl-prime>

## License

MIT
