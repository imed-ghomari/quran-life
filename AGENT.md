# Agent Instructions - Persistent Memory

## Plugin Build (Obsidian)
- This repo is now an **Obsidian plugin** (branch `quran-anki-companion-obsidian-plugin`). DO NOT use Next dev server.
- On **every code change** run the plugin build: `npm run dev` (esbuild watch → `main.js`) OR `npm run build` for production.
- `npm run dev` keeps running and rebuilds on save — check `main.js` timestamp / `npm run dev` log. Do not kill/restart unless dead.
- DO NOT run `next dev` / `next build`. Use only `npm run dev` / `npm run build` (esbuild).
- After build, reload plugin in Obsidian: Command Palette → "Reload app without saving" or disable/enable plugin, or use Hot Reload plugin.
- Vault data lives in `QuranLife/` folder (see `src/plugin/storage/vaultAdapter.ts`), synced via Resilio Sync — never touch `.obsidian/` directly for user data.

## Anki Deck Tab - Completed Fixes
- `src/components/AnkiDeckTab.tsx:323`: Deck name + Export button on same line via `flex gap-3 items-end` (input flex-1, button shrink-0 whitespace-nowrap).
- `src/lib/anki/splitStore.ts`: Added `sanitizeAnchors()` and `buildAnchorsFromBreaks()` to dedupe overlapping splits, filter corrupted data, rebuild sequential anchors from breaks. Applied in `loadSplits()`, `importSplitsFromBackup()`, `getSplitsForSurah()`.
- `src/components/AnkiDeckTab.tsx:173-195`: Fixed `handleAddBreak`/`handleRemoveBreak` to rebuild via breaks instead of anchor adjacency (fixes toggle enable works but disable fails bug caused by overlapping premade data). Handles empty anchors case.
- `public/premade-anki-data.json`: Sanitized surahs 50,79,81 from 12/17/9 overlapping anchors to 6/9/4 sequential valid coverings.

## Mobile / Offline Audio Fixes (2026-09-22)
- `src/lib/obsidianApp.ts` (NEW): shared `App` registry. Obsidian **Mobile has no `window.app`**, so recitation JSON, Quran JSON and offline audio all lost the vault adapter + `requestUrl` (the only CORS-free fetch) on phones. `main.ts` calls `setObsidianApp(this.app)` in `onload`. `lib/audio.ts`, `lib/quranData.ts`, `plugin/offlineAudio.ts` now resolve the app through it.
- `src/lib/audio.ts`: every ayah-based reciter carries `ayahAudioBase` — files are `<base>/<SSS><AAA>.mp3` (verified 37,416/37,416 verses against `public/recitations/*.json`). `buildAyahAudioUrl()` + `getAudioInfoForVerse()` derive the URL when the ~2MB `verses` map is unavailable, which fixes mobile download ("Failed to load ayah recitation map") and verse handoff latency. `fetchJsonWithObsidianFallback()` is now vault-first → `requestUrl` → fetch.
- `src/lib/audio.ts` + `src/plugin/recitationCache.ts` (NEW): `registerRecitationCacheStore()` persists a compact `{ "s:a": segments }` slice to `<dataRoot>/recitation-cache/<reciterId>.json`, so offline playback still highlights the exact words (was time-based interpolation before).
- `resolveAudioUrl()` streams CORS-friendly hosts directly (tarteel/qurancdn/quranicaudio send `access-control-allow-origin: *` + ranges); `resolveAudioUrlProxied()` is the error fallback. Blob-proxying every verse was the audible gap between verses.
- `AudioPlayerLocal.tsx`: speeds now `0.75…2, 2.5, 3`; Basmala resolves offline-first and derives 1:1 when metadata is missing (works offline between surahs); `onWaiting`/`onStalled` no longer pause mid-verse (stall watcher still recovers); time display shows elapsed / total / remaining with word-rate estimates when timings are missing.
- `AnkiDeckObsidian.tsx`: split Save button removed (splits persist on every change); Deck Statistics + export read `loadAllSplits()` / new `loadAllDocs()` with key normalization (`surah-2` ↔ `surah-002`), so files added directly in the data folder are counted and exported.
- Mobile layout pass: `box-sizing: border-box` + `width:100%` on view roots (the right-edge overflow), wrap/stack for setting rows, export row, split row, stats grid and tables, mobile CSS injected by `settings.ts` (`quran-life-settings` class).

## Branch Constraint
- ALWAYS work on `quran-anki-companion-obsidian-plugin` branch only (from `quran-anki-companion` on 2026-09-08). Do NOT update `main` or `quran-anki-companion` branch. All new plugin work is on `quran-anki-companion-obsidian-plugin`.

## Git Workflow - Push After Each Prompt
- After finishing **every** user prompt (feature, fix, or docs), push to GitHub immediately in the same turn.
- Use **one long command** to save time: `git add <files> && git commit -m "..." && git push origin quran-anki-companion-obsidian-plugin` (combine add/commit/push, don't run them as separate tool calls).
- Never leave unpushed commits locally after a prompt is done.

## User Preferences
- Language: concise, factual, file_path:line_number references when referencing code.
- Verify fixes via execution where possible, and rebuild plugin (`npm run build`) after logic changes.
- Quick lib check without Obsidian: `npx esbuild src/lib/audio.ts --bundle --format=cjs --platform=node --outfile=/tmp/ql-audio.cjs --log-level=error` then require it in node.
- Plugin build log: `npm run dev` watch → `main.js` (esbuild). No Next dev server.
