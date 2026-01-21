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
- `surah_id`: Integer (1-114)
- `is_complete`: Boolean
- `version`: Integer (Incremented on every edit)
- `updated_at`: Timestamp
- `storage_path`: String (e.g., `users/{uid}/mindmaps/1.json`)
- `snapshot_hash`: String (Optional, for quick change detection)

**3. `part_mindmaps` (Metadata Only)**
- Same structure as above, but with `part_id` instead of `surah_id`.

**4. `memory_nodes` (High Frequency Sync)**
- `id`: UUID (PK)
- `user_id`: UUID (FK)
- `node_id`: String (The logic ID used in app)
- `data`: JSONB (Contains specific SM-2/FSRS state only)
- `updated_at`: Timestamp

**5. `settings` (Low Frequency)**
- `user_id`: UUID (PK)
- `theme`, `audio_settings`, `learned_verses`: JSONB

### B. Supabase Storage Structure
We will create a private bucket named `user_data`.

- **Path Pattern:** `{user_id}/mindmaps/{surah_id}_v{version}.json`
  - *Note:* Including version in filename allows immutable caching.
- **Path Pattern:** `{user_id}/mindmaps/part_{part_id}_v{version}.json`
- **Path Pattern:** `{user_id}/images/{image_id}.webp` (Extracted images)

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

### Phase 2: Dual Write (Transition)
1. Update App to write to **BOTH** the old `user_backups` blob AND the new tables/storage.
2. This ensures no data is lost while we test the new system.

### Phase 3: Data Migration Script
Write a Node.js script (admin only) that:
1. Iterates through every row in `user_backups`.
2. Parses the big JSON blob.
3. Extracts Mindmaps -> Uploads to Storage.
4. Extracts Memory Nodes -> Inserts into DB table.
5. Updates the `mindmaps` metadata table.

### Phase 4: Switch & Cleanup
1. Update App to **READ** from the new system.
2. Disable the "Dual Write" to the old blob.
3. Drop the `data` column from `user_backups` (Reclaiming massive disk space).

---

## 5. Handling Tldraw Images (Critical Optimization)
To prevent 20MB+ JSON files:
1. **Intercept Paste:** When user pastes an image in Tldraw.
2. **Upload Immediately:** Upload image to `{user_id}/images/{uuid}.webp`.
3. **Embed URL:** Insert the **Storage URL** into the Tldraw shape, NOT the Base64 string.
4. **Result:** Mindmap JSON stays tiny (~50KB) even with 100 images.

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
