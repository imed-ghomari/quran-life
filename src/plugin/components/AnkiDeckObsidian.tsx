'use client';
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { getQuranVerses, getSurah, SURAHS } from '@/lib/quranData';
import { buildAnkiCards, buildMindmapCards } from '@/lib/anki/cardBuilder';
import { generateApkgBlob } from '@/lib/anki/apkgExport';
import { AnkiAnchor } from '@/lib/anki/types';
import type { Verse } from '@/lib/types';
import { useVaultSplits, useVaultMindmap, useVaultDoc, useVaultMindmaps } from '@/plugin/hooks/useVaultAnkiStore';
import type { VaultStore } from '@/plugin/storage/vaultAdapter';
import { sanitizeAnchors, buildAnchorsFromBreaks, ensureDefaultSplits } from '@/lib/anki/splitStore';
import { Save, Eye, Layers, PenTool, Split, Image as ImageIcon, Download, Trash2, Check, X, FileText } from 'lucide-react';
import MindmapEditor from '@/plugin/components/MindmapEditorObsidian';
import MindmapViewer from '@/plugin/components/MindmapViewerObsidian';

export default function AnkiDeckObsidian({ vaultStore }: { vaultStore: VaultStore }) {
  const [allVerses, setAllVerses] = useState<Verse[]>([]);
  const [isVersesLoaded, setIsVersesLoaded] = useState(false);
  const [selectedMindmapKey, setSelectedMindmapKey] = useState('surah-2');
  const selectedSurah = useMemo(() => {
    if (selectedMindmapKey.startsWith('surah-')) return Number(selectedMindmapKey.replace('surah-','')) || 2;
    return 2;
  }, [selectedMindmapKey]);
  const isPartOrMeta = selectedMindmapKey.startsWith('part-') || selectedMindmapKey.startsWith('meta-');
  const [deckName, setDeckName] = useState('QuranLife::Review');
  const [isExporting, setIsExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showMindmapEditor, setShowMindmapEditor] = useState(false);
  const [showAllVerses, setShowAllVerses] = useState(false);
  const [showMindmapPreview, setShowMindmapPreview] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { mindmap: currentMindmap, save: saveMindmap, remove: deleteMindmap, isLoading: isMindmapLoading } = useVaultMindmap(vaultStore, selectedMindmapKey);
  const { mindmaps: allMindmaps } = useVaultMindmaps(vaultStore);
  const { anchors: vaultAnchors, saveAnchors } = useVaultSplits(vaultStore, selectedSurah);
  const { content: docContent, save: saveDoc } = useVaultDoc(vaultStore, selectedMindmapKey);
  const [localAnchors, setLocalAnchors] = useState<AnkiAnchor[]>([]);
  const [editingDocText, setEditingDocText] = useState('');

  useEffect(() => { setEditingDocText(docContent); }, [docContent]);
  useEffect(() => { if (vaultAnchors.length) setLocalAnchors(vaultAnchors); else setLocalAnchors(ensureDefaultSplits(selectedSurah)); }, [vaultAnchors, selectedSurah]);

  const surah = getSurah(selectedSurah);
  const [surahVerses, setSurahVerses] = useState<Verse[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (allVerses.length) {
          if (!cancelled) { setSurahVerses(allVerses.filter(v=>v.surahId===selectedSurah)); setIsVersesLoaded(true); }
          return;
        }
        const verses = await getQuranVerses();
        if (cancelled) return;
        setAllVerses(verses);
        setSurahVerses(verses.filter(v=>v.surahId===selectedSurah));
      } catch { if (!cancelled) { setAllVerses([]); setSurahVerses([]); } }
      finally { if (!cancelled) setIsVersesLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [selectedSurah, allVerses.length]);

  const builderState = useMemo(() => {
    const sorted = [...localAnchors].sort((a,b)=>a.startVerse-b.startVerse);
    const breaks = sorted.slice(0,-1).map(a=>a.endVerse);
    return { breaks, anchors: sorted };
  }, [localAnchors]);

  const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(()=>setToast(null),3000); }, []);

  const handleAddBreak = (val: number) => {
    const vc = surah?.verseCount; if (!vc) return;
    const next = buildAnchorsFromBreaks(selectedSurah, [...builderState.breaks, val].sort((a,b)=>a-b), vc);
    setLocalAnchors(next.length ? next : ensureDefaultSplits(selectedSurah));
  };
  const handleRemoveBreak = (val: number) => {
    const vc = surah?.verseCount; if (!vc) return;
    const nextBreaks = builderState.breaks.filter(b=>b!==val);
    const next = buildAnchorsFromBreaks(selectedSurah, nextBreaks, vc);
    setLocalAnchors(next.length ? next : ensureDefaultSplits(selectedSurah));
  };
  const handleSaveSplits = async () => {
    await saveAnchors(localAnchors);
    showToast(`Saved ${localAnchors.length} groups for Surah ${selectedSurah} → QuranLife/splits/surah-${String(selectedSurah).padStart(3,'0')}.json`);
  };

  const handleSaveMindmap = async (snapshot: any) => {
    await saveMindmap({ snapshot, isComplete: true });
    setShowMindmapEditor(false);
    showToast(`Mindmap saved → QuranLife/mindmaps/${selectedMindmapKey}.json (Resilio syncs this file only)`);
  };

  const handleDeleteMindmap = async () => {
    await deleteMindmap();
    setShowDeleteConfirm(false);
    setShowMindmapPreview(false);
    showToast('Mindmap deleted (tombstone kept to avoid re-import)');
  };

  const handleDocSave = async () => {
    await saveDoc(editingDocText);
    showToast('Notes saved → QuranLife/docs/*.md (editable in Obsidian)');
  };

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      let versesForExport = allVerses;
      if (!versesForExport.length) { try { versesForExport = await getQuranVerses(); setAllVerses(versesForExport); } catch {} }
      const fullSplits: Record<number, AnkiAnchor[]> = {};
      // Load all splits from vault (split files)
      for (let sid=1; sid<=114; sid++) {
        const arr = await vaultStore.loadSplitsForSurah(sid);
        if (arr && arr.length) fullSplits[sid] = arr as AnkiAnchor[];
      }
      // Fallback: also check in-memory localAnchors for current surah if not yet saved
      if (!fullSplits[selectedSurah] && localAnchors.length) fullSplits[selectedSurah] = localAnchors;

      // Ensure every short surah and mindmap-linked surah has at least one anchor
      SURAHS.forEach(s => {
        if (s.verseCount <= 10 && !fullSplits[s.id]) {
          fullSplits[s.id] = [{ id: `auto-anchor-${s.id}-1-${s.verseCount}`, surahId: s.id, startVerse: 1, endVerse: s.verseCount, label: `Verses 1-${s.verseCount}` }];
        }
      });
      const mindmapKeys = new Set(Object.keys(allMindmaps).filter(k => (allMindmaps as any)[k]?.snapshot));
      SURAHS.forEach(s => {
        const key = `surah-${s.id}`;
        if (mindmapKeys.has(key) && !fullSplits[s.id]) {
          fullSplits[s.id] = [{ id: `auto-anchor-${s.id}-1-${s.verseCount}`, surahId: s.id, startVerse: 1, endVerse: s.verseCount, label: `Verses 1-${s.verseCount}` }];
        }
      });

      const allAnchors: AnkiAnchor[] = [];
      Object.values(fullSplits).forEach(arr => allAnchors.push(...arr));
      // filter to only surahs with mindmap
      const filteredAnchors = allAnchors.filter(a => mindmapKeys.has(`surah-${a.surahId}`));
      const docsMap: Record<string, string> = {};
      for (const key of Object.keys(allMindmaps)) {
        const d = await vaultStore.loadDoc(key);
        if (typeof d === 'string' && d.trim()) docsMap[key] = d;
      }
      // also include current doc if unsaved
      if (editingDocText.trim() && !docsMap[selectedMindmapKey]) docsMap[selectedMindmapKey] = editingDocText;

      const mindmapCards = buildMindmapCards(allMindmaps as any, docsMap);
      if (filteredAnchors.length===0 && mindmapCards.length===0) { showToast('No mindmap-linked surah to export — create a mindmap first'); setIsExporting(false); return; }
      const cards = buildAnkiCards(filteredAnchors, versesForExport, { mindmapDocsMap: docsMap });
      const blob = await generateApkgBlob(cards, deckName, ()=>{}, mindmapCards, allMindmaps);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.download='quran-life-deck.apkg'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      showToast(`Exported ${cards.length} verse cards + ${mindmapCards.length} mindmap cards`);
    } catch (e) { console.error(e); showToast('Export failed'); }
    finally { setIsExporting(false); }
  };

  if (!isVersesLoaded) return <div className="quran-life-hint">Loading verses…</div>;

  const displayTitle = isPartOrMeta ? (selectedMindmapKey==='meta-0' ? 'Meta Overview' : `Part ${selectedMindmapKey.replace('part-','')}`) : `${surah?.arabicName} - Surah ${selectedSurah}`;
  const vc = surah?.verseCount || 0;

  return (
    <div className="space-y-4" style={{ padding: '8px' }}>
      <div className="card">
        <h3 style={{ display:'flex', gap:6, alignItems:'center' }}><Layers size={18} /> Anki Deck (Vault-synced)</h3>
        <p style={{ fontSize:'0.85em', opacity:0.7 }}>Splits → QuranLife/splits/ · Mindmaps → QuranLife/mindmaps/ · Docs → QuranLife/docs/ — Resilio syncs per file, no giant JSON.</p>
        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          <input value={deckName} onChange={e=>setDeckName(e.target.value)} placeholder="QuranLife::Review" style={{ flex:1, padding:'6px 8px', borderRadius:8, border:'1px solid var(--background-modifier-border)' }} />
          <button onClick={handleExport} disabled={isExporting} style={{ padding:'6px 12px', borderRadius:8, background:'var(--interactive-accent)', color:'white', display:'flex', gap:6, alignItems:'center' }}><Download size={16} /> {isExporting?'Exporting…':'Export to Anki'}</button>
        </div>
      </div>

      <div className="card">
        <label style={{ fontSize:'0.8em', fontWeight:600 }}>Mindmap to edit</label>
        <select value={selectedMindmapKey} onChange={e=>setSelectedMindmapKey(e.target.value)} style={{ width:'100%', padding:6, borderRadius:8, border:'1px solid var(--background-modifier-border)', marginTop:4 }}>
          <optgroup label="Surahs">{SURAHS.map(s=> <option key={`surah-${s.id}`} value={`surah-${s.id}`}>{s.id}. {s.arabicName} ({s.name})</option>)}</optgroup>
          <optgroup label="Parts & Meta"><option value="meta-0">Meta - Overview</option><option value="part-1">Part 1 - 1-5</option><option value="part-2">Part 2 - 6-9</option><option value="part-3">Part 3 - 10-24</option><option value="part-4">Part 4 - 25-33</option><option value="part-5">Part 5 - 34-49</option><option value="part-6">Part 6 - 50-66</option><option value="part-7">Part 7 - 67-114</option></optgroup>
        </select>

        <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
          {currentMindmap?.snapshot ? <button onClick={()=>setShowMindmapPreview(v=>!v)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid var(--background-modifier-border)' }}><Eye size={14} style={{ display:'inline', marginRight:4 }}/>{showMindmapPreview?'Hide':'View'}</button> : null}
          {currentMindmap?.snapshot ? <button onClick={()=>setShowDeleteConfirm(true)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid var(--text-error)', color:'var(--text-error)'}}><Trash2 size={14} style={{ display:'inline', marginRight:4 }}/>Delete</button> : null}
          <button onClick={()=>setShowMindmapEditor(true)} style={{ padding:'6px 10px', borderRadius:8, background:'var(--interactive-accent)', color:'white' }}><PenTool size={14} style={{ display:'inline', marginRight:4 }}/>{currentMindmap?.snapshot ? 'Edit Mindmap' : 'Create Mindmap'}</button>
        </div>

        {currentMindmap?.snapshot && showMindmapPreview && (
          <div style={{ marginTop:10, border:'1px solid var(--background-modifier-border)', borderRadius:8, overflow:'hidden', height:220 }}>
            <MindmapViewer snapshot={currentMindmap.snapshot} height="220px" />
          </div>
        )}

        {!isPartOrMeta && surah && (
          <div style={{ marginTop:12, borderTop:'1px solid var(--background-modifier-border)', paddingTop:8 }}>
            <h4 style={{ display:'flex', gap:6, alignItems:'center', fontSize:'0.9em' }}><Split size={14}/> Splits for {surah.arabicName} ({vc} verses)</h4>
            <p style={{ fontSize:'0.8em', opacity:0.7 }}>Tap + to split, × to merge. Saves per surah to vault, not giant JSON.</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:6 }}>
              {(showAllVerses ? Array.from({length:vc},(_,i)=>i+1) : Array.from({length:Math.min(vc,60)},(_,i)=>i+1)).map(v=>{
                const isBreak = builderState.breaks.includes(v);
                const isLast = v===vc;
                return (
                  <span key={v} style={{ display:'flex', gap:2, alignItems:'center' }}>
                    <span style={{ padding:'2px 6px', borderRadius:6, border:'1px solid '+(isBreak?'var(--interactive-accent)':'var(--background-modifier-border)'), fontSize:'0.8em' }}>{v}</span>
                    {!isLast && <button onClick={()=> isBreak ? handleRemoveBreak(v) : handleAddBreak(v)} style={{ width:22, height:22, borderRadius:11, border:'1px solid var(--background-modifier-border)', background: isBreak?'var(--interactive-accent)':'var(--background-secondary)', color: isBreak?'white':'var(--text-normal)', fontSize:'0.8em' }}>{isBreak?'×':'+'}</button>}
                  </span>
                );
              })}
              {vc>60 && !showAllVerses && <button onClick={()=>setShowAllVerses(true)} style={{ padding:'2px 6px', borderRadius:6, border:'1px dashed var(--background-modifier-border)', fontSize:'0.8em' }}>+{vc-60} more</button>}
              {showAllVerses && vc>60 && <button onClick={()=>setShowAllVerses(false)} style={{ padding:'2px 6px', borderRadius:6, border:'1px solid var(--background-modifier-border)', fontSize:'0.8em' }}>Show less</button>}
            </div>
            <div style={{ display:'flex', gap:6, marginTop:8 }}>
              <button onClick={handleSaveSplits} style={{ padding:'6px 10px', borderRadius:8, background:'var(--interactive-accent)', color:'white', display:'flex', gap:4, alignItems:'center', fontSize:'0.85em' }}><Save size={14}/>Save Splits</button>
              <span style={{ fontSize:'0.8em', opacity:0.6 }}>{builderState.anchors.length} groups</span>
            </div>
          </div>
        )}

        <div style={{ marginTop:12 }}>
          <label style={{ fontSize:'0.8em', fontWeight:600 }}>Notes for this mindmap (→ QuranLife/docs/{selectedMindmapKey}.md)</label>
          <textarea value={editingDocText} onChange={e=>setEditingDocText(e.target.value)} onBlur={handleDocSave} placeholder="Write meaning, connections… will be included in Anki cards" style={{ width:'100%', minHeight:80, padding:8, borderRadius:8, border:'1px solid var(--background-modifier-border)', marginTop:4 }} />
          <p style={{ fontSize:'0.75em', opacity:0.6 }}>Saved as markdown per file — editable directly in Obsidian, synced via Resilio.</p>
        </div>
      </div>

      {showMindmapEditor && (
        <div style={{ position:'fixed', inset:0, zIndex:100, background:'var(--background-primary)' }}>
          <MindmapEditor
            initialSnapshot={currentMindmap?.snapshot}
            surahId={isPartOrMeta ? undefined : selectedSurah}
            partId={isPartOrMeta ? Number(selectedMindmapKey.replace('part-','').replace('meta-','')) : undefined}
            onSave={async (snap)=>{ await handleSaveMindmap(snap); }}
            onClose={()=>setShowMindmapEditor(false)}
            title={displayTitle}
            vaultStore={vaultStore}
          />
        </div>
      )}

      {showDeleteConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:101 }}>
          <div style={{ background:'var(--background-primary)', padding:16, borderRadius:12, border:'1px solid var(--background-modifier-border)', minWidth:280 }}>
            <p style={{ fontWeight:600 }}>Delete mindmap for {displayTitle}?</p>
            <p style={{ fontSize:'0.85em', opacity:0.7 }}>Removes QuranLife/mindmaps/{selectedMindmapKey}.json and keeps tombstone.</p>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:12 }}>
              <button onClick={()=>setShowDeleteConfirm(false)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid var(--background-modifier-border)' }}>Cancel</button>
              <button onClick={handleDeleteMindmap} style={{ padding:'6px 10px', borderRadius:8, background:'var(--text-error)', color:'white' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position:'fixed', bottom:12, left:'50%', transform:'translateX(-50%)', background:'var(--background-secondary)', border:'1px solid var(--background-modifier-border)', padding:'6px 12px', borderRadius:8, fontSize:'0.85em' }}>{toast}</div>}
    </div>
  );
}
