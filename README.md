# Quran Life — Obsidian Plugin

Daily Qur'an review, mindmap memorization and Anki export, vault-synced (one file per surah, Resilio-friendly — no cloud account needed). Works on desktop and mobile, offline after first launch.

## Features

- **Daily Portion** — listening/reading portion with word highlighting, Basmala transitions, completion + undo.
- **Anki Deck** — per-surah/part mindmaps (tldraw), verse-group splits, notes, deck statistics, and one-tap `.apkg` export with chunk-reveal cards and mindmap images.
- **Offline audio (opt-in)** — download recitation audio per part for offline playback; otherwise everything streams.
- **Vault storage** — splits, mindmaps, docs, progress and settings live as files in your vault (`QuranLife/` by default, or the plugin data folder), so any file sync (Resilio, Syncthing, iCloud) syncs them.

## Install

- **Community store** (once listed): search "Quran Life" in Settings → Community plugins.
- **BRAT (beta)**: add this repo (`imed-ghomari/quran-life`) — BRAT installs from the latest GitHub Release.
- **Manual**: download `manifest.json`, `main.js` and `styles.css` from the latest GitHub Release into `<vault>/.obsidian/plugins/quran-life/`, then enable the plugin.

## First launch (one-time download)

The install ships only the 3 standard files, so on first launch the plugin downloads the Quran text (~9MB) once from this repo and caches it in the vault (`QuranLife/assets/`). Both views show a live progress bar, and a retry card if the network fails. Afterwards everything except audio streaming works fully offline. Anki export needs no download at all — its database engine is bundled inside `main.js`.

## Offline behavior

- **Daily Portion, mindmaps, splits/notes, Anki export**: fully offline after first launch.
- **Audio**: needs internet. All reciters stream on demand; recitation metadata is fetched when online and cached in the vault afterwards. No audio files ship with the plugin.
- **Offline audio is opt-in**: Settings → Quran Life → Offline Audio → pick a reciter and part, then download. Files stay inside the plugin folder so one synced folder covers every device; the player prefers a downloaded file and streams only as fallback.

## Development

- Install deps: `npm install`
- Dev (esbuild watch → `main.js`): `npm run dev`
- Production build: `npm run build`
- Reload the plugin in Obsidian after building (Command Palette → "Reload app without saving", or disable/enable the plugin).

## Release process (maintainers)

- Bump `manifest.json` + `package.json`, add the version to `versions.json`.
- `npm run plugin:release` validates the 3 release files (`manifest.json`, `main.js`, `styles.css` — exactly what Obsidian installs, nothing else).
- Tag the version **without** a `v` prefix (`1.0.1`, not `v1.0.1`) and push — Obsidian matches releases to `manifest.json` by exact version, and `.github/workflows/plugin-release.yml` attaches the 3 files.
