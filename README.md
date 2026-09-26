# Quran Learning App

> ⚠️ **Warning: Under Development**    
> This application is currently in an active state of development. Features may change, data might be reset, and you may encounter bugs. Please use with caution and ensure you have backups of any important data.

Unified web app for daily Qur'an review, listening/reading, progress tracking, and mindmap-driven memorization.

## Quick start
1) Install deps: `npm install`
2) Dev server: `npm run dev`
3) Build: `npm run build` (uses Next 13.5)

## Data
- Quran text and word data: `public/qpc-hafs-word-by-word.json`
- Audio: `public/audio/<surah><ayah>.mp3` (e.g., 001001.mp3)
- Mutashabihat data: `Quran_Mutashabihat_Data-master/mutashabiha_data.json`

## Tabs
- **Today**: Reviews (SM-2) + Daily Portion (audio/read). Speed control, chunked reveal, mutashabihat-aware context, read-only toggle, and undo/redo for review actions.
  - **Sequential Daily Portion**: Portions follow natural Quranic order (surah-by-surah) with Bismillah transitions.
- **Statistics**: Progress focus — learned counts, active part progress, maturity buckets, mindmap completion, skipped count, due reviews.
- **Todo**: Work queue:
  - Surah mindmaps (incomplete first), configure verse splits, mark complete (no uploads in the mindmap editor).
  - Part mindmaps (incomplete first).
  - **Fix mindmaps**: Verse groups are suspended after 3 failed recalls. **Re-learning phase** (Day 1 -> Day 3) triggers after fix confirmation.
  - **Similarity checks**: Warnings for verse chunks with any failures involving mutashabihat. Not necessarily suspended; used for proactive checking.
  - **Active Part scope rule**: Changing **Settings > Active Part** filters only Surah/Part construction cards. Maintenance cards (**Similarity** and **Suspended**) are generated from review errors and remain visible across parts until resolved/acknowledged.
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
- Verse-group review creation uses splits (anchors). If a Surah has no saved splits, verse groups are not created, except for short Surahs with `<= 10` verses where a single implicit group (`1..N`) is used automatically.
- Manual splits always override the short-Surah implicit group as soon as the user saves splits.
- Mutashabihat-aware context expands preview until a non-similar verse is reached.
- **Review due-time precision**:
  - If a node due value includes a timestamp (ISO with `T`), it becomes due at that exact time (`due <= now`).
  - If a node due value is date-only (`YYYY-MM-DD`), it becomes due for the full local day (from local midnight).
  - Scheduling preview labels are day-rounded (`Today`, `1d`, `2d`, ...), so sub-day intervals may still display as `Today`.
- Desktop nav docks right; mobile keeps bottom bar.

## Mutashabihat Logic (Maintainer, Simple Terms)
- Think of each mutashabihat item as a "similarity case" around one ayah, with other ayat that look similar.
- The app now groups repeated cases so the user sees cleaner, non-duplicate items.

- Grouping rules:
  - Each grouped case keeps one originator verse.
  - Other verses in the same surah are treated as comparators, not extra originators.
  - If two cases in the same verse overlap strongly and point to the same outside comparator set, they may still be merged into one case.
  - A verse can still appear in more than one case when it truly has different similarity patterns (we do not force unrelated cases into one).

- Important counting behavior:
  - In **Settings > Similar Verse Coverage**, the counter uses grouped verse-cases (not raw backend rows), so the count matches what users actually see.

- Display behavior:
  - Internal `phrase#number` labels are hidden from users.
  - Context buttons exist per origin/comparator row:
    - Mindmap editor
    - Splits configuration
    - Previous verse
    - Next verse
    - Reset back to original verse
  - Previous/next changes the shown verse in-place (minimal view), not by adding extra lines.

- Where buttons open:
  - From **Todo similarity context**: open editor/splits in Todo.
  - From **Settings similarity coverage/context**: open editor/splits in Settings.
  - New windows open in front of the current context view.

- Tooltip behavior:
  - Button hover tooltips are expected in both mutashabihat windows.

- Todo card appearance rule (important):
  - A **Similarity** card is shown only when:
    - it has unresolved similarity work, and
    - at least one comparator verse has already been reviewed at least once.
  - If none of the comparator verses have been reviewed yet, that similarity card stays hidden for now.
  - If a Similarity card was already moved to **Complete**, it stays pinned there (it does not auto-move back).

- Todo maintenance lifecycle (important):
  - **Suspended** cards behave differently from Similarity cards.
  - If a suspended group is acknowledged (moved to Complete) and then the same group fails again (3+ errors), it is automatically treated as active work again and re-enters **Backlog**.
  - Suspended groups are matched against the **current** saved splits/anchors. If splits change and an old suspended range no longer exists, that old suspended card is removed from Todo immediately.
  - If `anchorId/groupKey` changes for what is effectively the same suspended range, the old completed suspended card is considered obsolete and removed from Todo to avoid duplicate-looking cards.

- Review queue sorting:
  - **Due Date** sorting prioritizes cards that have already been reviewed at least once.
  - New cards are shown after reviewed cards, with due date still used inside each group.

- Why this design:
  - Users first build basic review familiarity, then similarity warnings appear when they are actionable.
  - This reduces early noise and keeps mutashabihat work focused.

## Styling
- Reusable shared input styles for split and mindmap forms.

## Build & deploy
- Run `npm run build` to verify production readiness.
- Static assets served from `/public`.

## Mindmap Legend Symbols (Maintainer)
- Canonical source images live in `symbol meanings/` (project root).
- `npm run dev` / `npm run build` only run docs indexing (`node scripts/generate-search-index.js`).
- Legend/image sync is manual when symbols change:
  - `npm run docs:sync:legend`
- The legend generator does 2 things:
  - Regenerates `content/mindmaps/legend.mdx` (grouped tables + consistent thumbnail sizing).
  - Syncs image assets to `public/assets/symbol-meanings/`.

### Replace an Existing Symbol Image
1. Keep the same source filename in `symbol meanings/` (same base name, any supported extension: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`).
2. Replace the file.
3. Run `npm run docs:sync:legend`.
4. Run `npm run build` to refresh search index and verify production build.

### Add a New Symbol
1. Add the new image to `symbol meanings/`.
   - The filename (without extension) is the symbol meaning shown in column 2.
2. Open `scripts/generate-mindmap-legend.js`.
3. Add the new meaning string to the right group in `SYMBOL_GROUPS`.
4. Run `npm run docs:sync:legend` to regenerate legend and public assets.
5. Run `npm run build` to refresh search index and verify production build.

### Important
- Do not manually edit `content/mindmaps/legend.mdx` for long-term changes unless you also update `SYMBOL_GROUPS`.
- The generator rewrites `legend.mdx` only when `npm run docs:sync:legend` is executed.

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

## Audio Player Reciter Mode
- The Today-page audio player list is controlled by:
  - `NEXT_PUBLIC_AUDIO_PLAYER_RECITER_MODE=ayah-only`
  - or `NEXT_PUBLIC_AUDIO_PLAYER_RECITER_MODE=all`
- `ayah-only` is the safer mode when you want to avoid the known instability of surah-based reciters.
- `all` brings surah-based reciters back into the player list for testing or broader choice.
- Current ayah-only player list includes:
  - Abdur Rahman As Sudais
  - Abdul Basit Abdul Samad Murattal
  - Hani Ar Rifai Murattal
  - Mahmoud Khalil Al Husary Murattal
  - Mohamed Al Tablawi Murattal
  - Saad Al Ghamdi Murattal
# quran-life

## Obsidian plugin

Daily Qur'an review, mindmap memorization and Anki export, vault-synced (Resilio-friendly, one file per surah — no cloud account needed).

### Install

- **Community store** (once listed): search "Quran Life" in Settings → Community plugins.
- **BRAT (beta)**: add this repo (`imed-ghomari/quran-life`) — BRAT installs from the latest GitHub Release.
- **Manual**: download `quran-life-<version>.zip` from the latest GitHub Release, extract all 5 files into `<vault>/.obsidian/plugins/quran-life/`, then enable the plugin. The zip contains `manifest.json`, `main.js`, `styles.css` plus two offline data files (`qpc-hafs-word-by-word.json`, `sql-wasm.wasm`) — extract everything, not just the first three.

### Offline behavior

- **Fully offline from first run**: Daily Portion, mindmaps, splits/notes and Anki export work with no connection. Quran text and the Anki packaging engine ship inside the release zip and are copied into the vault on first launch.
- **Audio needs internet**: all reciters stream on demand (recitation metadata is fetched when online and cached in the vault afterwards). No audio files ship with the plugin.
- **Offline audio is opt-in**: Settings → Quran Life → Offline Audio → pick a reciter and part, then download. Files stay inside the plugin folder so one synced folder covers every device; the player prefers a downloaded file and streams only as fallback.

### Release process (maintainers)

- Bump `manifest.json` + `package.json` version, add it to `versions.json`.
- `npm run plugin:release` builds and zips `dist/quran-life-<version>.zip` (validates exactly the 5 release files).
- Tag the version **without** a `v` prefix (`1.0.0`, not `v1.0.0`) and push — Obsidian matches releases to `manifest.json` by exact version, and `.github/workflows/plugin-release.yml` attaches `main.js`/`manifest.json`/`styles.css` (what Obsidian installs) plus the data files and zip.
