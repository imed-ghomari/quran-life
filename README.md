# Quran Life — Obsidian Plugin

Daily Qur'an review, mindmap memorization and Anki export, vault-synced via Resilio Sync.

## Installation

### Community plugin (recommended)

1. Open Obsidian **Settings → Community plugins** and enable community plugins if prompted.
2. Search for **Quran Life** and click **Install**, then **Enable**.

### Manual / BRAT

1. Download the latest release `.zip` from the [releases page](https://github.com/imed-ghomari/quran-life/releases).
2. In Obsidian, open **Settings → Community plugins → Browse**, click the BRAT icon (or use **Open plugin folder**), and drop the extracted plugin folder into your vault's `.obsidian/plugins/quran-life` directory.
3. Restart Obsidian and enable **Quran Life** in **Settings → Community plugins**.

## Usage

### Daily portion

- In the plugin settings, choose the Quran part you want to review and your daily target in minutes.
- The plugin computes an approximate number of verses per day and a full cycle length for the selected part, so you can pace your review.
- Toggle between **Listening** (audio reciter) and **Reading** modes.

### Mindmap memorization

- Open a surah or part from the plugin's mindmap editor to create and edit visual memorization maps.
- Mindmaps are stored as individual vault files, so Resilio Sync keeps them in sync across devices.

### Anki export

- From the plugin settings, configure the part order and surah-within-part order for the next export.
- Press **Export** to generate an `.apkg` file you can import into Anki.

## Storage

All plugin data lives in a single vault folder (`QuranLife/` by default, or the plugin's own data folder on desktop), which Resilio Sync can keep in sync across devices.

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
