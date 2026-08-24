/**
 * Detect whether a URL is a stream watch page vs a plain website (dashboards, etc.).
 * Drives universal background harvest: paste any stream URL → auto-pull HLS.
 */
(function (root) {
  /** Full-site embeds — never background-harvest */
  const PAGE_ONLY_HOSTS = [
    "polymarket.com",
    "bet365.com",
    "betfair.com",
    "draftkings.com",
    "fanduel.com",
    "bovada.lv",
    "pinnacle.com",
    "williamhill.com",
    "ladbrokes.com",
    "betway.com",
    "1xbet.com",
    "stake.com",
    "robinhood.com",
    "coinbase.com",
    "reddit.com",
    "twitter.com",
    "x.com",
    "facebook.com",
    "instagram.com",
    "google.com",
    "wikipedia.org",
    "amazon.com",
    "ebay.com",
  ];

  /** Path fragments that strongly suggest a video stream page */
  const STREAM_PATH =
    /\/(live|watch|stream|streams|play|player|embed|channel|channels|event|match|video|hls|broadcast|tv|sports?)\b|[-_/]live\b|\/live\/|\/watch\/|\.m3u8(\?|$)|\.mpd(\?|$)/i;

  /** Path fragments that suggest a non-video page */
  const PAGE_PATH = /\/(odds|bet|bets|betting|sportsbook|market|exchange|wallet|deposit|login|signup|account)\b/i;

  function hostname(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return "";
    }
  }

  function isHttpUrl(url) {
    try {
      const u = new URL(url);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  function isDirectStreamFile(url) {
    return /\.(m3u8|mpd|mp4|webm|m4v)(\?|$)/i.test(url);
  }

  function isPageOnlyHost(url) {
    const host = hostname(url);
    return PAGE_ONLY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  }

  function isLikelyStreaming(url) {
    if (!isHttpUrl(url)) return false;
    if (isDirectStreamFile(url)) return true;
    if (root.DualStreamEmbed?.canEmbed?.(url)) return true;
    if (root.DualStreamZlive?.isZliveWatchUrl?.(url)) return true;
    if (root.DualStreamOndemand?.isOndemandWatchUrl?.(url)) return true;
    if (root.DualStreamAggregators?.isAggregatorHost?.(url)) return true;
    if (root.DualStreamSitePolicy?.isDrmHost?.(url)) return false;

    try {
      const u = new URL(url);
      if (PAGE_PATH.test(u.pathname)) return false;
      if (STREAM_PATH.test(`${u.pathname}${u.search}`)) return true;
    } catch {
      return false;
    }

    return false;
  }

  /**
   * URLs that should open a background tab and hunt for HLS when pasted.
   * Excludes DRM (handled separately) and obvious non-stream pages.
   */
  function shouldAutoHarvest(url) {
    if (!isHttpUrl(url)) return false;
    if (root.DualStreamEmbed?.canEmbed?.(url)) return false;
    if (root.DualStreamSitePolicy?.isDrmHost?.(url)) return false;
    if (isPageOnlyHost(url)) return false;
    if (isDirectStreamFile(url)) return false; // played directly, no harvest
    if (isLikelyStreaming(url)) return true;

    // Unknown URL — still try a short harvest before page fallback.
    try {
      const u = new URL(url);
      if (PAGE_PATH.test(u.pathname)) return false;
    } catch {
      return false;
    }
    return true;
  }

  function harvestTimeoutMs(url) {
    if (isLikelyStreaming(url)) return 55000;
    return 22000;
  }

  const api = {
    isHttpUrl,
    isDirectStreamFile,
    isPageOnlyHost,
    isLikelyStreaming,
    shouldAutoHarvest,
    harvestTimeoutMs,
    PAGE_ONLY_HOSTS,
  };

  root.DualStreamStreaming = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
