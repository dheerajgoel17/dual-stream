importScripts(chrome.runtime.getURL("shared/embed.js"));
importScripts(chrome.runtime.getURL("shared/zlive.js"));
importScripts(chrome.runtime.getURL("shared/ondemand.js"));
importScripts(chrome.runtime.getURL("shared/aggregators.js"));
importScripts(chrome.runtime.getURL("shared/streaming.js"));
importScripts(chrome.runtime.getURL("shared/site-policy.js"));

const VIEWER_PATH = "viewer/viewer.html";
const CONTENT_SCRIPT_FILES = [
  "shared/embed.js",
  "shared/stream-detect.js",
  "shared/zlive.js",
  "shared/ondemand.js",
  "shared/aggregators.js",
  "shared/streaming.js",
  "content/content.js",
];

const HARVEST_POLL_MS = 1200;
const HARVEST_TIMEOUT_DEFAULT_MS = 55000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTabLoad(tabId, timeoutMs = 20000) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab?.status === "complete") return;

  await new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    const listener = (updatedId, info) => {
      if (updatedId === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function injectAllFrames(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["shared/stream-detect.js"],
    });
  } catch {
    /* restricted page */
  }
}

async function probeAllFrames(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        if (typeof DualStreamDetect === "undefined") return null;
        const video = document.querySelector("video");
        const info = DualStreamDetect.getStreamInfo(video);
        if (info?.ok) return info;
        const urls = DualStreamDetect.extractStreamUrls(video);
        const streamUrl = DualStreamDetect.pickBestStreamUrl(urls);
        if (!streamUrl) return null;
        return {
          ok: true,
          streamUrl,
          type: DualStreamDetect.streamType(streamUrl),
        };
      },
    });
    for (const entry of results || []) {
      if (entry.result?.ok) return entry.result;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Opens the page in a background tab (if needed), nudges the embed player to
 * start, then pulls the HLS URL — no manual "open tab → From tabs" workflow.
 */
async function harvestStreamFromUrl(url) {
  let tabId;
  let created = false;

  const existing = await findTabByUrl(url);
  if (existing?.id) {
    tabId = existing.id;
  } else {
    const tab = await chrome.tabs.create({ url, active: false });
    tabId = tab.id;
    created = true;
    await waitForTabLoad(tabId);
    await sleep(1500);
  }

  await ensureContentScript(tabId);
  await injectAllFrames(tabId);
  await sendToTab(tabId, { type: "START_PLAYBACK" });

  const timeoutMs = DualStreamStreaming.harvestTimeoutMs(url) || HARVEST_TIMEOUT_DEFAULT_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const main = await sendToTab(tabId, { type: "GET_STREAM_URL" });
    if (main?.ok && main.streamUrl) {
      const result = await applyRefererForStream({ ...main, provider: main.provider || "aggregator" }, url);
      result.harvestTabId = tabId;
      return result;
    }
    if (main?.needsResolve && main.provider === "ondemand") {
      return resolveOndemandStream(main.pageUrl || url);
    }

    const frame = await probeAllFrames(tabId);
    if (frame?.streamUrl) {
      const result = await applyRefererForStream(
        {
          ok: true,
          streamUrl: frame.streamUrl,
          type: frame.type || "hls",
          provider: "aggregator",
        },
        url
      );
      result.harvestTabId = tabId;
      return result;
    }

    await sendToTab(tabId, { type: "START_PLAYBACK" });
    await injectAllFrames(tabId);
    await sleep(HARVEST_POLL_MS);
  }

  return {
    ok: false,
    error:
      "Player did not start in time. A background tab is open — click play there, then hit Reload on this pane.",
    harvestTabId: tabId,
    createdTab: created,
  };
}

function normalizeUrl(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    u.hash = "";
    let href = u.href;
    if (href.endsWith("/") && u.pathname.length > 1) href = href.slice(0, -1);
    return href;
  } catch {
    return String(url).trim();
  }
}

function urlsMatch(a, b) {
  const left = normalizeUrl(a);
  const right = normalizeUrl(b);
  if (!left || !right) return false;
  if (left === right) return true;
  try {
    const ua = new URL(left);
    const ub = new URL(right);
    return ua.origin === ub.origin && ua.pathname === ub.pathname;
  } catch {
    return false;
  }
}

async function findTabByUrl(url) {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const match = tabs.find((tab) => tab.url && urlsMatch(tab.url, url));
  if (!match?.id) return null;
  return {
    id: match.id,
    title: match.title || "Untitled",
    url: match.url,
  };
}

async function getCaptureStreamId(targetTabId, consumerTabId) {
  const options = { targetTabId };
  if (consumerTabId) options.consumerTabId = consumerTabId;
  return chrome.tabCapture.getMediaStreamId(options);
}

/**
 * Streaming CDNs reject requests without the site's own Referer, and extension
 * pages cannot set that header from fetch(). Rewrite it at the network layer
 * instead so HLS.js can load manifests and segments directly.
 */
const HEADER_RULE_ID_BASE = 9000;
const headerRuleIds = new Map();

async function ensureRefererRule(streamUrl, referer, origin) {
  let host;
  try {
    host = new URL(streamUrl).hostname;
  } catch {
    return null;
  }

  const key = `${host}|${referer}`;
  if (headerRuleIds.has(key)) return headerRuleIds.get(key);

  const id = HEADER_RULE_ID_BASE + headerRuleIds.size + 1;
  const requestHeaders = [{ header: "referer", operation: "set", value: referer }];
  if (origin) {
    requestHeaders.push({ header: "origin", operation: "set", value: origin });
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [id],
    addRules: [
      {
        id,
        priority: 1,
        action: { type: "modifyHeaders", requestHeaders },
        condition: {
          requestDomains: [host],
          resourceTypes: ["xmlhttprequest", "media", "other"],
        },
      },
    ],
  });

  headerRuleIds.set(key, id);
  return id;
}

async function clearRefererRules() {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const ids = existing.filter((rule) => rule.id >= HEADER_RULE_ID_BASE).map((rule) => rule.id);
  if (ids.length) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ids });
  }
  headerRuleIds.clear();
}

chrome.runtime.onStartup.addListener(clearRefererRules);
chrome.runtime.onInstalled.addListener(clearRefererRules);

async function resolveZliveStream(channelIdOrUrl) {
  const channelId =
    DualStreamZlive.channelFromWatchUrl(channelIdOrUrl) || String(channelIdOrUrl || "").trim();
  const entry = DualStreamZlive.entryUrlForChannel(channelId);
  if (!entry) {
    return { ok: false, error: "Invalid zlive channel URL." };
  }

  const headers = {
    Referer: DualStreamZlive.REFERER,
    Origin: DualStreamZlive.ORIGIN,
  };

  try {
    const response = await fetch(entry, { redirect: "follow", headers });
    const streamUrl = response.url;
    if (!streamUrl.includes("m3u8")) {
      return {
        ok: false,
        error: `Could not resolve zlive stream (HTTP ${response.status}). Try again in a few seconds.`,
      };
    }

    await ensureRefererRule(streamUrl, DualStreamZlive.REFERER, DualStreamZlive.ORIGIN);

    return {
      ok: true,
      streamUrl,
      type: "hls",
      provider: "zlive",
      referer: DualStreamZlive.REFERER,
      origin: DualStreamZlive.ORIGIN,
      channelId,
      title: channelId,
    };
  } catch (error) {
    return { ok: false, error: error.message || "Failed to resolve zlive stream." };
  }
}

async function resolveOndemandStream(pageUrlOrMatchId) {
  const pageUrl = String(pageUrlOrMatchId || "").startsWith("http")
    ? pageUrlOrMatchId
    : `https://ondemand.st/live/${pageUrlOrMatchId}`;
  const matchId = DualStreamOndemand.matchIdFromUrl(pageUrl) || String(pageUrlOrMatchId || "").trim();
  if (!matchId) {
    return { ok: false, error: "Invalid ondemand / damitv URL." };
  }

  const base = DualStreamOndemand.apiBaseForUrl(pageUrl);
  const playback = DualStreamOndemand.playbackHeaders(pageUrl);
  const extractUrl = `${base}/papi/extract-url/${encodeURIComponent(matchId)}`;

  try {
    const response = await fetch(extractUrl, {
      headers: {
        Referer: `${base}/embed/?id=${encodeURIComponent(matchId)}`,
        Origin: new URL(base).origin,
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    });

    const data = await response.json();
    if (!data?.success || !data.hlsUrl) {
      return {
        ok: false,
        error: data?.message || "Stream not live yet — check the event time or try again shortly.",
      };
    }

    await ensureRefererRule(data.hlsUrl, playback.referer, playback.origin);

    return {
      ok: true,
      streamUrl: data.hlsUrl,
      type: "hls",
      provider: "ondemand",
      referer: playback.referer,
      origin: playback.origin,
      matchId,
      channelId: matchId,
      title: matchId,
    };
  } catch (error) {
    return { ok: false, error: error.message || "Failed to resolve ondemand stream." };
  }
}

async function applyRefererForStream(result, pageUrl) {
  if (!result?.ok || !result.streamUrl) return result;

  let referer = result.referer;
  let origin = result.origin;

  if (!referer && pageUrl) {
    if (DualStreamZlive.isZliveWatchUrl(pageUrl)) {
      referer = DualStreamZlive.REFERER;
      origin = DualStreamZlive.ORIGIN;
    } else if (DualStreamOndemand.isOndemandWatchUrl(pageUrl)) {
      const headers = DualStreamOndemand.playbackHeaders(pageUrl);
      referer = headers.referer;
      origin = headers.origin;
    } else if (DualStreamAggregators.isAggregatorHost(pageUrl)) {
      const headers = DualStreamAggregators.playbackHeaders(pageUrl);
      referer = headers.referer;
      origin = headers.origin;
    }
  }

  if (referer) {
    await ensureRefererRule(result.streamUrl, referer, origin || "");
    result.referer = referer;
    result.origin = origin || "";
  }

  return result;
}

async function hlsFetch(url, referer, origin) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "*/*",
  };
  if (referer) headers.Referer = referer;
  if (origin) headers.Origin = origin;

  const response = await fetch(url, { redirect: "follow", headers });
  const isText =
    /\.m3u8(\?|$)/i.test(url) ||
    (response.headers.get("content-type") || "").includes("mpegurl") ||
    (response.headers.get("content-type") || "").startsWith("text/");

  if (isText) {
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      url: response.url,
      kind: "text",
      data: text,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  }

  const buffer = await response.arrayBuffer();
  return {
    ok: response.ok,
    status: response.status,
    url: response.url,
    kind: "binary",
    data: buffer,
    error: response.ok ? null : `HTTP ${response.status}`,
  };
}

const MAX_STREAMS = 9;

function viewerUrl(streamUrls) {
  const next = new URL(chrome.runtime.getURL(VIEWER_PATH));
  (streamUrls || [])
    .filter(Boolean)
    .slice(0, MAX_STREAMS)
    .forEach((streamUrl) => next.searchParams.append("s", streamUrl));
  return next.toString();
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
    return true;
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: CONTENT_SCRIPT_FILES,
      });
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ["content/overlay.css"],
      });
      return true;
    } catch (error) {
      console.warn("Dual Stream: cannot inject into tab", tabId, error);
      return false;
    }
  }
}

async function sendToTab(tabId, message) {
  const ok = await ensureContentScript(tabId);
  if (!ok) return { ok: false, error: "This page cannot run Dual Stream." };
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    return { ok: false, error: error.message || "Tab did not respond." };
  }
}

async function listWatchableTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const results = [];

  for (const tab of tabs) {
    if (!tab.id || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
      continue;
    }

    let video = { hasVideo: false };
    try {
      video = (await chrome.tabs.sendMessage(tab.id, { type: "VIDEO_INFO" })) || video;
    } catch {
      video = { hasVideo: false };
    }

    const policy = DualStreamSitePolicy.classify(tab.url);

    results.push({
      id: tab.id,
      title: tab.title || "Untitled",
      url: tab.url,
      favIconUrl: tab.favIconUrl || "",
      audible: Boolean(tab.audible),
      active: Boolean(tab.active),
      hasVideo: Boolean(video.hasVideo),
      paused: Boolean(video.paused),
      hasStreamUrl: Boolean(video.hasStreamUrl),
      embeddable: DualStreamEmbed.canEmbed(tab.url),
      provider: DualStreamEmbed.providerLabel(tab.url),
      suggestedMode: policy.preferredMode,
      modeLabel: DualStreamSitePolicy.modeLabel(policy.preferredMode),
      siteHint: policy.hint,
    });
  }

  return results.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.hasVideo !== b.hasVideo) return a.hasVideo ? -1 : 1;
    if (a.audible !== b.audible) return a.audible ? -1 : 1;
    return 0;
  });
}

async function openSplitView(streamUrls) {
  const url = viewerUrl(streamUrls);

  const existing = await chrome.tabs.query({
    url: chrome.runtime.getURL("viewer/*"),
  });
  if (existing[0]?.id) {
    await chrome.tabs.update(existing[0].id, { url, active: true });
    if (existing[0].windowId) {
      await chrome.windows.update(existing[0].windowId, { focused: true });
    }
    return { ok: true, tabId: existing[0].id };
  }

  const tab = await chrome.tabs.create({ url });
  return { ok: true, tabId: tab.id };
}

async function pipTab(tabId) {
  return sendToTab(tabId, { type: "PIP" });
}

async function overlayOnTab(targetTabId, sourceUrl, sourceTitle) {
  let parentHost = "localhost";
  try {
    const tab = await chrome.tabs.get(targetTabId);
    parentHost = new URL(tab.url).hostname;
  } catch {
    /* keep fallback parent */
  }

  const embed = DualStreamEmbed.toEmbed(sourceUrl, {
    parentHost,
    autoplay: true,
    muted: true,
  });

  if (!embed) {
    return {
      ok: false,
      error: "That site cannot be embedded. Try Picture-in-Picture on that tab instead.",
    };
  }

  return sendToTab(targetTabId, {
    type: "SHOW_OVERLAY",
    payload: {
      sourceUrl,
      sourceTitle: sourceTitle || DualStreamEmbed.providerLabel(sourceUrl),
      embed,
    },
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const run = async () => {
    switch (message?.type) {
      case "LIST_TABS":
        return { ok: true, tabs: await listWatchableTabs() };
      case "OPEN_SPLIT":
        return openSplitView(
          message.urls || [message.leftUrl, message.rightUrl].filter(Boolean)
        );
      case "OPEN_URL": {
        if (!message.url) return { ok: false, error: "Missing URL." };
        const tab = await chrome.tabs.create({ url: message.url, active: true });
        return { ok: true, tabId: tab.id };
      }
      case "PIP":
        return pipTab(message.tabId);
      case "OVERLAY": {
        const active = await getActiveTab();
        if (!active?.id) return { ok: false, error: "No active tab." };
        if (active.id === message.tabId) {
          return { ok: false, error: "Pick a different tab to float over this page." };
        }
        return overlayOnTab(active.id, message.url, message.title);
      }
      case "OVERLAY_URL": {
        const active = await getActiveTab();
        if (!active?.id) return { ok: false, error: "No active tab." };
        return overlayOnTab(active.id, message.url, message.title);
      }
      case "HIDE_OVERLAY": {
        const active = await getActiveTab();
        if (!active?.id) return { ok: false, error: "No active tab." };
        return sendToTab(active.id, { type: "HIDE_OVERLAY" });
      }
      case "FIND_TAB": {
        const tab = await findTabByUrl(message.url);
        return { ok: true, tab };
      }
      case "GET_STREAM_URL": {
        const url = message.url || "";

        const zliveChannel = DualStreamZlive.channelFromWatchUrl(url);
        if (zliveChannel) {
          return resolveZliveStream(zliveChannel);
        }

        if (DualStreamOndemand.isOndemandWatchUrl(url)) {
          return resolveOndemandStream(url);
        }

        if (DualStreamStreaming.isDirectStreamFile(url)) {
          return applyRefererForStream(
            { ok: true, streamUrl: url, type: "hls", provider: "direct" },
            url
          );
        }

        let tabId = message.tabId;
        if (!tabId && url) {
          const tab = await findTabByUrl(url);
          tabId = tab?.id;
        }

        if (!tabId) {
          if (DualStreamSitePolicy.isDrmHost(url)) {
            return {
              ok: false,
              error: "DRM stream — open in a tab, start playback, then add via From tabs to mirror.",
            };
          }
          if (DualStreamStreaming.shouldAutoHarvest(url)) {
            return harvestStreamFromUrl(url);
          }
          return {
            ok: false,
            error: "Could not resolve this URL automatically.",
          };
        }

        const result = await sendToTab(tabId, { type: "GET_STREAM_URL" });
        if (result?.needsResolve && result.channelId) {
          return resolveZliveStream(result.channelId);
        }
        if (result?.needsResolve && result.matchId && result.provider === "ondemand") {
          return resolveOndemandStream(result.pageUrl || result.matchId);
        }
        return await applyRefererForStream(result, url);
      }
      case "HARVEST_STREAM":
        return harvestStreamFromUrl(message.url);
      case "RESOLVE_ONDEMAND":
        return resolveOndemandStream(message.url || message.matchId);
      case "RESOLVE_ZLIVE":
        return resolveZliveStream(message.channelId || message.url);
      case "HLS_FETCH":
        return hlsFetch(message.url, message.referer, message.origin);
      case "GET_STREAM_ID": {
        if (!message.targetTabId) return { ok: false, error: "Missing tab id." };
        try {
          const streamId = await getCaptureStreamId(message.targetTabId, message.consumerTabId);
          if (!streamId) return { ok: false, error: "Could not capture that tab." };
          return { ok: true, streamId };
        } catch (error) {
          return { ok: false, error: error.message || "Tab capture failed." };
        }
      }
      default:
        return { ok: false, error: "Unknown message." };
    }
  };

  run()
    .then(sendResponse)
    .catch((error) => {
      sendResponse({ ok: false, error: error.message || String(error) });
    });
  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "open-split") {
    const tabs = await listWatchableTabs();
    const videoTabs = tabs.filter((t) => t.hasVideo || t.embeddable || t.url?.startsWith("http"));
    await openSplitView(videoTabs.slice(0, MAX_STREAMS).map((t) => t.url));
    return;
  }

  if (command === "pip-current") {
    const active = await getActiveTab();
    if (active?.id) await pipTab(active.id);
  }
});
