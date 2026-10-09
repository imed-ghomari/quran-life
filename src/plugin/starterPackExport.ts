// Build a shareable starter-pack .zip from vault entries.
// Layout mirrors scripts/build-starter-pack.mjs and src/plugin/starterPackZip.ts:
//   mindmaps/<key>.json  (e.g. surah-2.json, part-1.json, meta-0.json)
//   splits/surah-<NNN>.json
//   docs/<key>.md
// The output is accepted by the Import picker with no extra tooling.
import type { StarterPackEntry } from "./starterPack.generated";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function loadJSZipConstructor(): Promise<new () => {
  file: (path: string, data: string | Uint8Array | Blob | ArrayBuffer) => unknown;
  generateAsync: (opts: Record<string, unknown>) => Promise<Blob>;
}> {
  const mod: unknown = await import("jszip");
  const candidate: unknown =
    isRecord(mod) && "default" in mod && mod.default ? mod.default : mod;
  if (typeof candidate !== "function") throw new Error("zip support is unavailable");
  return candidate as new () => {
    file: (path: string, data: string | Uint8Array | Blob | ArrayBuffer) => unknown;
    generateAsync: (opts: Record<string, unknown>) => Promise<Blob>;
  };
}

export async function buildShareZipBlob(entries: StarterPackEntry[]): Promise<Blob> {
  const targets = (entries || []).filter(
    (e) => e && (e.mindmap || (Array.isArray(e.splits) && e.splits.length) || e.doc),
  );
  if (!targets.length) throw new Error("nothing to export — create a mindmap first");
  const JSZipCtor = await loadJSZipConstructor();
  const zip = new JSZipCtor();
  for (const e of targets) {
    if (e.mindmap) {
      zip.file(`mindmaps/${e.key}.json`, JSON.stringify(e.mindmap, null, 2));
    }
    if (e.kind === "surah" && e.surahId && Array.isArray(e.splits) && e.splits.length) {
      const name = `splits/surah-${String(e.surahId).padStart(3, "0")}.json`;
      zip.file(name, JSON.stringify(e.splits, null, 2));
    }
    if (typeof e.doc === "string" && e.doc.trim()) {
      zip.file(`docs/${e.key}.md`, e.doc);
    }
  }
  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
}

export function defaultShareFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `quran-life-share-${stamp}.zip`;
}
