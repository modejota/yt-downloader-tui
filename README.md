# yt-downloader-tui

> YouTube music, delivered to your terminal.

A keyboard-driven terminal UI for downloading audio from YouTube videos and playlists — search or paste a URL, pick a format, and watch it download without ever leaving the terminal.

Built with [Bun](https://bun.sh), [React](https://react.dev), and [OpenTUI](https://github.com/sst/opentui).

## Features

- **Search or paste a URL** — one input box handles both YouTube video/playlist links and free-text search.
- **Playlists** — select individual entries or the whole playlist, apply one format to everything or configure each video individually.
- **Audio formats** — MP3, AAC, Opus, FLAC, or WAV, with CBR/VBR bitrate control (or lossless "best" where the format allows it).
- **Trimming** — cut a video down to a start/end time before it's downloaded.
- **Metadata embedding** — title, artist, and thumbnail get tagged onto the output file.
- **Download queue** — configurable concurrency, live progress, and cancel-in-flight support.
- **No external FFmpeg install required** — audio decoding/encoding is bundled via native bindings.
- **English and Spanish** — follows your system locale, or set it manually in Settings.

## Requirements

- [Bun](https://bun.sh) 1.x (running from source, or building your own binary)

Nothing else — there's no separate FFmpeg, Python, or YouTube API key to install.

## Getting started

```bash
git clone <this-repository-url>
cd yt-downloader-tui
bun install
bun start
```

`bun dev` runs the same thing with file watching, for development.

## Building a standalone binary

`bun build --compile` produces a single native executable with the Bun runtime baked in — no `bun` or `node` install required to run it.

```bash
bun run build                 # current platform
bun run build:linux-x64
bun run build:linux-arm64
bun run build:windows-x64
bun run build:macos-x64
bun run build:macos-arm64
bun run build:all             # every target above
```

Binaries are written to `dist/`.

## Configuration

Settings (default audio format/quality, download folder, concurrency, language, queue panel position, etc.) are edited from the in-app Settings screen (`Ctrl+S`) and persisted automatically to:

- **Windows:** `%APPDATA%\yt-downloader-tui\config.json`
- **Linux/macOS:** `$XDG_CONFIG_HOME/yt-downloader-tui/config.json` (defaults to `~/.config/yt-downloader-tui/config.json`)

A missing or corrupted config file is never fatal — the app falls back to defaults field-by-field.

## Keyboard shortcuts

| Key       | Action                          |
| --------- | ------------------------------- |
| `Ctrl+Q`  | Toggle the download queue panel |
| `Ctrl+S`  | Open Settings                   |
| `Ctrl+C`  | Exit                            |
| `↑` / `↓` | Move through a list             |
| `←` / `→` | Change a selected value         |
| `Enter`   | Confirm / toggle                |
| `Esc`     | Go back                         |

## Development

```bash
bun test         # run the test suite
bun run typecheck
bun run lint
bun run fmt       # format with oxfmt
```

## Disclaimer

This tool downloads content from YouTube. Using it — and anything you do with what it downloads — is your responsibility, and is subject to YouTube's Terms of Service and the copyright law that applies in your country. The maintainers of this project are not responsible for how it is used. The app shows this same notice on first launch (and it's available again from Settings).

## License

[MIT](./LICENSE)
