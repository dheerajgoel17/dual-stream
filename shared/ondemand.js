/**
 * ondemand.st / damitv.st stream resolver.
 * Live pages like /live/nrl/2026-08-22/new-man resolve via /papi/extract-url/{id}
 * to a signed HLS playlist on damitv CDN (referer-gated, not DRM).
 */
(function (root) {
  const HOSTS = ["ondemand.st", "damitv.st", "damitv.app", "damitvsports.com", "90minutes.pro"];

  const REFERER = "https://ondemand.st/";
  const ORIGIN = "https://ondemand.st";

  function isHost(url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
      return HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
    } catch {
      return false;
    }
  }

  function matchIdFromUrl(url) {
    try {
      const u = new URL(url);
      if (!isHost(url)) return null;

      const idParam = u.searchParams.get("id");
      if (idParam) return decodeURIComponent(idParam);

      const live = u.pathname.match(/^\/live\/(.+)$/);
      if (live) return decodeURIComponent(live[1]);

      const embed = u.pathname === "/embed/" && idParam;
      if (embed) return decodeURIComponent(idParam);

      return null;
    } catch {
      return null;
    }
  }

  function apiBaseForUrl(url) {
    try {
      const u = new URL(url);
      return `${u.protocol}//${u.host}`;
    } catch {
      return "https://ondemand.st";
    }
  }

  function playbackHeaders(pageUrl) {
    try {
      const u = new URL(pageUrl || REFERER);
      return { referer: `${u.origin}/`, origin: u.origin };
    } catch {
      return { referer: REFERER, origin: ORIGIN };
    }
  }

  function isOndemandWatchUrl(url) {
    return Boolean(matchIdFromUrl(url));
  }

  const api = {
    HOSTS,
    REFERER,
    ORIGIN,
    isHost,
    matchIdFromUrl,
    apiBaseForUrl,
    playbackHeaders,
    isOndemandWatchUrl,
  };

  root.DualStreamOndemand = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
