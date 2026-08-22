#!/usr/bin/env node
/**
 * Network test for ondemand.st stream resolution.
 * Run: node scripts/e2e-ondemand.mjs
 */
const WATCH_URL = "https://ondemand.st/live/nrl/2026-08-22/new-man";
const MATCH_ID = "nrl/2026-08-22/new-man";

async function resolveOndemand(matchId) {
  const extractUrl = `https://ondemand.st/papi/extract-url/${encodeURIComponent(matchId)}`;
  const response = await fetch(extractUrl, {
    headers: {
      Referer: `https://ondemand.st/embed/?id=${encodeURIComponent(matchId)}`,
      Origin: "https://ondemand.st",
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`extract-url HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data?.success || !data.hlsUrl) {
    throw new Error(data?.message || "No hlsUrl in response (event may be offline)");
  }

  return data.hlsUrl;
}

async function probeManifest(url) {
  const response = await fetch(url, {
    headers: {
      Referer: "https://ondemand.st/",
      Origin: "https://ondemand.st",
      Accept: "*/*",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
  });

  const text = await response.text();
  return { ok: response.ok, status: response.status, text, url: response.url };
}

async function main() {
  console.log("Dual Stream — ondemand e2e test\n");
  console.log(`watch: ${WATCH_URL}\n`);

  try {
    const streamUrl = await resolveOndemand(MATCH_ID);
    console.log(`✓ resolved`);
    console.log(`  ${streamUrl.slice(0, 90)}…\n`);

    const manifest = await probeManifest(streamUrl);
    if (manifest.text.startsWith("#EXTM3U")) {
      console.log(`✓ manifest OK (${manifest.text.length} bytes)`);
      console.log("All ondemand checks passed");
      return;
    }

    if (/not available|403|Forbidden/i.test(manifest.text)) {
      console.log(`⚠ manifest blocked/offline (${manifest.status}) — resolver works, stream not live right now`);
      console.log(`  body: ${manifest.text.slice(0, 80)}`);
      process.exit(0);
    }

    throw new Error(`Unexpected manifest body: ${manifest.text.slice(0, 80)}`);
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  }
}

main();
