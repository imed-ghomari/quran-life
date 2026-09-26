/**
 * Vault-backed cache for recitation word timings.
 *
 * Ayah-based recitation metadata is a ~2MB map whose `segments` tables are the
 * only source of per-word timings. On mobile that map is frequently unreachable
 * (offline listening, slow/flaky fetch), which made word highlighting degrade to
 * a time-based guess that ignores the reciter. After the first successful load we
 * persist just the segments slice next to the synced data folder, so later
 * sessions — including fully offline ones — still follow the reciter word by word.
 *
 * Registration lives here (plugin side) because `src/lib/audio.ts` must stay free
 * of `obsidian` imports for the web build.
 */
import { App, TFile, normalizePath } from "obsidian";
import { registerRecitationCacheStore } from "@/lib/audio";
import { ensureFolder, isHiddenPath } from "./storage/vaultAdapter";

const CACHE_FOLDER = "recitation-cache";

export function recitationCacheDir(root: string): string {
  return normalizePath(`${root}/${CACHE_FOLDER}`);
}

function cacheFilePath(root: string, reciterId: string): string {
  // Reciter ids are filename-safe already, but encode anyway to be safe.
  return normalizePath(`${recitationCacheDir(root)}/${encodeURIComponent(reciterId)}.json`);
}

async function readTextFile(app: App, path: string): Promise<string | null> {
  const normalized = normalizePath(path);
  if (isHiddenPath(normalized)) {
    const adapter: any = (app as any).vault?.adapter;
    try {
      if (adapter?.exists && !(await adapter.exists(normalized))) return null;
      return (await adapter.read(normalized)) as string;
    } catch { return null; }
  }
  const file = app.vault.getAbstractFileByPath(normalized);
  if (!(file instanceof TFile)) return null;
  try { return await app.vault.read(file); } catch { return null; }
}

async function writeTextFile(app: App, path: string, text: string): Promise<void> {
  const normalized = normalizePath(path);
  if (isHiddenPath(normalized)) {
    const adapter: any = (app as any).vault?.adapter;
    if (adapter?.write) {
      await adapter.write(normalized, text);
      return;
    }
  }
  const file = app.vault.getAbstractFileByPath(normalized);
  if (file instanceof TFile) await app.vault.modify(file, text);
  else await app.vault.create(normalized, text);
}

export function registerVaultRecitationCache(app: App, dataRoot: string): void {
  registerRecitationCacheStore({
    read: async (reciterId: string) => {
      const raw = await readTextFile(app, cacheFilePath(dataRoot, reciterId));
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || typeof parsed.segments !== "object") return null;
        return parsed as { segments: Record<string, number[][]> };
      } catch { return null; }
    },
    write: async (reciterId: string, data: { segments: Record<string, number[][]> }) => {
      const dir = recitationCacheDir(dataRoot);
      await ensureFolder(app, dir);
      await writeTextFile(app, cacheFilePath(dataRoot, reciterId), JSON.stringify(data));
    },
  });
}
