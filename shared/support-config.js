/**
 * Optional donation links — edit URLs after you set up GitHub Sponsors / Ko-fi.
 * Docs: docs/SUPPORT.md
 */
(function (root) {
  const api = {
    repo: "https://github.com/dheerajgoel17/dual-stream",
    githubSponsors: "https://github.com/sponsors/dheerajgoel17",
    kofi: "https://ko-fi.com/dheerajgoel17",
  };

  root.DualStreamSupport = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
