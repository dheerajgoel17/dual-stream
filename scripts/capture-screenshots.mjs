#!/usr/bin/env node
/**
 * Marketing screenshots using real stream + odds URLs.
 * Run: npm run screenshots
 */
import puppeteer from "puppeteer-core";
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = resolve(__dirname, "..");
const OUT_DIR = resolve(EXTENSION_PATH, "docs/screenshots");

const STREAMS = [
  "https://www.vipbox.fm/afl/melbourne-demons-vs-western-bulldogs-1-live",
  "https://ondemand.st/live/nrl/2026-08-22/new-man",
  "https://ondemand.st/channel/espn-usa",
  "https://ondemand.st/channel/fox-sports-1-usa",
  "https://ondemand.st/channel/nat-geo-wild-usa",
  "https://ondemand.st/channel/sport-1-cz",
];

const SCENARIOS = [
  {
    file: "multi-view-9.png",
    urls: [
      ...STREAMS,
      "https://ondemand.st/channel/nat-geo-wild-usa",
      "https://ondemand.st/channel/sport-1-cz",
      "https://ondemand.st/channel/espn-usa",
    ],
    timeout: 120000,
    viewport: { width: 1440, height: 900 },
  },
  {
    file: "multi-view-2.png",
    urls: [
      "https://ondemand.st/channel/espn-usa",
      "https://ondemand.st/channel/fox-sports-1-usa",
    ],
    timeout: 60000,
    viewport: { width: 1440, height: 860 },
  },
  {
    file: "stream-and-odds.png",
    urls: [
      "https://ondemand.st/live/nrl/2026-08-22/new-man",
      "https://black.betinasia.com/sportsbook/football/JP/170/2026-08-22,23022,785?origin=sportsbook",
    ],
    timeout: 90000,
    viewport: { width: 1440, height: 860 },
  },
];

function findChrome() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  const cacheDir = resolve(homedir(), ".cache/puppeteer/chrome");
  if (existsSync(cacheDir)) {
    for (const build of readdirSync(cacheDir).sort().reverse()) {
      const p = resolve(
        cacheDir,
        build,
        "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
      );
      if (existsSync(p)) candidates.unshift(p);
    }
  }
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("No Chrome binary found");
  return found;
}

async function getExtensionId(browser) {
  const worker = await browser.waitForTarget(
    (t) => t.type() === "service_worker" && t.url().startsWith("chrome-extension://"),
    { timeout: 30000 }
  );
  return new URL(worker.url()).hostname;
}

function viewerUrl(extensionId, urls) {
  const query = urls.map((url) => `s=${encodeURIComponent(url)}`).join("&");
  return `chrome-extension://${extensionId}/viewer/viewer.html?${query}`;
}

async function waitForPanes(page, expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastSnap = { ok: false, loaded: 0, total: 0 };

  while (Date.now() < deadline) {
    try {
      lastSnap = await page.evaluate((count) => {
        const panes = [...document.querySelectorAll("[data-pane-id]")];
        if (panes.length < count) return { ok: false, loaded: 0, total: panes.length };

        let loaded = 0;
        for (const pane of panes) {
          const video = pane.querySelector("video");
          const iframe = pane.querySelector("iframe");
          const pageShell = pane.querySelector(".page-shell");
          const status = pane.querySelector(".stream-badge");
          const playing = video && video.readyState >= 2;
          const hasFrame = Boolean(iframe || pageShell);
          const hasBadge = Boolean(status && !status.classList.contains("error"));
          if (playing || hasFrame || hasBadge) loaded += 1;
        }
        return { ok: loaded >= Math.min(count, 2) || loaded >= count * 0.6, loaded, total: panes.length };
      }, expected);
      if (lastSnap.ok) return lastSnap;
    } catch {
      /* viewer may reload while harvest tabs spin up */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  return lastSnap;
}

async function captureScenario(browser, extensionId, scenario) {
  const page = await browser.newPage();
  await page.setViewport(scenario.viewport);
  console.log(`\n— ${scenario.file} (${scenario.urls.length} panes) —`);

  await page.goto(viewerUrl(extensionId, scenario.urls), { waitUntil: "domcontentloaded" });

  const result = await waitForPanes(page, scenario.urls.length, scenario.timeout);
  console.log(`  panes loaded: ${result.loaded}/${scenario.urls.length} (rendered ${result.total})`);

  await new Promise((r) => setTimeout(r, 3000));
  const outPath = resolve(OUT_DIR, scenario.file);
  await page.screenshot({ path: outPath });
  console.log(`  → docs/screenshots/${scenario.file}`);
  await page.close();
}

async function capturePopup(browser, extensionId) {
  console.log("\n— popup.png —");
  const sample = await browser.newPage();
  await sample.goto("https://example.com", { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});

  const popup = await browser.newPage();
  await popup.setViewport({ width: 340, height: 580 });
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 600));

  const outPath = resolve(OUT_DIR, "popup.png");
  await popup.screenshot({ path: outPath });
  console.log("  → docs/screenshots/popup.png");
  await popup.close();
  await sample.close();
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--mute-audio",
      "--window-size=1440,900",
    ],
  });

  try {
    const extensionId = await getExtensionId(browser);
    console.log("Multi Streams — screenshot capture");
    console.log(`extension id: ${extensionId}`);

    for (const scenario of SCENARIOS) {
      await captureScenario(browser, extensionId, scenario);
    }
    await capturePopup(browser, extensionId);

    console.log("\nDone.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
