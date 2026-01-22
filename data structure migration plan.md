# Data Migration & Scalability Plan: The Hybrid-Storage Strategy

## 1. The Problem
- **Current State:** Storing entire application state (including 118+ heavy JSON mindmaps) in a single `jsonb` column in PostgreSQL.
- **Symptom:** "Disk IO Depleted" errors, 504 timeouts, slow sync.
- **Root Cause:** "Write Amplification". Changing 1 byte in a mindmap rewrites the entire 50MB+ user record to the disk log.

## 2. The Solution: Hybrid Storage
We will split data into **Relational Metadata** (Postgres) and **File Content** (Supabase Storage).

### A. New Database Schema (Postgres)

We will replace the single `user_backups` table with normalized tables.

**1. `users` (Managed by Auth)**
- `id`: UUID (PK)

**2. `mindmaps` (Metadata Only)**
- `id`: UUID (PK)
- `user_id`: UUID (FK)
- `type`: String ('surah' | 'part')
- `resource_id`: Integer (Surah Number or Part Number)
- `is_complete`: Boolean
- `version`: Integer (Incremented on every edit)
- `updated_at`: Timestamp
- `storage_path`: String (e.g., `users/{uid}/mindmaps/surah_1_v1.json`)
- `snapshot_hash`: String (Optional, for quick change detection)

**3. `memory_nodes` (High Frequency Sync)**
- `id`: UUID (PK)
- `user_id`: UUID (FK)
- `node_id`: String (The logic ID used in app)
- `data`: JSONB (Contains specific SM-2/FSRS state only)
- `updated_at`: Timestamp

**4. `settings` (Low Frequency)**
- `user_id`: UUID (PK)
- `theme`, `audio_settings`, `learned_verses`: JSONB

### B. Supabase Storage Structure
We will create a private bucket named `user_data`.

- **Path Pattern:** `{user_id}/mindmaps/{surah_id}_v{version}.json`
  - *Note:* Including version in filename allows immutable caching.
- **Path Pattern:** `{user_id}/mindmaps/part_{part_id}_v{version}.json`

---

## 3. The New Sync Protocol (Delta Sync)

### Step 1: Push (Client -> Server)
When `syncWithCloud()` is called:
1. **Identify Changes:** Client compares local `updatedAt` vs last sync time.
2. **Batch Upload Files:**
   - If `Mindmap 2` changed, upload `surah_2_v6.json` to Storage Bucket.
   - *Optimization:* Only upload if content actually changed.
3. **Batch Update DB:**
   - Send a lightweight JSON payload to an RPC function `sync_updates`:
     ```json
     {
       "mindmaps": [{ "surah_id": 2, "version": 6, "updated_at": "..." }],
       "memory_nodes": [{ "id": "node-1", "data": {...}, "updated_at": "..." }]
     }
     ```

### Step 2: Pull (Server -> Client)
1. **Fetch Metadata:** Client calls `get_updates(last_sync_timestamp)`.
   - Server returns list of IDs that have `updated_at > last_sync_timestamp`.
2. **Download Content (Smart Strategy):**
   - **Memory Nodes:** Downloaded immediately (small JSON array).
   - **Mindmaps:**
     - *Active Map:* Download immediately.
     - *Other Maps:* Download **Lazily** (only when user opens them) OR in a **Background Queue**.

---

## 4. Migration Steps (Execution)

### Phase 1: Preparation
1. Create the new tables (`mindmaps`, `memory_nodes`, etc.) in Supabase.
2. Create the `user_data` Storage Bucket with RLS policies (User can only read/write their own folder).

### Phase 2: User Manual Backup (Safety Net)
1. Add a "Download Backup" button in Settings.
2. User downloads their current mindmaps as `.tldr` files.
3. This ensures they have a local copy if the migration fails.

### Phase 3: Data Migration Script
1. Write a Node.js script (admin only) that:
   - Iterates through every row in `user_backups`.
   - Parses the big JSON blob.
   - Extracts Mindmaps -> Uploads to Storage (using new schema).
   - Extracts Memory Nodes -> Inserts into DB table.
   - Updates the `mindmaps` metadata table.

### Phase 4: Switch & Cleanup
1. Update App to **READ** from the new system.
2. Drop the `data` column from `user_backups` (Reclaiming massive disk space).

---

## 5. Handling Tldraw Images (Simplification)
- **Decision:** Remove image support entirely from Tldraw editor.
- **Reason:** Not needed for the app's scope; prevents large JSON files (Base64 bloat) and complexity.
- **Action:** Configure Tldraw `assetProps` or UI to disable image upload/paste.

---

## 6. Infrastructure Optimization (Free Tier Survival)

### A. Netlify Optimization (Compute Limits)
- **Problem:** Docs Search API route consumes "Function Invocations" on every keystroke. Netlify Free limit is 125k/month.
- **Solution 1: Zero-Compute Search (Client-Side)**
  1. Generate `search-index.json` at build time.
  2. Client fetches index (cached CDN) and searches locally.
  3. **Result:** 0 Server Functions used for search.

- **Solution 2: Cache Docs Pages**
  1. Ensure MDX pages utilize `generateStaticParams` (Next.js) to be built as static HTML at deploy time.
  2. **Result:** Docs pages are served as static assets, not server-rendered functions.

- **Solution 3: Supabase for Everything Dynamic**
  1. Keep using `supabase-js` on the client for Auth, Database, and Storage.
  2. Avoid Next.js API Routes for data fetching.
  3. **Result:** Dynamic logic runs in the browser, bypassing Netlify completely.

### B. Supabase Egress Optimization (Bandwidth Limits)
- **Problem:** Database Egress limit is 2GB/month. Downloading 50MB backups kills this fast.
- **Solution:** Immutable Storage Caching.
  1. File names include version: `surah_2_v5.json`.
  2. Set `Cache-Control: public, max-age=31536000, immutable` on upload.
  3. Browser caches file forever. User NEVER downloads the same version twice.
  4. **Result:** Egress drops by 90%+.

---

## 7. Codebase & Reliability Improvements (Scalability)

### A. Local Data Architecture (Critical Performance)
- **Problem:** Local storage mirrors the backend monolith issue. All mindmaps are stored in a single IndexedDB key (`quran-app-mindmaps`).
- **Risk:** Loading 50MB+ JSON into RAM on mobile startup causes crashes/freezes.
- **Solution:** Normalize Local Storage.
  1. Split keys: `quran-app-mindmap-1`, `quran-app-mindmap-2`, etc.
  2. Load lazily (only when user opens the specific Surah).

### B. Dependency Cleanup
- **Action:** Remove unused `@automerge` packages and delete empty `sync-server` directory.
- **Benefit:** Reduces bundle size and improves "Time to Interactive".

### C. Stability & Testing
- **Problem:** No E2E testing framework found.
- **Risk:** High regression risk with large audience.
- **Solution:** Implement Playwright.
  1. Add Smoke Test: Login -> Create Mindmap -> Sync -> Verify.
  2. Run on CI (GitHub Actions).

### D. Error Monitoring
- **Action:** Install Sentry or LogRocket.
- **Benefit:** Real-time visibility into client-side crashes for the large user base.

---

## 8. Implementation Phases (AI Agent Checklist)

Each phase is designed to be completed in one or two agent turns.

### Phase A: Safety & Cleanup
- [x] **Step 1:** Implement "Download Backup" button in Settings.
- [x] **Step 2:** Disable Image Paste/Upload in Tldraw configuration.
- [x] **Step 3:** Remove unused dependencies (`automerge`, etc.) and delete `sync-server`.

### Phase B: Infrastructure Setup (Supabase)
- [ ] **Step 4:** Create new Postgres tables (`mindmaps`, `memory_nodes`, `users`, `settings`) - *Migration script created: `supabase/migrations/20260122_migration_v2.sql`*
- [ ] **Step 5:** Create Supabase Storage bucket `user_data` with RLS policies - *Included in migration script*

### Phase C: Code Adaptation (Local & Remote)
- [x] **Step 6:** Refactor `storage.ts` to use normalized IndexedDB keys (One key per mindmap).
- [x] **Step 7:** Update `sync.ts` to push/pull files to Supabase Storage + DB Metadata.

### Phase D: Migration Execution
- [x] **Step 8:** Create and test the Admin Migration Script (Node.js) - *Created `scripts/migrate-to-v2.js`*
- [x] **Step 9:** Run Migration Script (Production) - *Executed. Success: 20/21 users.*
- [x] **Step 10:** Update App to READ from new source & Drop old columns - *App updated to read/write from new tables. Columns preserved for safety.*

### Phase E: Reliability (The "Big Audience" Pack)
- [x] **Step 11:** Set up Playwright and write Smoke Test - *Installed Playwright and added basic smoke tests.*
- [ ] **Step 12:** Integrate Sentry/LogRocket.

### Phase F: Optimization & Performance
- [x] **Step 13:** Implement Zero-Compute Search (Generate `search-index.json` at build time) - *Implemented. API route removed.*
- [x] **Step 14:** Configure Static Generation for Docs (`generateStaticParams`) - *Already implemented in `[...slug]/page.tsx`.*
- [x] **Step 15:** Verify Immutable Cache-Control headers on Storage Uploads - *Set `cacheControl: '0'` in `supabaseSync.ts` to prevent stale data.*
