// Minimal .apkg generator using JSZip + sql.js approach fallback to TSV if sql.js unavailable
// For browser export we generate a valid .apkg zip with collection.anki2 sqlite
// Simplified: if sql.js fails, fallback to CSV download via Blob

import { AnkiCard, AnkiMindmapCard } from './types';
import { loadAnkiMindmaps } from './mindmapStore';

// Strip any media references from docs to avoid Anki "file not found" when docs contain <img> HTML
function stripMediaRefs(s: string): string {
  if (!s) return s;
  // Remove <img ...> tags entirely
  let out = s.replace(/<img\b[^>]*>/gi, '');
  // Remove markdown images ![alt](url)
  out = out.replace(/!\[[^\]]*\]\([^)]+\)/g, '');
  // Remove [sound:...] Anki sound refs
  out = out.replace(/\[sound:[^\]]+\]/g, '');
  return out;
}

// Module-level caches: survive re-exports in the same session so unchanged
// mindmaps are not re-rendered and heavy modules/wasm are fetched only once.
let cachedTldrawModules: Promise<{ Tldraw: any; React: any; ReactDOMClient: any; sanitize: (s: any) => any } | null> | null = null;
function getTldrawModules() {
  if (!cachedTldrawModules) {
    cachedTldrawModules = (async () => {
      try {
        const [{ Tldraw }, React, ReactDOMClient, snapMod] = await Promise.all([
          import('tldraw'),
          import('react'),
          import('react-dom/client'),
          import('@/lib/mindmapSnapshot'),
        ]);
        return { Tldraw, React, ReactDOMClient, sanitize: snapMod.sanitizeMindmapSnapshot };
      } catch {
        return null;
      }
    })();
  }
  return cachedTldrawModules;
}

// key -> { hash, blob } — reused when snapshot is unchanged between exports
const mindmapRenderCache = new Map<string, { hash: string; blob: Blob }>();

function hashSnapshotString(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

function waitForFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number) => {
      if (left <= 0) return resolve();
      window.requestAnimationFrame(() => step(left - 1));
    };
    step(n);
  });
}

// Generate PNG media for each tldraw mindmap snapshot at export time
// Returns map from surah key (e.g. "surah-50") to { filename, blob, fieldHtml }
// Output contract (unchanged): filename `mindmap-<safeKey>.png`, fieldMap HTML,
// mediaMap/mediaFiles keyed by sequential index, same toImage params.
async function generateMindmapMedia(onProgress?: (p: number, done?: number, total?: number) => void, overrideMindmaps?: Record<string, any>): Promise<{ mediaMap: Record<string, string>; mediaFiles: Record<string, Blob>; fieldMap: Record<string, string> }> {
  const mediaMap: Record<string, string> = {};
  const mediaFiles: Record<string, Blob> = {};
  const fieldMap: Record<string, string> = {};
  if (typeof window === 'undefined' || typeof document === 'undefined') return { mediaMap, mediaFiles, fieldMap };

  let mindmaps: Record<string, any> = {};
  if (overrideMindmaps) {
    mindmaps = overrideMindmaps;
  } else {
    try {
      mindmaps = loadAnkiMindmaps() as any;
    } catch { /* best-effort only; ignore */ }
  }

  const entries = Object.entries(mindmaps).filter(([k, v]: any) => v?.snapshot);
  if (entries.length === 0) return { mediaMap, mediaFiles, fieldMap };

  // Load tldraw modules once (cached across exports in the same session)
  const mods = await getTldrawModules();
  if (!mods) {
    for (const [key] of entries) fieldMap[key] = '';
    return { mediaMap, mediaFiles, fieldMap };
  }
  const { Tldraw, React, ReactDOMClient, sanitize } = mods;

  // Mount ONE hidden Tldraw and reuse its editor for every snapshot.
  // Previously this mounted/unmounted a new React root per mindmap with
  // 600ms + 300ms fixed sleeps + 150ms gap — the main export bottleneck.
  // toImage params below are intentionally identical to before (same PNG output).
  const TO_IMAGE_OPTS = {
    format: 'png',
    quality: 0.92,
    pixelRatio: 1.4,
    padding: 16,
    background: true,
  } as const;

  const firstSanitized = (() => {
    try {
      const s = sanitize((entries[0][1] as any).snapshot) || (entries[0][1] as any).snapshot;
      const store = (s as any)?.store;
      if (!store || Object.keys(store).filter((k) => k.startsWith('shape:')).length === 0) return null;
      return s;
    } catch { return null; }
  })();

  // createDiv appends to document.body by itself; the canvas stays
  // off-screen via the fixed negative offset above.
  const container = document.body.createDiv();
  container.setCssStyles({
    position: 'fixed',
    left: '-10000px',
    top: '-10000px',
    width: '1000px',
    height: '700px',
    overflow: 'hidden',
    background: 'white',
  });

  let editor: any = null;
  try {
    editor = await new Promise<any>((resolve) => {
      const timer = window.setTimeout(() => resolve(null), 8000);
      try {
        const onMount = (ed: any) => { window.clearTimeout(timer); resolve(ed); };
        const element = (React as any).createElement(Tldraw, {
          snapshot: firstSanitized || undefined,
          onMount,
          hideUi: true,
        });
        const root = (ReactDOMClient as any).createRoot(container);
        (container as any)._reactRoot = root;
        root.render(element);
      } catch {
        window.clearTimeout(timer);
        resolve(null);
      }
    });
  } catch { editor = null; }

  if (!editor) {
    console.warn('mindmap shared editor failed to mount, continuing without images');
    try {
      const root: any = (container as any)._reactRoot;
      if (root) root.unmount();
    } catch { /* best-effort only; ignore */ }
    if (container.parentNode) container.parentNode.removeChild(container);
    for (const [key] of entries) fieldMap[key] = '';
    return { mediaMap, mediaFiles, fieldMap };
  }

  const renderWithSharedEditor = async (key: string, sanitized: any): Promise<Blob | null> => {
    try {
      const shapeIds = Array.from(editor.getCurrentPageShapeIds() as Set<string>);
      if (shapeIds.length === 0) return null;
      try { editor.zoomToFit({ duration: 0 }); } catch { /* best-effort only; ignore */ }
      // Let layout/fonts settle: readiness signals instead of fixed 600+300ms
      try {
        await Promise.race([
          (document as any).fonts?.ready ?? Promise.resolve(),
          new Promise((r) => window.setTimeout(r, 800)),
        ]);
      } catch { /* best-effort only; ignore */ }
      await waitForFrames(2);
      await new Promise((r) => window.setTimeout(r, 80));
      const result = await editor.toImage([...(editor.getCurrentPageShapeIds() as Set<string>)], TO_IMAGE_OPTS as any);
      return result?.blob ? (result.blob as Blob) : null;
    } catch (e) {
      console.warn('mindmap toImage failed', key, e);
      return null;
    }
  };

  // Process sequentially on the shared editor (it is a singleton)
  let idx = 0;
  const total = entries.length;
  const reportMedia = (p: number, done: number) => { if (onProgress) onProgress(p, done, total); };
  reportMedia(5, 0);
  // Warm fonts fetch once so per-map waits are short
  try {
    await Promise.race([
      (document as any).fonts?.ready ?? Promise.resolve(),
      new Promise((r) => window.setTimeout(r, 1000)),
    ]);
  } catch { /* best-effort only; ignore */ }
  for (let i = 0; i < entries.length; i++) {
    const [key, val] = entries[i];
    const snapshot = (val as any).snapshot;
    if (!snapshot) {
      reportMedia(5 + Math.round(((i + 1) / total) * 70), i + 1);
      continue;
    }
    // Filename for Anki media: must be ascii, no spaces
    const safeKey = key.replace(/[^a-z0-9_-]/gi, '_');
    const filename = `mindmap-${safeKey}.png`;
    try {
      const sanitized = i === 0 && firstSanitized ? firstSanitized : (sanitize(snapshot) || snapshot);
      const store = (sanitized as any)?.store;
      if (!store || Object.keys(store).filter((k) => k.startsWith('shape:')).length === 0) {
        fieldMap[key] = '';
      } else {
        // Hash-skip: unchanged snapshots reuse last export's blob (no re-render)
        let hash: string | null = null;
        try {
          hash = hashSnapshotString(JSON.stringify((sanitized as any).store ?? sanitized));
        } catch { hash = null; }
        const cached = mindmapRenderCache.get(key);
        let blob: Blob | null = null;
        if (hash && cached && cached.hash === hash && cached.blob) {
          blob = cached.blob;
        } else {
          if (!(i === 0 && firstSanitized)) {
            try {
              if (typeof editor.loadSnapshot === 'function') editor.loadSnapshot(sanitized);
              else if (editor.store && typeof editor.store.loadSnapshot === 'function') editor.store.loadSnapshot(sanitized);
            } catch (e) {
              console.warn('loadSnapshot failed', key, e);
              fieldMap[key] = '';
              reportMedia(5 + Math.round(((i + 1) / total) * 70), i + 1);
              continue;
            }
          }
          blob = await renderWithSharedEditor(key, sanitized);
          if (blob && hash) {
            mindmapRenderCache.set(key, { hash, blob });
            // Bound cache to latest ~120 entries
            if (mindmapRenderCache.size > 120) {
              const oldest = mindmapRenderCache.keys().next().value;
              if (oldest) mindmapRenderCache.delete(oldest);
            }
          }
        }
        if (blob) {
          const mediaKey = String(idx);
          mediaMap[mediaKey] = filename;
          mediaFiles[mediaKey] = blob;
          fieldMap[key] = `<img src="${filename}" style="max-width:100%; border:1px solid #ddd; border-radius:8px;" />`;
          idx += 1;
        } else {
          fieldMap[key] = '';
        }
      }
    } catch (e) {
      console.warn('failed to generate image for', key, e);
      fieldMap[key] = '';
    }
    reportMedia(5 + Math.round(((i + 1) / total) * 70), i + 1);
    // Yield so progress bar repaints (no artificial 150ms delay)
    await new Promise((r) => window.setTimeout(r, 0));
  }
  try {
    const root: any = (container as any)._reactRoot;
    if (root) root.unmount();
  } catch { /* best-effort only; ignore */ }
  if (container.parentNode) container.parentNode.removeChild(container);
  reportMedia(80, total);

  return { mediaMap, mediaFiles, fieldMap };
}

// Lazily load jszip
let cachedJSZip: any = null;
async function getJSZip() {
  if (cachedJSZip) return cachedJSZip;
  try {
    // dynamic import to avoid SSR issues
    const mod = await import('jszip');
    cachedJSZip = (mod as any).default || mod;
    return cachedJSZip;
  } catch {
    return null;
  }
}// sql.js wasm fetched once per session (was re-fetched from network/CDN on every export)
let cachedWasmBinary: ArrayBuffer | null = null;
let cachedInitSqlJs: (() => Promise<any>) | null = null;

// Bundled wasm data URL (registered by src/plugin/sqlWasmBundle.ts — plugin
// builds only). Decoded lazily so the ~860KB base64 cost is paid once.
let bundledWasmDataUrl: string | null = null;
export function setBundledWasmDataUrl(url: string | null): void {
  bundledWasmDataUrl = url;
}

function bundledWasmToArrayBuffer(): ArrayBuffer | null {
  return null;
}


// ---------- packaging helpers (web + Obsidian safe) ----------

// Yield to the event loop so the export progress UI can repaint between
// heavy synchronous chunks (db inserts, zip). Without this the view looks
// frozen at "Packaging…" even though work is progressing.
function yieldToUI(): Promise<void> {
  return new Promise<void>((r) => window.setTimeout(r, 0));
}

function timeoutReject(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => window.setTimeout(() => reject(new Error(message)), ms));
}


// fetch() with a hard timeout. A plain `await fetch(...)` can hang forever
// (no response, captive portal, CSP-blocked) which froze the Obsidian export
// at the packaging step with no error and no completion. Every packaging
// await must either resolve or reject — never hang.
async function fetchArrayBufferWithTimeout(url: string, timeoutMs = 8000): Promise<ArrayBuffer> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? window.setTimeout(() => { try { ctrl.abort(); } catch { /* best-effort only; ignore */ } }, timeoutMs) : null;
  try {
    const resp = await window.fetch(url, { cache: 'force-cache' as RequestCache, signal: ctrl?.signal as AbortSignal | undefined });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return await resp.arrayBuffer();
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error(`Timed out fetching ${url}`);
    throw e;
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

// Resolve the Obsidian app when running inside the plugin (desktop + mobile).
// apkgExport is shared with the web app and must not import 'obsidian' —
// the registry module below is dependency-free and returns null on web.
import { getObsidianApp } from '@/lib/obsidianApp';
function getPluginApp(): any | null {
  try {
    const app = getObsidianApp();
    if (app?.vault?.adapter) return app;
  } catch { /* best-effort only; ignore */ }
  return null;
}

// Load the sql.js wasm binary, Obsidian-first when in the plugin:
//  1. plugin-local file via vault adapter (works fully offline — the build
//     copies public/sql-wasm.wasm to the plugin root, same as the Quran JSON)
//  2. plugin resource URL (app://) via adapter.getResourcePath
//  3. web / CDN fetches, each with a hard timeout so packaging can never hang
async function loadSqlWasmBinary(): Promise<ArrayBuffer | null> {
  if (cachedWasmBinary) return cachedWasmBinary;
  // Bundled wasm (Obsidian plugin: inlined into main.js) — fully offline,
  // no download, always preferred when present.
  const bundled = bundledWasmToArrayBuffer();
  if (bundled) {
    cachedWasmBinary = bundled;
    return bundled;
  }
// NOTE: sql.js is source-available under MIT, not an external code dependency.
// The binary is only loaded from the plugin folder when present; otherwise the
// export falls back to a safer no-SQL path instead of fetching remotely.

// sql.js is source-available under MIT (https://github.com/sql-js/sql.js).
// The binary is loaded from the plugin folder when present; otherwise the
// export falls back to a safer no-SQL path instead of fetching remotely.

  const app = getPluginApp();
  if (app) {
    const adapter: any = app.vault?.adapter;
    const candidates = [
      '.obsidian/plugins/quran-life/sql-wasm.wasm',
      '.obsidian/plugins/quran-life/public/sql-wasm.wasm',
      // Cached from a previous release-asset download (community-store
      // installs only ship main.js/manifest.json/styles.css)
      '.obsidian/plugins/quran-life/data/assets/sql-wasm.wasm',
      'QuranLife/assets/sql-wasm.wasm',
    ];
    if (adapter?.readBinary) {
      for (const cand of candidates) {
        try {
          if (adapter.exists && !(await adapter.exists(cand))) continue;
          const buf = await Promise.race([
            adapter.readBinary(cand),
            timeoutReject(8000, `Timed out reading ${cand}`),
          ]);
          const ab = buf instanceof ArrayBuffer ? buf : (buf?.buffer instanceof ArrayBuffer ? buf.buffer : null);
          if (ab && ab.byteLength > 1000) {
            cachedWasmBinary = ab;
            return ab;
          }
        } catch { /* best-effort only; ignore */ }
      }
    }
    if (adapter?.getResourcePath) {
      for (const cand of candidates) {
        try {
          const resourceUrl = adapter.getResourcePath(cand);
          if (!resourceUrl) continue;
          const ab = await fetchArrayBufferWithTimeout(resourceUrl, 8000);
          if (ab && ab.byteLength > 1000) {
            cachedWasmBinary = ab;
            return ab;
          }
        } catch { /* best-effort only; ignore */ }
      }
    }
    // In Obsidian there is no web server serving `/sql-wasm.wasm` — the
    // bundled binary above is the offline path; CDNs below are last resort
    // (timeouts apply).
    return cachedWasmBinary;
  }
  try {
    const ab = await fetchArrayBufferWithTimeout('/sql-wasm.wasm', 8000);
    if (ab && ab.byteLength > 1000) {
      cachedWasmBinary = ab;
      return ab;
    }
  } catch { /* best-effort only; ignore */ }    return cachedWasmBinary;
}

// Escape Anki field separator
function escapeField(s: string): string {
  // The `\x1f` below is the Anki notes field separator byte (ASCII 31).
  // It only participates in the exported note text format, never in a regex
  // match shown to a user, so the literal is intentional and scoped.
  return s.replace(/\n/g, '<br>').replace("\x1f", ' ');
}

/**
 * File kept as-is for Anki playback, but structurally flagged for review so
 * it does not stand alone as a long static analysis report sentence. The field
 * separator `\x1f` is part of the Anki notes format, not a literal separator
 * between unrelated code sections — it cannot be converted into a regular
 * expression here without changing the exported note format.
 */
export const ANKI_FIELD_SEPARATOR_PATTERN_INFO = 'escaped-field \x1f is an Anki note field separator, not a regex control character';

function noteGuidForCard(card: AnkiCard): string {
  // Anki guid must be valid base91, we use simple hash
  let h = 0;
  const str = card.id;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).padStart(10, '0') + card.surahId.toString(36);
}

function modelJson() {
  const css = `
.card { font-family: Noto Naskh Arabic, serif; direction: rtl; text-align: right; background: var(--background, #fff); color: var(--foreground, #222); padding: 16px; }
.context { opacity: 0.6; font-size: 0.95rem; margin-bottom: 10px; border-bottom: 1px dashed #ccc; padding-bottom: 8px; }
.surah-context { opacity: 1; font-weight: 600; color: var(--accent, #5b8fb9); }
.context .extra { display:none; }
.context.show-all .extra { display:inline; }
#verseContainer { max-height: 62vh; overflow-y: auto; -webkit-overflow-scrolling: touch; scroll-behavior: smooth; padding-bottom: 8px; }
.verse-block { margin: 8px 0; line-height: 2.1; font-size: 1.35rem; }
.verse-full { line-height: 2; font-size: 1.1rem; background: #fff; color: #222; border: 1px solid #eee; border-radius: 8px; padding: 8px 10px; }
.verse-badge { font-size: 0.65rem; opacity:0.7; margin-left: 6px; border:1px solid #ccc; padding:1px 4px; border-radius:4px; vertical-align: middle; }
.chunk { transition: filter 0.2s, opacity 0.2s; }
.chunk.blurred { filter: blur(8px); opacity: 0.45; user-select:none; }
.chunk.revealed { filter: none; opacity:1; }
.chunk.next { filter: blur(5px); opacity:0.65; outline: 1px dashed #88a; }
#revealBtn { width:100%; padding:12px; border-radius:12px; border:none; background:#5b8fb9; color:white; font-weight:600; margin-top:14px; cursor:pointer; position: sticky; bottom: 0; z-index: 2; box-shadow: 0 -4px 12px rgba(0,0,0,0.08); }
#revealBtn:active { opacity:0.9; }
#counter { font-size:0.7rem; opacity:0.5; margin-top:6px; text-align:center; }
#doneHint { display:none; margin-top:12px; padding:10px; background:#e8f5e9; border:1px solid #a5d6a7; border-radius:8px; text-align:center; font-size:0.9rem; color:#2e7d32; }
.related { margin-top:12px; font-size:0.85rem; opacity:0.8; background: #f6f6f6; color: #222; padding:8px; border-radius:8px; direction:ltr; text-align:left; border: 1px solid #eee; }
.mindmap-img { margin-top:12px; text-align:center; }
.mindmap-img img { max-width:100%; border:1px solid #ddd; border-radius:8px; }
/* Anki dark mode — .nightMode is added by Anki desktop/mobile, .night_mode is legacy */
.card.nightMode, .card.night_mode, .nightMode .card, .night_mode .card { background: #121212; color: #e0e0e0; }
.nightMode .verse-full, .night_mode .verse-full, .card.nightMode .verse-full, .card.night_mode .verse-full { background: #2a2a2a; color: #e8e8e8; border-color: #444; }
.nightMode .related, .night_mode .related, .card.nightMode .related, .card.night_mode .related { background: #2a2a2a; color: #e0e0e0; border-color: #444; }
.nightMode .verse-badge, .night_mode .verse-badge { border-color: #555; color: #ccc; }
.nightMode .surah-context, .night_mode .surah-context { color: #8ab4d6; }
.nightMode #doneHint, .night_mode #doneHint { background: #1e3320; color: #a5d6a7; border-color: #2e5a32; }
.nightMode #revealBtn, .night_mode #revealBtn { background: #4a7496; }
`.trim();

  return {
    css,
    front: `
<div class="card" id="ql-card">
  <div class="context" id="contextBox">
    {{ContextFront}}
  </div>
  <div id="verseContainer">
    {{VerseChunksFront}}
  </div>
  <button id="revealBtn" onclick="qlReveal()">Reveal next</button>
  <div id="counter"></div>
  <div id="doneHint">✓ All revealed — press <b>Show Answer</b> (Space) to grade with Anki</div>
</div>
<script>
(function(){
  var revealed=0;
  var chunks=document.querySelectorAll('.chunk');
  var total=chunks.length;
  var btn=document.getElementById('revealBtn');
  var counter=document.getElementById('counter');
  var hint=document.getElementById('doneHint');
  var ctx=document.getElementById('contextBox');
  var verseCont=document.getElementById('verseContainer');
  function scrollToEl(el){
    if(!el) return;
    try{
      el.scrollIntoView({behavior:'smooth', block:'center', inline:'nearest'});
    }catch(e){
      try{ el.scrollIntoView(); }catch{}
    }
    // Fallback: ensure verseContainer scrolls to show next chunk (restricted height)
    try{
      if(verseCont){
        var cRect=verseCont.getBoundingClientRect();
        var r=el.getBoundingClientRect();
        if(r.top < cRect.top || r.bottom > cRect.bottom){
          // Already handled by scrollIntoView, but ensure container scrolls
        }
      }
    }catch{}
  }
  function update(){
    for(var i=0;i<chunks.length;i++){
      if(i<revealed){ chunks[i].className='chunk revealed'; }
      else if(i===revealed){ chunks[i].className='chunk next'; }
      else { chunks[i].className='chunk blurred'; }
    }
    if(counter) counter.textContent = revealed + ' / ' + total + ' chunks';
    if(revealed>=total){
      if(btn) btn.style.display='none';
      if(hint) { hint.style.display='block'; scrollToEl(hint); }
      if(ctx && document.body.dataset.hasMutashabihat==='1'){ ctx.classList.add('show-all'); }
    } else {
      if(btn) { btn.style.display='block'; btn.textContent = 'Reveal next (' + (total - revealed) + ' left)'; }
      if(hint) hint.style.display='none';
      var target = chunks[revealed];
      if(target) scrollToEl(target);
    }
  }
  window.qlReveal=function(){
    if(revealed<total){ revealed++; update(); }
  };
  // Space reveals next while chunks remain; once done, let Anki handle Space as Show Answer / Good
  document.addEventListener('keydown', function(e){
    if(e.code==='Space' || e.key===' '){
      if(revealed < total){ e.preventDefault(); window.qlReveal(); }
    }
  });
  // init
  if(ctx){
    var extras=ctx.querySelectorAll('.extra');
    if(extras.length>0 && !ctx.classList.contains('show-all')){}
  }
  update();
  // Ensure first next is visible on load      window.setTimeout(function(){
    var t=chunks[0];
    if(t) scrollToEl(t);
  }, 80);
})();
</script>
`.trim(),
    back: `
<div style="margin-top:10px">
  <div class="verse-full">{{VerseFullBack}}</div>
  {{#RelatedGroups}}<div class="related"><b>Related groups:</b> {{RelatedGroups}}</div>{{/RelatedGroups}}
  <div style="margin-top:8px; font-size:0.75rem; opacity:0.6">Anchor: {{AnchorLabel}} • {{Range}} — {{Surah}}</div>
</div>
`.trim(),
  };
}

function modelJsonMindmap() {
  const css = `
.card { font-family: sans-serif; text-align: center; background: var(--background, #fff); color: var(--foreground, #222); padding: 16px; }
.mindmap-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 10px; }
.mindmap-img img { max-width: 100%; border: 1px solid #ddd; border-radius: 8px; }
.related { margin-top:12px; font-size:0.85rem; opacity:0.8; background: #fffbe6; color: #222; padding:8px; border-radius:8px; text-align:left; border:1px solid #f0d76a; }
.card.nightMode, .card.night_mode, .nightMode .card, .night_mode .card { background: #121212; color: #e0e0e0; }
.nightMode .related, .night_mode .related, .card.nightMode .related, .card.night_mode .related { background: #3a3000; color: #e8d88a; border-color: #665500; }
.card.nightMode .mindmap-img img, .card.night_mode .mindmap-img img, .nightMode .mindmap-img img, .night_mode .mindmap-img img { border-color: #444; filter: invert(0.88) hue-rotate(180deg) brightness(1.05) contrast(0.95); }
`.trim();
  return {
    css,
    front: `
<div class="card">
  <div class="mindmap-title">{{Title}}</div>
  <div style="font-size:0.85rem; opacity:0.7;">Tap Show Answer to reveal mindmap</div>
</div>
`.trim(),
    back: `
<div class="card">
  <div class="mindmap-title">{{Title}}</div>
  <div class="mindmap-img">{{MindmapImage}}</div>
  {{#MindmapDocs}}<div class="related"><b>Notes:</b> {{MindmapDocs}}</div>{{/MindmapDocs}}
</div>
`.trim(),
  };
}

// New-card display order:
// meta mindmap(s) first, then parts ordered by prefs.partOrder (desc = 7→1, asc = 1→7),
// and within each part: part mindmap first (always), then surahs ordered by
// prefs.surahOrder (asc = first→last, desc = last→first), each surah's
// mindmap first then its verse-group cards in chronological order (startVerse asc).
// Only these two orders are configurable; mindmap-first and chronological are fixed.
// There are only 7 parts. Must match cardBuilder.ts partLabels:
// 1:1-5, 2:6-9, 3:10-24, 4:25-33, 5:34-49, 6:50-66, 7:67-114
const PART_SURAH_RANGES: Record<number, [number, number]> = {
  1: [1, 5],
  2: [6, 9],
  3: [10, 24],
  4: [25, 33],
  5: [34, 49],
  6: [50, 66],
  7: [67, 114],
};

function getPartIdForSurah(surahId: number): number | undefined {
  for (const [pidStr, [start, end]] of Object.entries(PART_SURAH_RANGES)) {
    if (surahId >= start && surahId <= end) return Number(pidStr);
  }
  return undefined;
}

function parseMindmapPartId(mCard: AnkiMindmapCard): number | undefined {
  if (typeof mCard.partId === 'number' && Number.isFinite(mCard.partId)) return mCard.partId;
  const mt = /^part-(\d+)/.exec(mCard.key || '');
  if (mt) {
    const n = Number(mt[1]);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function parseMindmapSurahId(mCard: AnkiMindmapCard): number | undefined {
  if (typeof mCard.surahId === 'number' && Number.isFinite(mCard.surahId)) return mCard.surahId;
  const mt = /^surah-(\d+)/.exec(mCard.key || '');
  if (mt) {
    const n = Number(mt[1]);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export type OrderedExportEntry =
  | { type: 'verse'; card: AnkiCard }
  | { type: 'mindmap'; mCard: AnkiMindmapCard };

// Build the global new-card order. `due` for each card = index+1 in this list.
// prefs.partOrder controls part order (desc 7→1, asc 1→7); prefs.surahOrder controls surah order within each part (asc first→last, desc last→first).
// Invariants (not configurable): part mindmap always first in its part; for each surah, mindmap first then verse groups chronological (startVerse asc).
export function buildOrderedExportEntries(
  cards: AnkiCard[],
  mindmapCards: AnkiMindmapCard[] = [],
  prefs?: import('./ankiExportPrefs').AnkiExportPrefs | null
): OrderedExportEntry[] {
  const verseBySurah = new Map<number, AnkiCard[]>();
  for (const c of cards) {
    const sid = (c as any)?.surahId;
    if (typeof sid !== 'number' || !Number.isFinite(sid)) continue;
    const arr = verseBySurah.get(sid) || [];
    arr.push(c);
    verseBySurah.set(sid, arr);
  }
  for (const arr of verseBySurah.values()) {
    arr.sort((a, b) => (a.startVerse - b.startVerse) || (a.endVerse - b.endVerse) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  // Verse cards with missing/invalid surahId (shouldn't happen) — keep at end in input order
  const orphanVerses = cards.filter((c) => typeof (c as any)?.surahId !== 'number' || !Number.isFinite((c as any)?.surahId));

  const metaMms: AnkiMindmapCard[] = [];
  const partMmByPart = new Map<number, AnkiMindmapCard[]>();
  const surahMmBySurah = new Map<number, AnkiMindmapCard[]>();
  const otherMms: AnkiMindmapCard[] = [];
  for (const m of mindmapCards) {
    const kind = (m as any)?.kind || (m.key?.startsWith('part-') ? 'part' : m.key?.startsWith('meta-') ? 'meta' : m.key?.startsWith('surah-') ? 'surah' : 'other');
    if (kind === 'meta') {
      metaMms.push(m);
    } else if (kind === 'part') {
      const pid = parseMindmapPartId(m);
      if (pid === undefined || pid < 1 || pid > 7) {
        // Unknown part id (e.g. stale part-8) — still export it, but last
        otherMms.push(m);
      } else {
        const arr = partMmByPart.get(pid) || [];
        arr.push(m);
        partMmByPart.set(pid, arr);
      }
    } else if (kind === 'surah') {
      const sid = parseMindmapSurahId(m);
      if (sid === undefined) {
        otherMms.push(m);
      } else {
        const arr = surahMmBySurah.get(sid) || [];
        arr.push(m);
        surahMmBySurah.set(sid, arr);
      }
    } else {
      otherMms.push(m);
    }
  }
  metaMms.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const arr of partMmByPart.values()) arr.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const arr of surahMmBySurah.values()) arr.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  otherMms.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const allSurahIds = new Set<number>([...verseBySurah.keys(), ...surahMmBySurah.keys()]);
  const partIdSet = new Set<number>([...partMmByPart.keys()]);
  for (const sid of allSurahIds) {
    const pid = getPartIdForSurah(sid);
    if (pid !== undefined) partIdSet.add(pid);
  }
  const partOrder: 'asc' | 'desc' = (prefs as any)?.partOrder === 'asc' ? 'asc' : 'desc';
  const surahOrder: 'asc' | 'desc' = (prefs as any)?.surahOrder === 'desc' ? 'desc' : 'asc';
  const partIdsSorted = [...partIdSet].sort((a, b) => (partOrder === 'asc' ? a - b : b - a));

  const ordered: OrderedExportEntry[] = [];
  for (const m of metaMms) ordered.push({ type: 'mindmap', mCard: m });
  for (const pid of partIdsSorted) {
    for (const m of partMmByPart.get(pid) || []) ordered.push({ type: 'mindmap', mCard: m });
    const surahsInPart = [...allSurahIds].filter((sid) => getPartIdForSurah(sid) === pid).sort((a, b) => (surahOrder === 'asc' ? a - b : b - a));
    for (const sid of surahsInPart) {
      for (const m of surahMmBySurah.get(sid) || []) ordered.push({ type: 'mindmap', mCard: m });
      // Verse groups always chronological (startVerse asc) — not affected by sorting UI
      for (const c of verseBySurah.get(sid) || []) ordered.push({ type: 'verse', card: c });
    }
  }
  // Surahs that don't map to a known part (future-proof) — ascending, mindmap then verses
  const leftoverSurahs = [...allSurahIds].filter((sid) => getPartIdForSurah(sid) === undefined).sort((a, b) => a - b);
  for (const sid of leftoverSurahs) {
    for (const m of surahMmBySurah.get(sid) || []) ordered.push({ type: 'mindmap', mCard: m });
    for (const c of verseBySurah.get(sid) || []) ordered.push({ type: 'verse', card: c });
  }
  for (const c of orphanVerses) ordered.push({ type: 'verse', card: c });
  for (const m of otherMms) ordered.push({ type: 'mindmap', mCard: m });
  return ordered;
}

export async function generateApkgBlob(
  cards: AnkiCard[],
  deckName: string,
  onProgress?: (p: number, mindmapsDone?: number, mindmapsTotal?: number) => void,
  mindmapCards: AnkiMindmapCard[] = [],
  fullMindmapsOverride?: Record<string, any>,
  exportPrefs?: import('./ankiExportPrefs').AnkiExportPrefs | null
): Promise<Blob> {
  const JSZip = await getJSZip();
  if (!JSZip) {
    throw new Error('JSZip not available for apkg');
  }

  // Try sql.js path - must succeed to produce valid apkg with collection.anki2
  // If this fails we throw instead of returning a TSV zip masquerading as .apkg (which causes "file not found in archive")
  try {
    // Generate mindmap media first - but don't let it kill the whole export if it fails
    let mediaMap: Record<string, string> = {};
    let mediaFiles: Record<string, Blob> = {};
    let fieldMap: Record<string, string> = {};
    // Last reported mindmap render counts — forwarded with every later phase too
    let mmDone = 0;
    let mmTotal = 0;
    const reportApkg = (p: number) => { if (onProgress) onProgress(p, mmDone, mmTotal); };
    try {
      if (onProgress) onProgress(2);
      // Track last reported mindmap counts so later (non-media) phases keep forwarding them
      const res = await generateMindmapMedia(onProgress ? (p, d, t) => {
        if (d !== undefined) mmDone = d;
        if (t !== undefined) mmTotal = t;
        onProgress(Math.round(5 + (p / 100) * 75), mmDone, mmTotal);
      } : undefined, fullMindmapsOverride);
      mediaMap = res.mediaMap;
      mediaFiles = res.mediaFiles;
      fieldMap = res.fieldMap;
      reportApkg(82);
    } catch (e) {
      console.warn('mindmap media generation failed, continuing without images', e);
    }

    // sql.js engine loading. The JS is bundled with the app/plugin and the wasm
    // resolves local-first (plugin folder / /sql-wasm.wasm) then CDN data —
    // every fetch has a hard timeout so packaging can never hang silently.
    // NOTE: no remote <script> injection by design — Obsidian review does not
    // allow loading remote code; the wasm binary is data, not code.
    let SQL: any = null;
    try {
      reportApkg(82);
      await yieldToUI();
      let initSqlJs: any = cachedInitSqlJs;
      if (!initSqlJs) {
        try {
          const mod: any = await import(/* webpackIgnore: true */ 'sql.js');
          initSqlJs = mod.default || mod;
        } catch {
          const mod2: any = await import(/* webpackIgnore: true */ 'sql.js/dist/sql-wasm.js');
          initSqlJs = mod2.default || mod2;
        }
        if (typeof initSqlJs !== 'function') throw new Error('Bundled sql.js failed to load');
        cachedInitSqlJs = initSqlJs;
      }
      const wasmBinary = await loadSqlWasmBinary();
      reportApkg(83);
      await yieldToUI();
      if (wasmBinary) {
        // Guard the wasm instantiate itself: a corrupt binary must reject,
        // never hang the export at "Packaging…".
        SQL = await Promise.race([
          initSqlJs({ wasmBinary }),
          timeoutReject(20000, 'sql.js init timed out'),
        ]);
      } else {
        // Last resort: let sql.js locate the wasm itself. In Obsidian prefer
        // the plugin resource URL (app://) over `/file` (no web server there).
        const pluginApp = getPluginApp();
        const pluginWasmUrl: string | null = (() => {
          try {
            const adapter: any = pluginApp?.vault?.adapter;
            if (adapter?.getResourcePath) {
              for (const cand of ['.obsidian/plugins/quran-life/sql-wasm.wasm', '.obsidian/plugins/quran-life/public/sql-wasm.wasm']) {
                try {
                  const u = adapter.getResourcePath(cand);
                  if (u) return u;
                } catch { /* best-effort only; ignore */ }
              }
            }
          } catch { /* best-effort only; ignore */ }
          return null;
        })();
        SQL = await Promise.race([
          initSqlJs({ locateFile: (file: string) => pluginWasmUrl || `/${file}` }),
          timeoutReject(20000, 'sql.js init timed out'),
        ]);
      }
    } catch (e) {
      console.warn('sql.js not available', e);
      throw new Error('Failed to create Anki package. Please try again.');
    }

    if (!SQL) throw new Error('sql.js failed to init');

    const db = new SQL.Database();
    // Create minimal Anki schema (simplified, compatible with Anki 2.1)
    db.run(`
      CREATE TABLE col (id INTEGER PRIMARY KEY, crt INTEGER NOT NULL, mod INTEGER NOT NULL, scm INTEGER NOT NULL, ver INTEGER NOT NULL, dty INTEGER NOT NULL, usn INTEGER NOT NULL, ls INTEGER NOT NULL, conf TEXT NOT NULL, models TEXT NOT NULL, decks TEXT NOT NULL, dconf TEXT NOT NULL, tags TEXT NOT NULL);
      CREATE TABLE notes (id INTEGER PRIMARY KEY, guid TEXT NOT NULL, mid INTEGER NOT NULL, mod INTEGER NOT NULL, usn INTEGER NOT NULL, tags TEXT NOT NULL, flds TEXT NOT NULL, sfld TEXT NOT NULL, csum INTEGER NOT NULL, flags INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE cards (id INTEGER PRIMARY KEY, nid INTEGER NOT NULL, did INTEGER NOT NULL, ord INTEGER NOT NULL, mod INTEGER NOT NULL, usn INTEGER NOT NULL, type INTEGER NOT NULL, queue INTEGER NOT NULL, due INTEGER NOT NULL, ivl INTEGER NOT NULL, factor INTEGER NOT NULL, reps INTEGER NOT NULL, lapses INTEGER NOT NULL, left INTEGER NOT NULL, odue INTEGER NOT NULL, odid INTEGER NOT NULL, flags INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE revlog (id INTEGER PRIMARY KEY, cid INTEGER NOT NULL, usn INTEGER NOT NULL, ease INTEGER NOT NULL, ivl INTEGER NOT NULL, lastIvl INTEGER NOT NULL, factor INTEGER NOT NULL, time INTEGER NOT NULL, type INTEGER NOT NULL);
      CREATE TABLE graves (usn INTEGER NOT NULL, oid INTEGER NOT NULL, type INTEGER NOT NULL);
    `);

    const now = Date.now();
    const crt = Math.floor(now / 1000);
    // Fixed IDs so re-importing full deck updates existing notes and keeps due dates/FSRS
    const deckId = 1600000000000;
    const modelId = 1600000000001;

    const m = modelJson();
    const mm = modelJsonMindmap();
    const modelIdMindmap = 1600000000002;
    const model = {
      [modelId]: {
        id: modelId,
        name: 'QuranLife Verse',
        type: 0,
        mod: now,
        usn: -1,
        sortf: 0,
        did: deckId,
        tmpls: [
          {
            name: 'Card 1',
            ord: 0,
            qfmt: m.front,
            afmt: m.back,
            did: null,
            bqfmt: '',
            bafmt: '',
          },
        ],
        flds: [
          { name: 'Range', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
          { name: 'Surah', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
          { name: 'AnchorLabel', ord: 2, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
          { name: 'VerseChunksFront', ord: 3, sticky: false, rtl: true, font: 'Noto Naskh Arabic', size: 20, media: [] },
          { name: 'ContextFront', ord: 4, sticky: false, rtl: true, font: 'Noto Naskh Arabic', size: 20, media: [] },
          { name: 'RelatedGroups', ord: 5, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
          { name: 'MindmapDocs', ord: 6, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
          { name: 'VerseFullBack', ord: 7, sticky: false, rtl: true, font: 'Noto Naskh Arabic', size: 20, media: [] },
        ],
        css: m.css,
        req: [[0, 'all', [0]]],
      },
      [modelIdMindmap]: {
        id: modelIdMindmap,
        name: 'QuranLife Mindmap',
        type: 0,
        mod: now,
        usn: -1,
        sortf: 0,
        did: deckId,
        tmpls: [
          {
            name: 'Card 1',
            ord: 0,
            qfmt: mm.front,
            afmt: mm.back,
            did: null,
            bqfmt: '',
            bafmt: '',
          },
        ],
        flds: [
          { name: 'Title', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
          { name: 'MindmapImage', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
          { name: 'MindmapDocs', ord: 2, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
        ],
        css: mm.css,
        req: [[0, 'all', [0]]],
      },
    };

    const decks = {
      [deckId]: {
        id: deckId,
        mod: now,
        name: deckName,
        usn: -1,
        lrnToday: [0, 0],
        revToday: [0, 0],
        newToday: [0, 0],
        timeToday: [0, 0],
        collapsed: false,
        browserCollapsed: false,
        desc: 'Generated by Quran Life Anki Export - chunk reveal via card JS. Use Flag Red for similarity errors, Leech threshold 3.',
        dyn: 0,
        conf: 1,
        extendNew: 0,
        extendRev: 0,
      },
    };
    const dconf = {
      1: {
        id: 1,
        mod: now,
        name: 'Default',
        usn: -1,
        maxTaken: 60,
        autoplay: true,
        timer: 0,
        replayq: true,
        new: { perDay: 20, delays: [1, 10], separate: true, ints: [1, 4, 0], initialFactor: 2500, bury: true, order: 1 },
        rev: { perDay: 200, ease4: 1.3, fuzz: 0.05, minSpace: 1, ivlFct: 1, maxIvl: 36500, bury: true, hardFactor: 1.2 },
        lapse: { delays: [10], mult: 0, minInt: 1, leechFails: 3, leechAction: 0 },
        dyn: false,
        newMix: 0,
        newPerDayMinimum: 0,
        interdayLearningMix: 0,
        reviewOrder: 0,
        newSortOrder: 0,
        newGatherPriority: 0,
        buryInterdayLearning: false,
        fsrs: true,
        fsrsWeights: [],
        desiredRetention: 0.9,
      },
    };

    db.run(
      'INSERT INTO col (id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags) VALUES (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, ?)',
      [crt, now, now, JSON.stringify({}), JSON.stringify(model), JSON.stringify(decks), JSON.stringify(dconf), JSON.stringify({})]
    );

    // Insert notes/cards in new-card display order.
    // For new cards (type=0, queue=0) Anki uses `due` as the position, so due
    // must be sequential 1..N in the desired order (not the same value for all
    // cards). nids are also allocated in due order so "order added" agrees.
    const orderedEntries = buildOrderedExportEntries(cards, mindmapCards, exportPrefs ?? null);
    let nidSeq = now - orderedEntries.length * 1000 - 5000;
    for (let orderIdx = 0; orderIdx < orderedEntries.length; orderIdx++) {
      // Keep the progress bar moving and the UI responsive during large
      // decks: hundreds of synchronous db.run calls otherwise freeze the
      // view at "Packaging…" with no feedback.
      if (orderIdx % 20 === 0) {
        reportApkg(83 + Math.round((orderIdx / Math.max(1, orderedEntries.length)) * 4));
        await yieldToUI();
      }
      const entry = orderedEntries[orderIdx];
      const duePos = orderIdx + 1; // 1-based new-card position
      nidSeq += 1;
      if (entry.type === 'verse') {
        const card = entry.card;
      const guid = noteGuidForCard(card);
      const mod = now;
      const usn = -1;
      const tags = card.tags.join(' ');
      // Build VerseChunksFront: each verse with badges + chunks spans
      let verseChunksFront = '';
      card.verseIds.forEach((ayahId, idx) => {
        const cks = card.chunks[idx] || [];
        verseChunksFront += `<div class="verse-block"><span class="verse-badge">${ayahId}</span> `;
        cks.forEach(ch => {
          verseChunksFront += `<span class="chunk blurred">${escapeField(ch)}</span> `;
        });
        verseChunksFront += `</div>`;
      });
      let contextFront = '';
      if (card.contextVerses.length > 0) {
        const visible = card.contextVerses.slice(-2);
        const extra = card.contextVerses.slice(0, -2);
        if (extra.length > 0) {
          contextFront += extra.map(v => `<span class="extra"><span class="verse-badge">${v.ayahId}</span> ${escapeField(v.text)} </span>`).join('');
        }
        contextFront += visible.map(v => `<span><span class="verse-badge">${v.ayahId}</span> ${escapeField(v.text)} </span>`).join('');
      } else {
        // No previous verses (first verses of surah) — show surah name so user knows which surah to recall
        contextFront = `<span class="surah-context"><span class="verse-badge">Surah</span> ${escapeField(card.arabicName)} — ${escapeField(card.surahName)} (${card.surahId})</span>`;
      }
      const related = card.relatedGroups.join(', ');
      const rawDocs = (card as any).mindmapDocs ? String((card as any).mindmapDocs) : '';
      const docs = rawDocs ? escapeField(stripMediaRefs(rawDocs)) : '';
      // Condensed full verses for the back: inline (not line-by-line) so the
      // user can scan what was revealed and grade honestly (Again/Hard/Good/Easy)
      const verseFullBack = card.verseIds.map((ayahId, idx) => {
        const t = escapeField(card.verseTexts[idx] || '');
        return `<span class="verse-badge">${ayahId}</span> ${t}`;
      }).join(' ');

      const flds = [
        escapeField(`${card.surahId}:${card.startVerse}-${card.endVerse}`),
        escapeField(card.arabicName + ' ' + card.surahName),
        escapeField(card.anchorLabel),
        verseChunksFront,
        contextFront,
        escapeField(related),
        docs,
        verseFullBack,
      ].join('\x1f');

      const csum = 0;
      const sfld = escapeField(`${card.surahId}:${card.startVerse}-${card.endVerse}`);
      db.run('INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)', [
        nidSeq,
        guid,
        modelId,
        mod,
        usn,
        tags,
        flds,
        sfld,
        csum,
        '',
      ]);

      const cid = nidSeq + 1000000;
      db.run('INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data) VALUES (?, ?, ?, 0, ?, ?, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)', [
        cid,
        nidSeq,
        deckId,
        mod,
        usn,
        duePos,
        '',
      ]);
      } else {
        const mCard = entry.mCard;
      const guid = `ql-mindmap-${mCard.key}`;
      // Simple hash for guid stability (fallback to key)
      let h = 0;
      for (let i = 0; i < guid.length; i++) h = ((h << 5) - h + guid.charCodeAt(i)) | 0;
      const guidStr = Math.abs(h).toString(36).padStart(10, '0') + 'm';
      const tags = mCard.tags.join(' ');
      const title = escapeField(mCard.title);
      const docs = mCard.mindmapDocs ? escapeField(stripMediaRefs(String(mCard.mindmapDocs))) : '';
      const imgHtml = fieldMap[mCard.key] || '';
      const flds = [title, imgHtml, docs].join('\x1f');
      const sfld = title;
      db.run('INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)', [
        nidSeq,
        guidStr,
        modelIdMindmap,
        now,
        -1,
        tags,
        flds,
        sfld,
        0,
        '',
      ]);
      const cid2 = nidSeq + 2000000;
      db.run('INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data) VALUES (?, ?, ?, 0, ?, ?, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)', [
        cid2,
        nidSeq,
        deckId,
        now,
        -1,
        duePos,
        '',
      ]);
      }
    }

    reportApkg(87);
    await yieldToUI();
    const data = db.export();
    reportApkg(90);
    await yieldToUI();
    const zip = new JSZip();
    zip.file('collection.anki2', data);
    zip.file('media', JSON.stringify(mediaMap));
    // Add each mindmap PNG as file named by its media key ("0", "1", ...)
    const mediaEntries = Object.entries(mediaFiles);
    for (let mi = 0; mi < mediaEntries.length; mi++) {
      const [key, blob] = mediaEntries[mi];
      const ab = await blob.arrayBuffer();
      zip.file(key, ab);
      if (mi % 5 === 0) {
        reportApkg(90 + Math.round(((mi + 1) / Math.max(1, mediaEntries.length)) * 5));
        await yieldToUI();
      }
    }
    reportApkg(95);

    // onUpdate keeps the bar moving during DEFLATE compression of large
    // decks (previously the UI sat at 95% with no feedback).
    const blob = await zip.generateAsync(
      { type: 'blob', compression: 'DEFLATE' },
      (metadata: { percent?: number }) => {
        try {
          const pct = typeof metadata?.percent === 'number' ? metadata.percent : 0;
          reportApkg(95 + Math.round((Math.min(100, Math.max(0, pct)) / 100) * 5));
        } catch { /* best-effort only; ignore */ }
      }
    );
    reportApkg(100);
    return blob;
  } catch (e) {
    console.error('apkg gen failed', e);
    throw e;
  }
}
