# Quran Life — Obsidian Plugin

> **🚧 Under development — will be fully operational soon.**
>
> Quran Life is still being built and is not finished yet. Expect rough edges,
> breaking changes and one-time data migrations between versions. Feel free to try it.
> I'm working on the quran mindmaps. I'll add a way to import them directly to the plugin shortly. After that the plugin will be ready for use.

Daily Qur'an review, mindmap memorization and Anki export, autosaved to your vault.

> **Requires [Anki](https://apps.ankiweb.net/) (23.10 or newer, desktop or mobile).**
> The plugin prepares your cards — daily reading, mindmaps, verse groups — and Anki
> handles all reviews and scheduling.

📖 **Documentation:** <https://imed-ghomari.github.io/quran-life/> — user guides and mindmap symbol legend.
✍️ **Blog:** <https://imed-ghomari.github.io/quran-life/blog> — essays on the memorization method behind the plugin.

## Installation

### Community plugin (recommended)

1. Open Obsidian **Settings → Community plugins** and enable community plugins if prompted.
2. Search for **Quran Life** and click **Install**, then **Enable**.

### Manual install

1. Download the latest release `.zip` from the [releases page](https://github.com/imed-ghomari/quran-life/releases).
2. Extract it into your vault's `.obsidian/plugins/quran-life` directory.
3. Restart Obsidian and enable **Quran Life** in **Settings → Community plugins**.

### Via BRAT

1. Install the [BRAT](https://obsidian.md/plugins?id=brat) plugin and enable it.
2. In BRAT settings, choose **Add Beta plugin** and paste this repository URL.
3. Enable **Quran Life** in **Settings → Community plugins**.

## Usage

### Daily portion

- In the plugin settings, choose the Quran part you want to review and your daily target in minutes.
- The plugin computes an approximate number of verses per day and a full cycle length for the selected part, so you can pace your review.
- Toggle between **Listening** (audio reciter) and **Reading** modes.

### Mindmap memorization

- Open a surah or part from the plugin's mindmap editor to create and edit visual memorization maps. Only surahs **with** a mindmap are exported, so always start here.
- Mindmaps are stored as individual files in the plugin's data folder, so any file sync keeps them in sync across devices.

### Anki export

- From the plugin settings, configure the part order and surah-within-part order for the next export.
- In the Anki Deck view, press **Export to Anki** to generate an `.apkg` file, then import it into Anki (double-click the file, or File → Import). Re-importing updates your cards without losing review progress — see the [import walkthrough](https://imed-ghomari.github.io/quran-life/philosophy/getting-started#3-export-and-import-into-anki).

## Storage

Everything the plugin stores lives in **one** folder — the plugin's own data folder
inside Obsidian's configuration directory (`<configDir>` is `.obsidian` unless you
renamed it):

```
<configDir>/plugins/quran-life/data/
├── assets/               # the Qur'an corpus, downloaded once on first run
├── splits/               # Anki split anchors, one file per surah
├── mindmaps/             # tldraw mindmaps: surah-, part- and meta-<n>.json
├── docs/                 # the markdown note belonging to each mindmap
├── daily/                # daily portion settings + per-part listening progress
├── recitation-cache/     # word-timing slices for offline playback
├── deleted-mindmaps.json # delete tombstones (stable deletes across syncs)
└── anki-export.json      # Anki export order preferences
```

Sync your vault with any file sync to keep your data in sync
across devices. Offline recitation audio downloaded from the settings tab lives one
level up, in `<configDir>/plugins/quran-life/offline-audio/` — syncing the whole
`plugins/quran-life` folder covers both. The location is fixed — there is deliberately no setting to move it —
so every vault and every device syncs exactly one predictable directory.

Two notes:

- `QuranLife/` at the vault root is only read for the one-time migration from older
  builds; the plugin never writes there anymore, so you can move or delete it after a
  release that no longer needs it.
- Review scheduling lives in Anki, not in the plugin, so no review/`nodes` files are kept.

## Development

```bash
npm run build
```

## Release

```bash
npm run plugin:release
```

Releases are published from the `main` branch.

## License

MIT © [imed-ghomari](https://github.com/imed-ghomari)
