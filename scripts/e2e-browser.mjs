#!/usr/bin/env node
/**
 * Real-browser end-to-end test: loads the unpacked extension in Chrome,
 * opens the multi-view grid, and asserts that every <video> actually
 * advances past 0s. Also exercises adding/removing panes up to the limit.
 *
 * Run: node scripts/e2e-browser.mjs
 */
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = resolve(__dirname, "..");

const STREAMS = [
  "https://zlive.st/watch/auto-sky-sport-2-nz",
  "https://zlive.st/watch/auto-sky-sport-4-nz",
];

const PLAYBACK_TIMEOUT_MS = 45000;
const MAX_PANES = 9;

function findChrome() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
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

function probeAllPanes(page, expected) {
  return page.evaluate(
    async ({ expected, timeout }) => {
      const deadline = Date.now() + timeout;

      const snapshot = () =>
        [...document.querySelectorAll("[data-pane-id]")].map((pane, index) => {
          const video = pane.querySelector("video");
          const badge = pane.querySelector(".stream-badge");
          return {
            index: index + 1,
            title: pane.querySelector(".pane-title")?.textContent || "",
            badge: badge?.textContent || "",
            error: Boolean(badge?.classList.contains("error")),
            playing: Boolean(video && video.currentTime > 0.5 && video.readyState >= 3),
            currentTime: video ? Number(video.currentTime.toFixed(2)) : null,
            width: video?.videoWidth ?? 0,
            height: video?.videoHeight ?? 0,
            muted: video?.muted ?? null,
          };
        });

      while (Date.now() < deadline) {
        const panes = snapshot();
        if (panes.length >= expected && panes.every((p) => p.playing || p.error)) return panes;
        await new Promise((r) => setTimeout(r, 500));
      }

      return snapshot();
    },
    { expected, timeout: PLAYBACK_TIMEOUT_MS }
  );
}

async function main() {
  const executablePath = findChrome();
  console.log("Dual Stream — browser e2e test");
  console.log(`chrome:    ${executablePath.split("/").slice(-1)[0]}`);
  console.log(`extension: ${EXTENSION_PATH}\n`);

  const browser = await puppeteer.launch({
    executablePath,
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

  let exitCode = 0;
  const fail = (msg) => {
    exitCode = 1;
    console.error(`✗ ${msg}`);
  };

  try {
    const extensionId = await getExtensionId(browser);
    console.log(`extension id: ${extensionId}\n`);

    const viewerUrl =
      `chrome-extension://${extensionId}/viewer/viewer.html?` +
      STREAMS.map((s) => `s=${encodeURIComponent(s)}`).join("&");

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 860 });

    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

    await page.goto(viewerUrl, { waitUntil: "domcontentloaded" });

    console.log("— playback —");
    const panes = await probeAllPanes(page, STREAMS.length);

    panes.forEach((pane) => {
      if (pane.playing) {
        console.log(`✓ pane ${pane.index}  ${pane.title}`);
        console.log(`  ${pane.currentTime}s · ${pane.width}x${pane.height} · muted=${pane.muted}`);
        console.log(`  badge: ${pane.badge}`);
      } else {
        fail(`pane ${pane.index} (${pane.title}) not playing — ${pane.badge || "no badge"}`);
      }
    });

    if (panes.length !== STREAMS.length) {
      fail(`expected ${STREAMS.length} panes, found ${panes.length}`);
    }

    console.log("\n— audio focus —");
    const readAudio = () =>
      page.evaluate(() => {
        const panes = [...document.querySelectorAll("[data-pane-id]")];
        return {
          unmuted: panes.filter((p) => {
            const v = p.querySelector("video");
            return v && !v.muted;
          }).length,
          highlighted: panes.filter((p) => p.classList.contains("is-audio")).length,
          highlightedIndex: panes.findIndex((p) => p.classList.contains("is-audio")) + 1,
        };
      });

    const initial = await readAudio();
    if (initial.unmuted <= 1 && initial.unmuted === initial.highlighted) {
      console.log(`✓ ${initial.unmuted} stream unmuted, highlight matches (pane ${initial.highlightedIndex || "none"})`);
    } else {
      fail(`audio state inconsistent: ${JSON.stringify(initial)}`);
    }

    // Keyboard: "2" moves audio to the second pane, and only that one.
    await page.click("body");
    await page.keyboard.press("2");
    await new Promise((r) => setTimeout(r, 400));

    const switched = await readAudio();
    if (switched.highlightedIndex === 2 && switched.unmuted === 1 && switched.highlighted === 1) {
      console.log("✓ pressing 2 moves audio to pane 2 and mutes the rest");
    } else {
      fail(`keyboard audio switch failed: ${JSON.stringify(switched)}`);
    }

    await page.keyboard.press("m");
    await new Promise((r) => setTimeout(r, 300));
    const muted = await readAudio();
    if (muted.unmuted === 0 && muted.highlighted === 0) {
      console.log("✓ pressing m mutes every stream");
    } else {
      fail(`mute-all failed: ${JSON.stringify(muted)}`);
    }

    await page.screenshot({ path: resolve(EXTENSION_PATH, "test-result.png") });

    console.log("\n— grid capacity —");
    const capacity = await page.evaluate(async (max) => {
      const api = window.DualStreamViewer;
      while (api.state.panes.length < max) api.addPane("", { focus: false });
      const afterFill = api.state.panes.length;
      const blocked = api.addPane("", { focus: false });
      const cols = getComputedStyle(document.getElementById("grid")).getPropertyValue("--cols").trim();
      const domPanes = document.querySelectorAll("[data-pane-id]").length;
      return { afterFill, blocked, cols, domPanes };
    }, MAX_PANES);

    if (capacity.afterFill === MAX_PANES && capacity.blocked === null) {
      console.log(`✓ grid holds ${MAX_PANES} panes and refuses a 10th`);
      console.log(`  columns=${capacity.cols} · rendered=${capacity.domPanes}`);
    } else {
      fail(`capacity check failed: ${JSON.stringify(capacity)}`);
    }

    await page.screenshot({ path: resolve(EXTENSION_PATH, "test-result-grid.png") });

    console.log("\n— popup —");
    // Give the popup a real http tab to list.
    const sample = await browser.newPage();
    await sample
      .goto("https://example.com", { waitUntil: "domcontentloaded", timeout: 15000 })
      .catch(() => console.log("  (example.com unreachable — tab list may be empty)"));

    const popup = await browser.newPage();
    const popupErrors = [];
    popup.on("pageerror", (err) => popupErrors.push(err.message));
    await popup.setViewport({ width: 340, height: 560 });
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`, {
      waitUntil: "networkidle2",
    });
    await new Promise((r) => setTimeout(r, 800));

    const popupState = await popup.evaluate(() => ({
      rows: document.querySelectorAll(".tab-row").length,
      icons: document.querySelectorAll("[data-icon] svg").length,
      openLabel: document.getElementById("open-selected").textContent.trim(),
    }));

    if (!popupErrors.length && popupState.icons > 0 && popupState.rows > 0) {
      console.log(`✓ popup renders (${popupState.rows} tabs, ${popupState.icons} icons)`);
      console.log(`  primary action: "${popupState.openLabel}"`);
    } else {
      fail(`popup problems: ${popupErrors.join("; ") || "icons did not render"}`);
    }

    await popup.screenshot({ path: resolve(EXTENSION_PATH, "test-result-popup.png") });

    console.log(
      "\nscreenshots: test-result.png (playback), test-result-grid.png (9-up), test-result-popup.png"
    );

    const realErrors = consoleErrors.filter((e) => !/favicon|ERR_FILE_NOT_FOUND/i.test(e));
    if (realErrors.length) {
      console.log("\nconsole errors:");
      realErrors.slice(0, 10).forEach((e) => console.log(`  ${e}`));
    }

    console.log(exitCode === 0 ? "\nAll browser checks passed" : "\nFAILED — see errors above");
  } finally {
    await browser.close();
  }

  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
