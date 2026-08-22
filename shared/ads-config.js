/**
 * Google AdSense — fill in after AdSense approves your GitHub Pages site.
 * Docs: docs/ADS.md
 *
 * Extension panes load ad iframes from GitHub Pages (https), not from
 * chrome-extension:// URLs, which AdSense does not support.
 */
(function (root) {
  const api = {
    /** Set true once ca-pub-… is configured on Pages + here */
    enabled: false,

    /** GitHub Pages base, e.g. https://dheerajgoel17.github.io/dual-stream */
    pagesBase: "https://dheerajgoel17.github.io/dual-stream",

    /** AdSense publisher id (ca-pub-…) */
    publisherId: "",

    /** Optional per-slot AdSense slot ids */
    slots: {
      popup: "",
      viewer: "",
    },
  };

  root.DualStreamAdsConfig = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
