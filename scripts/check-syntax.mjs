#!/usr/bin/env node
/**
 * Static checks: every JS file parses, manifest.json is valid, and every
 * file the manifest references actually exists.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const JS_FILES = [
  "background/service-worker.js",
  "content/content.js",
  "shared/embed.js",
  "shared/stream-detect.js",
  "shared/zlive.js",
  "shared/ondemand.js",
  "shared/aggregators.js",
  "shared/native-player.js",
  "shared/streaming.js",
  "shared/site-policy.js",
  "shared/tab-mirror.js",
  "viewer/viewer.js",
  "viewer/icons.js",
  "viewer/self-test.js",
  "popup/popup.js",
];

let failed = 0;

console.log("Dual Stream — static checks\n");

for (const file of JS_FILES) {
  try {
    execFileSync(process.execPath, ["--check", resolve(ROOT, file)], { stdio: "pipe" });
    console.log(`  OK   ${file}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${file}`);
    console.error(`       ${error.stderr?.toString().split("\n")[2] || error.message}`);
  }
}

const manifest = JSON.parse(readFileSync(resolve(ROOT, "manifest.json"), "utf8"));
const referenced = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  ...Object.values(manifest.icons || {}),
  ...(manifest.content_scripts || []).flatMap((cs) => [...(cs.js || []), ...(cs.css || [])]),
];

const missing = referenced.filter((file) => !existsSync(resolve(ROOT, file)));

console.log(`\n  manifest v${manifest.version} · ${manifest.permissions.join(", ")}`);

if (missing.length) {
  failed += 1;
  console.error(`  FAIL missing files: ${missing.join(", ")}`);
} else {
  console.log(`  OK   all ${referenced.length} referenced files exist`);
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}

console.log("\nAll static checks passed");
