/**
 * Verify collateral resolution: ensure perpDexs() and allPerpMetas() align,
 * and that every collateralToken resolves to a known spot token.
 *
 * Run with: npx tsx research/verify-collateral.ts
 */
import * as hl from "@nktkas/hyperliquid";

async function main() {
  const transport = new hl.HttpTransport({ isTestnet: true });
  const info = new hl.InfoClient({ transport });

  // 1. Build spot token index map
  const spotMeta = await info.spotMeta();
  const tokenMap = new Map<number, string>();
  for (const t of spotMeta.tokens) {
    tokenMap.set(t.index, t.name);
  }
  console.log(`Loaded ${tokenMap.size} spot tokens\n`);

  // 2. Fetch dex list and all metas
  const dexs = await info.perpDexs();
  const allMetas = await info.allPerpMetas();

  console.log(`perpDexs count: ${dexs.length}`);
  console.log(`allPerpMetas count: ${allMetas.length}`);

  if (dexs.length !== allMetas.length) {
    console.error("MISMATCH: perpDexs and allPerpMetas have different lengths!");
    return;
  }

  // 3. Verify each dex's collateral resolves
  let unresolved = 0;
  const collateralCounts = new Map<string, number>();

  for (const [i, meta] of allMetas.entries()) {
    const dex = dexs[i];
    const dexName = dex ? dex.name : "__native__";
    const ct = (meta as any).collateralToken;
    const tokenName = tokenMap.get(ct);

    if (!tokenName) {
      console.error(`  UNRESOLVED: dex="${dexName}" collateralToken=${ct}`);
      unresolved++;
    }

    const name = tokenName ?? `UNKNOWN_${ct}`;
    collateralCounts.set(name, (collateralCounts.get(name) ?? 0) + 1);
  }

  // 4. Spot-check specific dexes
  console.log("\n=== Spot checks ===");
  for (const checkName of ["flx", "xyz", "felix"]) {
    const idx = dexs.findIndex((d) => d?.name === checkName);
    if (idx === -1) {
      console.log(`  ${checkName}: not found`);
      continue;
    }
    const ct = (allMetas[idx] as any).collateralToken;
    const resolved = tokenMap.get(ct) ?? "UNRESOLVED";
    console.log(`  ${checkName}: collateralToken=${ct} → ${resolved}`);

    // Cross-check with direct metaAndAssetCtxs call
    const [directMeta] = await info.metaAndAssetCtxs({ dex: checkName });
    const directCt = (directMeta as any).collateralToken;
    const match = ct === directCt ? "OK" : `MISMATCH (allPerpMetas=${ct}, direct=${directCt})`;
    console.log(`    cross-check: ${match}`);
  }

  // 5. Summary
  console.log("\n=== Collateral distribution ===");
  const sorted = [...collateralCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [name, count] of sorted) {
    console.log(`  ${name}: ${count} dexes`);
  }

  console.log(`\nTotal: ${dexs.length} dexes, ${unresolved} unresolved collateral tokens`);
}

main().catch(console.error);
