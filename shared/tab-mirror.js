/**
 * Mirror an open Chrome tab into a pane via tabCapture.
 * Used for DRM players (Sony LIV, JioStar, Hotstar) and sites that block iframes.
 */
(function (root) {
  function stopMirror(mount) {
    if (!mount) return;

    if (mount._mirrorVideo) {
      mount._mirrorVideo.srcObject = null;
      mount._mirrorVideo.remove();
      mount._mirrorVideo = null;
    }

    if (mount._mirrorStream) {
      mount._mirrorStream.getTracks().forEach((track) => track.stop());
      mount._mirrorStream = null;
    }

    mount._mirrorTabId = null;
  }

  async function getViewerTabId() {
    try {
      const tabs = await chrome.tabs.getCurrent();
      return tabs?.id ?? null;
    } catch {
      return null;
    }
  }

  /**
   * @param {HTMLElement} mount
   * @param {number} targetTabId
   * @param {{ muted?: boolean, label?: string }} [opts]
   */
  async function mountTabMirror(mount, targetTabId, opts) {
    if (!mount || !targetTabId) {
      return { ok: false, error: "No tab to mirror." };
    }

    stopMirror(mount);

    const consumerTabId = await getViewerTabId();
    const result = await chrome.runtime.sendMessage({
      type: "GET_STREAM_ID",
      targetTabId,
      consumerTabId,
    });

    if (!result?.ok || !result.streamId) {
      return { ok: false, error: result?.error || "Tab capture failed." };
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "tab",
            chromeMediaSourceId: result.streamId,
          },
        },
      });
    } catch (error) {
      return { ok: false, error: error.message || "Could not start tab mirror." };
    }

    const shell = document.createElement("div");
    shell.className = "player-shell mirror-shell";

    const video = document.createElement("video");
    video.className = "native-video mirror-video";
    video.autoplay = true;
    video.playsInline = true;
    video.muted = Boolean(opts?.muted);
    video.srcObject = stream;

    video.addEventListener("dblclick", () => {
      const target = shell.requestFullscreen ? shell : video;
      if (target.requestFullscreen) target.requestFullscreen();
      else if (target.webkitRequestFullscreen) target.webkitRequestFullscreen();
    });

    const badge = document.createElement("div");
    badge.className = "stream-badge";
    badge.textContent = opts?.label || "Tab mirror";

    shell.append(video, badge);
    mount.innerHTML = "";
    mount.appendChild(shell);

    mount._mirrorVideo = video;
    mount._mirrorStream = stream;
    mount._mirrorTabId = targetTabId;

    await video.play().catch(() => {});

    return { ok: true, video };
  }

  const api = { mountTabMirror, stopMirror };

  root.DualStreamMirror = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
