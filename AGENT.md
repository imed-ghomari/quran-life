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

## Branch Constraint
- ALWAYS work on `quran-anki-companion-obsidian-plugin` branch only (from `quran-anki-companion` on 2026-09-08). Do NOT update `main` or `quran-anki-companion` branch. All new plugin work is on `quran-anki-companion-obsidian-plugin`.

## Git Workflow - Push After Each Prompt
- After finishing **every** user prompt (feature, fix, or docs), push to GitHub immediately in the same turn.
- Use **one long command** to save time: `git add <files> && git commit -m "..." && git push origin quran-anki-companion-obsidian-plugin` (combine add/commit/push, don't run them as separate tool calls).
- Never leave unpushed commits locally after a prompt is done.

## User Preferences
- Language: concise, factual, file_path:line_number references when referencing code.
- Verify fixes via execution where possible, and rebuild plugin (`npm run build`) after logic changes.
- Plugin build log: `npm run dev` watch → `main.js` (esbuild). No Next dev server.
