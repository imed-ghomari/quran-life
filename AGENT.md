# Agent Instructions - Persistent Memory

## Dev Server
- KEEP ONE dev server running at all times. DO NOT kill and restart it on every change.
- Use `npm run dev` only once; rely on HMR for updates. Check `/tmp/quran-dev.log` or `lsof -i :3000` if needed, but do not kill/restart unless user explicitly asks or port is dead.
- Current dev server: `npm run dev` > `/tmp/quran-dev.log` 2>&1 & (PID tracked in log) - http://localhost:3000
- DO NOT run `npm run build` / `next build`. User wants dev only: "don't build".

## Anki Deck Tab - Completed Fixes
- `src/components/AnkiDeckTab.tsx:323`: Deck name + Export button on same line via `flex gap-3 items-end` (input flex-1, button shrink-0 whitespace-nowrap).
- `src/lib/anki/splitStore.ts`: Added `sanitizeAnchors()` and `buildAnchorsFromBreaks()` to dedupe overlapping splits, filter corrupted data, rebuild sequential anchors from breaks. Applied in `loadSplits()`, `importSplitsFromBackup()`, `getSplitsForSurah()`.
- `src/components/AnkiDeckTab.tsx:173-195`: Fixed `handleAddBreak`/`handleRemoveBreak` to rebuild via breaks instead of anchor adjacency (fixes toggle enable works but disable fails bug caused by overlapping premade data). Handles empty anchors case.
- `public/premade-anki-data.json`: Sanitized surahs 50,79,81 from 12/17/9 overlapping anchors to 6/9/4 sequential valid coverings.

## Branch Constraint
- ALWAYS work on `quran-anki-companion` branch only (renamed from `daily-portion-only` on 2026-09-08). Do NOT update `main` branch. All new app work is on `quran-anki-companion` — even though the branch changed name, still only this branch.

## Git Workflow - Push After Each Prompt
- After finishing **every** user prompt (feature, fix, or docs), push to GitHub immediately in the same turn.
- Use **one long command** to save time: `git add <files> && git commit -m "..." && git push origin quran-anki-companion` (combine add/commit/push, don't run them as separate tool calls).
- Never leave unpushed commits locally after a prompt is done.

## User Preferences
- Language: concise, factual, file_path:line_number references when referencing code.
- Verify fixes via execution where possible, but never rebuild.
- Dev server logs: `/tmp/quran-dev.log`
