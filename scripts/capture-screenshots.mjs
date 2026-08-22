#!/usr/bin/env node
/**
 * Regenerate basic dev screenshots (popup + zlive 2-up grid from e2e test).
 * Marketing PNGs in docs/screenshots/ are normally kept as committed static files.
 *
 * Run: npm run screenshots
 */
import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "docs/screenshots");

const copies = [
  ["test-result.png", "multi-view-2.png"],
  ["test-result-grid.png", "multi-view-9.png"],
  ["test-result-popup.png", "popup.png"],
];

mkdirSync(outDir, { recursive: true });

execSync("node scripts/e2e-browser.mjs", { cwd: root, stdio: "inherit" });

for (const [src, dest] of copies) {
  copyFileSync(resolve(root, src), resolve(outDir, dest));
  console.log(`→ docs/screenshots/${dest}`);
}

console.log("\nNote: stream-and-odds.png is a static marketing asset — replace manually if needed.");
