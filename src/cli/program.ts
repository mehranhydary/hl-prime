import { Command } from "commander";
import { createContext } from "./context.js";
import { output, formatTable } from "./output.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("hp")
    .description("Hyperliquid Prime CLI — unified HIP-3 market trading")
    .version("0.1.0")
    .option("--testnet", "Use Hyperliquid testnet", false)
    .option("--key <hex>", "Private key (hex) for trading")
    .option("--log-level <level>", "Log level", "warn")
    .option("--json", "Output as JSON", false);

  // hp markets <asset>
  program
    .command("markets")
    .description("Show all HIP-3 markets for an asset")
    .argument("<asset>", "Base asset symbol (e.g. ETH)")
    .action(async (asset: string) => {
      const opts = program.opts();
      const hp = await createContext(opts);
      try {
        const markets = hp.getMarkets(asset);
        if (opts.json) {
          output(markets, true);
        } else {
          if (markets.length === 0) {
            console.log(`No markets found for ${asset}`);
            return;
          }
          const table = formatTable(
            ["Coin", "Dex", "Collateral", "Native", "Funding", "OI", "Mark"],
            markets.map((m) => [
              m.coin,
              m.dexName,
              m.collateral,
              m.isNative ? "yes" : "no",
              m.funding ?? "-",
              m.openInterest ?? "-",
              m.markPrice ?? "-",
            ]),
          );
          console.log(table);
        }
      } finally {
        await hp.disconnect();
      }
    });

  // hp book <asset>
  program
    .command("book")
    .description("Show aggregated orderbook for an asset")
    .argument("<asset>", "Base asset symbol")
    .option("-d, --depth <n>", "Number of levels", "5")
    .action(async (asset: string, cmdOpts: { depth: string }) => {
      const opts = program.opts();
      const hp = await createContext(opts);
      try {
        const book = await hp.getAggregatedBook(asset);
        const depth = parseInt(cmdOpts.depth, 10);
        if (opts.json) {
          output(book, true);
        } else {
          console.log(`\nAggregated Book: ${asset}`);
          console.log("=".repeat(60));

          console.log("\nAsks (best first):");
          const asks = book.asks.slice(0, depth).reverse();
          for (const level of asks) {
            const sources = level.sources
              .map((s) => `${s.coin}:${s.sz.toFixed(4)}`)
              .join(", ");
            console.log(
              `  ${level.px.toFixed(2)}  |  ${level.sz.toFixed(4)}  [${sources}]`,
            );
          }

          console.log("  --- mid ---");

          console.log("Bids (best first):");
          const bids = book.bids.slice(0, depth);
          for (const level of bids) {
            const sources = level.sources
              .map((s) => `${s.coin}:${s.sz.toFixed(4)}`)
              .join(", ");
            console.log(
              `  ${level.px.toFixed(2)}  |  ${level.sz.toFixed(4)}  [${sources}]`,
            );
          }
        }
      } finally {
        await hp.disconnect();
      }
    });

  // hp funding <asset>
  program
    .command("funding")
    .description("Compare funding rates across markets")
    .argument("<asset>", "Base asset symbol")
    .action(async (asset: string) => {
      const opts = program.opts();
      const hp = await createContext(opts);
      try {
        const comparison = await hp.getFundingComparison(asset);
        if (opts.json) {
          output(comparison, true);
        } else {
          console.log(`\nFunding Comparison: ${asset}`);
          console.log("=".repeat(60));
          const table = formatTable(
            ["Coin", "Dex", "Collateral", "Funding Rate", "OI", "Mark"],
            comparison.markets.map((m) => [
              m.coin,
              m.dexName,
              m.collateral,
              (m.fundingRate * 100).toFixed(6) + "%",
              m.openInterest.toFixed(2),
              m.markPrice.toFixed(2),
            ]),
          );
          console.log(table);
          console.log(`\nBest for LONG:  ${comparison.bestForLong}`);
          console.log(`Best for SHORT: ${comparison.bestForShort}`);
        }
      } finally {
        await hp.disconnect();
      }
    });

  // hp quote <asset> <side> <size>
  program
    .command("quote")
    .description("Get a routing quote (does not execute)")
    .argument("<asset>", "Base asset symbol")
    .argument("<side>", "buy or sell")
    .argument("<size>", "Size in base asset units")
    .action(async (asset: string, side: string, size: string) => {
      const opts = program.opts();
      const hp = await createContext(opts);
      try {
        const quote = await hp.quote(
          asset,
          side as "buy" | "sell",
          parseFloat(size),
        );
        if (opts.json) {
          output(quote, true);
        } else {
          console.log(`\nQuote: ${side.toUpperCase()} ${size} ${asset}`);
          console.log("=".repeat(60));
          console.log(`Selected Market:  ${quote.selectedMarket.coin}`);
          console.log(`Dex:              ${quote.selectedMarket.dexName}`);
          console.log(`Collateral:       ${quote.selectedMarket.collateral}`);
          console.log(`Est. Avg Price:   ${quote.estimatedAvgPrice.toFixed(4)}`);
          console.log(
            `Est. Impact:      ${quote.estimatedPriceImpact.toFixed(2)} bps`,
          );
          console.log(
            `Funding Rate:     ${(quote.estimatedFundingRate * 100).toFixed(6)}%`,
          );
          console.log(
            `\nAlternatives considered: ${quote.alternativesConsidered.length}`,
          );
          for (const alt of quote.alternativesConsidered) {
            const marker =
              alt.market.coin === quote.selectedMarket.coin ? " <-- BEST" : "";
            console.log(
              `  ${alt.market.coin}: score=${alt.totalScore.toFixed(2)} impact=${alt.priceImpact.toFixed(2)}bps${alt.reason ? ` (${alt.reason})` : ""}${marker}`,
            );
          }
        }
      } finally {
        await hp.disconnect();
      }
    });

  // hp long <asset> <size>
  program
    .command("long")
    .description("Open a long position via best market")
    .argument("<asset>", "Base asset symbol")
    .argument("<size>", "Size in base asset units")
    .action(async (asset: string, size: string) => {
      const opts = program.opts();
      const hp = await createContext(opts);
      try {
        const receipt = await hp.long(asset, parseFloat(size));
        if (opts.json) {
          output(receipt, true);
        } else {
          console.log(
            receipt.success
              ? `LONG ${size} ${asset} via ${receipt.market.coin}: filled ${receipt.filledSize} @ ${receipt.avgPrice}`
              : `FAILED: ${receipt.error}`,
          );
        }
      } finally {
        await hp.disconnect();
      }
    });

  // hp short <asset> <size>
  program
    .command("short")
    .description("Open a short position via best market")
    .argument("<asset>", "Base asset symbol")
    .argument("<size>", "Size in base asset units")
    .action(async (asset: string, size: string) => {
      const opts = program.opts();
      const hp = await createContext(opts);
      try {
        const receipt = await hp.short(asset, parseFloat(size));
        if (opts.json) {
          output(receipt, true);
        } else {
          console.log(
            receipt.success
              ? `SHORT ${size} ${asset} via ${receipt.market.coin}: filled ${receipt.filledSize} @ ${receipt.avgPrice}`
              : `FAILED: ${receipt.error}`,
          );
        }
      } finally {
        await hp.disconnect();
      }
    });

  // hp positions
  program
    .command("positions")
    .description("Show all positions (unified view)")
    .action(async () => {
      const opts = program.opts();
      const hp = await createContext(opts);
      try {
        const grouped = await hp.getGroupedPositions();
        if (opts.json) {
          output(Object.fromEntries(grouped), true);
        } else {
          if (grouped.size === 0) {
            console.log("No open positions");
            return;
          }
          for (const [asset, positions] of grouped) {
            console.log(`\n${asset}:`);
            for (const pos of positions) {
              console.log(
                `  ${pos.side.toUpperCase()} ${pos.size.toFixed(4)} @ ${pos.entryPrice.toFixed(2)} | mark: ${pos.markPrice.toFixed(2)} | PnL: ${pos.unrealizedPnl.toFixed(2)} | lev: ${pos.leverage}x | via ${pos.coin}`,
              );
            }
          }
        }
      } finally {
        await hp.disconnect();
      }
    });

  // hp balance
  program
    .command("balance")
    .description("Show account balance")
    .action(async () => {
      const opts = program.opts();
      const hp = await createContext(opts);
      try {
        const balance = await hp.getBalance();
        if (opts.json) {
          output(balance, true);
        } else {
          console.log(`\nAccount Balance`);
          console.log("=".repeat(40));
          console.log(`Account Value:    ${balance.accountValue}`);
          console.log(`Margin Used:      ${balance.totalMarginUsed}`);
          console.log(`Notional Pos:     ${balance.totalNtlPos}`);
          console.log(`Raw USD:          ${balance.totalRawUsd}`);
        }
      } finally {
        await hp.disconnect();
      }
    });

  return program;
}
