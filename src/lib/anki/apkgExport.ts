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

// Generate PNG media for each tldraw mindmap snapshot at export time
// Returns map from surah key (e.g. "surah-50") to { filename, blob, fieldHtml }
async function generateMindmapMedia(onProgress?: (p: number) => void, overrideMindmaps?: Record<string, any>): Promise<{ mediaMap: Record<string, string>; mediaFiles: Record<string, Blob>; fieldMap: Record<string, string> }> {
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
    } catch {}
  }

  const entries = Object.entries(mindmaps).filter(([k, v]: any) => v?.snapshot);
  if (entries.length === 0) return { mediaMap, mediaFiles, fieldMap };

  // Helper to render one snapshot to blob
  const renderOne = async (key: string, snapshot: any): Promise<Blob | null> => {
    try {
      const { sanitizeMindmapSnapshot } = await import('@/lib/mindmapSnapshot');
      const sanitized = sanitizeMindmapSnapshot(snapshot) || snapshot;
      // Count shapes
      const store = (sanitized as any)?.store;
      if (!store || Object.keys(store).filter(k => k.startsWith('shape:')).length === 0) return null;

      // Dynamically import tldraw and react
      const [{ Tldraw }, React, ReactDOMClient] = await Promise.all([
        import('tldraw'),
        import('react'),
        import('react-dom/client'),
      ]);

      return await new Promise<Blob | null>((resolve) => {
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-10000px';
        container.style.top = '-10000px';
        container.style.width = '1000px';
        container.style.height = '700px';
        container.style.overflow = 'hidden';
        container.style.background = 'white';
        document.body.appendChild(container);

        let editorRef: any = null;
        let timeoutId: any = null;
        let resolved = false;

        const cleanup = () => {
          if (timeoutId) clearTimeout(timeoutId);
          try {
            const root: any = (container as any)._reactRoot;
            if (root) root.unmount();
          } catch {}
          if (container.parentNode) container.parentNode.removeChild(container);
        };

        const finish = (blob: Blob | null) => {
          if (resolved) return;
          resolved = true;
          cleanup();
          resolve(blob);
        };

        const onMount = async (editor: any) => {
          editorRef = editor;
          try {
            // Ensure snapshot is loaded (Tldraw will load via prop, but ensure)
            // Wait a bit for shapes to render
            await new Promise(r => setTimeout(r, 600));
            const shapeIds = Array.from(editor.getCurrentPageShapeIds() as Set<string>);
            if (shapeIds.length === 0) {
              finish(null);
              return;
            }
            // Zoom to fit before export
            try { editor.zoomToFit({ duration: 0 }); } catch {}
            await new Promise(r => setTimeout(r, 300));
            const result = await editor.toImage([...shapeIds], {
              format: 'png',
              quality: 0.92,
              pixelRatio: 1.4,
              padding: 16,
              background: true,
            });
            if (result && result.blob) {
              finish(result.blob as Blob);
            } else {
              finish(null);
            }
          } catch (e) {
            console.warn('mindmap toImage failed', key, e);
            finish(null);
          }
        };

        // Timeout fallback
        timeoutId = setTimeout(() => {
          console.warn('mindmap render timeout', key);
          finish(null);
        }, 8000);

        try {
          const element = (React as any).createElement(Tldraw, {
            snapshot: sanitized,
            onMount,
            hideUi: true,
          });
          const root = (ReactDOMClient as any).createRoot(container);
          (container as any)._reactRoot = root;
          root.render(element);
        } catch (e) {
          console.warn('tldraw mount failed', e);
          finish(null);
        }
      });
    } catch (e) {
      console.warn('renderOne outer failed', key, e);
      return null;
    }
  };

  // Process sequentially to avoid overloading
  let idx = 0;
  const total = entries.length;
  if (onProgress) onProgress(5);
  for (let i = 0; i < entries.length; i++) {
    const [key, val] = entries[i];
    const snapshot = (val as any).snapshot;
    if (!snapshot) {
      if (onProgress) onProgress(5 + Math.round(((i + 1) / total) * 70));
      continue;
    }
    // Filename for Anki media: must be ascii, no spaces
    const safeKey = key.replace(/[^a-z0-9_-]/gi, '_');
    const filename = `mindmap-${safeKey}.png`;
    try {
      const blob = await renderOne(key, snapshot);
      if (blob) {
        const mediaKey = String(idx);
        mediaMap[mediaKey] = filename;
        mediaFiles[mediaKey] = blob;
        fieldMap[key] = `<img src="${filename}" style="max-width:100%; border:1px solid #ddd; border-radius:8px;" />`;
        idx += 1;
      } else {
        fieldMap[key] = '';
      }
    } catch (e) {
      console.warn('failed to generate image for', key, e);
      fieldMap[key] = '';
    }
    if (onProgress) onProgress(5 + Math.round(((i + 1) / total) * 70));
    // Small delay between renders to let browser breathe
    await new Promise(r => setTimeout(r, 150));
  }
  if (onProgress) onProgress(80);

  return { mediaMap, mediaFiles, fieldMap };
}

// Lazily load jszip
async function getJSZip() {
  try {
    // dynamic import to avoid SSR issues
    const mod = await import('jszip');
    return (mod as any).default || mod;
  } catch {
    return null;
  }
}

// Escape Anki field separator
function escapeField(s: string): string {
  return s.replace(/\n/g, '<br>').replace(/\x1f/g, ' ');
}

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
.verse-badge { font-size: 0.65rem; opacity:0.7; margin-left: 6px; border:1px solid #ccc; padding:1px 4px; border-radius:4px; vertical-align: middle; }
.chunk { transition: filter 0.2s, opacity 0.2s; }
.chunk.blurred { filter: blur(8px); opacity: 0.45; user-select:none; }
.chunk.revealed { filter: none; opacity:1; }
.chunk.next { filter: blur(5px); opacity:0.65; outline: 1px dashed #88a; }
#revealBtn { width:100%; padding:12px; border-radius:12px; border:none; background:#5b8fb9; color:white; font-weight:600; margin-top:14px; cursor:pointer; position: sticky; bottom: 0; z-index: 2; box-shadow: 0 -4px 12px rgba(0,0,0,0.08); }
#revealBtn:active { opacity:0.9; }
#counter { font-size:0.7rem; opacity:0.5; margin-top:6px; text-align:center; }
#doneHint { display:none; margin-top:12px; padding:10px; background:#e8f5e9; border:1px solid #a5d6a7; border-radius:8px; text-align:center; font-size:0.9rem; color:#2e7d32; }
.related { margin-top:12px; font-size:0.85rem; opacity:0.8; background: #f6f6f6; padding:8px; border-radius:8px; direction:ltr; text-align:left; }
.mindmap-img { margin-top:12px; text-align:center; }
.mindmap-img img { max-width:100%; border:1px solid #ddd; border-radius:8px; }
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
  // Ensure first next is visible on load
  setTimeout(function(){
    var t=chunks[0];
    if(t) scrollToEl(t);
  }, 80);
})();
</script>
`.trim(),
    back: `
<div style="margin-top:10px">
  {{#RelatedGroups}}<div class="related"><b>Related groups:</b> {{RelatedGroups}}</div>{{/RelatedGroups}}
  {{#MindmapDocs}}<div class="related" style="direction:rtl; text-align:right; background:#fffbe6; border:1px solid #f0d76a"><b>Mindmap notes:</b> {{MindmapDocs}}</div>{{/MindmapDocs}}
  <div style="margin-top:8px; font-size:0.75rem; opacity:0.6">Anchor: {{AnchorLabel}} • {{Range}} — {{Surah}}</div>
</div>
`.trim(),
  };
}

function modelJsonMindmap() {
  const css = `
.card { font-family: sans-serif; text-align: center; background: #fff; color: #222; padding: 16px; }
.mindmap-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 10px; }
.mindmap-img img { max-width: 100%; border: 1px solid #ddd; border-radius: 8px; }
.related { margin-top:12px; font-size:0.85rem; opacity:0.8; background: #fffbe6; padding:8px; border-radius:8px; text-align:left; border:1px solid #f0d76a; }
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

export async function generateApkgBlob(cards: AnkiCard[], deckName: string, onProgress?: (p: number) => void, mindmapCards: AnkiMindmapCard[] = [], fullMindmapsOverride?: Record<string, any>): Promise<Blob> {
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
    try {
      if (onProgress) onProgress(2);
      const res = await generateMindmapMedia(onProgress ? (p) => onProgress(Math.round(5 + (p / 100) * 75)) : undefined, fullMindmapsOverride);
      mediaMap = res.mediaMap;
      mediaFiles = res.mediaFiles;
      fieldMap = res.fieldMap;
      if (onProgress) onProgress(82);
    } catch (e) {
      console.warn('mindmap media generation failed, continuing without images', e);
    }

    // Try dynamic sql.js - robust for Vercel (public/ at root, wasm via fetch, fallback to wasmBinary)
    // Use Function() to avoid Webpack bundling node:crypto at build time (sql.js uses node:crypto in its Node entry)
    // Robust sql.js loading for Vercel: avoid Webpack bundling node:crypto, use wasmBinary with CDN fallbacks
    let SQL: any = null;
    try {
      let initSqlJs: any = null;
      try {
        const mod: any = await import(/* webpackIgnore: true */ 'sql.js');
        initSqlJs = mod.default || mod;
      } catch {
        try {
          const mod2: any = await import(/* webpackIgnore: true */ 'sql.js/dist/sql-wasm.js');
          initSqlJs = mod2.default || mod2;
        } catch {
          initSqlJs = await new Promise<any>((resolve, reject) => {
            if ((window as any).initSqlJs) return resolve((window as any).initSqlJs);
            const script = document.createElement('script');
            script.src = 'https://sql.js.org/dist/sql-wasm.js';
            script.async = true;
            script.onload = () => resolve((window as any).initSqlJs);
            script.onerror = () => reject(new Error('CDN sql.js load failed'));
            document.head.appendChild(script);
            setTimeout(() => reject(new Error('CDN timeout')), 8000);
          });
        }
      }
      const wasmUrls = ['/sql-wasm.wasm', 'https://sql.js.org/dist/sql-wasm.wasm', 'https://cdn.jsdelivr.net/npm/sql.js@1.14.2/dist/sql-wasm.wasm'];
      let wasmBinary: ArrayBuffer | null = null;
      for (const url of wasmUrls) {
        try {
          const resp = await fetch(url, { cache: 'no-store' as any });
          if (resp.ok) {
            wasmBinary = await resp.arrayBuffer();
            break;
          }
        } catch {}
      }
      if (wasmBinary) {
        SQL = await initSqlJs({ wasmBinary });
      } else {
        SQL = await initSqlJs({ locateFile: (file: string) => `/${file}` });
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
          { name: 'Surah', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
          { name: 'Range', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
          { name: 'AnchorLabel', ord: 2, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
          { name: 'VerseChunksFront', ord: 3, sticky: false, rtl: true, font: 'Noto Naskh Arabic', size: 20, media: [] },
          { name: 'ContextFront', ord: 4, sticky: false, rtl: true, font: 'Noto Naskh Arabic', size: 20, media: [] },
          { name: 'RelatedGroups', ord: 5, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
          { name: 'MindmapDocs', ord: 6, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
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

    // Insert notes/cards
    let nid = now - cards.length * 1000;
    for (const card of cards) {
      nid += 1;
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

      const flds = [
        escapeField(card.arabicName + ' ' + card.surahName),
        escapeField(`${card.surahId}:${card.startVerse}-${card.endVerse}`),
        escapeField(card.anchorLabel),
        verseChunksFront,
        contextFront,
        escapeField(related),
        docs,
      ].join('\x1f');

      const csum = 0;
      const sfld = escapeField(card.anchorLabel);
      db.run('INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)', [
        nid,
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

      const cid = nid + 1000000;
      db.run('INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data) VALUES (?, ?, ?, 0, ?, ?, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)', [
        cid,
        nid,
        deckId,
        mod,
        usn,
        deckId, // due
        '',
      ]);
    }

    // Insert mindmap cards (one per surah/part/meta with snapshot)
    // Use a separate nid sequence to avoid collision with verse cards
    let midNid = now + 10000000;
    for (const mCard of mindmapCards) {
      midNid += 1;
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
        midNid,
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
      const cid2 = midNid + 2000000;
      db.run('INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data) VALUES (?, ?, ?, 0, ?, ?, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)', [
        cid2,
        midNid,
        deckId,
        now,
        -1,
        deckId,
        '',
      ]);
    }

    if (onProgress) onProgress(85);
    const data = db.export();
    if (onProgress) onProgress(90);
    const zip = new JSZip();
    zip.file('collection.anki2', data);
    zip.file('media', JSON.stringify(mediaMap));
    // Add each mindmap PNG as file named by its media key ("0", "1", ...)
    for (const [key, blob] of Object.entries(mediaFiles)) {
      const ab = await (blob as Blob).arrayBuffer();
      zip.file(key, ab);
    }
    if (onProgress) onProgress(95);

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    if (onProgress) onProgress(100);
    return blob;
  } catch (e) {
    console.error('apkg gen failed', e);
    throw e;
  }
}

async function generateZipWithTsv(cards: AnkiCard[], deckName: string, JSZip: any): Promise<Blob> {
  const tsv = cards
    .map(c => {
      const verseFull = c.verseTexts.join(' ');
      const chunks = c.chunks.map(arr => arr.join(' | ')).join(' || ');
      const context = c.contextVerses.map(v => v.text).join(' ');
      const related = c.relatedGroups.join(', ');
      return [c.surahId, `${c.startVerse}-${c.endVerse}`, c.anchorLabel, verseFull, chunks, context, related, c.tags.join(' ')].join('\t');
    })
    .join('\n');
  const zip = new JSZip();
  zip.file('quran-life-cards.tsv', tsv);
  zip.file(
    'README.txt',
    `Deck: ${deckName}\nGenerated by Quran Life\nImport TSV via Anki -> File -> Import\nFields: Surah | Range | Label | VerseFull | Chunks | Context | Related | Tags\n`
  );
  zip.file('media', JSON.stringify({}));
  // Minimal apkg fallback still zip, user can import tsv
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

function generateTsvBlob(cards: AnkiCard[]): Blob {
  const tsv = cards
    .map(c => [c.surahId, c.startVerse, c.endVerse, c.anchorLabel, c.verseTexts.join(' '), c.tags.join(' ')].join('\t'))
    .join('\n');
  return new Blob([tsv], { type: 'text/tab-separated-values' });
}
