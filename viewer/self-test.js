/**
 * In-extension self test — open the viewer with ?autotest=1
 */
(async function runSelfTest() {
  const params = new URLSearchParams(location.search);
  if (params.get("autotest") !== "1") return;

  const channels = [
    "https://zlive.st/watch/auto-sky-sport-2-nz",
    "https://zlive.st/watch/auto-sky-sport-4-nz",
  ];

  const log = document.createElement("pre");
  log.id = "autotest-log";
  log.style.cssText =
    "position:fixed;inset:0;z-index:9999;background:#07090c;color:#2ee6c8;padding:24px;overflow:auto;font:12px/1.6 ui-monospace,monospace;margin:0;";
  document.body.appendChild(log);

  const write = (line) => {
    log.textContent += `${line}\n`;
  };

  let failed = 0;

  write("Dual Stream autotest\n");

  for (const url of channels) {
    write(`→ ${url}`);
    try {
      const resolved = await chrome.runtime.sendMessage({ type: "GET_STREAM_URL", url });
      if (!resolved?.ok) throw new Error(resolved?.error || "resolve failed");
      write(`  resolved ${resolved.streamUrl.slice(0, 72)}…`);

      const manifest = await chrome.runtime.sendMessage({
        type: "HLS_FETCH",
        url: resolved.streamUrl,
        referer: resolved.referer,
        origin: resolved.origin,
      });

      if (!manifest?.ok) throw new Error(manifest?.error || `manifest HTTP ${manifest?.status}`);
      if (manifest.kind !== "text") throw new Error(`expected text manifest, got ${manifest.kind}`);
      if (!manifest.data.startsWith("#EXTM3U")) throw new Error("invalid manifest body");

      write(`  manifest OK (${manifest.data.length} bytes)\n`);
    } catch (error) {
      failed += 1;
      write(`  FAIL ${error.message || error}\n`);
    }
  }

  write(failed ? `${failed} check(s) failed` : "All checks passed");
  write("\nRemove ?autotest=1 from the URL for normal use.");
})();
