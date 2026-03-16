/**
 * Post-build prerender script.
 * Renders the landing page ("/") to static HTML and injects it into the built
 * index.html so that search-engine crawlers see real content instead of an
 * empty <div id="root"></div>.
 *
 * Run after `vite build`:  tsx scripts/prerender.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distIndex = path.resolve(__dirname, "../dist/web/index.html");

async function prerender() {
  const { render } = await import("../web/src/entry-prerender.tsx");
  const appHtml = render();

  let template = fs.readFileSync(distIndex, "utf-8");
  template = template.replace(
    '<div id="root"></div>',
    `<div id="root">${appHtml}</div>`,
  );
  fs.writeFileSync(distIndex, template);

  console.log("Prerendered / → dist/web/index.html");
}

prerender().catch((err) => {
  console.error("Prerender failed:", err);
  process.exit(1);
});
