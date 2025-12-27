# Tldraw & UI Fixes - Debug Log
**Date:** 2025-12-27
**Issue:** "Blank Screen" on Tldraw Editor in Vercel Production (works locally).
**Status:** Unresolved (editor loads then goes blank/crashes after a few seconds).

## Attempts & Hypotheses

### 1. CSS Loading Strategy
*   **Hypothesis:** `tldraw.css` was being purged or not loaded correctly on the client, or causing SSR mismatch.
*   **Action:**
    *   Moved from component-level import to dynamic CDN link tag. (Failed)
    *   Restored component-level import `import 'tldraw/tldraw.css'`. (Failed: works locally, blank in prod)
    *   Moved import to `src/app/layout.tsx` (Global import) to ensure it's always present. (Status: Applied, but didn't fix blank screen).

### 2. SSR/Hydration Issues
*   **Hypothesis:** `tldraw` components were trying to render on the server, causing hydration mismatch or crashes due to missing `window`/`canvas`.
*   **Action:**
    *   Implemented `MindmapEditor` using `next/dynamic` with `{ ssr: false }`.
    *   Wrapped all `tldraw` logic (including custom tool definition) inside `useEffect`.
    *   Used `ErrorBoundary` to catch React render errors. (Status: Applied, but no error UI shown, just blank).

### 3. Custom Tools (Lasso)
*   **Hypothesis:** The custom `LassoSelectTool` implementation (using `StateNode` and `atom`) was causing memory leaks or infinite loops in production (minification issues?).
*   **Action:**
    *   Temporarily disabled/commented out the Custom Lasso Tool logic.
    *   Reverted to standard `Tldraw` tools only. (Status: Applied, still blank).
    *   Documented the custom feature logic in `system design` for future restoration.

### 4. Build Configuration (`next.config.mjs`)
*   **Hypothesis:** improper handling of `tldraw` packages or `canvas` dependency in Vercel build.
*   **Action:**
    *   Added `transpilePackages: ['tldraw', ...]`
    *   Added `webpack` config to ignore `canvas` on server. (Later removed to simplify).
    *   Re-added `transpilePackages`. (Status: Active).

### 5. Caching & Service Workers
*   **Hypothesis:** Stale Service Worker cache (from `next-pwa`) was serving broken/old chunks.
*   **Action:**
    *   Set `pwa: { disable: true }` in `next.config.mjs`.
    *   Added script to `layout.tsx` to **force unregister** all service workers on client load. (Status: Active).

### 6. Container Dimensions
*   **Hypothesis:** The `tldraw` container had 0 height in production due to CSS differences.
*   **Action:**
    *   Added explicit `width: 100%; height: 100%; min-height: 0;` to the wrapper `div`. (Status: Active).

## Recommended Next Steps for Future Agent

1.  **Verify `process.env.NODE_ENV` behavior**: Is there code stripping out Tldraw in production?
2.  **Strict Mode**: Try disabling `reactStrictMode` in `next.config.mjs`. Double-mounting in strict mode can sometimes expose or cause crash-loops in complex libraries like Tldraw.
3.  **Canvas/Polyfill**: The "few seconds" delay usually implies an async crash. It might be the specific `toImage` or snapshot loading logic running on mount.
4.  **Tldraw Version**: Consider pinning `tldraw` to a specific stable version (currently `^4.2.1`).
5.  **Vercel Logs**: If possible, get *runtime* logs from Vercel function (though this is Client Side, so browser console is key. "Blank screen" prevents seeing console if it crashes the renderer completely).

## Current Code State
*   `MindmapEditor.tsx`: Simplified, Standard Tools, `ssr: false`, Error Boundary, commented-out Custom Lasso code.
*   `layout.tsx`: Unregisters SW, imports `tldraw.css`.
*   `next.config.mjs`: PWA disabled, Transpilation enabled.
