/**
 * Sports aggregator sites (VIPBox, StreamEast mirrors, etc.).
 * Streams are plain HLS once the embed player starts — pull them from the
 * open tab with that site's Referer, same idea as zlive.
 */
(function (root) {
  const AGGREGATOR_HOSTS = [
    "vipbox.fm",
    "vipbox.lc",
    "vipboxtv.se",
    "streameast.io",
    "streameast.ga",
    "crackstreams.biz",
    "totalsportek.com",
    "sportsurge.net",
    "buffstreams.sx",
    "methstreams.com",
    "embedsports.top",
    "ninguno.cc",
    "dlhd.sx",
  ];

  function hostname(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return "";
    }
  }

  function isAggregatorHost(url) {
    const host = hostname(url);
    return AGGREGATOR_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  }

  function playbackHeaders(url) {
    try {
      const u = new URL(url);
      return { referer: `${u.origin}/`, origin: u.origin };
    } catch {
      return { referer: "", origin: "" };
    }
  }

  function isAggregatorWatchUrl(url) {
    if (!url || typeof url !== "string") return false;
    if (root.DualStreamOndemand?.isOndemandWatchUrl?.(url)) return true;
    if (root.DualStreamZlive?.isZliveWatchUrl?.(url)) return true;
    return isAggregatorHost(url);
  }

  const api = { AGGREGATOR_HOSTS, isAggregatorHost, isAggregatorWatchUrl, playbackHeaders };

  root.DualStreamAggregators = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
