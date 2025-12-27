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

## Recommended Immediate Fix
The `persistenceKey` change is the primary fix for the runtime crash. The minification change broke the build, so it was reverted. The Asset URL fix is also active.
