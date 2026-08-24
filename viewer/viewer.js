const MAX_PANES = 9;

const grid = document.getElementById("grid");
const emptyState = document.getElementById("empty-state");
const drawer = document.getElementById("drawer");
const drawerList = document.getElementById("drawer-list");
const drawerHint = document.getElementById("drawer-hint");
const addSelectedBtn = document.getElementById("add-selected");
const streamCount = document.getElementById("stream-count");
const toastEl = document.getElementById("toast");
const paneTemplate = document.getElementById("pane-template");

/** @type {{panes: Array<{id:string,url:string,title:string,mode?:string,tabId?:number}>, layout:string, audioPaneId:string|null}} */
const state = {
  panes: [],
  layout: "auto",
  audioPaneId: null,
};

let paneSeq = 0;
let toastTimer = null;

const nextPaneId = () => `p${++paneSeq}`;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toast(message, isError) {
  toastEl.textContent = message;
  toastEl.classList.toggle("is-error", Boolean(isError));
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, isError ? 6000 : 3000);
}

function paneEl(paneId) {
  return grid.querySelector(`[data-pane-id="${paneId}"]`);
}

function playerMount(paneId) {
  return paneEl(paneId)?.querySelector(".pane-player") || null;
}

function paneState(paneId) {
  return state.panes.find((p) => p.id === paneId) || null;
}

/* ---------- layout ---------- */

/** DAZN-style Multiview: equal tiles, or main + side stack for 3 and 5. */
function applyLayout() {
  const count = state.panes.length;

  grid.dataset.count = String(count);
  grid.dataset.mode = state.layout;

  state.panes.forEach((pane, index) => {
    const el = paneEl(pane.id);
    if (!el) return;
    el.style.gridColumn = "";
    el.style.gridRow = "";
    el.dataset.slot = String(index + 1);
    el.querySelector(".pane-tally").textContent = index + 1;
  });

  if (state.layout === "auto") {
    applyMultiviewAuto(count);
  } else {
    const cols = Math.min(Number(state.layout), Math.max(count, 1));
    const rows = Math.max(1, Math.ceil(count / cols));
    grid.style.setProperty("--cols", cols);
    grid.style.setProperty("--rows", rows);
  }

  document.querySelectorAll("[data-layout]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.layout === state.layout));
  });

  emptyState.hidden = count > 0;
  document.body.classList.toggle("has-streams", count > 0);
  streamCount.textContent = count === 1 ? "1 stream" : `${count} streams`;

  const full = count >= MAX_PANES;
  document.getElementById("add-stream").disabled = full;
  document.getElementById("empty-add").disabled = full;
}

function applyMultiviewAuto(count) {
  if (count <= 1) {
    grid.style.setProperty("--cols", 1);
    grid.style.setProperty("--rows", 1);
    return;
  }

  if (count === 2) {
    grid.style.setProperty("--cols", 2);
    grid.style.setProperty("--rows", 1);
    return;
  }

  if (count === 3) {
    /* Main (first) left tall + two stacked — DAZN Multiview 3-up */
    grid.style.setProperty("--cols", 2);
    grid.style.setProperty("--rows", 2);
    const [main, a, b] = state.panes;
    setPaneCell(main.id, 1, "1 / 3");
    setPaneCell(a.id, 2, 1);
    setPaneCell(b.id, 2, 2);
    return;
  }

  if (count === 4) {
    grid.style.setProperty("--cols", 2);
    grid.style.setProperty("--rows", 2);
    return;
  }

  if (count === 5) {
    /* Main left tall + 2×2 on the right */
    grid.style.setProperty("--cols", 3);
    grid.style.setProperty("--rows", 2);
    const [main, ...rest] = state.panes;
    setPaneCell(main.id, 1, "1 / 3");
    setPaneCell(rest[0].id, 2, 1);
    setPaneCell(rest[1].id, 3, 1);
    setPaneCell(rest[2].id, 2, 2);
    setPaneCell(rest[3].id, 3, 2);
    return;
  }

  if (count === 6) {
    grid.style.setProperty("--cols", 3);
    grid.style.setProperty("--rows", 2);
    return;
  }

  /* 7–9: equal 3-column wall */
  grid.style.setProperty("--cols", 3);
  grid.style.setProperty("--rows", Math.ceil(count / 3));
}

function setPaneCell(paneId, column, row) {
  const el = paneEl(paneId);
  if (!el) return;
  el.style.gridColumn = String(column);
  el.style.gridRow = String(row);
}

/* ---------- audio focus ---------- */

function setAudioPane(paneId) {
  state.audioPaneId = paneId;

  state.panes.forEach((pane) => {
    const el = paneEl(pane.id);
    if (!el) return;

    const isAudio = pane.id === paneId;
    const video = el.querySelector("video");
    if (video) video.muted = !isAudio;

    el.classList.toggle("is-audio", isAudio);
    const btn = el.querySelector('[data-act="audio"] .ico');
    if (btn) {
      btn.dataset.icon = isAudio ? "speaker" : "speaker-off";
      DualStreamIcons.paint(el);
    }
    el.querySelector('[data-act="audio"]')?.classList.toggle("is-on", isAudio);
  });

  document.getElementById("mute-all").classList.toggle("is-on", paneId === null);
}

function toggleAudioPane(paneId) {
  setAudioPane(state.audioPaneId === paneId ? null : paneId);
}

/**
 * Applies the current audio focus to a freshly mounted video and keeps the
 * highlight truthful when the native controls — or a blocked unmuted
 * autoplay — change the muted state behind our back.
 */
function syncPaneAudio(paneId) {
  const video = paneEl(paneId)?.querySelector("video");
  if (!video) return;

  video.muted = state.audioPaneId !== paneId;

  if (video._audioBound) return;
  video._audioBound = true;

  video.addEventListener("volumechange", () => {
    if (!video.muted && state.audioPaneId !== paneId) setAudioPane(paneId);
    else if (video.muted && state.audioPaneId === paneId) setAudioPane(null);
  });
}

/* ---------- playback ---------- */

function showStatus(paneId, message, spinning) {
  const mount = playerMount(paneId);
  if (!mount) return;
  DualStreamPlayer.destroyPlayer(mount);
  mount.innerHTML = `
    <div class="pane-status">
      <div>
        ${spinning ? '<div class="spinner"></div>' : ""}
        <p>${escapeHtml(message)}</p>
      </div>
    </div>
  `;
}

function destroyPanePlayer(paneId) {
  const mount = playerMount(paneId);
  if (mount) DualStreamPlayer.destroyPlayer(mount);
}

function setPaneBadge(mount, text, mode) {
  let badge = mount.querySelector(".stream-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.className = "stream-badge";
    mount.appendChild(badge);
  }
  badge.textContent = text;
  badge.classList.remove("error", "mode-page", "mode-tab");
  if (mode === "page") badge.classList.add("mode-page");
  if (mode === "tab") badge.classList.add("mode-tab");
}

function mountPageFrame(mount, url, label) {
  DualStreamPlayer.destroyPlayer(mount);
  const shell = document.createElement("div");
  shell.className = "page-shell";
  shell.innerHTML = `<iframe src="${escapeHtml(url)}" title="${escapeHtml(label || "Page")}" allow="autoplay; fullscreen; clipboard-read; clipboard-write" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
  mount.innerHTML = "";
  mount.appendChild(shell);
  setPaneBadge(mount, `${DualStreamSitePolicy.modeLabel("page")} · ${label || "site"}`, "page");
}

function showFallback(paneId, url, policy, options) {
  const mount = playerMount(paneId);
  if (!mount) return;

  DualStreamPlayer.destroyPlayer(mount);

  const hint = policy.hint || "This site could not load automatically.";
  const pageBtn =
    policy.allowPageFrame !== false
      ? `<button type="button" class="btn" data-fallback="page">Open as page</button>`
      : "";

  mount.innerHTML = `
    <div class="pane-fallback">
      <p>${escapeHtml(hint)}</p>
      <div class="pane-fallback-actions">
        <button type="button" class="btn btn-primary" data-fallback="tab">Mirror open tab</button>
        ${pageBtn}
        <button type="button" class="btn" data-fallback="open">Open in new tab</button>
      </div>
    </div>
  `;

  mount.querySelector('[data-fallback="tab"]')?.addEventListener("click", () => {
    loadPane(paneId, url, { ...options, forceMode: "tab" });
  });
  mount.querySelector('[data-fallback="page"]')?.addEventListener("click", () => {
    loadPane(paneId, url, { ...options, forceMode: "page" });
  });
  mount.querySelector('[data-fallback="open"]')?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_URL", url });
  });
}

async function resolveTabId(url, tabId) {
  if (tabId) return tabId;
  const result = await chrome.runtime.sendMessage({ type: "FIND_TAB", url });
  return result?.tab?.id ?? null;
}

async function tryTabMirror(paneId, url, tabId, muted, label) {
  const mount = playerMount(paneId);
  const resolvedTabId = await resolveTabId(url, tabId);
  if (!resolvedTabId) {
    return { ok: false, error: "Open this URL in a Chrome tab first, then add it from From tabs." };
  }

  showStatus(paneId, "Mirroring tab…", true);
  const result = await DualStreamMirror.mountTabMirror(mount, resolvedTabId, {
    muted,
    label: `${DualStreamSitePolicy.modeLabel("tab")} · ${label}`,
  });

  if (!result.ok) return result;

  const pane = paneState(paneId);
  if (pane) {
    pane.mode = "tab";
    pane.tabId = resolvedTabId;
  }

  syncPaneAudio(paneId);
  return { ok: true };
}

async function tryStreamPull(paneId, url, muted) {
  const mount = playerMount(paneId);
  const willHarvest =
    DualStreamStreaming?.shouldAutoHarvest?.(url) &&
    !DualStreamZlive?.isZliveWatchUrl?.(url) &&
    !DualStreamOndemand?.isOndemandWatchUrl?.(url);

  showStatus(
    paneId,
    willHarvest ? "Starting stream in background…" : "Resolving stream…",
    true
  );

  const result = await chrome.runtime.sendMessage({
    type: "GET_STREAM_URL",
    url,
    tabId: paneState(paneId)?.tabId,
  });

  if (!result?.ok || !result.streamUrl) {
    if (result?.harvestTabId) {
      const pane = paneState(paneId);
      if (pane) pane.tabId = result.harvestTabId;
    }
    return { ok: false, error: result?.error || "Could not resolve a direct stream." };
  }

  const el = paneEl(paneId);
  const pane = paneState(paneId);
  if (result.channelId && el && pane) {
    pane.title = result.channelId;
    el.querySelector(".pane-title").textContent = result.channelId;
  }

  const label =
    result.provider === "zlive"
      ? `zlive · ${result.channelId || "HLS"}`
      : result.provider === "ondemand"
        ? `ondemand · ${result.matchId || result.channelId || "HLS"}`
        : result.provider === "aggregator"
          ? `Direct · ${pane.title}`
          : `Direct ${(result.type || "stream").toUpperCase()}`;

  await DualStreamPlayer.mountNativePlayer(mount, result.streamUrl, {
    muted,
    type: result.type,
    label,
    referer: result.referer,
    origin: result.origin,
  });

  if (pane) pane.mode = "stream";
  syncPaneAudio(paneId);
  return { ok: true };
}

async function loadPane(paneId, rawUrl, options = {}) {
  const pane = paneState(paneId);
  const el = paneEl(paneId);
  if (!pane || !el) return;

  const url = (rawUrl || "").trim();
  pane.url = url;
  if (options.tabId) pane.tabId = options.tabId;

  const input = el.querySelector(".pane-input");
  if (input) input.value = url;

  if (!url) {
    el.classList.add("is-empty");
    destroyPanePlayer(paneId);
    playerMount(paneId).innerHTML = "";
    pane.mode = undefined;
    pane.tabId = undefined;
    el.querySelector(".pane-title").textContent = "Empty";
    persist();
    return;
  }

  el.classList.remove("is-empty");

  const policy = DualStreamSitePolicy.classify(url);
  pane.title = policy.label;
  el.querySelector(".pane-title").textContent = policy.label;

  const mode = options.forceMode || options.mode || policy.preferredMode;
  const muted = state.audioPaneId !== paneId;
  const mount = playerMount(paneId);

  // --- forced modes ---
  if (mode === "page") {
    mountPageFrame(mount, url, policy.label);
    pane.mode = "page";
    persist();
    return;
  }

  if (mode === "tab") {
    const mirror = await tryTabMirror(paneId, url, pane.tabId, muted, policy.label);
    if (mirror.ok) {
      persist();
      return;
    }
    showFallback(paneId, url, { ...policy, hint: mirror.error || policy.hint }, options);
    persist();
    return;
  }

  // --- auto cascade ---

  const embed = DualStreamEmbed.toEmbed(url, {
    parentHost: chrome.runtime.id,
    autoplay: true,
    muted,
  });

  if (embed?.kind === "iframe") {
    DualStreamPlayer.destroyPlayer(mount);
    mount.innerHTML = `<iframe src="${escapeHtml(embed.src)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    setPaneBadge(mount, `${DualStreamSitePolicy.modeLabel("embed")} · ${embed.label}`, "embed");
    pane.mode = "embed";
    persist();
    return;
  }

  if (embed?.kind === "video") {
    await DualStreamPlayer.mountNativePlayer(mount, embed.src, {
      muted,
      type: "progressive",
      label: embed.label,
    });
    pane.mode = "embed";
    syncPaneAudio(paneId);
    persist();
    return;
  }

  if (policy.preferTabMirror || policy.preferredMode === "tab") {
    const mirror = await tryTabMirror(paneId, url, pane.tabId, muted, policy.label);
    if (mirror.ok) {
      persist();
      return;
    }
  }

  if (policy.canPullStream || DualStreamSitePolicy.canPullStream(url)) {
    const stream = await tryStreamPull(paneId, url, muted);
    if (stream.ok) {
      persist();
      return;
    }
  }

  if (DualStreamSitePolicy.isPageOnly?.(url)) {
    mountPageFrame(mount, url, policy.label);
    pane.mode = "page";
    persist();
    return;
  }

  if (policy.allowPageFrame) {
    mountPageFrame(mount, url, policy.label);
    pane.mode = "page";
    persist();
    return;
  }

  showFallback(paneId, url, policy, options);
  persist();
}

/* ---------- pane lifecycle ---------- */

function addPane(url, options) {
  if (state.panes.length >= MAX_PANES) {
    toast(`Maximum of ${MAX_PANES} streams reached.`, true);
    return null;
  }

  const pane = { id: nextPaneId(), url: url || "", title: "Empty", tabId: options?.tabId };
  state.panes.push(pane);

  const node = paneTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.paneId = pane.id;
  node.classList.add("is-empty");
  node.draggable = false;
  DualStreamIcons.paint(node);

  bindPane(node, pane.id);
  grid.appendChild(node);
  applyLayout();

  if (pane.url) {
    loadPane(pane.id, pane.url, { tabId: pane.tabId, mode: options?.mode });
  } else if (options?.focus !== false) {
    node.querySelector(".pane-input")?.focus();
  }

  persist();
  return pane.id;
}

function removePane(paneId) {
  destroyPanePlayer(paneId);

  paneEl(paneId)?.remove();
  state.panes = state.panes.filter((p) => p.id !== paneId);

  if (state.audioPaneId === paneId) {
    setAudioPane(state.panes[0]?.id ?? null);
  }

  applyLayout();
  persist();
}

function bindPane(node, paneId) {
  node.querySelector(".pane-form").addEventListener("submit", (event) => {
    event.preventDefault();
    loadPane(paneId, node.querySelector(".pane-input").value);
  });

  node.querySelectorAll("[data-act]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const act = button.dataset.act;

      if (act === "close") removePane(paneId);
      if (act === "audio") toggleAudioPane(paneId);
      if (act === "reload") {
        const pane = paneState(paneId);
        if (pane?.url) loadPane(paneId, pane.url, { tabId: pane.tabId, mode: pane.mode });
      }
      if (act === "fullscreen") {
        const target = node.querySelector(".player-shell") || node;
        if (target.requestFullscreen) target.requestFullscreen();
        else if (target.webkitRequestFullscreen) target.webkitRequestFullscreen();
      }
    });
  });

  const head = node.querySelector(".pane-head");
  head.addEventListener("pointerdown", () => {
    node.draggable = true;
  });
  head.addEventListener("pointerup", () => {
    node.draggable = false;
  });

  node.addEventListener("dragstart", (event) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", paneId);
    node.classList.add("is-dragging");
  });

  node.addEventListener("dragend", () => {
    node.classList.remove("is-dragging");
    node.draggable = false;
    grid.querySelectorAll(".is-drop-target").forEach((el) => el.classList.remove("is-drop-target"));
  });

  node.addEventListener("dragover", (event) => {
    event.preventDefault();
    node.classList.add("is-drop-target");
  });

  node.addEventListener("dragleave", () => node.classList.remove("is-drop-target"));

  node.addEventListener("drop", (event) => {
    event.preventDefault();
    node.classList.remove("is-drop-target");
    const sourceId = event.dataTransfer.getData("text/plain");
    if (sourceId && sourceId !== paneId) reorderPanes(sourceId, paneId);
  });

  /* DAZN Multiview: click a tile to hear it */
  node.addEventListener("click", (event) => {
    if (event.target.closest("button, a, input, form, label")) return;
    setAudioPane(paneId);
  });
}

function reorderPanes(sourceId, targetId) {
  const from = state.panes.findIndex((p) => p.id === sourceId);
  const to = state.panes.findIndex((p) => p.id === targetId);
  if (from < 0 || to < 0) return;

  const [moved] = state.panes.splice(from, 1);
  state.panes.splice(to, 0, moved);

  const sourceEl = paneEl(sourceId);
  const targetEl = paneEl(targetId);
  if (sourceEl && targetEl) {
    grid.insertBefore(sourceEl, from < to ? targetEl.nextSibling : targetEl);
  }

  applyLayout();
  persist();
}

/* ---------- persistence ---------- */

function persist() {
  const next = new URL(location.href);
  next.searchParams.delete("s");
  next.searchParams.delete("left");
  next.searchParams.delete("right");
  state.panes.filter((p) => p.url).forEach((p) => next.searchParams.append("s", p.url));
  if (state.layout !== "auto") next.searchParams.set("layout", state.layout);
  else next.searchParams.delete("layout");
  history.replaceState(null, "", next);
}

function readUrlsFromLocation() {
  const params = new URLSearchParams(location.search);
  const urls = params.getAll("s").filter(Boolean);

  // Backwards compatibility with the original two-pane links.
  ["left", "right"].forEach((key) => {
    const value = params.get(key);
    if (value) urls.push(value);
  });

  const layout = params.get("layout");
  if (layout && ["auto", "1", "2", "3"].includes(layout)) state.layout = layout;

  return urls.slice(0, MAX_PANES);
}

/* ---------- drawer ---------- */

async function openDrawer() {
  drawer.hidden = false;
  drawerList.innerHTML = `<li class="drawer-empty">Loading tabs…</li>`;
  addSelectedBtn.disabled = true;

  const result = await chrome.runtime.sendMessage({ type: "LIST_TABS" });
  const tabs = (result?.tabs || []).filter((tab) => !tab.url?.startsWith("chrome-extension://"));

  const remaining = MAX_PANES - state.panes.filter((p) => p.url).length;
  drawerHint.textContent = remaining > 0
    ? `Select up to ${remaining} more stream${remaining === 1 ? "" : "s"}.`
    : `All ${MAX_PANES} slots are full. Remove a stream first.`;

  if (!tabs.length) {
    drawerList.innerHTML = `<li class="drawer-empty">No open tabs found in this window.</li>`;
    return;
  }

  drawerList.innerHTML = "";

  tabs.forEach((tab) => {
    const mode = tab.modeLabel || DualStreamSitePolicy.modeLabel(tab.suggestedMode || "page");

    const item = document.createElement("li");
    item.innerHTML = `
      <label class="tab-row">
        <input type="checkbox" value="${escapeHtml(tab.url)}" data-tab-id="${tab.id}" data-mode="${escapeHtml(tab.suggestedMode || "")}" />
        <img class="tab-favicon" src="${tab.favIconUrl?.startsWith("http") ? escapeHtml(tab.favIconUrl) : "../icons/icon16.png"}" alt="" />
        <span class="tab-meta">
          <span class="tab-name">${escapeHtml(tab.title)}</span>
          <span class="tab-sub">${escapeHtml(tab.provider || "")}</span>
        </span>
        <span class="tab-mode">${escapeHtml(mode)}</span>
      </label>
    `;

    const row = item.querySelector(".tab-row");
    const checkbox = item.querySelector("input");
    checkbox.addEventListener("change", () => {
      row.classList.toggle("is-checked", checkbox.checked);
      updateSelectionState();
    });

    drawerList.appendChild(item);
  });
}

function selectedTabEntries() {
  return [...drawerList.querySelectorAll("input:checked")].map((input) => ({
    url: input.value,
    tabId: Number(input.dataset.tabId) || undefined,
    mode: input.dataset.mode || undefined,
  }));
}

function selectedUrls() {
  return selectedTabEntries().map((entry) => entry.url);
}

function updateSelectionState() {
  const selected = selectedUrls();
  const free = MAX_PANES - state.panes.filter((p) => p.url).length;

  addSelectedBtn.disabled = selected.length === 0 || selected.length > free;
  addSelectedBtn.textContent = selected.length
    ? `Add ${selected.length} stream${selected.length === 1 ? "" : "s"}`
    : "Add selected";

  if (selected.length > free) {
    drawerHint.textContent = `Only ${free} slot${free === 1 ? "" : "s"} left — deselect ${selected.length - free}.`;
  }
}

function closeDrawer() {
  drawer.hidden = true;
}

function addSelectedTabs() {
  const entries = selectedTabEntries();
  closeDrawer();

  entries.forEach((entry) => {
    const emptyPane = state.panes.find((p) => !p.url);
    if (emptyPane) {
      emptyPane.tabId = entry.tabId;
      loadPane(emptyPane.id, entry.url, { tabId: entry.tabId, mode: entry.mode });
    } else {
      addPane(entry.url, { focus: false, tabId: entry.tabId, mode: entry.mode });
    }
  });

  if (entries.length) {
    toast(`Added ${entries.length} pane${entries.length === 1 ? "" : "s"}.`);
    if (!state.audioPaneId) setAudioPane(state.panes[0]?.id ?? null);
  }
}

/* ---------- global controls ---------- */

document.querySelectorAll("[data-layout]").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.layout = btn.dataset.layout;
    applyLayout();
    persist();
  });
});

document.getElementById("add-stream").addEventListener("click", () => addPane(""));
document.getElementById("empty-add").addEventListener("click", () => addPane(""));
document.getElementById("open-tabs").addEventListener("click", openDrawer);
document.getElementById("empty-tabs").addEventListener("click", openDrawer);
document.getElementById("close-drawer").addEventListener("click", closeDrawer);
addSelectedBtn.addEventListener("click", addSelectedTabs);

document.getElementById("mute-all").addEventListener("click", () => {
  setAudioPane(null);
  toast("All streams muted.");
});

document.addEventListener("keydown", (event) => {
  if (event.target.matches("input, textarea")) return;

  if (event.key === "Escape") {
    closeDrawer();
    return;
  }

  if (event.key >= "1" && event.key <= "9") {
    const pane = state.panes[Number(event.key) - 1];
    if (pane) {
      toggleAudioPane(pane.id);
      toast(state.audioPaneId === pane.id ? `Audio: ${pane.title}` : "All streams muted.");
    }
    return;
  }

  if (event.key === "m") {
    setAudioPane(null);
    toast("All streams muted.");
  }
});

window.addEventListener("beforeunload", () => {
  state.panes.forEach((pane) => destroyPanePlayer(pane.id));
});

/* ---------- boot ---------- */

(function initChrome() {
  let hideTimer = null;

  const showChrome = () => {
    document.body.classList.add("chrome-visible");
    clearTimeout(hideTimer);
    if (!document.body.classList.contains("has-streams")) return;
    hideTimer = setTimeout(() => {
      if (!drawer.hidden) return;
      document.body.classList.remove("chrome-visible");
    }, 2200);
  };

  document.addEventListener("mousemove", showChrome);
  document.addEventListener("pointerdown", showChrome);
  document.querySelector(".bar")?.addEventListener("mouseenter", () => {
    clearTimeout(hideTimer);
    document.body.classList.add("chrome-visible");
  });

  showChrome();
})();

(function init() {
  DualStreamIcons.paint();

  const urls = readUrlsFromLocation();
  if (urls.length) {
    urls.forEach((url) => addPane(url, { focus: false }));
    setAudioPane(state.panes[0]?.id ?? null);
  } else {
    applyLayout();
  }
})();

/** Exposed for the in-page self test. */
window.DualStreamViewer = { state, addPane, loadPane, removePane, setAudioPane, MAX_PANES };
