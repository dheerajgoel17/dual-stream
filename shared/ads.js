/**
 * Mount AdSense via GitHub Pages iframe (AdSense-compatible origin).
 */
(function (root) {
  function config() {
    return root.DualStreamAdsConfig || {};
  }

  function mount(container, slot) {
    const cfg = config();
    if (!container || !cfg.enabled || !cfg.pagesBase) return false;

    const frame = document.createElement("iframe");
    frame.className = "ds-ad-frame";
    frame.title = "Advertisement";
    frame.loading = "lazy";
    frame.referrerPolicy = "no-referrer-when-downgrade";
    frame.src = `${cfg.pagesBase.replace(/\/$/, "")}/ads/${slot}.html`;
    container.appendChild(frame);
    return true;
  }

  const api = { mount, config };
  root.DualStreamAds = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
