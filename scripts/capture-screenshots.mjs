#!/usr/bin/env node
/**
 * Run the e2e browser test (writes test-result*.png at repo root).
 * Marketing shot docs/screenshots/multiview-4.png is a static asset — replace manually.
 *
 * Run: npm run screenshots
 */
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

execSync("node scripts/e2e-browser.mjs", { cwd: root, stdio: "inherit" });

console.log(
  "\nNote: docs/screenshots/multiview-4.png is the marketing asset — replace manually if needed."
);