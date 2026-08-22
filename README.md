# Dual Stream

Chrome extension — **watch up to 9 videos at once** in one tab (grid, PiP, float overlay).

[![Install from GitHub](https://img.shields.io/badge/Install-GitHub-2ee6c8?style=for-the-badge)](https://github.com/dheerajgoel17/dual-stream)

**Landing page:** [dheerajgoel17.github.io/dual-stream](https://dheerajgoel17.github.io/dual-stream)

## Install from GitHub

1. **[Download ZIP](https://github.com/dheerajgoel17/dual-stream/archive/refs/heads/main.zip)** (or clone this repo)
2. Unzip if needed
3. Open `chrome://extensions`
4. Enable **Developer mode**
5. Click **Load unpacked** → select this folder

Updates: pull latest `main` and click **Reload** on the extension card.

## Features

- **Multi-view** — up to 9 panes, drag to reorder, audio focus (`1`–`9`, `m`)
- **Float** — mini-player over your current tab
- **Picture-in-Picture** — `Alt+Shift+P`
- Embeds: YouTube, Twitch, Kick, Vimeo
- Direct HLS for supported watch URLs (see [docs/USAGE.md](docs/USAGE.md))

## Shortcuts

| Key | Action |
| --- | --- |
| `Alt+Shift+S` | Open multi-view |
| `Alt+Shift+P` | PiP current tab |

Configure at `chrome://extensions/shortcuts`.

## Development

```bash
npm install
npm test
```

## Monetization (Google AdSense)

Ad slots on the [GitHub Pages site](docs/index.html) and optional banners in the popup/viewer (via iframe). Setup: [docs/ADS.md](docs/ADS.md).

## Docs

- [Usage](docs/USAGE.md)
- [AdSense setup](docs/ADS.md)

## License

Use at your own risk. Not affiliated with Google, YouTube, Twitch, or any streaming provider.
