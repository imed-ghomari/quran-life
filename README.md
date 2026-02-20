# Quran Learning App

> ⚠️ **Warning: Under Development**    
> This application is currently in an active state of development. Features may change, data might be reset, and you may encounter bugs. Please use with caution and ensure you have backups of any important data.

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
  - **Sequential Daily Portion**: Portions follow natural Quranic order (surah-by-surah) with Bismillah transitions.
- **Statistics**: Progress focus — learned counts, active part progress, maturity buckets, mindmap completion, skipped count, due reviews.
- **Todo**: Work queue:
  - Surah mindmaps (incomplete first), add anchors, upload image, mark complete.
  - Part mindmaps (incomplete first).
  - **Fix mindmaps**: Anchors suspended after 3 failed recalls. **Re-learning phase** (Day 1 -> Day 3) triggers after fix confirmation to ensure mental re-encoding.
  - **Similarity checks**: Warnings for verse chunks with any failures involving mutashabihat. Not necessarily suspended; used for proactive checking.
  - Empty sections auto-collapse.
- **Settings**: Completion schedule, active part, learned/skipped surahs, surah maturity adjustment, mutashabihat decisions registry (editable notes).
  - **Cloud Sync**: InstantDB integration with real-time graph-based synchronization and automatic conflict resolution.

## Key behaviors
- **Sync Conflict Resolution**: Powered by InstantDB's real-time sync engine, providing seamless data consistency across devices without manual timestamp tracking.
- **Authentication**: Secure Magic Link authentication via InstantDB.
- **Mobile Optimization**: Responsive design with bottom navigation, optimized modal sizes, and top-right toast notifications to avoid interaction overlaps.
- **Sequential Transitions**: Automatic Bismillah display/audio when transitioning between surahs in the Daily Portion.
- Skipped surahs are removed from Today (audio/read) and due reviews; mindmap artifacts pruned.
- Mindmap reviews appear when a mindmap is marked complete.
- Mutashabihat-aware context expands preview until a non-similar verse is reached.
- Desktop nav docks right; mobile keeps bottom bar.

## Styling
- Reusable `.anchor-input` for anchor/mindmap inputs to align UI.

## Build & deploy
- Run `npm run build` to verify production readiness.
- Static assets served from `/public`.

## Mindmap Source Verification (Maintainer)
- Scope: `content/mindmaps/part-*.mdx` and `content/mindmaps/surah-*.mdx`.
- Each file has a `## Source Verification` section with 5 source pills and page placeholders (`p.___`).
- Set the 5 shared source URLs in bulk:
  - `scripts/set-mindmap-source-links.sh "<source1_url>" "<source2_url>" "<source3_url>" "<source4_url>" "<source5_url>"`
- Current URL placeholders:
  - `https://SOURCE_FILE_1_URL`
  - `https://SOURCE_FILE_2_URL`
  - `https://SOURCE_FILE_3_URL`
  - `https://SOURCE_FILE_4_URL`
  - `https://SOURCE_FILE_5_URL`
- After links are set, fill page placeholders per Surah/Part by replacing `p.___` in each file.

## Access Configuration (Canonical)
- Role and checkout bypass are server-authoritative.
- Canonical vars:
  - `EDITOR_EMAILS` (maintainer/editor features; also bypasses checkout)
  - `BYPASS_EMAILS` (checkout bypass only)
- Example:
  - `EDITOR_EMAILS=maintainer@example.com`
  - `BYPASS_EMAILS=viewer@example.com`

### Migration Window (Release N)
- Deprecated but still supported with warnings:
  - `NEXT_PUBLIC_EDITOR_EMAILS`
  - `NEXT_PUBLIC_EDITOR_EMAIL`
  - `NEXT_PUBLIC_BYPASS_EMAILS`
  - `NEXT_PUBLIC_APP_MODE`
  - `APP_MODE`
- Release N+1 will remove deprecated vars from access-control logic.

## E2E Auth Bootstrap (Playwright)
- Goal: enable UI automation in non-production without bypassing production auth rules.
- Required env vars:
  - `E2E_MODE=true`
  - `E2E_AUTH_SECRET=<long-random-secret>`
  - Optional: `E2E_DEFAULT_EMAIL`, `E2E_ALLOWED_EMAILS` (comma-separated allowlist), `E2E_BASE_URL`
- Flow:
  1) Start app in non-production environment.
  2) Generate login URL: `npm run e2e:auth:url`
  3) Open that URL in browser automation (it sets `instant_user_<appId>` cookie and redirects to dashboard).
- Endpoint: `GET /api/e2e/session`
  - Hard guards: disabled unless `E2E_MODE=true`, requires secret, blocked in `NODE_ENV=production`.
  - Cookie TTL: 1 hour, `HttpOnly`, `SameSite=Strict`.

## FSRS Optimization Testing (No E2E)
- Run local optimizer test: `npm run test:fsrs:optimization`
- This uses synthetic review logs and verifies optimizer output shape (finite FSRS weights array; currently `21` values).

### FSRS Optimization Mode Switch
- Add these to `.env.local` and restart `npm run dev`.
- Normal mode (default behavior):
  - `NEXT_PUBLIC_FSRS_OPTIMIZATION_MODE=normal`
  - Uses `400` new logs threshold and `5000ms` startup delay.
- Test mode (fast trigger for manual testing):
  - `NEXT_PUBLIC_FSRS_OPTIMIZATION_MODE=test`
  - Uses `5` new logs threshold and `0ms` delay.

### Optional Overrides
- You can override either mode with:
  - `NEXT_PUBLIC_FSRS_OPTIMIZATION_LOG_DELTA=<number>`
  - `NEXT_PUBLIC_FSRS_OPTIMIZATION_DELAY_MS=<number>`
# quran-life
