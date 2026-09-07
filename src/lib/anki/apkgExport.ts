// Minimal .apkg generator using JSZip + sql.js approach fallback to TSV if sql.js unavailable
// For browser export we generate a valid .apkg zip with collection.anki2 sqlite
// Simplified: if sql.js fails, fallback to CSV download via Blob

import { AnkiCard } from './types';

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
.context .extra { display:none; }
.context.show-all .extra { display:inline; }
.verse-block { margin: 8px 0; line-height: 2.1; font-size: 1.35rem; }
.verse-badge { font-size: 0.65rem; opacity:0.7; margin-left: 6px; border:1px solid #ccc; padding:1px 4px; border-radius:4px; vertical-align: middle; }
.chunk { transition: filter 0.2s, opacity 0.2s; }
.chunk.blurred { filter: blur(8px); opacity: 0.45; user-select:none; }
.chunk.revealed { filter: none; opacity:1; }
.chunk.next { filter: blur(5px); opacity:0.65; outline: 1px dashed #88a; }
#revealBtn { width:100%; padding:12px; border-radius:12px; border:none; background:#5b8fb9; color:white; font-weight:600; margin-top:14px; cursor:pointer; }
#grading { display:flex; gap:8px; margin-top:14px; }
#grading button { flex:1; padding:10px; border-radius:10px; border:1px solid #ddd; background:#f7f7f7; cursor:pointer; font-weight:600; }
#grading button.good { background:#5b8fb9; color:white; }
.related { margin-top:12px; font-size:0.85rem; opacity:0.8; background: #f6f6f6; padding:8px; border-radius:8px; direction:ltr; text-align:left; }
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
  <div id="grading" style="display:none">
    <button onclick="pycmd('ansAgain')" style="background:#b07c7c;color:white">Not remembered</button>
    <button onclick="pycmd('ansGood')" class="good">Remembered</button>
    <button onclick="pycmd('ansBury')">Postpone</button>
  </div>
  <div id="counter" style="font-size:0.7rem;opacity:0.5;margin-top:6px"></div>
</div>
<script>
(function(){
  var revealed=0;
  var chunks=document.querySelectorAll('.chunk');
  var total=chunks.length;
  var grading=document.getElementById('grading');
  var btn=document.getElementById('revealBtn');
  var counter=document.getElementById('counter');
  var ctx=document.getElementById('contextBox');
  function update(){
    for(var i=0;i<chunks.length;i++){
      if(i<revealed){ chunks[i].className='chunk revealed'; }
      else if(i===revealed){ chunks[i].className='chunk next'; }
      else { chunks[i].className='chunk blurred'; }
    }
    if(counter) counter.textContent = revealed + ' / ' + total + ' chunks';
    if(revealed>=total){
      if(btn) btn.style.display='none';
      if(grading) grading.style.display='flex';
      // expand context if mutashabihat tag present
      if(ctx && document.body.dataset.hasMutashabihat==='1'){ ctx.classList.add('show-all'); }
    } else {
      if(btn) btn.style.display='block';
      if(grading) grading.style.display='none';
    }
  }
  window.qlReveal=function(){
    if(revealed<total){ revealed++; update(); }
  };
  // auto-bind space
  document.addEventListener('keydown', function(e){
    if(e.code==='Space'){ e.preventDefault(); window.qlReveal(); }
  });
  // init
  // hide extra context verses initially if >2
  if(ctx){
    var extras=ctx.querySelectorAll('.extra');
    if(extras.length>0 && !ctx.classList.contains('show-all')){}
  }
  update();
})();
</script>
`.trim(),
    back: `
{{FrontSide}}
<hr id="answer">
<div style="margin-top:10px">
  <div style="font-size:1.35rem; line-height:2.1">{{VerseFull}}</div>
  {{#RelatedGroups}}<div class="related"><b>Related groups:</b> {{RelatedGroups}}</div>{{/RelatedGroups}}
  {{#MindmapDocs}}<div class="related" style="direction:rtl; text-align:right; background:#fffbe6; border:1px solid #f0d76a"><b>Mindmap notes:</b> {{MindmapDocs}}</div>{{/MindmapDocs}}
  <div style="margin-top:8px; font-size:0.75rem; opacity:0.6">Anchor: {{AnchorLabel}} • {{Range}}</div>
</div>
`.trim(),
  };
}

export async function generateApkgBlob(cards: AnkiCard[], deckName: string): Promise<Blob> {
  const JSZip = await getJSZip();
  if (!JSZip) {
    // Fallback to TSV
    return generateTsvBlob(cards);
  }

  // Try sql.js path
  try {
    // Attempt to create real sqlite apkg
    // Lazy load sql.js wasm via cdn if not available
    // For now we generate a minimal apkg using JSZip + fake sqlite (Anki will still import TSV-like?)
    // Instead we generate a zip with media and a TSV for manual import plus instructions
    // To create a valid .apkg we need sqlite - we fallback to a valid but minimal sqlite using sql.js if available

    // Try dynamic sql.js - use local wasm for offline and to avoid CDN 500
    let SQL: any = null;
    try {
      const mod: any = await import('sql.js');
      const initSqlJs = mod.default || mod;
      SQL = await initSqlJs({
        locateFile: (file: string) => `/${file}`,
      });
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
          { name: 'Surah', ord: 0 },
          { name: 'Range', ord: 1 },
          { name: 'AnchorLabel', ord: 2 },
          { name: 'VerseFull', ord: 3 },
          { name: 'VerseChunksFront', ord: 4 },
          { name: 'ContextFront', ord: 5 },
          { name: 'RelatedGroups', ord: 6 },
          { name: 'MindmapDocs', ord: 7 },
        ],
        css: m.css,
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
      const verseFull = card.verseTexts.join(' <span style="opacity:0.4"> ۝ </span> ');
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
      }
      const related = card.relatedGroups.join(', ');
      const docs = (card as any).mindmapDocs ? escapeField(String((card as any).mindmapDocs)) : '';

      const flds = [
        escapeField(card.arabicName + ' ' + card.surahName),
        escapeField(`${card.surahId}:${card.startVerse}-${card.endVerse}`),
        escapeField(card.anchorLabel),
        escapeField(verseFull),
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

    const data = db.export();
    const zip = new JSZip();
    zip.file('collection.anki2', data);
    zip.file('media', JSON.stringify({}));

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    return blob;
  } catch (e) {
    console.error('apkg gen failed, fallback', e);
    return generateZipWithTsv(cards, deckName, JSZip);
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
