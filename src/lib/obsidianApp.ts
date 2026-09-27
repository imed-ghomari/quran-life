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

function isUsableApp(candidate: unknown): candidate is App {
  try {
    if (!candidate || typeof candidate !== "object") return false;
    if (!("vault" in candidate)) return false;
    const vault: unknown = candidate.vault;
    if (!vault || typeof vault !== "object") return false;
    if (!("adapter" in vault)) return false;
    return !!vault.adapter;
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

export function getVaultConfigDir(appOverride?: App | null): string | null {
  try {
    const app = getObsidianApp(appOverride);
    const dir = app?.vault?.configDir;
    if (typeof dir === 'string' && dir) return dir.replace(/\/$/, '');
  } catch { /* fall through */ }
  return null;
}
export function pluginPublishDir(appOverride?: App | null): string | null {
  const configDir = getVaultConfigDir(appOverride);
  if (!configDir) return null;
  return `${configDir}/plugins/quran-life`;
}

/**
 * File-system view of the vault adapter, shared by plugin storage code.
 *
 * `App#vault#adapter` is typed as the minimal `DataAdapter`, but at runtime it
 * is a `FileSystemAdapter` (desktop) / `CapacitorAdapter` (mobile) that also
 * exposes `mkdir` / `remove` / `getResourcePath`. Use {@link getVaultFiles}
 * instead of casting locally.
 */
export interface VaultFilesAdapter {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  readBinary(path: string): Promise<ArrayBuffer>;
  write(path: string, data: string): Promise<void>;
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  list(path: string): Promise<{ files: string[]; folders: string[] }>;
  getResourcePath(path: string): string;
  stat(path: string): Promise<{ size?: number } | null>;
}

/**
 * Typed accessor for the vault's file-system adapter (`null` when no usable
 * app is registered). The override is `unknown` so untrusted callers cannot
 * smuggle an unvalidated app through; it is narrowed with a real structural
 * check before use.
 */
export function getVaultFiles(appOverride?: unknown): VaultFilesAdapter | null {
  const app = getObsidianApp(isUsableApp(appOverride) ? appOverride : undefined);
  if (!app) return null;
  // BRIDGE (documented, sole cast in this module): the stock DataAdapter type
  // lacks the FileSystemAdapter methods (mkdir/remove/getResourcePath) that
  // exist at runtime on both desktop and mobile.
  return app.vault.adapter as unknown as VaultFilesAdapter;
}
