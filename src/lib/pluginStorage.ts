import { getObsidianApp } from "./obsidianApp";

/**
 * Small, vault-scoped preference values (selected reciter, theme choice, …).
 *
 * Obsidian stores these per vault through `App#loadLocalStorage` /
 * `App#saveLocalStorage`, which is the supported replacement for touching
 * `window.localStorage` directly. When no Obsidian app is registered (the web
 * build, unit tests) the values fall back to an in-memory map so nothing throws.
 */
const memory = new Map<string, string>();

export function readStored(key: string): string | null {
  const app = getObsidianApp();
  if (!app) return memory.get(key) ?? null;
  let value: unknown;
  try {
    value = app.loadLocalStorage(key);
  } catch {
    return null;
  }
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  return null;
}

export function readStoredJson<T>(key: string): T | null {
  const raw = readStored(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  const app = getObsidianApp();
  if (!app) {
    memory.set(key, value);
    return;
  }
  app.saveLocalStorage(key, value);
}

/** Persist a JSON-serializable value. */
export function writeStoredJson(key: string, value: unknown): void {
  writeStored(key, JSON.stringify(value));
}

export function removeStored(key: string): void {
  const app = getObsidianApp();
  if (!app) {
    memory.delete(key);
    return;
  }
  // `null` clears the entry in Obsidian's vault-scoped local storage.
  app.saveLocalStorage(key, null);
}
