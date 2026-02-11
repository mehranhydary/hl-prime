/**
 * Research script: Fetch HIP-3 data from testnet to validate data model.
 * Run with: npx tsx research/fetch-hip3-data.ts
 */
import * as hl from "@nktkas/hyperliquid";

async function main() {
  const transport = new hl.HttpTransport({ isTestnet: true });
  const info = new hl.InfoClient({ transport });

  // 1. Get all deployers
  console.log("=== perpDexs() ===");
  const dexs = await info.perpDexs();
  console.log(`Found ${dexs.length} deployers`);
  for (const dex of dexs) {
    if (dex) {
      console.log(`  - ${dex.name} (deployer: ${dex.deployer})`);
    } else {
      console.log(`  - null (native/main dex)`);
    }
  }

  // 2. Get spot token metadata (for collateral resolution)
  console.log("\n=== spotMeta() ===");
  const spotMeta = await info.spotMeta();
  console.log(`Found ${spotMeta.tokens.length} spot tokens`);
  for (const token of spotMeta.tokens.slice(0, 20)) {
    console.log(`  index=${token.index}: ${token.name} (szDecimals=${token.szDecimals}, weiDecimals=${token.weiDecimals})`);
  }

  // 3. Get native perp meta (default dex = "")
  console.log("\n=== metaAndAssetCtxs('') - native ===");
  const [nativeMeta] = await info.metaAndAssetCtxs({ dex: "" });
  console.log(`Native: ${nativeMeta.universe.length} markets, collateralToken=${(nativeMeta as any).collateralToken}`);
  console.log(`First 5 native markets:`);
  for (const m of nativeMeta.universe.slice(0, 5)) {
    console.log(`  ${m.name} (szDecimals=${m.szDecimals}, maxLev=${m.maxLeverage})`);
  }

  // 4. Get per-deployer meta for each dex
  const dexNames = dexs
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .map((d) => d.name);

  for (const dexName of dexNames.slice(0, 5)) {
    console.log(`\n=== metaAndAssetCtxs('${dexName}') ===`);
    try {
      const [dexMeta, dexCtxs] = await info.metaAndAssetCtxs({ dex: dexName });
      const collateralToken = (dexMeta as any).collateralToken;
      const tokenName = spotMeta.tokens.find((t) => t.index === collateralToken)?.name ?? "UNKNOWN";
      console.log(`  ${dexMeta.universe.length} markets, collateralToken=${collateralToken} → ${tokenName}`);
      console.log(`  First 3 markets:`);
      for (const [i, m] of dexMeta.universe.slice(0, 3).entries()) {
        console.log(`    ${m.name} (funding=${dexCtxs[i]?.funding}, oi=${dexCtxs[i]?.openInterest}, delisted=${(m as any).isDelisted ?? false})`);
      }
    } catch (err) {
      console.log(`  ERROR: ${err}`);
    }
  }

  // 5. Get all perp metas at once
  console.log("\n=== allPerpMetas() ===");
  const allMetas = await info.allPerpMetas();
  console.log(`Found ${allMetas.length} total dex metas`);
  for (const [i, meta] of allMetas.entries()) {
    const collateralToken = (meta as any).collateralToken;
    const tokenName = spotMeta.tokens.find((t) => t.index === collateralToken)?.name ?? "UNKNOWN";
    console.log(`  [${i}] ${meta.universe.length} markets, collateralToken=${collateralToken} → ${tokenName}`);
  }

  // 6. Check extractBaseAsset logic against real data
  console.log("\n=== Base Asset Extraction Validation ===");
  const hip3Names: string[] = [];
  for (const dexName of dexNames.slice(0, 5)) {
    try {
      const [dexMeta] = await info.metaAndAssetCtxs({ dex: dexName });
      for (const m of dexMeta.universe) {
        if (m.name.includes(":")) {
          hip3Names.push(m.name);
        }
      }
    } catch {}
  }

  console.log(`Checking ${hip3Names.length} HIP-3 names:`);
  for (const name of hip3Names.slice(0, 20)) {
    const afterColon = name.split(":")[1];
    const stripped = afterColon.replace(/\d+$/, "");
    const hasTrailingDigits = afterColon !== stripped;
    console.log(`  ${name} → base="${stripped}" ${hasTrailingDigits ? "(digits stripped)" : "(no trailing digits)"}`);
  }
}

main().catch(console.error);
