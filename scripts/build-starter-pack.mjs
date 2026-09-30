/**
 * Compile `starter-pack/` (pre-made mindmaps, splits, docs) into
 * `src/plugin/starterPack.generated.ts` so the pack ships inside main.js.
 *
 * Layout mirrors the vault data root:
 *   starter-pack/mindmaps/<key>.json  (e.g. surah-2.json, part-1.json, meta-0.json)
 *   starter-pack/splits/surah-<NNN>.json
 *   starter-pack/docs/<key>.md
 *
 * The three kinds merge by key: mindmaps/surah-2.json + splits/surah-002.json
 * + docs/surah-2.md become one "Surah 2" import item.
 *
 * Two outputs:
 *   1. `src/plugin/starterPack.generated.ts` — small packs ship INSIDE main.js
 *      (offline, zero taps). Size guard: warn over 1.5 MB; over 6 MB the
 *      module is left empty (with a warning) so a big pack never breaks the
 *      build or bloats startup for everyone.
 *   2. `starter-pack.zip` (repo root, gitignored build artifact) — the full
 *      pack in vault-relative layout (`mindmaps/…`, `splits/…`, `docs/…`),
 *      no matter the size. Share this file directly; the in-app importer
 *      loads it via file picker (a 57 MB pack zips to a few MB).
 *
 * Usage: npm run starter-pack  (also runs automatically in npm run build)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, "starter-pack");
const outFile = path.join(root, "src", "plugin", "starterPack.generated.ts");

const WARN_BYTES = 1.5 * 1024 * 1024;
const FAIL_BYTES = 6 * 1024 * 1024;

const KEY_RE = /^(surah-\d+|part-\d+|meta-0|cluster-.+)$/;

function kindOf(key) {
  if (key.startsWith("part-")) return "part";
  if (key.startsWith("meta-")) return "meta";
  if (key.startsWith("cluster-")) return "cluster";
  return "surah";
}

function surahIdOf(key) {
  const m = key.match(/^surah-(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 1 && n <= 114 ? n : null;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (e) {
    console.warn(`  starter-pack: skipping ${path.basename(file)} (${e instanceof Error ? e.message : e})`);
    return null;
  }
}

async function main() {
  /** key -> { mindmap, splits, doc } */
  const items = new Map();

  const get = (key) => {
    let it = items.get(key);
    if (!it) {
      it = { mindmap: null, splits: [], doc: null };
      items.set(key, it);
    }
    return it;
  };

  if (fs.existsSync(path.join(dir, "mindmaps"))) {
    for (const f of fs.readdirSync(path.join(dir, "mindmaps"))) {
      if (!f.endsWith(".json")) continue;
      const key = f.slice(0, -".json".length);
      if (!KEY_RE.test(key)) {
        console.warn(`  starter-pack: skipping mindmaps/${f} (unexpected key name)`);
        continue;
      }
      const rec = readJson(path.join(dir, "mindmaps", f));
      const store = rec && typeof rec === "object" ? rec.snapshot?.store ?? rec.store : null;
      if (!rec || typeof rec !== "object" || !store || typeof store !== "object") {
        console.warn(`  starter-pack: skipping mindmaps/${f} (no snapshot.store)`);
        continue;
      }
      get(key).mindmap = rec;
    }
  }

  if (fs.existsSync(path.join(dir, "splits"))) {
    for (const f of fs.readdirSync(path.join(dir, "splits"))) {
      const m = f.match(/^surah-(\d+)\.json$/i);
      if (!m) {
        if (f.endsWith(".json")) console.warn(`  starter-pack: skipping splits/${f} (expected surah-NNN.json)`);
        continue;
      }
      const sid = Number(m[1]);
      if (!Number.isInteger(sid) || sid < 1 || sid > 114) {
        console.warn(`  starter-pack: skipping splits/${f} (surah out of range)`);
        continue;
      }
      const arr = readJson(path.join(dir, "splits", f));
      if (!Array.isArray(arr) || arr.length === 0) {
        console.warn(`  starter-pack: skipping splits/${f} (not a non-empty array)`);
        continue;
      }
      const valid = arr.filter(
        (a) =>
          a && typeof a === "object" &&
          Number.isFinite(Number(a.startVerse)) && Number.isFinite(Number(a.endVerse)) &&
          Number(a.startVerse) >= 1 && Number(a.endVerse) >= Number(a.startVerse),
      );
      if (!valid.length) {
        console.warn(`  starter-pack: skipping splits/${f} (no valid anchors)`);
        continue;
      }
      get(`surah-${sid}`).splits = valid;
    }
  }

  if (fs.existsSync(path.join(dir, "docs"))) {
    for (const f of fs.readdirSync(path.join(dir, "docs"))) {
      if (!/\.(md|markdown)$/i.test(f)) continue;
      const key = f.replace(/\.(md|markdown)$/i, "");
      if (!KEY_RE.test(key)) {
        console.warn(`  starter-pack: skipping docs/${f} (unexpected key name)`);
        continue;
      }
      const text = fs.readFileSync(path.join(dir, "docs", f), "utf-8");
      if (!text.trim()) {
        console.warn(`  starter-pack: skipping docs/${f} (empty)`);
        continue;
      }
      get(key).doc = text;
    }
  }

  const entries = [...items.entries()]
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
      const rank = (e) => (e.kind === "surah" ? (e.surahId ?? 999) : e.kind === "meta" ? 1000 : 2000 + Number(e.key.split("-")[1] || 0));
      return rank(a) - rank(b) || (a.key < b.key ? -1 : 1);
    });

  const body =
    `// GENERATED — do not edit by hand. Regenerate with: npm run starter-pack\n` +
    `// Built from starter-pack/ (${entries.length} items). Empty when the folder has no valid files.\n` +
    `export interface StarterPackEntry {\n` +
    `  key: string;\n` +
    `  kind: 'surah' | 'part' | 'meta' | 'cluster';\n` +
    `  surahId: number | null;\n` +
    `  mindmap: Record<string, unknown> | null;\n` +
    `  splits: Array<Record<string, unknown>>;\n` +
    `  doc: string | null;\n` +
    `}\n` +
    `export const STARTER_PACK: StarterPackEntry[] = ${JSON.stringify(entries)};\n` +
    `export const STARTER_PACK_META = { count: ${entries.length}, builtAt: ${JSON.stringify(new Date().toISOString())} };\n`;

  const bytes = Buffer.byteLength(body, "utf-8");
  const tooBig = bytes > FAIL_BYTES;
  const moduleBody = tooBig ? body.replace(/STARTER_PACK: StarterPackEntry\[\] = \[.*?\];/s, "STARTER_PACK: StarterPackEntry[] = [];").replace(/count: \d+/, "count: 0") : body;
  const prev = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf-8") : null;
  // Compare payload only (builtAt changes every run) to keep mtime stable.
  const stripMeta = (s) => s.replace(/builtAt: "[^"]*"/, 'builtAt: ""');
  if (!prev || stripMeta(prev) !== stripMeta(moduleBody)) {
    fs.writeFileSync(outFile, moduleBody);
  }
  if (tooBig) {
    console.warn(
      `starter-pack: ${(bytes / 1024 / 1024).toFixed(1)} MB exceeds the ${(FAIL_BYTES / 1024 / 1024).toFixed(0)} MB inline limit — ` +
      `inlined module left empty (main.js is parsed on every startup). The zip below is the way to share it.`,
    );
  } else {
    console.log(`✓ starter-pack: ${entries.length} items (${(bytes / 1024).toFixed(1)} KB) → src/plugin/starterPack.generated.ts`);
    if (bytes > WARN_BYTES) {
      console.warn(
        `Warning: starter pack is ${(bytes / 1024 / 1024).toFixed(1)} MB; it ships inside main.js. Consider a subset or the zip.`,
      );
    }
  }

  // Always emit the zip (vault-relative layout the importer understands).
  const zipPath = path.join(root, "starter-pack.zip");
  if (entries.length === 0) {
    try { fs.rmSync(zipPath, { force: true }); } catch { /* nothing to clean */ }
    console.log("✓ starter-pack: empty — no zip emitted");
    return;
  }
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  // Re-read source files so the zip bytes match disk (not the TS-escaped form).
  const addDir = (sub) => {
    const abs = path.join(dir, sub);
    if (!fs.existsSync(abs)) return;
    for (const f of fs.readdirSync(abs).sort()) {
      const full = path.join(abs, f);
      if (!fs.statSync(full).isFile()) continue;
      zip.file(`${sub}/${f}`, fs.readFileSync(full));
    }
  };
  addDir("mindmaps");
  addDir("splits");
  addDir("docs");
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
  fs.writeFileSync(zipPath, buf);
  console.log(`✓ starter-pack: ${entries.length} items (${(buf.length / 1024 / 1024).toFixed(2)} MB zipped) → starter-pack.zip`);
}

void main().catch((e) => {
  console.error("starter-pack build failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
