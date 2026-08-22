# Dual Stream

Chrome extension — **watch up to 9 videos at once** in one tab (grid, PiP, float overlay).

[![Install from GitHub](https://img.shields.io/badge/Install-v1.9.0-2ee6c8?style=for-the-badge)](https://github.com/dheerajgoel17/dual-stream/releases/latest)

**Landing page:** [dheerajgoel17.github.io/dual-stream](https://dheerajgoel17.github.io/dual-stream)

## Screenshots

<p align="center">
  <img src="docs/screenshots/popup.png" alt="Dual Stream popup — pick tabs and open multi-view" width="340" />
</p>

<p align="center">
  <img src="docs/screenshots/multi-view-2.png" alt="Two live streams side by side in the grid viewer" width="720" />
</p>

<p align="center">
  <img src="docs/screenshots/multi-view-9.png" alt="Nine-stream grid layout with layout controls" width="720" />
</p>

## Install from GitHub

1. **[Download v1.9.0](https://github.com/dheerajgoel17/dual-stream/releases/latest/download/dual-stream-v1.9.0.zip)** (or clone this repo)
2. Unzip if needed
3. Open `chrome://extensions`
4. Enable **Developer mode**
5. Click **Load unpacked** → select this folder

Updates: download the [latest release](https://github.com/dheerajgoel17/dual-stream/releases/latest) and click **Reload** on the extension card.

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

## Support development

Dual Stream is **free and ad-free**. Optional support via the repo [**Sponsor**](https://github.com/sponsors/dheerajgoel17) button (GitHub Sponsors · Buy Me a Coffee). See [docs/SUPPORT.md](docs/SUPPORT.md).

## Docs

- [Usage](docs/USAGE.md)
- [Support / donations](docs/SUPPORT.md)

## License

Use at your own risk. Not affiliated with Google, YouTube, Twitch, or any streaming provider.
