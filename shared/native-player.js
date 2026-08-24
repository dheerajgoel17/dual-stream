/**
 * Mount a native HTML5 player (with HLS.js when needed) in split view.
 *
 * Referer-restricted CDNs are handled by declarativeNetRequest rules in the
 * service worker, so playback uses HLS.js's normal loader at full speed.
 * The proxy fallback below only ever carries playlist text: binary segments
 * cannot survive chrome.runtime messaging, so they always load directly.
 */
(function (root) {
  function destroyPlayer(mount) {
    if (!mount) return;

    if (root.DualStreamMirror?.stopMirror) {
      root.DualStreamMirror.stopMirror(mount);
    }

    if (mount._hls) {
      mount._hls.destroy();
      mount._hls = null;
    }
    mount._video = null;
  }

  function streamLabel(type) {
    if (type === "hls") return "Direct HLS";
    if (type === "dash") return "Direct DASH";
    return "Direct stream";
  }

  function isPlaylistUrl(url) {
    return /\.m3u8(\?|$)/i.test(url) || /m3u8/i.test(url);
  }

  function createPlaylistProxyLoader(referer, origin) {
    const DefaultLoader = root.Hls.DefaultConfig.loader;

    return class PlaylistProxyLoader extends DefaultLoader {
      load(context, config, callbacks) {
        if (!isPlaylistUrl(context.url)) {
          return super.load(context, config, callbacks);
        }

        this.context = context;
        this.stats.loading.start = performance.now();
        let aborted = false;
        this.abort = () => {
          aborted = true;
        };

        chrome.runtime.sendMessage(
          { type: "HLS_FETCH", url: context.url, referer, origin },
          (response) => {
            if (aborted) return;

            if (chrome.runtime.lastError || !response?.ok || typeof response.data !== "string") {
              callbacks.onError(
                {
                  code: response?.status || 0,
                  text:
                    response?.error ||
                    chrome.runtime.lastError?.message ||
                    "Playlist proxy failed",
                },
                context,
                null,
                this.stats
              );
              return;
            }

            const now = performance.now();
            this.stats.loading.first = now;
            this.stats.loading.end = now;
            this.stats.loaded = response.data.length;
            this.stats.total = response.data.length;

            callbacks.onSuccess(
              { url: response.url || context.url, data: response.data },
              this.stats,
              context,
              null
            );
          }
        );
      }
    };
  }

  function buildConfig(useProxy, referer, origin) {
    // Multiview prioritizes stability over low latency. Live LL-HLS settings
    // keep buffers tiny and cause constant rebuffering when several panes share
    // one connection.
    const config = {
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: 30,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      maxBufferSize: 60 * 1000 * 1000,
      maxBufferHole: 0.5,
      // Prefer a safer start bitrate; ABR climbs if the link has headroom.
      abrEwmaDefaultEstimate: 500000,
      startLevel: -1,
      // Grid panes are small — don't decode full 1080p in every tile.
      capLevelToPlayerSize: true,
      abrBandWidthFactor: 0.7,
      abrBandWidthUpFactor: 0.5,
      fragLoadPolicy: {
        default: {
          maxLoadTimeMs: 20000,
          maxTimeToFirstByteMs: 10000,
          errorRetry: { maxNumRetry: 4, retryDelayMs: 1000, maxRetryDelayMs: 8000 },
        },
      },
    };

    if (useProxy) {
      config.loader = createPlaylistProxyLoader(referer, origin);
      config.enableWorker = false;
    }

    return config;
  }

  /**
   * @param {HTMLElement} mount
   * @param {string} streamUrl
   * @param {{ muted?: boolean, type?: string, label?: string, referer?: string, origin?: string, proxied?: boolean }} [options]
   */
  async function mountNativePlayer(mount, streamUrl, options) {
    const opts = options || {};
    destroyPlayer(mount);

    const shell = document.createElement("div");
    shell.className = "player-shell";

    const video = document.createElement("video");
    video.className = "native-video";
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = Boolean(opts.muted);

    video.addEventListener("dblclick", () => {
      const target = shell.requestFullscreen ? shell : video;
      if (target.requestFullscreen) target.requestFullscreen();
      else if (target.webkitRequestFullscreen) target.webkitRequestFullscreen();
    });

    const badge = document.createElement("div");
    badge.className = "stream-badge";
    badge.textContent = opts.label || streamLabel(opts.type);

    shell.append(video, badge);
    mount.innerHTML = "";
    mount.appendChild(shell);

    const isHls = opts.type === "hls" || isPlaylistUrl(streamUrl);
    const referer = opts.referer || "";
    const origin = opts.origin || "";

    if (isHls && root.Hls?.isSupported?.()) {
      const attach = (useProxy) => {
        const hls = new root.Hls(buildConfig(useProxy, referer, origin));
        mount._hls = hls;

        hls.loadSource(streamUrl);
        hls.attachMedia(video);

        hls.on(root.Hls.Events.MANIFEST_PARSED, (_event, data) => {
          badge.textContent = opts.label || streamLabel(opts.type);
          badge.classList.remove("error");

          // After layout, cap to the tile size so ABR doesn't chase 1080p in a
          // small Multiview cell.
          if (typeof hls.autoLevelCapping === "number") {
            try {
              hls.capLevelToPlayerSize = true;
            } catch (_) {
              /* ignore */
            }
          }

          const levels = data?.levels?.length || 0;
          if (levels > 1 && hls.currentLevel === -1) {
            // Start near mid/low quality for multi-pane stability.
            const start = Math.min(1, levels - 1);
            hls.startLevel = start;
            hls.loadLevel = start;
          }

          video.play().catch(() => {
            video.muted = true;
            video.play().catch(() => {});
          });
        });

        hls.on(root.Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;

          const playlistFailed =
            data.details === root.Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
            data.details === root.Hls.ErrorDetails.MANIFEST_PARSING_ERROR ||
            data.details === root.Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT ||
            data.details === root.Hls.ErrorDetails.LEVEL_LOAD_ERROR;

          if (!useProxy && referer && playlistFailed) {
            badge.textContent = "Retrying playlist via proxy…";
            hls.destroy();
            attach(true);
            return;
          }

          badge.textContent = `Stream error (${data.details || data.type}) — click Load to refresh`;
          badge.classList.add("error");
        });
      };

      attach(false);
    } else if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl;
      await video.play().catch(() => {});
    } else {
      video.src = streamUrl;
      await video.play().catch(() => {});
    }

    mount._video = video;
    return { video, shell };
  }

  const api = { mountNativePlayer, destroyPlayer };

  root.DualStreamPlayer = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
