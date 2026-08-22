# Google AdSense setup

AdSense **does not** serve ads on `chrome-extension://` URLs. This project uses:

1. **GitHub Pages** (`docs/`) — landing page with AdSense units  
2. **Extension iframes** — popup & viewer load `docs/ads/*.html` from your Pages URL  

## Steps

1. Enable **GitHub Pages** on the repo: Settings → Pages → Source **Deploy from branch** → `/docs` on `main`.
2. Apply for [Google AdSense](https://www.google.com/adsense/) with your Pages URL  
   `https://<username>.github.io/dual-stream/`
3. After approval, create ad units (popup banner ~320×50, viewer ~728×90).
4. Replace `ca-pub-XXXXXXXXXXXXXXXX` and `data-ad-slot` in:
   - `docs/index.html`
   - `docs/ads/popup.html`
   - `docs/ads/viewer.html`
5. Edit `shared/ads-config.js`:
   ```javascript
   enabled: true,
   pagesBase: "https://<username>.github.io/dual-stream",
   publisherId: "ca-pub-…",
   ```
6. Reload the extension in `chrome://extensions`.

Until `enabled: true`, no ad iframes are shown in the extension.
