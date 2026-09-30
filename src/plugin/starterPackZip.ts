// Parse a starter-pack .zip (as emitted by scripts/build-starter-pack.mjs, or a
// hand-made zip with the same layout) into importable entries. Mirrors the
// build script's validation so a bad file fails loudly instead of half-importing.
import type { StarterPackEntry } from "./starterPack.generated";

const KEY_RE = /^(surah-\d+|part-\d+|meta-0|cluster-.+)$/;

function kindOf(key: string): StarterPackEntry["kind"] {
  if (key.startsWith("part-")) return "part";
  if (key.startsWith("meta-")) return "meta";
  if (key.startsWith("cluster-")) return "cluster";
  return "surah";
}

function surahIdOf(key: string): number | null {
  const m = key.match(/^surah-(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 1 && n <= 114 ? n : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function loadJSZip(): Promise<{
  loadAsync: (data: ArrayBuffer | Uint8Array | Blob) => Promise<{
    files: Record<string, { dir: boolean; name: string; async: (kind: "string") => Promise<string> }>;
  }>;
}> {
  const mod: unknown = await import("jszip");
  const candidate: unknown =
    isRecord(mod) && "default" in mod && mod.default ? mod.default : mod;
  if (typeof candidate !== "function") throw new Error("zip support is unavailable");
  return candidate as unknown as {
    loadAsync: (data: ArrayBuffer | Uint8Array | Blob) => Promise<{
      files: Record<string, { dir: boolean; name: string; async: (kind: "string") => Promise<string> }>;
    }>;
  };
}

export async function parseStarterZip(
  data: ArrayBuffer | Uint8Array | Blob,
): Promise<{ entries: StarterPackEntry[]; skipped: number }> {
  const JSZip = await loadJSZip();
  let zip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error("not a readable .zip file");
  }
  const bucket = new Map<string, { mindmap: Record<string, unknown> | null; splits: Array<Record<string, unknown>>; doc: string | null }>();
  const get = (key: string) => {
    let it = bucket.get(key);
    if (!it) {
      it = { mindmap: null, splits: [], doc: null };
      bucket.set(key, it);
    }
    return it;
  };
  let skipped = 0;
  for (const f of Object.values(zip.files)) {
    if (f.dir) continue;
    const name = String(f.name).replace(/\\/g, "/").replace(/^\/+/, "");
    // macOS metadata — never content.
    if (name.startsWith("__MACOSX/") || /(^|\/)\._/.test(name) || /(^|\/)\.DS_Store$/i.test(name)) continue;
    try {
      const mm = name.match(/^mindmaps\/([^/]+)\.json$/);
      const sp = name.match(/^splits\/surah-(\d+)\.json$/i);
      const dc = name.match(/^docs\/([^/]+)\.(md|markdown)$/i);
      if (mm && KEY_RE.test(mm[1])) {
        const rec: unknown = JSON.parse(await f.async("string"));
        const store = isRecord(rec) ? ((rec.snapshot ?? rec) as unknown) : null;
        const hasStore = isRecord(store) && isRecord((store as Record<string, unknown>).store);
        if (isRecord(rec) && hasStore) get(mm[1]).mindmap = rec;
        else skipped++;
      } else if (sp) {
        const sid = Number(sp[1]);
        const arr: unknown = JSON.parse(await f.async("string"));
        const valid = Array.isArray(arr)
          ? arr.filter(
              (a): a is Record<string, unknown> =>
                isRecord(a) &&
                Number.isFinite(Number(a.startVerse)) &&
                Number.isFinite(Number(a.endVerse)) &&
                Number(a.startVerse) >= 1 &&
                Number(a.endVerse) >= Number(a.startVerse),
            )
          : [];
        if (sid >= 1 && sid <= 114 && valid.length) get(`surah-${sid}`).splits = valid;
        else skipped++;
      } else if (dc && KEY_RE.test(dc[1])) {
        const text = await f.async("string");
        if (text.trim()) get(dc[1]).doc = text;
        else skipped++;
      } else {
        skipped++;
      }
    } catch {
      skipped++;
    }
  }
  const entries: StarterPackEntry[] = [...bucket.entries()]
    .filter(([, v]) => v.mindmap || v.splits.length || v.doc)
    .map(([key, v]) => ({
      key,
      kind: kindOf(key),
      surahId: surahIdOf(key),
      mindmap: v.mindmap,
      splits: v.splits,
      doc: v.doc,
    }))
    .sort((a, b) => {
      const rank = (e: StarterPackEntry): number =>
        e.kind === "surah" ? (e.surahId ?? 999) : e.kind === "meta" ? 1000 : 2000 + Number(e.key.split("-")[1] || 0);
      return rank(a) - rank(b) || (a.key < b.key ? -1 : 1);
    });
  return { entries, skipped };
}
