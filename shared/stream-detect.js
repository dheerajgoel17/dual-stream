/**
 * Detect direct stream URLs from the page's video player.
 * Used by content scripts on sites that block iframe embeds (zlive, etc.).
 */
(function (root) {
  function isStreamUrl(url) {
    if (!url || typeof url !== "string") return false;
    if (url.startsWith("blob:") || url.startsWith("data:")) return false;
    return (
      /\.m3u8(\?|$)/i.test(url) ||
      url.includes("m3u8") ||
      /\.mpd(\?|$)/i.test(url) ||
      /\.mp4(\?|$)/i.test(url) ||
      /\.webm(\?|$)/i.test(url) ||
      /\.m4v(\?|$)/i.test(url) ||
      /\/hls\//i.test(url) ||
      /\.ts(\?|$)/i.test(url) ||
      /timst\.cfd/i.test(url) ||
      /damitv\.st/i.test(url) ||
      /messi\.damitv/i.test(url) ||
      /tiktokcdn/i.test(url)
    );
  }

  function addUrl(set, url) {
    if (isStreamUrl(url)) set.add(url);
  }

  function collectFromVideo(video, set) {
    if (!video) return;
    addUrl(set, video.src);
    addUrl(set, video.currentSrc);
    video.querySelectorAll("source").forEach((source) => addUrl(set, source.src));

    [video.hls, video._hls, video.__hls].forEach((hls) => {
      if (hls?.url) addUrl(set, hls.url);
    });

    try {
      const source = video.player?.currentSource?.()?.src;
      addUrl(set, source);
    } catch {
      /* video.js not present */
    }

    try {
      const jw = root.jwplayer?.(video);
      const file = jw?.getPlaylistItem?.()?.file || jw?.getPlaylistItem?.()?.sources?.[0]?.file;
      addUrl(set, file);
    } catch {
      /* jwplayer not present */
    }
  }

  function collectPerformanceUrls(set) {
    try {
      performance.getEntriesByType("resource").forEach((entry) => addUrl(set, entry.name));
    } catch {
      /* performance API unavailable */
    }
  }

  function pickBestStreamUrl(urls) {
    if (!urls.length) return null;

    const m3u8 = urls.filter((url) => url.includes("m3u8"));
    if (m3u8.length) {
      const master = m3u8.find((url) => /master|index|playlist|manifest/i.test(url));
      return master || m3u8[m3u8.length - 1];
    }

    const mp4 = urls.find((url) => /\.mp4(\?|$)/i.test(url));
    if (mp4) return mp4;

    return urls[urls.length - 1];
  }

  function streamType(url) {
    if (!url) return "unknown";
    if (/\.m3u8|m3u8/i.test(url)) return "hls";
    if (/\.mpd/i.test(url)) return "dash";
    return "progressive";
  }

  /**
   * @param {HTMLVideoElement | null | undefined} video
   */
  function extractStreamUrls(video) {
    const urls = new Set();
    collectFromVideo(video, urls);
    collectPerformanceUrls(urls);

    document.querySelectorAll("iframe").forEach((frame) => {
      try {
        const innerVideo = frame.contentDocument?.querySelector("video");
        collectFromVideo(innerVideo, urls);
      } catch {
        /* cross-origin iframe */
      }
    });

    return [...urls];
  }

  /**
   * @param {HTMLVideoElement | null | undefined} video
   */
  function getStreamInfo(video) {
    const urls = extractStreamUrls(video);
    const streamUrl = pickBestStreamUrl(urls);
    if (!streamUrl) {
      return {
        ok: false,
        error: "No stream URL found yet. Start playback on the source tab, then try again.",
        hasVideo: Boolean(video),
        paused: video ? Boolean(video.paused) : true,
        candidates: urls.length,
      };
    }

    return {
      ok: true,
      streamUrl,
      type: streamType(streamUrl),
      hasVideo: true,
      paused: video ? Boolean(video.paused) : true,
      title: document.title,
      candidates: urls.length,
    };
  }

  const api = { isStreamUrl, extractStreamUrls, getStreamInfo, pickBestStreamUrl, streamType };

  root.DualStreamDetect = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
