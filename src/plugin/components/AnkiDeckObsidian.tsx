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
import { Save, Eye, Layers, PenTool, Split, Download, Trash2, Check, X, FileText, BarChart3, BookOpen } from 'lucide-react';
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
  const [showPreview, setShowPreview] = useState(true);
  const [showMindmapPreview, setShowMindmapPreview] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Progress popup inspired by obsidian-importer/src/progress-ui.ts (cloned at ./obsidian-importer) — shows status, bar (via --importer-progress), stats and log
  const [exportProgress, setExportProgress] = useState<null | { status: string; current: number; total: number; logs: string[]; verseCards?: number; mindmapCards?: number }>(null);
  const { mindmap: currentMindmap, save: saveMindmap, remove: deleteMindmap, isLoading: isMindmapLoading } = useVaultMindmap(vaultStore, selectedMindmapKey);
  const { mindmaps: allMindmaps } = useVaultMindmaps(vaultStore);
  const { anchors: vaultAnchors, saveAnchors } = useVaultSplits(vaultStore, selectedSurah);
  const { content: docContent, save: saveDoc } = useVaultDoc(vaultStore, selectedMindmapKey);
  const [localAnchors, setLocalAnchors] = useState<AnkiAnchor[]>([]);
  const [editingDocText, setEditingDocText] = useState('');
  const [showStatsDetails, setShowStatsDetails] = useState(false);
  const [allSplitsForStats, setAllSplitsForStats] = useState<Record<number, AnkiAnchor[]>>({});
  const [allDocsForStats, setAllDocsForStats] = useState<Record<string, string>>({});

  useEffect(() => { setEditingDocText(docContent); }, [docContent]);
  useEffect(() => { if (vaultAnchors.length) setLocalAnchors(vaultAnchors); else setLocalAnchors(ensureDefaultSplits(selectedSurah)); }, [vaultAnchors, selectedSurah]);

  // Load all splits/docs for Deck Statistics
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const splits: Record<number, AnkiAnchor[]> = {};
      for (let sid=1; sid<=114; sid++) {
        const arr = await vaultStore.loadSplitsForSurah(sid);
        if (arr && arr.length) splits[sid] = arr as AnkiAnchor[];
      }
      const docs: Record<string, string> = {};
      for (const key of Object.keys(allMindmaps)) {
        const d = await vaultStore.loadDoc(key);
        if (typeof d === 'string' && d.trim()) docs[key] = d;
      }
      if (editingDocText.trim() && !docs[selectedMindmapKey]) docs[selectedMindmapKey] = editingDocText;
      if (!cancelled) {
        setAllSplitsForStats(splits);
        setAllDocsForStats(docs);
      }
    })();
    return () => { cancelled = true; };
  }, [vaultStore, allMindmaps, editingDocText, selectedMindmapKey]);

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
    showToast(`Saved ${localAnchors.length} groups for Surah ${selectedSurah}`);
  };

  const handleSaveMindmap = async (snapshot: any) => {
    await saveMindmap({ snapshot, isComplete: true });
    setShowMindmapEditor(false);
    showToast(`Mindmap saved → mindmaps/${selectedMindmapKey}.json`);
  };

  const handleDeleteMindmap = async () => {
    await deleteMindmap();
    setShowDeleteConfirm(false);
    setShowMindmapPreview(false);
    showToast('Mindmap deleted');
  };

  const handleDocSave = async () => {
    await saveDoc(editingDocText);
    showToast('Notes saved');
  };

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportProgress({ status: 'Preparing export…', current: 0, total: 100, logs: ['Starting export...'] });
    const updateProgress = (patch: Partial<{ status: string; current: number; logs: string[]; verseCards: number; mindmapCards: number }>) => {
      setExportProgress(prev => prev ? { ...prev, ...patch, logs: patch.logs ?? prev.logs } : null);
    };
    const pushLog = (msg: string) => setExportProgress(prev => prev ? { ...prev, logs: [...prev.logs, msg] } : null);
    try {
      updateProgress({ status: 'Loading verses…', current: 3 });
      let versesForExport = allVerses;
      if (!versesForExport.length) { try { versesForExport = await getQuranVerses(); setAllVerses(versesForExport); pushLog(`Loaded ${versesForExport.length} verses`); } catch {} }
      else pushLog(`Verses cached: ${versesForExport.length}`);

      updateProgress({ status: 'Loading splits (1/114)…', current: 5 });
      const fullSplits: Record<number, AnkiAnchor[]> = {};
      for (let sid=1; sid<=114; sid++) {
        const arr = await vaultStore.loadSplitsForSurah(sid);
        if (arr && arr.length) fullSplits[sid] = arr as AnkiAnchor[];
        if (sid % 20 === 0 || sid === 114) {
          updateProgress({ current: 5 + Math.round((sid/114)*25), status: `Loading splits ${sid}/114…` });
          // allow UI to repaint
          await new Promise(r => setTimeout(r, 0));
        }
      }
      if (!fullSplits[selectedSurah] && localAnchors.length) fullSplits[selectedSurah] = localAnchors;
      pushLog(`Loaded splits for ${Object.keys(fullSplits).length} surahs`);
      updateProgress({ current: 32, status: 'Ensuring short surahs…' });
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
      updateProgress({ current: 35, status: 'Collecting notes…' });
      const allAnchors: AnkiAnchor[] = [];
      Object.values(fullSplits).forEach(arr => allAnchors.push(...arr));
      const filteredAnchors = allAnchors.filter(a => mindmapKeys.has(`surah-${a.surahId}`));
      pushLog(`Filtered to ${filteredAnchors.length} groups linked to mindmaps`);
      const docsMap: Record<string, string> = {};
      const docKeys = Object.keys(allMindmaps);
      for (let i=0;i<docKeys.length;i++) {
        const key = docKeys[i];
        const d = await vaultStore.loadDoc(key);
        if (typeof d === 'string' && d.trim()) docsMap[key] = d;
        if (i % 10 === 0) updateProgress({ current: 35 + Math.round(((i+1)/Math.max(1,docKeys.length))*10), status: `Loading notes ${i+1}/${docKeys.length}…` });
      }
      if (editingDocText.trim() && !docsMap[selectedMindmapKey]) docsMap[selectedMindmapKey] = editingDocText;
      updateProgress({ current: 48, status: 'Building cards…' });
      const mindmapCards = buildMindmapCards(allMindmaps as any, docsMap);
      if (filteredAnchors.length===0 && mindmapCards.length===0) {
        showToast('No mindmap-linked surah to export — create a mindmap first');
        setExportProgress(null);
        setIsExporting(false);
        return;
      }
      const cards = buildAnkiCards(filteredAnchors, versesForExport, { mindmapDocsMap: docsMap });
      pushLog(`Built ${cards.length} verse cards + ${mindmapCards.length} mindmap cards`);
      updateProgress({ current: 60, status: `Rendering mindmaps & packaging…`, verseCards: cards.length, mindmapCards: mindmapCards.length });
      // generateApkgBlob reports 0-100 for its internal phases (mindmap media 5-80), map to 60-96
      const blob = await generateApkgBlob(cards, deckName, (p)=> {
        const mapped = 60 + Math.round((p/100)*35);
        setExportProgress(prev => prev ? { ...prev, current: Math.min(96, mapped), status: p < 80 ? `Rendering mindmaps ${p}%…` : `Packaging ${p}%…` } : null);
      }, mindmapCards, allMindmaps);
      updateProgress({ current: 98, status: 'Finalizing download…' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.download='quran-life-deck.apkg'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      updateProgress({ current: 100, status: `Complete: ${cards.length} verse + ${mindmapCards.length} mindmap cards`, verseCards: cards.length, mindmapCards: mindmapCards.length });
      pushLog(`Download started: ${deckName}.apkg`);
      showToast(`Exported ${cards.length} verse cards + ${mindmapCards.length} mindmap cards`);
      // keep progress visible briefly then auto-close if user doesn't click Done
      setTimeout(() => {
        setExportProgress(prev => prev && prev.current === 100 ? null : prev);
        setIsExporting(false);
      }, 2200);
      return;
    } catch (e) { console.error(e); showToast('Export failed'); setExportProgress(prev => prev ? { ...prev, status: 'Failed — see console', logs: [...prev.logs, String((e as any)?.message || e)] } : null); setTimeout(()=>{ setExportProgress(null); }, 2500); }
    finally {
      // if already set to 100, let timeout close; otherwise ensure closed
      setTimeout(()=>{ setExportProgress(prev => (prev && prev.current < 100 ? null : prev)); }, 3000);
      setIsExporting(false);
    }
  };

  if (!isVersesLoaded) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'30vh', flexDirection:'column', gap:10, padding:24 }}>
      <div style={{ width:24, height:24, border:'3px solid var(--background-modifier-border)', borderTopColor:'var(--interactive-accent)', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      <span style={{ fontSize:'0.85em', color:'var(--text-muted)' }}>Loading verses…</span>
    </div>
  );

  const displayTitle = isPartOrMeta ? (selectedMindmapKey==='meta-0' ? 'Meta Overview' : `Part ${selectedMindmapKey.replace('part-','')}`) : `${surah?.arabicName} • Surah ${selectedSurah}`;
  const vc = surah?.verseCount || 0;

  const cardBase: React.CSSProperties = {
    border: '1px solid var(--background-modifier-border)',
    borderRadius: 12,
    background: 'var(--background-primary)',
    padding: 16,
  };

  return (
    <div style={{ padding:'16px', maxWidth:720, margin:'0 auto', display:'flex', flexDirection:'column', gap:16, color:'var(--text-normal)' }}>
      {/* Header */}
      <div style={{ display:'flex', flexDirection:'column', gap:6, paddingBottom:12, borderBottom:'1px solid var(--background-modifier-border)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:32, height:32, borderRadius:8, background:'var(--interactive-accent)', color:'var(--text-on-accent)' }}>
            <Layers size={18} />
          </span>
          <h2 style={{ margin:0, fontSize:'1.35em', fontWeight:700, letterSpacing:'-0.01em' }}>Anki Deck</h2>
          <span style={{ marginLeft:'auto', display:'inline-flex', alignItems:'center', gap:6, padding:'4px 8px', borderRadius:999, background:'var(--background-modifier-border)', fontSize:'0.72em', fontWeight:600, color:'var(--text-muted)' }}>
            Vault-synced
          </span>
        </div>

      </div>

      {/* Export Card — matching Daily Portion accent */}
      <div style={{ ...cardBase, borderLeft:'3px solid var(--interactive-accent)', display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 8px', borderRadius:6, background:'color-mix(in srgb, var(--interactive-accent) 14%, transparent)', color:'var(--interactive-accent)', fontSize:'0.72em', fontWeight:700, letterSpacing:'0.02em', border:'1px solid color-mix(in srgb, var(--interactive-accent) 22%, transparent)' }}>
            <Download size={12} /> EXPORT
          </span>
          <span style={{ fontSize:'0.78em', color:'var(--text-faint)' }}>Generate .apkg for Anki</span>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input value={deckName} onChange={e=>setDeckName(e.target.value)} placeholder="QuranLife::Review" style={{ flex:1, padding:'8px 10px', borderRadius:8, border:'1px solid var(--background-modifier-border)', background:'var(--background-secondary)', color:'var(--text-normal)', fontSize:'0.9em' }} />
          <button onClick={handleExport} disabled={isExporting} style={{ padding:'8px 14px', borderRadius:8, background:'var(--interactive-accent)', color:'var(--text-on-accent)', border:'none', display:'inline-flex', gap:6, alignItems:'center', cursor:'pointer', fontWeight:600, fontSize:'0.9em', opacity:isExporting?0.7:1 }}>
            <Download size={16} /> {isExporting?'Exporting…':'Export to Anki'}
          </button>
        </div>

      </div>

      {/* Mindmap Selector & Actions — matching Daily tone */}
      <div style={{ ...cardBase, borderLeft:'3px solid var(--interactive-accent)', display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          <label style={{ fontSize:'0.78em', fontWeight:700, color:'var(--text-muted)', letterSpacing:'0.03em', textTransform:'uppercase' }}>Mindmap to edit</label>
          <select value={selectedMindmapKey} onChange={e=>setSelectedMindmapKey(e.target.value)} className="dropdown" style={{ width:'100%', padding:'10px 12px', minHeight:'40px', lineHeight:'1.4', borderRadius:8, border:'1px solid var(--background-modifier-border)', background:'var(--background-secondary)', color:'var(--text-normal)', fontSize:'0.9em' }}>
            <optgroup label="Surahs">{SURAHS.map(s=> <option key={`surah-${s.id}`} value={`surah-${s.id}`}>{s.id}. {s.arabicName} ({s.name})</option>)}</optgroup>
            <optgroup label="Parts & Meta"><option value="meta-0">Meta • Overview</option><option value="part-1">Part 1 • 1-5</option><option value="part-2">Part 2 • 6-9</option><option value="part-3">Part 3 • 10-24</option><option value="part-4">Part 4 • 25-33</option><option value="part-5">Part 5 • 34-49</option><option value="part-6">Part 6 • 50-66</option><option value="part-7">Part 7 • 67-114</option></optgroup>
          </select>

        </div>

        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {currentMindmap?.snapshot ? <button onClick={()=>setShowMindmapPreview(v=>!v)} style={{ padding:'7px 12px', borderRadius:8, border:'1px solid var(--background-modifier-border)', background:'var(--background-secondary)', color:'var(--text-normal)', display:'inline-flex', gap:6, alignItems:'center', cursor:'pointer', fontSize:'0.85em' }}><Eye size={14}/>{showMindmapPreview?'Hide preview':'View'}</button> : null}
          {currentMindmap?.snapshot ? <button onClick={()=>setShowDeleteConfirm(true)} style={{ padding:'7px 12px', borderRadius:8, border:'1px solid var(--text-error)', color:'var(--text-error)', background:'var(--background-secondary)', display:'inline-flex', gap:6, alignItems:'center', cursor:'pointer', fontSize:'0.85em' }}><Trash2 size={14}/>Delete</button> : null}
          <button onClick={()=>setShowMindmapEditor(true)} style={{ padding:'7px 14px', borderRadius:8, background:'var(--interactive-accent)', color:'var(--text-on-accent)', border:'none', display:'inline-flex', gap:6, alignItems:'center', cursor:'pointer', fontWeight:600, fontSize:'0.85em', marginLeft:'auto' }}><PenTool size={14}/>{currentMindmap?.snapshot ? 'Edit Mindmap' : 'Create Mindmap'}</button>
        </div>

        {currentMindmap?.snapshot && showMindmapPreview && (
          <div style={{ border:'1px solid var(--background-modifier-border)', borderRadius:10, overflow:'hidden', background:'var(--background-secondary)' }}>
            <MindmapViewer snapshot={currentMindmap.snapshot} height="220px" />
          </div>
        )}

        {!isPartOrMeta && surah && (
          <div style={{ display:'flex', flexDirection:'column', gap:8, paddingTop:12, borderTop:'1px solid var(--background-modifier-border)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 8px', borderRadius:6, background:'color-mix(in srgb, var(--interactive-accent) 14%, transparent)', color:'var(--interactive-accent)', fontSize:'0.72em', fontWeight:700, border:'1px solid color-mix(in srgb, var(--interactive-accent) 22%, transparent)' }}>
                <Split size={12}/> SPLITS
              </span>
              <span style={{ fontSize:'0.78em', color:'var(--text-muted)' }}>for {surah.arabicName} ({vc} verses)</span>
              <span style={{ marginLeft:'auto', fontSize:'0.74em', color:'var(--text-faint)' }}>{builderState.anchors.length} groups</span>
            </div>

            <div style={{ display:'flex', gap:12, alignItems: showPreview ? 'flex-start' : 'stretch' }}>
              <div style={{ flex: showPreview ? '1 1 70%' : '1 1 100%', display:'flex', flexDirection:'column', gap:8, minWidth:0 }}>
                <div style={{ display:'flex', flexWrap:'wrap', gap:4, padding:'8px', border:'1px solid var(--background-modifier-border)', borderRadius:8, background:'var(--background-secondary)' }}>
                  {(showAllVerses ? Array.from({length:vc},(_,i)=>i+1) : Array.from({length:Math.min(vc,60)},(_,i)=>i+1)).map(v=>{
                    const isBreak = builderState.breaks.includes(v);
                    const isLast = v===vc;
                    return (
                      <span key={v} style={{ display:'inline-flex', gap:2, alignItems:'center' }}>
                        <span style={{ padding:'3px 7px', borderRadius:6, border:'1px solid '+(isBreak?'var(--interactive-accent)':'var(--background-modifier-border)'), background: isBreak ? 'var(--interactive-accent)' : 'var(--background-primary)', color: isBreak ? 'var(--text-on-accent)' : 'var(--text-normal)', fontSize:'0.8em', fontWeight: isBreak ? 700 : 500 }}>{v}</span>
                        {!isLast && <button onClick={()=> isBreak ? handleRemoveBreak(v) : handleAddBreak(v)} style={{ width:22, height:22, borderRadius:999, border:'1px solid var(--background-modifier-border)', background: isBreak?'var(--interactive-accent)':'var(--background-primary)', color: isBreak?'var(--text-on-accent)':'var(--text-muted)', fontSize:'0.8em', display:'inline-flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontWeight:700 }}>{isBreak?'×':'+'}</button>}
                      </span>
                    );
                  })}
                  {vc>60 && !showAllVerses && <button onClick={()=>setShowAllVerses(true)} style={{ padding:'4px 8px', borderRadius:6, border:'1px dashed var(--background-modifier-border)', background:'var(--background-primary)', color:'var(--text-muted)', fontSize:'0.8em', cursor:'pointer' }}>+{vc-60} more</button>}
                  {showAllVerses && vc>60 && <button onClick={()=>setShowAllVerses(false)} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid var(--background-modifier-border)', background:'var(--background-primary)', fontSize:'0.8em', cursor:'pointer' }}>Show less</button>}
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <button onClick={handleSaveSplits} style={{ padding:'7px 12px', borderRadius:8, background:'var(--interactive-accent)', color:'var(--text-on-accent)', border:'none', display:'inline-flex', gap:6, alignItems:'center', cursor:'pointer', fontWeight:600, fontSize:'0.85em' }}><Save size={14}/>Save</button>
                  <button onClick={()=>setShowPreview(v=>!v)} style={{ padding:'7px 12px', borderRadius:8, border:'1px solid var(--background-modifier-border)', background:'var(--background-primary)', color:'var(--text-muted)', display:'inline-flex', gap:6, alignItems:'center', cursor:'pointer', fontSize:'0.85em' }}><Eye size={14}/>{showPreview ? 'Hide' : 'Preview'}</button>
                </div>
              </div>
              {showPreview && (
                <div style={{ flex:'0 0 30%', maxHeight:220, overflowY:'auto', border:'1px solid var(--background-modifier-border)', borderRadius:8, padding:'8px', background:'var(--background-primary)', display:'flex', flexDirection:'column', gap:6, alignSelf:'stretch' }}>
                  {builderState.anchors.length === 0 ? (
                    <div style={{ fontSize:'0.8em', color:'var(--text-faint)', textAlign:'center', padding:'8px 0' }}>No groups</div>
                  ) : builderState.anchors.map((a,i)=>(
                    <div key={a.id} style={{ fontSize:'0.8em', lineHeight:1.4, padding:'6px 8px', borderRadius:6, background: i%2===0 ? 'var(--background-secondary)' : 'var(--background-primary)', border:'1px solid var(--background-modifier-border)' }}>
                      <span style={{ fontWeight:700, color:'var(--interactive-accent)' }}>{a.startVerse}-{a.endVerse}</span>
                      <span style={{ color:'var(--text-muted)', marginLeft:6 }}>{a.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

          <div style={{ display:'flex', flexDirection:'column', gap:6, paddingTop:12, borderTop:'1px solid var(--background-modifier-border)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 8px', borderRadius:6, background:'var(--background-modifier-border)', color:'var(--text-muted)', fontSize:'0.72em', fontWeight:700, letterSpacing:'0.02em' }}>
                <FileText size={12}/> NOTES
              </span>
            </div>
            <textarea value={editingDocText} onChange={e=>setEditingDocText(e.target.value)} onBlur={handleDocSave} placeholder="Notes…" style={{ width:'100%', minHeight:90, padding:'10px', borderRadius:8, border:'1px solid var(--background-modifier-border)', background:'var(--background-secondary)', color:'var(--text-normal)', fontSize:'0.9em', lineHeight:1.5, resize:'vertical' }} />
          </div>
      </div>

      {/* Deck Statistics — matching Daily tone */}
      {(() => {
        const surahMindmapCount = Object.keys(allMindmaps).filter(k => k.startsWith('surah-') && (allMindmaps as any)[k]?.snapshot).length;
        const partMetaCount = Object.keys(allMindmaps).filter(k => (k.startsWith('part-') || k.startsWith('meta-')) && (allMindmaps as any)[k]?.snapshot).length;
        const totalVerseGroups = SURAHS.reduce((acc, s) => {
          const hasMM = !!(allMindmaps as any)[`surah-${s.id}`]?.snapshot;
          if (!hasMM) return acc;
          const groups = (allSplitsForStats as any)[s.id]?.length;
          return acc + (groups && groups > 0 ? groups : 1);
        }, 0);
        const docsWithContent = Object.keys(allDocsForStats).filter(k => {
          const v = (allDocsForStats as any)[k];
          return typeof v === 'string' && v.trim().length > 0 && !v.includes('_Not added yet._');
        }).length;
        const docsTotal = Object.keys(allDocsForStats).filter(k => typeof (allDocsForStats as any)[k] === 'string' && (allDocsForStats as any)[k].trim().length > 0).length;
        return (
          <div style={{ ...cardBase, borderLeft:'3px solid var(--interactive-accent)', display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ display:'inline-flex', gap:6, alignItems:'center', fontSize:'0.95em', fontWeight:700 }}><BarChart3 size={16} style={{ color:'var(--interactive-accent)' }} /> Deck Statistics</span>
              <button onClick={()=>setShowStatsDetails(v=>!v)} style={{ padding:'5px 10px', borderRadius:8, border:'1px solid var(--background-modifier-border)', background:'var(--background-secondary)', color:'var(--text-normal)', fontSize:'0.8em', cursor:'pointer' }}>{showStatsDetails ? 'Hide details' : 'Show details'}</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(110px, 1fr))', gap:8 }}>
              {[
                { val: `${surahMindmapCount}/114`, label: 'Surahs with mindmap' },
                { val: `${partMetaCount}/8`, label: 'Parts/Meta' },
                { val: `${totalVerseGroups}`, label: 'Verse groups' },
                { val: `${docsWithContent}/${docsTotal}`, label: 'Docs with notes' },
              ].map(card=>(
                <div key={card.label} style={{ padding:'12px 8px', borderRadius:10, background:'var(--background-secondary)', border:'1px solid var(--background-modifier-border)', textAlign:'center' }}>
                  <div style={{ fontWeight:800, fontSize:'1.15em', color:'var(--text-normal)' }}>{card.val}</div>
                  <div style={{ fontSize:'0.72em', color:'var(--text-muted)', fontWeight:600, letterSpacing:'0.02em', textTransform:'uppercase', marginTop:2 }}>{card.label}</div>
                </div>
              ))}
            </div>
            {showStatsDetails && (
              <div style={{ borderTop:'1px solid var(--background-modifier-border)', paddingTop:10, display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ fontSize:'0.85em', fontWeight:700 }}>Surahs 1-114</div>
                <div style={{ maxHeight:280, overflow:'auto', border:'1px solid var(--background-modifier-border)', borderRadius:8, background:'var(--background-secondary)' }}>
                  <table style={{ width:'100%', fontSize:'0.8em', borderCollapse:'collapse' }}>
                    <thead style={{ position:'sticky', top:0, background:'var(--background-secondary)', borderBottom:'1px solid var(--background-modifier-border)', zIndex:1 }}>
                      <tr><th style={{ textAlign:'left', padding:'8px', color:'var(--text-muted)', fontWeight:700 }}>Surah</th><th style={{ padding:'8px', color:'var(--text-muted)' }}>Mindmap</th><th style={{ padding:'8px', color:'var(--text-muted)' }}>Groups</th><th style={{ padding:'8px', color:'var(--text-muted)' }}>Docs</th></tr>
                    </thead>
                    <tbody>
                      {SURAHS.map(s=>{
                        const key=`surah-${s.id}`;
                        const hasMM=!!(allMindmaps as any)[key]?.snapshot;
                        const groups=hasMM ? ((allSplitsForStats as any)[s.id]?.length ?? 1) : 0;
                        const doc=(allDocsForStats as any)[key] as string | undefined;
                        const hasDoc=typeof doc==='string' && doc.trim().length>0;
                        const isPlaceholder=hasDoc && doc.includes('_Not added yet._');
                        return (
                          <tr key={s.id} style={{ borderTop:'1px solid var(--background-modifier-border)', background: hasMM ? 'var(--background-primary)' : 'transparent' }}>
                            <td style={{ padding:'7px 8px' }}><b style={{ color:'var(--text-normal)' }}>{s.id}.</b> {s.arabicName} <span style={{ color:'var(--text-faint)', fontSize:'0.85em' }}>({s.name})</span></td>
                            <td style={{ padding:'7px 8px', textAlign:'center' }}>{hasMM ? <Check size={14} style={{ color:'var(--interactive-accent)', display:'inline' }} /> : <X size={14} style={{ display:'inline', opacity:0.3 }} />}</td>
                            <td style={{ padding:'7px 8px', textAlign:'center' }}>{hasMM ? <span style={{ padding:'2px 7px', borderRadius:999, background:'var(--interactive-accent)', color:'var(--text-on-accent)', fontWeight:700, fontSize:'0.78em' }}>{groups}</span> : <span style={{ opacity:0.3 }}>—</span>}</td>
                            <td style={{ padding:'7px 8px', textAlign:'center' }}>{!hasDoc ? <X size={14} style={{ display:'inline', opacity:0.3 }} /> : isPlaceholder ? <span style={{ color:'var(--text-warning)' }}><FileText size={12} style={{ display:'inline' }} />•</span> : <Check size={14} style={{ color:'var(--interactive-accent)', display:'inline' }} />}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })()}

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
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:101, padding:16 }}>
          <div style={{ background:'var(--background-primary)', padding:20, borderRadius:12, border:'1px solid var(--background-modifier-border)', minWidth:300, maxWidth:400, boxShadow:'0 8px 24px rgba(0,0,0,0.2)' }}>
            <p style={{ fontWeight:700, margin:'0 0 6px 0' }}>Delete mindmap for {displayTitle}?</p>
            <p style={{ fontSize:'0.85em', color:'var(--text-muted)', margin:0 }}>Removes <code style={{ background:'var(--background-secondary)', padding:'1px 4px', borderRadius:4, border:'1px solid var(--background-modifier-border)' }}>mindmaps/{selectedMindmapKey}.json</code> and keeps tombstone.</p>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
              <button onClick={()=>setShowDeleteConfirm(false)} style={{ padding:'7px 12px', borderRadius:8, border:'1px solid var(--background-modifier-border)', background:'var(--background-secondary)', cursor:'pointer' }}>Cancel</button>
              <button onClick={handleDeleteMindmap} style={{ padding:'7px 14px', borderRadius:8, background:'var(--text-error)', color:'white', border:'none', cursor:'pointer', fontWeight:600 }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Export progress popup — mirrors obsidian-importer/src/progress-ui.ts (SettingGroup + progress bar + stats + log) */}
      {exportProgress && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:16 }}>
          <div style={{ background:'var(--background-primary)', border:'1px solid var(--background-modifier-border)', borderRadius:12, width:'100%', maxWidth:520, maxHeight:'85vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 12px 32px rgba(0,0,0,0.22)' }}>
            <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid var(--background-modifier-border)', display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:28, height:28, borderRadius:8, background:'var(--interactive-accent)', color:'var(--text-on-accent)' }}><Download size={14} /></span>
                <span style={{ fontWeight:700, fontSize:'1em' }}>Exporting Anki Deck</span>
                <span style={{ marginLeft:'auto', fontSize:'0.75em', color:'var(--text-muted)', fontVariantNumeric:'tabular-nums' }}>{exportProgress.current}%</span>
              </div>
              <div className="setting-item-description" style={{ fontSize:'0.85em', color:'var(--text-muted)', fontWeight:500 }}>{exportProgress.status}</div>
              {/* progress bar — same structure as importer: .importer-progress-bar + .importer-progress-bar-inner with --importer-progress */}
              <div className="importer-progress-bar" style={{ width:'100%', height:8, background:'var(--background-secondary)', borderRadius:999, overflow:'hidden', boxShadow:'inset 0 0 0 1px var(--background-modifier-border)' } as React.CSSProperties & Record<string,string>}>
                <div className="importer-progress-bar-inner" style={{ width: `${exportProgress.current}%`, height:'100%', background:'var(--interactive-accent)', transition:'width 0.25s ease', borderRadius:999 }} />
              </div>
              {/* stats — like importer-stats-container */}
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <div style={{ flex:'1 1 90px', textAlign:'center', padding:'8px 6px', background:'var(--background-secondary)', border:'1px solid var(--background-modifier-border)', borderRadius:8 }}>
                  <div style={{ fontWeight:800, fontSize:'1.05em', fontVariantNumeric:'tabular-nums' }}>{exportProgress.verseCards ?? '—'}</div>
                  <div style={{ fontSize:'0.68em', color:'var(--text-muted)', fontWeight:600, letterSpacing:'0.03em', textTransform:'uppercase' }}>Verse cards</div>
                </div>
                <div style={{ flex:'1 1 90px', textAlign:'center', padding:'8px 6px', background:'var(--background-secondary)', border:'1px solid var(--background-modifier-border)', borderRadius:8 }}>
                  <div style={{ fontWeight:800, fontSize:'1.05em', fontVariantNumeric:'tabular-nums' }}>{exportProgress.mindmapCards ?? '—'}</div>
                  <div style={{ fontSize:'0.68em', color:'var(--text-muted)', fontWeight:600, letterSpacing:'0.03em', textTransform:'uppercase' }}>Mindmaps</div>
                </div>
                <div style={{ flex:'1 1 90px', textAlign:'center', padding:'8px 6px', background:'var(--background-secondary)', border:'1px solid var(--background-modifier-border)', borderRadius:8 }}>
                  <div style={{ fontWeight:800, fontSize:'1.05em', fontVariantNumeric:'tabular-nums' }}>{exportProgress.current}/{exportProgress.total}</div>
                  <div style={{ fontSize:'0.68em', color:'var(--text-muted)', fontWeight:600, letterSpacing:'0.03em', textTransform:'uppercase' }}>Progress</div>
                </div>
                <div style={{ flex:'1 1 90px', textAlign:'center', padding:'8px 6px', background:'var(--background-secondary)', border:'1px solid var(--background-modifier-border)', borderRadius:8 }}>
                  <div style={{ fontWeight:800, fontSize:'1.05em', fontVariantNumeric:'tabular-nums' }}>{exportProgress.logs.length}</div>
                  <div style={{ fontSize:'0.68em', color:'var(--text-muted)', fontWeight:600, letterSpacing:'0.03em', textTransform:'uppercase' }}>Steps</div>
                </div>
              </div>
            </div>
            {/* log — like importer-log */}
            <div style={{ flex:1, overflow:'auto', padding:'10px 16px', fontFamily:'var(--font-monospace)', fontSize:'0.75em', color:'var(--text-muted)', background:'var(--background-secondary)', minHeight:80, maxHeight:160 }}>
              {exportProgress.logs.map((l,i) => (
                <div key={i} style={{ padding:'2px 0', borderBottom: i < exportProgress.logs.length-1 ? '1px solid var(--background-modifier-border)' : 'none' }}>• {l}</div>
              ))}
              {exportProgress.current < 100 && <div style={{ marginTop:6, fontStyle:'italic', opacity:0.7 }}>Working…</div>}
              {exportProgress.current >= 100 && <div style={{ marginTop:8, color:'var(--interactive-accent)', fontWeight:600 }}>✓ Done — download should have started</div>}
            </div>
            <div style={{ padding:'12px 16px', borderTop:'1px solid var(--background-modifier-border)', display:'flex', justifyContent:'flex-end', gap:8, background:'var(--background-primary)' }}>
              {exportProgress.current >= 100 ? (
                <button onClick={()=>{ setExportProgress(null); setIsExporting(false); }} style={{ padding:'7px 14px', borderRadius:8, background:'var(--interactive-accent)', color:'var(--text-on-accent)', border:'none', cursor:'pointer', fontWeight:600 }}>Done</button>
              ) : (
                <button disabled style={{ padding:'7px 14px', borderRadius:8, border:'1px solid var(--background-modifier-border)', background:'var(--background-secondary)', color:'var(--text-muted)', fontSize:'0.85em' }}>Exporting… {exportProgress.current}%</button>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position:'fixed', bottom:14, left:'50%', transform:'translateX(-50%)', background:'var(--background-secondary)', border:'1px solid var(--background-modifier-border)', padding:'8px 14px', borderRadius:10, fontSize:'0.86em', boxShadow:'0 4px 12px rgba(0,0,0,0.12)', display:'flex', alignItems:'center', gap:6, zIndex:50 }}>{toast}</div>}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
