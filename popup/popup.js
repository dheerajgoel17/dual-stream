const MAX_STREAMS = 9;

const tabList = document.getElementById("tab-list");
const statusEl = document.getElementById("status");
const pasteUrl = document.getElementById("paste-url");
const openSelectedBtn = document.getElementById("open-selected");

let cachedTabs = [];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(message, isError) {
  if (!message) {
    statusEl.hidden = true;
    statusEl.textContent = "";
    return;
  }
  statusEl.hidden = false;
  statusEl.textContent = message;
  statusEl.classList.toggle("error", Boolean(isError));
}

const send = (message) => chrome.runtime.sendMessage(message);

function favicon(tab) {
  return tab.favIconUrl?.startsWith("http") ? tab.favIconUrl : "../icons/icon16.png";
}

function modeFor(tab) {
  if (tab.modeLabel) return tab.modeLabel;
  if (tab.embeddable) return "Embed";
  if (DualStreamZlive.isZliveWatchUrl(tab.url)) return "Direct";
  if (DualStreamOndemand?.isOndemandWatchUrl?.(tab.url)) return "Direct";
  if (DualStreamSitePolicy.isDrmHost(tab.url)) return "Tab";
  if (tab.hasStreamUrl) return "Direct";
  return "Page";
}

function selectedUrls() {
  return [...tabList.querySelectorAll("input:checked")].map((input) => input.value);
}

function updateSelection() {
  const selected = selectedUrls();

  tabList.querySelectorAll("input").forEach((input) => {
    const atLimit = selected.length >= MAX_STREAMS && !input.checked;
    input.disabled = atLimit;
    input.closest(".tab-row").classList.toggle("is-checked", input.checked);
  });

  openSelectedBtn.disabled = selected.length === 0;
  openSelectedBtn.textContent = selected.length
    ? `Open ${selected.length} stream${selected.length === 1 ? "" : "s"}`
    : "Open selected";

  if (selected.length >= MAX_STREAMS) {
    setStatus(`Maximum of ${MAX_STREAMS} streams selected.`);
  } else {
    setStatus("");
  }
}

function renderTabs(tabs) {
  cachedTabs = tabs;
  tabList.innerHTML = "";

  if (!tabs.length) {
    tabList.innerHTML = `<li class="empty">No watchable tabs in this window.</li>`;
    return;
  }

  tabs.forEach((tab) => {
    const flags = [tab.provider, tab.audible ? "playing audio" : null, tab.active ? "current tab" : null]
      .filter(Boolean)
      .join(" · ");

    const item = document.createElement("li");
    item.innerHTML = `
      <label class="tab-row">
        <input type="checkbox" value="${escapeHtml(tab.url)}" ${tab.hasVideo || tab.embeddable ? "checked" : ""} />
        <img class="favicon" src="${escapeHtml(favicon(tab))}" alt="" />
        <span class="tab-meta">
          <span class="tab-name">${escapeHtml(tab.title)}</span>
          <span class="tab-sub">${escapeHtml(flags)} · ${modeFor(tab)}</span>
        </span>
        <span class="tab-actions">
          <button type="button" class="mini-btn" data-act="float" ${tab.active || !tab.embeddable ? "disabled" : ""}>Float</button>
          <button type="button" class="mini-btn" data-act="pip" ${tab.hasVideo ? "" : "disabled"}>PiP</button>
        </span>
      </label>
    `;

    item.querySelector("input").addEventListener("change", updateSelection);

    item.querySelectorAll("[data-act]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        handleTabAction(button.dataset.act, tab);
      });
    });

    tabList.appendChild(item);
  });

  updateSelection();
}

async function handleTabAction(act, tab) {
  setStatus("");

  if (act === "float") {
    const result = await send({ type: "OVERLAY", tabId: tab.id, url: tab.url, title: tab.title });
    setStatus(result.ok ? "Floating on the current page." : result.error, !result.ok);
    if (result.ok) window.close();
    return;
  }

  if (act === "pip") {
    const result = await send({ type: "PIP", tabId: tab.id });
    setStatus(result.ok ? "Picture-in-Picture toggled." : result.error, !result.ok);
  }
}

async function loadTabs() {
  const result = await send({ type: "LIST_TABS" });
  if (!result?.ok) {
    setStatus(result?.error || "Could not list tabs.", true);
    return;
  }
  renderTabs(result.tabs.filter((tab) => tab.url?.startsWith("http")));
}

document.getElementById("open-grid").addEventListener("click", async () => {
  const watchable = cachedTabs.filter((tab) => tab.hasVideo || tab.embeddable || tab.url?.startsWith("http"));
  await send({ type: "OPEN_SPLIT", urls: watchable.slice(0, MAX_STREAMS).map((tab) => tab.url) });
  window.close();
});

openSelectedBtn.addEventListener("click", async () => {
  const urls = selectedUrls();
  if (!urls.length) return;
  await send({ type: "OPEN_SPLIT", urls });
  window.close();
});

document.getElementById("float-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = pasteUrl.value.trim();

  if (!url) {
    setStatus("Paste a stream URL first.", true);
    return;
  }

  if (!DualStreamEmbed.canEmbed(url)) {
    setStatus("That URL cannot float here. Use Open multi-view for full pages or DRM streams.", true);
    return;
  }

  const result = await send({ type: "OVERLAY_URL", url, title: DualStreamEmbed.providerLabel(url) });
  setStatus(result.ok ? "Floating on the current page." : result.error, !result.ok);
  if (result.ok) window.close();
});

document.getElementById("refresh").addEventListener("click", loadTabs);

loadTabs();

(function initAds() {
  const slot = document.getElementById("ad-slot");
  if (slot && DualStreamAds.mount(slot, "popup")) slot.hidden = false;
})();
