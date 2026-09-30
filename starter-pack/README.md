# Starter pack — pre-made mindmaps, splits & docs

Drop your pre-made files here and they ship **inside the plugin**. The other
vault then gets an “Import pre-made” button (Anki Deck → MINDMAPS card) with
bulk + selective import — no manual folder copying needed.

## Where the files come from

Copy from your own vault's plugin data folder
(`<configDir>/plugins/quran-life/data/`, where `<configDir>` is usually
`.obsidian`):

| Copy from (your vault) | To (this folder) | Example |
|---|---|---|
| `data/mindmaps/*.json` | `starter-pack/mindmaps/` | `surah-2.json`, `part-1.json`, `meta-0.json` |
| `data/splits/*.json` | `starter-pack/splits/` | `surah-002.json` |
| `data/docs/*.md` | `starter-pack/docs/` | `surah-2.md` |

Keep the **original filenames** — the build matches the three kinds by key:

- `mindmaps/surah-2.json` + `splits/surah-002.json` + `docs/surah-2.md`
  → one “Surah 2” import item (mindmap + splits + notes travel together).
- `mindmaps/part-1.json` → “Part 1” item (parts/metas carry no splits).
- A key with only some of the three is fine — whatever is present is imported.

## Build

Run `npm run starter-pack` (also runs automatically as part of
`npm run build`). It validates every file and produces two outputs:

1. `src/plugin/starterPack.generated.ts` — small packs ship **inside
   `main.js`** (offline, zero taps). Size guard: warns over 1.5 MB; over
   6 MB the module is left empty (with a warning) so a big pack never
   breaks the build or slows startup for everyone.
2. `starter-pack.zip` (repo root, gitignored build artifact) — the **full**
   pack in vault-relative layout, whatever the size. Send this file to the
   other person; the in-app importer loads it via file picker
   (a ~60 MB pack zips to a few MB).

Validation per file:

- mindmaps must parse as JSON with a `snapshot.store` (real tldraw snapshot);
  anything else is skipped with a warning.
- splits must be a JSON array of `{ startVerse, endVerse }` anchors.
- docs must be non-empty markdown.

When the folder is empty both outputs are empty (the zip is removed), so this
folder costs nothing by default. The import button always shows — with an
empty bundled pack the modal offers the `.zip` picker directly.
