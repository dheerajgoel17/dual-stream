#!/usr/bin/env node
/**
 * End-to-end test for zlive stream resolution + HLS manifest/segment fetch.
 * Run: node scripts/e2e-zlive.mjs
 */
const CHANNELS = [
  "auto-sky-sport-2-nz",
  "auto-sky-sport-4-nz",
];

const WATCH_URLS = CHANNELS.map((id) => `https://zlive.st/watch/${id}`);
const REFERER = "https://zlive.st/";
const ORIGIN = "https://zlive.st";

function channelFromWatchUrl(url) {
  const u = new URL(url);
  return decodeURIComponent(u.pathname.slice("/watch/".length).split("/")[0]);
}

function entryUrlForChannel(channelId) {
  const slug = channelId.replace(/^auto-/, "").replace(/^evt-/, "");
  return `https://iptv.fontaine.lol/${encodeURIComponent(slug)}`;
}

async function resolveZlive(channelId) {
  const entry = entryUrlForChannel(channelId);
  const response = await fetch(entry, {
    redirect: "follow",
    headers: { Referer: REFERER, Origin: ORIGIN },
  });
  if (!response.url.includes("m3u8")) {
    throw new Error(`Resolve failed for ${channelId}: ${response.status}`);
  }
  return response.url;
}

async function hlsFetch(url) {
  const isText = /\.m3u8(\?|$)/i.test(url);
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      Referer: REFERER,
      Origin: ORIGIN,
      Accept: "*/*",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
  });

  if (isText) {
    const text = await response.text();
    return { ok: response.ok, status: response.status, kind: "text", data: text, url: response.url };
  }

  const data = await response.arrayBuffer();
  return { ok: response.ok, status: response.status, kind: "binary", data, url: response.url };
}

function assertManifest(text) {
  if (!text.startsWith("#EXTM3U")) throw new Error("Manifest missing #EXTM3U");
  if (!text.includes("#EXTINF")) throw new Error("Manifest missing #EXTINF segments");
}

async function testChannel(watchUrl) {
  const channelId = channelFromWatchUrl(watchUrl);
  const streamUrl = await resolveZlive(channelId);
  const manifest = await hlsFetch(streamUrl);

  if (!manifest.ok) throw new Error(`Manifest HTTP ${manifest.status}`);
  if (manifest.kind !== "text") throw new Error("Manifest should be text");
  assertManifest(manifest.data);

  const segmentUrl = manifest.data.split("\n").map((l) => l.trim()).find((l) => l.startsWith("http"));
  if (!segmentUrl) throw new Error("No segment URL in manifest");

  const segment = await hlsFetch(segmentUrl);
  if (!segment.ok) throw new Error(`Segment HTTP ${segment.status}`);
  if (segment.kind !== "binary") throw new Error("Segment should be binary");
  if (segment.data.byteLength < 1000) throw new Error("Segment too small");

  return {
    channelId,
    streamUrl,
    manifestBytes: manifest.data.length,
    segmentBytes: segment.data.byteLength,
  };
}

async function main() {
  console.log("Dual Stream — zlive e2e test\n");
  let failed = 0;

  for (const watchUrl of WATCH_URLS) {
    try {
      const result = await testChannel(watchUrl);
      console.log(`✓ ${result.channelId}`);
      console.log(`  manifest: ${result.manifestBytes} bytes`);
      console.log(`  segment:  ${result.segmentBytes} bytes`);
      console.log(`  url:      ${result.streamUrl.slice(0, 72)}…\n`);
    } catch (error) {
      failed += 1;
      console.error(`✗ ${watchUrl}`);
      console.error(`  ${error.message}\n`);
    }
  }

  if (failed) {
    console.error(`${failed}/${WATCH_URLS.length} failed`);
    process.exit(1);
  }

  console.log(`All ${WATCH_URLS.length} streams OK`);
}

main();
