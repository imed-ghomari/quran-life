# Tldraw & UI Fixes - Debug Log
**Date:** 2025-12-27
**Issue:** "Blank Screen" on Tldraw Editor in Vercel Production (works locally).
**Status:** Unresolved (editor loads then goes blank/crashes after a few seconds).

## Attempts & Hypotheses

### 1. CSS Loading Strategy
*   **Hypothesis:** `tldraw.css` was being purged or not loaded correctly on the client.
*   **Action:** Moved import to `src/app/layout.tsx`. (Status: Active).

### 2. SSR/Hydration Issues
*   **Hypothesis:** `tldraw` components were trying to render on the server.
*   **Action:** Using `next/dynamic` with `{ ssr: false }`.

### 3. Custom Tools (Lasso)
*   **Hypothesis:** Custom `LassoSelectTool` memory leaks.
*   **Action:** Temporarily disabled custom tools, documented in system design. (Status: Active).

### 4. Build Configuration
*   **Hypothesis:** `canvas` dependency issues.
*   **Action:** Added `transpilePackages`. (Status: Active).

### 5. Caching & Service Workers
*   **Hypothesis:** Stale Service Worker cache.
*   **Action:** Unregistered SWs in `layout.tsx`, disabled PWA. (Status: Active).

### 6. Container Dimensions
*   **Hypothesis:** 0 height container.
*   **Action:** Added explicit dimensions. (Status: Active).

### 7. React Strict Mode
*   **Hypothesis:** Double-mounting issues.
*   **Action:** `reactStrictMode: false`. (Status: Active).

### 8. Snapshot Compatibility
*   **Hypothesis:** Corrupt initial data.
*   **Action:** Disabled snapshot loading via commented code (restored now).

### 9. Missing Assets
*   **Hypothesis:** Icons/Fonts missing.
*   **Action:** Hardcoded `defaultEditorAssetUrls`. (Status: Active).

### 10. Corrupt LocalStorage & Minification (Current Focus)
*   **Hypothesis:** 
    1.  The Vercel production deployment has "dirty" data in `localStorage` from previous versions. Tldraw crashes when trying to reconcile this.
    2.  SWC Minification is causing runtime errors in Tldraw's complex logic.
*   **Action:**
    *   Add `persistenceKey="mindmap-editor-v3-clean"` to forcing a fresh store.
    *   Set `swcMinify: false` in `next.config.mjs`.

### 11. Corrupt LocalStorage & Minification
*   **Action:** Added `persistenceKey="mindmap-editor-v3-clean"`.
*   **Action:** Tried `swcMinify: false`.
*   **Result:** **Build Failed** with Terser error (`Unexpected token: punc ({)`).
*   **Correction:** Reverted `swcMinify: false` (back to SWC). Kept `persistenceKey`.

### 11. Corrupt LocalStorage & Minification
*   **Action:** Added `persistenceKey="mindmap-editor-v3-clean"`.
*   **Action:** Tried `swcMinify: false` (broke build, reverted).
*   **Result:** Still blank screen (implied).

### 12. Hard Reset UI
*   **Hypothesis:** Corrupt IndexedDB data persists despite key change, or users need a manual way to purge bad state.
*   **Action:** Added "Hard Reset" button to Error Boundary that clears `localStorage` and `IndexedDB`.
*   **Goal:** Provide a fallback for users to self-heal the blank screen.

### 13. Circular Dependency / ReferenceError (FIXED)
*   **Discovery:** Browser console showed `ReferenceError: Cannot access 'o' before initialization` in `storage.ts`.
*   **Cause:** Variable hoisting of `STORAGE_KEYS` which was used before definition in module scope.
*   **Action:** Moved `STORAGE_KEYS` definition to top of `storage.ts`. (Status: Active).
*   **Result:** Error gone, but blank screen persists (or user reported license warning).

### 14. License Warning & Debug Overlay
*   **Issue:** Console shows "No tldraw license key provided". This is expected for free use but user wants it gone/fixed.
*   **Action:**
    *   Added VISIBLE debug overlay to `MindmapEditor.tsx` ("Debug: Mounted=...").
    *   This will diagnose if the component mounts successfully (and is just invisible) or fails to mount.

### 15. UI Missing / CSS Purging
*   **Observation:** Debug Overlay shows `Mounted=Yes`, `Dim=1272x641`, `Shapes=0`. But screen is blank (No Toolbar).
*   **Hypothesis:** The global CSS import in `layout.tsx` is being purged or not applied to the dynamic `MindmapEditor` chunk in production. OR `assetUrls` are still failing invisibly.
*   **Action:** Re-introduce `import 'tldraw/tldraw.css'` directly into `MindmapEditor.tsx` to force inclusion in the chunk.

## Recommended Immediate Fix
Import CSS locally. If that fails, the "Missing Toolbar" + "White Screen" on Vercel is strictly an **Assets/CSS** path issue. Consider serving assets from `public/` folder.
