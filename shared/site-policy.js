/**
 * Classifies URLs so the viewer picks the right playback strategy:
 * embed → direct stream → full page iframe → tab mirror (DRM / blocked sites).
 */
(function (root) {
  const DRM_HOSTS = [
    "sonyliv.com",
    "hotstar.com",
    "disneyplus.com",
    "jiostar.com",
    "jiocinema.com",
    "netflix.com",
    "primevideo.com",
    "amazon.com",
    "zee5.com",
    "sonypicturesnetworks.com",
    "crunchyroll.com",
    "hulu.com",
    "hbomax.com",
    "max.com",
    "peacocktv.com",
    "apple.com",
  ];

  const STREAM_PULL_HOSTS = [
    "zlive.st",
    "timst.cfd",
    "fontaine.lol",
    "ondemand.st",
    "damitv.st",
    "damitv.app",
    "messi.damitv.st",
    "damitvsports.com",
  ];

  function hostname(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return "";
    }
  }

  function hostMatches(host, patterns) {
    return patterns.some((pattern) => host === pattern || host.endsWith(`.${pattern}`));
  }

  function isHttpUrl(url) {
    try {
      const u = new URL(url);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  function isDrmHost(url) {
    return hostMatches(hostname(url), DRM_HOSTS);
  }

  function canPullStream(url) {
    if (root.DualStreamStreaming?.shouldAutoHarvest?.(url)) return true;
    if (root.DualStreamStreaming?.isDirectStreamFile?.(url)) return true;
    const host = hostname(url);
    if (hostMatches(host, STREAM_PULL_HOSTS)) return true;
    if (root.DualStreamZlive?.isZliveWatchUrl?.(url)) return true;
    if (root.DualStreamOndemand?.isOndemandWatchUrl?.(url)) return true;
    if (root.DualStreamAggregators?.isAggregatorHost?.(url)) return true;
    return false;
  }

  function isPageOnly(url) {
    return root.DualStreamStreaming?.isPageOnlyHost?.(url) || false;
  }

  /**
   * @param {string} url
   * @returns {{
   *   host: string,
   *   label: string,
   *   preferredMode: 'embed' | 'stream' | 'page' | 'tab',
   *   allowPageFrame: boolean,
   *   preferTabMirror: boolean,
   *   hint: string
   * }}
   */
  function classify(url) {
    const host = hostname(url);
    const label = root.DualStreamEmbed?.providerLabel?.(url) || host || "Page";

    if (!isHttpUrl(url)) {
      return {
        host,
        label,
        preferredMode: "page",
        allowPageFrame: false,
        preferTabMirror: false,
        hint: "Enter a valid http(s) URL.",
      };
    }

    if (root.DualStreamEmbed?.canEmbed?.(url)) {
      return {
        host,
        label,
        preferredMode: "embed",
        allowPageFrame: true,
        preferTabMirror: false,
        hint: "",
      };
    }

    if (canPullStream(url)) {
      const isPage = isPageOnly(url);
      return {
        host,
        label,
        preferredMode: "stream",
        allowPageFrame: true,
        preferTabMirror: false,
        hint: isPage
          ? ""
          : "Paste the URL — a background tab starts the player and pulls HLS automatically.",
      };
    }

    if (isPageOnly(url)) {
      return {
        host,
        label,
        preferredMode: "page",
        allowPageFrame: true,
        preferTabMirror: false,
        hint: "Loads the full interactive site — scorecards, chat, and live stats.",
      };
    }

    if (isDrmHost(url)) {
      return {
        host,
        label,
        preferredMode: "tab",
        allowPageFrame: false,
        preferTabMirror: true,
        hint:
          `${label} encrypts video with Widevine DRM — unlike zlive, the .m3u8 URL alone is not enough. ` +
          `Open it in a Chrome tab, sign in, start the show, then add it via From tabs to mirror that tab.`,
      };
    }

    return {
      host,
      label,
      preferredMode: "page",
      allowPageFrame: true,
      preferTabMirror: false,
      hint: "Loads the full site in this pane — useful for scorecards, chat, and live stats.",
    };
  }

  function modeLabel(mode) {
    switch (mode) {
      case "embed":
        return "Embed";
      case "stream":
        return "Direct";
      case "page":
        return "Page";
      case "tab":
        return "Tab";
      default:
        return mode;
    }
  }

  const api = { classify, isDrmHost, canPullStream, isPageOnly, isHttpUrl, modeLabel, DRM_HOSTS };

  root.DualStreamSitePolicy = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
