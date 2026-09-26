import type { App } from "obsidian";

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
 * This module must stay free of runtime `obsidian` imports (only `import type`):
 * it is bundled for the web app as well as the plugin.
 */
interface WindowWithApp extends Window {
  app?: App;
}

let registeredApp: App | null = null;

function isUsableApp(candidate: App | null | undefined): candidate is App {
  try {
    return !!candidate && !!candidate.vault && !!candidate.vault.adapter;
  } catch {
    return false;
  }
}

export function setObsidianApp(app: App | null | undefined): void {
  if (!isUsableApp(app)) {
    registeredApp = null;
    return;
  }
  registeredApp = app;
  try {
    if (typeof window !== "undefined") {
      const win = window as WindowWithApp;
      if (!win.app) win.app = app;
    }
  } catch { /* sandboxed WebView — the registry value is enough */ }
}

export function getObsidianApp(appOverride?: App | null): App | null {
  const fromWindow = typeof window !== "undefined" ? (window as WindowWithApp).app : undefined;
  for (const candidate of [appOverride, registeredApp, fromWindow]) {
    if (isUsableApp(candidate)) return candidate;
  }
  return null;
}

export function isObsidianEnv(appOverride?: App | null): boolean {
  return getObsidianApp(appOverride) !== null;
}
