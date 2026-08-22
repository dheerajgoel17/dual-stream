/**
 * Turn a watch-page URL into an embeddable player URL.
 * Used by the popup, split viewer, and in-page overlay.
 */
(function (root) {
  const YT_ID = /^[\w-]{11}$/;

  function hostname(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  function youtubeId(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, "");

      if (host === "youtu.be") {
        const id = u.pathname.split("/").filter(Boolean)[0];
        return YT_ID.test(id) ? id : null;
      }

      if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
        const v = u.searchParams.get("v");
        if (v && YT_ID.test(v)) return v;

        const parts = u.pathname.split("/").filter(Boolean);
        if (parts[0] === "embed" && YT_ID.test(parts[1])) return parts[1];
        if (parts[0] === "shorts" && YT_ID.test(parts[1])) return parts[1];
        if (parts[0] === "live" && YT_ID.test(parts[1])) return parts[1];
      }
    } catch {
      return null;
    }
    return null;
  }

  function twitchTarget(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, "");
      if (host !== "twitch.tv" && host !== "m.twitch.tv") return null;

      const parts = u.pathname.split("/").filter(Boolean);
      if (!parts.length) return null;
      if (parts[0] === "videos" && parts[1]) return { video: parts[1] };
      if (parts[0] === "clip" || parts[0] === "clips") return null;
      if (["directory", "p", "settings", "downloads"].includes(parts[0])) return null;
      return { channel: parts[0] };
    } catch {
      return null;
    }
  }

  function kickChannel(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, "");
      if (host !== "kick.com") return null;
      const parts = u.pathname.split("/").filter(Boolean);
      if (!parts.length) return null;
      if (["browse", "category", "categories", "following"].includes(parts[0])) return null;
      return parts[0];
    } catch {
      return null;
    }
  }

  function vimeoId(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, "");
      if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;
      const parts = u.pathname.split("/").filter(Boolean);
      if (host === "player.vimeo.com" && parts[0] === "video") return parts[1];
      const id = parts.find((p) => /^\d+$/.test(p));
      return id || null;
    } catch {
      return null;
    }
  }

  function isDirectVideo(url) {
    try {
      const path = new URL(url).pathname.toLowerCase();
      return /\.(mp4|webm|ogg|ogv|mov|m4v)(\?|$)/.test(path);
    } catch {
      return false;
    }
  }

  /**
   * @param {string} url
   * @param {{ parentHost?: string, autoplay?: boolean, muted?: boolean }} [opts]
   */
  function toEmbed(url, opts) {
    if (!url || typeof url !== "string") return null;
    const options = opts || {};
    const autoplay = options.autoplay !== false;
    const muted = options.muted !== false;
    const parent = options.parentHost || "localhost";

    const yt = youtubeId(url);
    if (yt) {
      const params = new URLSearchParams({
        autoplay: autoplay ? "1" : "0",
        mute: muted ? "1" : "0",
        rel: "0",
        modestbranding: "1",
        playsinline: "1",
      });
      return {
        kind: "iframe",
        provider: "youtube",
        label: "YouTube",
        src: `https://www.youtube.com/embed/${yt}?${params.toString()}`,
      };
    }

    const tw = twitchTarget(url);
    if (tw) {
      const params = new URLSearchParams({
        parent,
        autoplay: autoplay ? "true" : "false",
        muted: muted ? "true" : "false",
      });
      if (tw.channel) params.set("channel", tw.channel);
      if (tw.video) params.set("video", tw.video);
      return {
        kind: "iframe",
        provider: "twitch",
        label: "Twitch",
        src: `https://player.twitch.tv/?${params.toString()}`,
      };
    }

    const kick = kickChannel(url);
    if (kick) {
      return {
        kind: "iframe",
        provider: "kick",
        label: "Kick",
        src: `https://player.kick.com/${encodeURIComponent(kick)}`,
      };
    }

    const vim = vimeoId(url);
    if (vim) {
      const params = new URLSearchParams({
        autoplay: autoplay ? "1" : "0",
        muted: muted ? "1" : "0",
      });
      return {
        kind: "iframe",
        provider: "vimeo",
        label: "Vimeo",
        src: `https://player.vimeo.com/video/${vim}?${params.toString()}`,
      };
    }

    if (isDirectVideo(url)) {
      return {
        kind: "video",
        provider: "file",
        label: "Video",
        src: url,
      };
    }

    return null;
  }

  function providerLabel(url) {
    const host = hostname(url);
    if (!host) return "Tab";
    if (host.includes("youtube") || host === "youtu.be") return "YouTube";
    if (host.includes("twitch")) return "Twitch";
    if (host === "kick.com") return "Kick";
    if (host.includes("vimeo")) return "Vimeo";
    if (host.includes("sonyliv")) return "Sony LIV";
    if (host.includes("ondemand")) return "OnDemand";
    if (host.includes("damitv")) return "DAMITV";
    if (host.includes("vipbox")) return "VIPBox";
    if (host.includes("jiostar") || host.includes("jiocinema")) return "JioStar";
    if (host.includes("hotstar")) return "Hotstar";
    if (host.includes("zee5")) return "ZEE5";
    return host;
  }

  function canEmbed(url) {
    return Boolean(toEmbed(url, { parentHost: "example.com" }));
  }

  const api = { toEmbed, canEmbed, providerLabel, youtubeId };

  root.DualStreamEmbed = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
