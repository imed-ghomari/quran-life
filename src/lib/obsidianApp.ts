/**
 * Shared Obsidian `App` accessor.
 *
 * Desktop Obsidian exposes `window.app`, but Obsidian Mobile does NOT, which is
 * why mobile could not read bundled recitation JSON / use `requestUrl` (the only
 * CORS-free way to fetch recitation metadata and audio) — the player then fell
 * back to plain `fetch`, which is blocked cross-origin, so metadata (segments,
 * surah.json) never arrived and offline downloads failed with
 * "Failed to load ayah recitation map".
 *
 * The plugin registers its own App instance here on load, so every reader
 * (lib/audio, lib/quranData, plugin/offlineAudio) resolves the app the same way
 * on both platforms. When no window.app exists we also mirror it (harmless
 * convenience for other plugin code paths that still read window.app).
 *
 * This module must stay free of `obsidian` imports: it is bundled for the web
 * app as well as the plugin.
 */
let registeredApp: any = null;

export function setObsidianApp(app: any): void {
  if (!app || !app.vault || !app.vault.adapter) {
    registeredApp = null;
    return;
  }
  registeredApp = app;
  try {
    if (typeof window !== 'undefined' && !(window as any).app) {
      (window as any).app = app;
    }
  } catch { /* sandboxed WebView — registry value is enough */ }
}

export function getObsidianApp(appOverride?: any): any | null {
  const candidates = [
    appOverride,
    registeredApp,
    typeof window !== 'undefined' ? (window as any).app : null,
  ];
  for (const candidate of candidates) {
    try {
      if (candidate && candidate.vault && candidate.vault.adapter) return candidate;
    } catch { /* keep looking */ }
  }
  return null;
}

export function isObsidianEnv(appOverride?: any): boolean {
  return getObsidianApp(appOverride) !== null;
}
