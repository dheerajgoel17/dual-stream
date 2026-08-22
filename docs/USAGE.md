# Dual Stream usage

Dual Stream is a Chrome extension for watching up to nine streams **at the same time** — not one after the other.

## Modes

### 1. Float overlay (second stream on this page)

Use this when you are already watching something and want another stream in the corner.

1. Stay on the tab you want as stream A.
2. Click the Dual Stream icon.
3. Either paste a YouTube / Twitch / Kick / Vimeo URL and click **Float**, or click **Float here** on another open tab.
4. Drag the overlay from its header, resize from the bottom-right corner, unmute, or close it.

The overlay starts muted because Chrome blocks unmuted autoplay without a click on the page itself.

### 2. Picture-in-Picture

Use this when the site cannot be embedded (or you want Chrome's native floating window).

1. Open Dual Stream.
2. Click **PiP** on a tab that already has a `<video>` element.
3. Chrome's PiP window stays visible while you use other tabs.

Shortcut: `Alt+Shift+P` on the current tab.

Netflix, Prime Video, Hotstar, and similar DRM players may block PiP or embeds.

### 3. Multi-view (one tab, up to 9 players)

1. Click **Open multi-view**, or press `Alt+Shift+S`.
2. Paste a URL into any empty pane, or click **From tabs** and tick several open tabs at once.
3. Use **Auto / 2 / 3 / 1** to set the column count. Drag a pane's header to reorder the grid.

Each pane has its own controls in the header (they fade in on hover):

| Control | What it does |
| --- | --- |
| Speaker | Makes this the stream you hear; every other pane mutes |
| Reload | Re-resolves and restarts just this stream |
| Fullscreen | Fullscreens this pane (double-clicking the video also works) |
| Close | Removes the pane and frees its bandwidth |

Panes are sized to 16:9 so the frame hugs the picture. The grid stops at 9 streams;
a tenth is refused rather than degrading the others.

#### Audio

Only one pane is unmuted at a time. Press `1`–`9` to jump audio between panes,
or `m` to mute everything. The highlighted pane is the one you are hearing —
if Chrome blocks unmuted autoplay the pane silently falls back to muted and the
highlight clears, so the UI never lies about what is audible.

#### Watching many at once

HLS panes run with `capLevelToPlayerSize`, so a stream rendered in a small grid
cell only decodes a small rendition. Nine panes cost roughly what two full-size
panes would. Going fullscreen on a pane restores source quality.

The state of the grid lives in the page URL (`?s=...&s=...`), so you can bookmark
a set of streams or reopen it after a reload.

For sites that block embeds (zlive, many sports streams), Dual Stream resolves the
**real HLS stream** and plays it natively — full frame rate, full resolution, real fullscreen.

For **zlive** you do not need the source tab open at all. Just paste the watch URL:

```
https://zlive.st/watch/auto-sky-sport-2-nz
```

Then click **Load**. The badge shows `zlive · <channel>` once playing.
Use the pane's fullscreen button or double-click the video.

For other sites, open the stream in a tab, start playback, then load the URL in multi-view
so Dual Stream can read the `.m3u8` from the page.

### Why referer-restricted streams work

Streaming CDNs often reject requests that lack the site's own `Referer` header, and
extension pages are not allowed to set that header from `fetch()`. Dual Stream registers a
`declarativeNetRequest` rule that rewrites the header at the network layer, so HLS.js
loads manifests and segments directly at full speed — nothing is proxied or re-encoded.

Note that binary segments can never be routed through `chrome.runtime` messaging
(ArrayBuffers do not survive message serialization), which is why the header-rewrite
approach is used instead of a proxy.

**Open multi-view** in the popup loads every watchable tab in the window, up to 9.
To be selective, tick the tabs you want in the popup's **Open tabs** list and click
**Open N streams** instead.

## Supported embeds

| Site | Overlay + multi-view |
| --- | --- |
| YouTube (watch, shorts, live, youtu.be) | Yes |
| Twitch channels and VODs | Yes |
| Kick channels | Yes |
| Vimeo | Yes |
| Direct `.mp4` / `.webm` / `.ogg` files | Yes |
| zlive.st watch URLs | Multi-view resolves HLS automatically (paste watch URL) |
| ondemand.st / damitv.st live URLs | Multi-view resolves HLS via `/papi/extract-url` (paste live URL) |
| VIPBox, StreamEast-style aggregators | Direct HLS when added from an open tab with the player running; page mode as fallback |

Other sites: use **PiP** if the page has a video element.

### Any streaming URL (universal auto-harvest)

For **any** stream watch page that is not DRM-protected, paste the URL and click
**Load**. The extension will:

1. Try instant resolve (zlive, ondemand API, direct `.m3u8`)
2. Otherwise open a **background tab**, auto-click play, scan all embed iframes for HLS
3. Play natively in the pane with real fullscreen

No manual "open tab → From tabs" step for streaming sites.

| Site type | Paste URL? | What happens |
| --- | --- | --- |
| zlive / ondemand | Yes | Instant API resolve |
| VIPBox, StreamEast, any `/live/` `/watch/` page | Yes | Background harvest → direct HLS |
| Direct `.m3u8` link | Yes | Plays immediately |
| Betting / odds (Polymarket, Bet365, …) | Yes | Full page mode (not harvested) |
| Sony LIV / JioStar (DRM) | Tab mirror only | Cannot pull HLS |

### Tab mirroring (background only)

The `GET_STREAM_ID` message and the `tabCapture` permission are still in the
service worker, but the multi-view grid no longer exposes a "mirror this tab"
button. Mirroring captures a tab like screen sharing: low frame rate, no real
fullscreen, and Chrome permits only one capture at a time — which does not fit a
grid of nine. Direct stream pull replaced it. The backend hook is kept so the
fallback can be reinstated without rewriting anything.

## Limits

- Some pages set a Content-Security-Policy that blocks embeds. If Float does nothing useful, use PiP or multi-view instead.
- Chrome only allows one native Picture-in-Picture window.
- Restricted pages (`chrome://`, the Chrome Web Store) cannot receive the overlay or PiP.
- Twitch embeds need the extension id as `parent`. That is handled automatically in multi-view; overlay uses the current page hostname.
- The grid is capped at 9 streams. Live HLS is bandwidth-bound before it is CPU-bound, so the practical ceiling on a slow connection is lower.
