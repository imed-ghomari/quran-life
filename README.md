# Quran Learning App

Unified web app for daily Qur'an review, listening/reading, progress tracking, and mindmap-driven memorization.

## Quick start
1) Install deps: `npm install`
2) Dev server: `npm run dev`
3) Build: `npm run build` (uses Next 13.5)

## Data
- Quran text: `public/qpc-hafs-word-by-word.json` (Word-by-word dataset)
- Audio: `public/audio/<surah><ayah>.mp3` (e.g., 001001.mp3)
- Mutashabihat data: `Quran_Mutashabihat_Data-master/mutashabiha_data.json`

## Tabs
- **Today**: Reviews (SM-2) + Daily Portion (audio/read). Speed control, chunked reveal, mutashabihat-aware context, read-only toggle.
- **Statistics**: Progress focus — learned counts, active part progress, maturity buckets, mindmap completion, skipped count, due reviews.
- **Todo**: Work queue:
  - Surah mindmaps (incomplete first), add anchors, upload image, mark complete.
  - Part mindmaps (incomplete first).
  - Fix mindmaps (anchors suspended after 3 failed recalls; confirm new mindmap to unsuspend).
  - Similarity checks (decide if error was due to mutashabihat; update mindmap/note or hide).
  - Empty sections auto-collapse.
- **Settings**: Completion schedule, active part, learned/s skipped surahs, surah maturity adjustment, mutashabihat decisions registry (editable notes).

## Key behaviors
- Skipped surahs are removed from Today (audio/read) and due reviews; mindmap artifacts pruned.
- Mindmap reviews appear when a mindmap is marked complete.
- Mutashabihat-aware context expands preview until a non-similar verse is reached.
- Desktop nav docks right; mobile keeps bottom bar.

## Styling
- Reusable `.anchor-input` for anchor/mindmap inputs to align UI.

## Build & deploy
- Run `npm run build` to verify production readiness.
- Static assets served from `/public`.
# quran-life
