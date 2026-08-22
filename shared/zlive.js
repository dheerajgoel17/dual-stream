/**
 * zlive.st stream resolver.
 * Channels like /watch/auto-sky-sport-2-nz map to iptv.fontaine.lol/sky-sport-2-nz
 * which redirects to a signed .m3u8 that requires Referer headers.
 */
(function (root) {
  const ENTRY_BASE = "https://iptv.fontaine.lol";
  const REFERER = "https://zlive.st/";
  const ORIGIN = "https://zlive.st";

  function channelFromWatchUrl(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, "");
      if (host !== "zlive.st") return null;
      if (!u.pathname.startsWith("/watch/")) return null;
      const id = decodeURIComponent(u.pathname.slice("/watch/".length).split("/")[0] || "");
      return id || null;
    } catch {
      return null;
    }
  }

  function entryUrlForChannel(channelId) {
    if (!channelId) return null;
    const slug = channelId.replace(/^auto-/, "").replace(/^evt-/, "");
    return `${ENTRY_BASE}/${encodeURIComponent(slug)}`;
  }

  function playbackHeaders() {
    return { referer: REFERER, origin: ORIGIN };
  }

  function isZliveWatchUrl(url) {
    return Boolean(channelFromWatchUrl(url));
  }

  const api = {
    channelFromWatchUrl,
    entryUrlForChannel,
    playbackHeaders,
    isZliveWatchUrl,
    REFERER,
    ORIGIN,
    ENTRY_BASE,
  };

  root.DualStreamZlive = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
