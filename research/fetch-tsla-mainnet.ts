/**
 * Fetch all TSLA markets from Hyperliquid mainnet.
 * Run with: npx tsx research/fetch-tsla-mainnet.ts
 */
import * as hl from "@nktkas/hyperliquid";

async function main() {
  const transport = new hl.HttpTransport({ isTestnet: false });
  const info = new hl.InfoClient({ transport });

  // 1. Build spot token map
  const spotMeta = await info.spotMeta();
  const tokenMap = new Map<number, string>();
  for (const t of spotMeta.tokens) {
    tokenMap.set(t.index, t.name);
  }

  // 2. Get all deployers and metas
  const dexs = await info.perpDexs();
  const allMetas = await info.allPerpMetas();

  console.log(`Total deployers: ${dexs.length}`);
  console.log(`Total metas: ${allMetas.length}\n`);

  // 3. Find all TSLA markets
  const tslaMarkets: {
    coin: string;
    dexName: string;
    collateral: string;
    funding: string;
    openInterest: string;
    markPx: string;
    oraclePx: string;
    maxLeverage: number;
    assetIndex: number;
  }[] = [];

  for (const [dexIndex, meta] of allMetas.entries()) {
    const dex = dexs[dexIndex];
    const dexName = dex ? dex.name : "__native__";
    const ct = (meta as any).collateralToken;
    const collateral = tokenMap.get(ct) ?? `TOKEN_${ct}`;

    for (const [i, asset] of (meta as any).universe.entries()) {
      if (asset.isDelisted) continue;

      const name: string = asset.name;
      // Check if this is a TSLA market
      const isNative = dexName === "__native__";
      let baseAsset: string;
      if (isNative) {
        baseAsset = name;
      } else {
        const afterColon = name.split(":")[1];
        baseAsset = afterColon?.replace(/\d+$/, "") || afterColon || name;
      }

      if (baseAsset.toUpperCase() === "TSLA") {
        // Fetch asset context for this specific market
        const [, ctxs] = await info.metaAndAssetCtxs(dex ? { dex: dex.name } : undefined);
        const ctx = ctxs[i] as any;

        tslaMarkets.push({
          coin: name,
          dexName,
          collateral,
          funding: ctx?.funding ?? "N/A",
          openInterest: ctx?.openInterest ?? "N/A",
          markPx: ctx?.markPx ?? "N/A",
          oraclePx: ctx?.oraclePx ?? "N/A",
          maxLeverage: asset.maxLeverage,
          assetIndex: i,
        });
      }
    }
  }

  // 4. Print results
  console.log(`Found ${tslaMarkets.length} TSLA markets:\n`);
  console.log("=".repeat(100));

  for (const m of tslaMarkets) {
    console.log(`\n  Coin:          ${m.coin}`);
    console.log(`  Dex:           ${m.dexName}`);
    console.log(`  Collateral:    ${m.collateral}`);
    console.log(`  Mark Price:    ${m.markPx}`);
    console.log(`  Oracle Price:  ${m.oraclePx}`);
    console.log(`  Funding Rate:  ${m.funding}`);
    console.log(`  Open Interest: ${m.openInterest}`);
    console.log(`  Max Leverage:  ${m.maxLeverage}x`);
    console.log(`  Asset Index:   ${m.assetIndex}`);
  }

  // 5. Fetch order books for each TSLA market
  console.log("\n\n" + "=".repeat(100));
  console.log("ORDER BOOKS (top 3 levels):\n");

  for (const m of tslaMarkets) {
    try {
      const book = await info.l2Book({ coin: m.coin });
      const bids = (book as any).levels?.[0]?.slice(0, 3) ?? [];
      const asks = (book as any).levels?.[1]?.slice(0, 3) ?? [];

      console.log(`\n--- ${m.coin} (${m.dexName}, ${m.collateral}) ---`);
      console.log("  Asks:");
      for (const a of [...asks].reverse()) {
        console.log(`    ${a.px}  |  ${a.sz}  (${a.n} orders)`);
      }
      console.log("  --- mid ---");
      console.log("  Bids:");
      for (const b of bids) {
        console.log(`    ${b.px}  |  ${b.sz}  (${b.n} orders)`);
      }
    } catch (e: any) {
      console.log(`\n--- ${m.coin} ---`);
      console.log(`  Error fetching book: ${e.message}`);
    }
  }

  // 6. JSON dump for reference
  console.log("\n\n" + "=".repeat(100));
  console.log("JSON dump:\n");
  console.log(JSON.stringify(tslaMarkets, null, 2));
}

main().catch(console.error);
