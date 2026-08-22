const HOST_ID = "dual-stream-overlay-host";
const SIZES = {
  sm: { width: 320, height: 180 },
  md: { width: 420, height: 236 },
  lg: { width: 560, height: 315 },
};

function findPrimaryVideo() {
  const videos = [...document.querySelectorAll("video")];
  if (!videos.length) return null;
  return videos.sort((a, b) => {
    const areaA = a.clientWidth * a.clientHeight;
    const areaB = b.clientWidth * b.clientHeight;
    return areaB - areaA;
  })[0];
}

function videoInfo() {
  const video = findPrimaryVideo();
  if (!video) return { hasVideo: false, paused: true };
  const stream = DualStreamDetect.getStreamInfo(video);
  return {
    hasVideo: true,
    paused: Boolean(video.paused),
    width: video.videoWidth || video.clientWidth,
    height: video.videoHeight || video.clientHeight,
    hasStreamUrl: Boolean(stream.ok),
    streamType: stream.type || null,
  };
}

function getStreamUrl() {
  const video = findPrimaryVideo();
  const pageUrl = location.href;

  const zliveChannel = DualStreamZlive?.channelFromWatchUrl?.(pageUrl);
  if (zliveChannel) {
    const detected = DualStreamDetect.getStreamInfo(video);
    if (detected.ok) {
      return {
        ...detected,
        provider: "zlive",
        referer: DualStreamZlive.REFERER,
        origin: DualStreamZlive.ORIGIN,
        channelId: zliveChannel,
        pageUrl,
      };
    }
    return {
      ok: false,
      needsResolve: true,
      channelId: zliveChannel,
      pageUrl,
      provider: "zlive",
      hasVideo: Boolean(video),
      paused: video ? Boolean(video.paused) : true,
      error: "Resolving zlive stream…",
    };
  }

  const ondemandMatch = DualStreamOndemand?.matchIdFromUrl?.(pageUrl);
  if (ondemandMatch) {
    const detected = DualStreamDetect.getStreamInfo(video);
    const headers = DualStreamOndemand.playbackHeaders(pageUrl);
    if (detected.ok) {
      return {
        ...detected,
        provider: "ondemand",
        referer: headers.referer,
        origin: headers.origin,
        matchId: ondemandMatch,
        pageUrl,
      };
    }
    return {
      ok: false,
      needsResolve: true,
      matchId: ondemandMatch,
      pageUrl,
      provider: "ondemand",
      hasVideo: Boolean(video),
      paused: video ? Boolean(video.paused) : true,
      error: "Resolving ondemand stream…",
    };
  }

  const detected = DualStreamDetect.getStreamInfo(video);
  if (detected.ok) {
    const headers = DualStreamAggregators?.playbackHeaders?.(pageUrl) || {
      referer: `${location.origin}/`,
      origin: location.origin,
    };
    return {
      ...detected,
      provider: DualStreamAggregators?.isAggregatorHost?.(pageUrl) ? "aggregator" : "direct",
      referer: headers.referer,
      origin: headers.origin,
      pageUrl,
    };
  }

  return detected;
}

async function togglePip() {
  const video = findPrimaryVideo();
  if (!video) return { ok: false, error: "No video found on this page." };

  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return { ok: true, pip: false };
    }
    if (video.readyState === 0) {
      video.load?.();
    }
    await video.requestPictureInPicture();
    return { ok: true, pip: true };
  } catch (error) {
    return { ok: false, error: error.message || "Picture-in-Picture is not available here." };
  }
}

function removeOverlay() {
  document.getElementById(HOST_ID)?.remove();
  return { ok: true, hidden: true };
}

function showOverlay(payload) {
  removeOverlay();

  const host = document.createElement("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = overlayStyles();

  const wrap = document.createElement("div");
  wrap.className = "ds-wrap size-md";
  wrap.style.right = "24px";
  wrap.style.top = "24px";
  wrap.style.left = "auto";
  wrap.style.bottom = "auto";

  wrap.innerHTML = `
    <div class="ds-chrome" data-drag>
      <span class="ds-dot" aria-hidden="true"></span>
      <span class="ds-title" title="${escapeHtml(payload.sourceTitle || "Stream B")}">${escapeHtml(payload.sourceTitle || "Stream B")}</span>
      <div class="ds-actions">
        <button type="button" class="ds-btn" data-action="size" title="Resize">Size</button>
        <button type="button" class="ds-btn" data-action="mute" title="Unmute">Unmute</button>
        <button type="button" class="ds-btn ds-close" data-action="close" title="Close overlay">Close</button>
      </div>
    </div>
    <div class="ds-stage">
      ${
        payload.embed.kind === "video"
          ? `<video src="${escapeAttr(payload.embed.src)}" autoplay muted playsinline controls></video>`
          : `<iframe src="${escapeAttr(payload.embed.src)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`
      }
    </div>
    <div class="ds-resize" data-resize></div>
  `;

  shadow.append(style, wrap);
  document.documentElement.append(host);

  let size = "md";
  let muted = true;
  bindOverlay(wrap, {
    getSize: () => size,
    setSize: (next) => {
      size = next;
      wrap.classList.remove("size-sm", "size-md", "size-lg");
      wrap.classList.add(`size-${next}`);
    },
    getMuted: () => muted,
    setMuted: (next) => {
      muted = next;
      const media = wrap.querySelector("video");
      if (media) media.muted = next;
      const btn = wrap.querySelector('[data-action="mute"]');
      if (btn) btn.textContent = next ? "Unmute" : "Mute";
    },
  });

  return { ok: true };
}

function bindOverlay(wrap, state) {
  wrap.querySelector('[data-action="close"]').addEventListener("click", () => removeOverlay());

  wrap.querySelector('[data-action="size"]').addEventListener("click", () => {
    const order = ["sm", "md", "lg"];
    const next = order[(order.indexOf(state.getSize()) + 1) % order.length];
    state.setSize(next);
  });

  wrap.querySelector('[data-action="mute"]').addEventListener("click", () => {
    state.setMuted(!state.getMuted());
  });

  const dragHandle = wrap.querySelector("[data-drag]");
  let drag = null;
  dragHandle.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: wrap.offsetLeft,
      top: wrap.offsetTop,
    };
    wrap.style.bottom = "auto";
    wrap.style.right = "auto";
    dragHandle.setPointerCapture(event.pointerId);
  });
  dragHandle.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const left = clamp(drag.left + event.clientX - drag.startX, 8, window.innerWidth - wrap.offsetWidth - 8);
    const top = clamp(drag.top + event.clientY - drag.startY, 8, window.innerHeight - wrap.offsetHeight - 8);
    wrap.style.left = `${left}px`;
    wrap.style.top = `${top}px`;
  });
  dragHandle.addEventListener("pointerup", () => {
    drag = null;
  });

  const resizeHandle = wrap.querySelector("[data-resize]");
  let resize = null;
  resizeHandle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    resize = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: wrap.offsetWidth,
      height: wrap.offsetHeight,
    };
    wrap.classList.remove("size-sm", "size-md", "size-lg");
    resizeHandle.setPointerCapture(event.pointerId);
  });
  resizeHandle.addEventListener("pointermove", (event) => {
    if (!resize || event.pointerId !== resize.pointerId) return;
    const width = clamp(resize.width + event.clientX - resize.startX, 260, Math.min(900, window.innerWidth - 16));
    const height = clamp(resize.height + event.clientY - resize.startY, 160, Math.min(560, window.innerHeight - 16));
    wrap.style.width = `${width}px`;
    wrap.style.height = `${height}px`;
  });
  resizeHandle.addEventListener("pointerup", () => {
    resize = null;
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function overlayStyles() {
  return `
    :host { all: initial; }
    .ds-wrap {
      position: fixed;
      z-index: 2147483646;
      width: ${SIZES.md.width}px;
      height: ${SIZES.md.height + 36}px;
      display: flex;
      flex-direction: column;
      background: #10141c;
      color: #e8edf2;
      border: 1px solid rgba(46, 230, 200, 0.45);
      border-radius: 14px;
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 176, 32, 0.15);
      overflow: hidden;
      font-family: "Avenir Next", "Segoe UI", ui-rounded, system-ui, sans-serif;
    }
    .ds-wrap.size-sm { width: ${SIZES.sm.width}px; height: ${SIZES.sm.height + 36}px; }
    .ds-wrap.size-md { width: ${SIZES.md.width}px; height: ${SIZES.md.height + 36}px; }
    .ds-wrap.size-lg { width: ${SIZES.lg.width}px; height: ${SIZES.lg.height + 36}px; }
    .ds-chrome {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 36px;
      padding: 0 8px 0 10px;
      background: linear-gradient(90deg, #15232a, #1b1710);
      cursor: grab;
      user-select: none;
    }
    .ds-chrome:active { cursor: grabbing; }
    .ds-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ff4d4d;
      box-shadow: 0 0 8px #ff4d4d;
      flex-shrink: 0;
    }
    .ds-title {
      flex: 1;
      min-width: 0;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #c9d3dc;
    }
    .ds-actions { display: flex; gap: 4px; }
    .ds-btn {
      border: 0;
      background: rgba(255,255,255,0.08);
      color: #e8edf2;
      font: 600 10px/1 "Avenir Next", "Segoe UI", sans-serif;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 6px 8px;
      border-radius: 999px;
      cursor: pointer;
    }
    .ds-btn:hover { background: rgba(46, 230, 200, 0.2); }
    .ds-close:hover { background: rgba(255, 77, 77, 0.25); }
    .ds-stage { flex: 1; background: #000; position: relative; min-height: 0; }
    .ds-stage iframe, .ds-stage video {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
      background: #000;
    }
    .ds-resize {
      position: absolute;
      right: 0;
      bottom: 0;
      width: 16px;
      height: 16px;
      cursor: nwse-resize;
      background:
        linear-gradient(135deg, transparent 50%, rgba(255,176,32,0.9) 50%) no-repeat;
    }
  `;
}

function startPlayback() {
  document.querySelectorAll("video").forEach((video) => {
    video.muted = true;
    video.play().catch(() => {});
  });

  const clickPatterns = /watch|play|start|close and play|click here to close/i;
  document.querySelectorAll("button, a, [role='button'], .btn").forEach((el) => {
    const label = `${el.textContent || ""} ${el.getAttribute("aria-label") || ""}`.trim();
    if (clickPatterns.test(label)) {
      try {
        el.click();
      } catch {
        /* ignore */
      }
    }
  });

  document.querySelectorAll("iframe").forEach((frame) => {
    try {
      const doc = frame.contentDocument;
      doc?.querySelectorAll("video").forEach((video) => {
        video.muted = true;
        video.play().catch(() => {});
      });
    } catch {
      /* cross-origin embed */
    }
  });

  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const run = async () => {
    switch (message?.type) {
      case "PING":
        return { ok: true };
      case "VIDEO_INFO":
        return videoInfo();
      case "GET_STREAM_URL":
        return getStreamUrl();
      case "START_PLAYBACK":
        return startPlayback();
      case "PIP":
        return togglePip();
      case "SHOW_OVERLAY":
        return showOverlay(message.payload || {});
      case "HIDE_OVERLAY":
        return removeOverlay();
      default:
        return { ok: false, error: "Unknown content message." };
    }
  };

  run()
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});
