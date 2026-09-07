'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { getQuranVerses, getSurah, SURAHS } from '@/lib/quranData';
import { buildAnkiCards } from '@/lib/anki/cardBuilder';
import { generateApkgBlob } from '@/lib/anki/apkgExport';
import { loadSplits, saveSplits, getSplitsForSurah, setSplitsForSurah, importSplitsFromBackup, ensureDefaultSplits } from '@/lib/anki/splitStore';
import { loadAnkiMindmaps, saveAnkiMindmap, saveAnkiMindmapByKey, getAnkiMindmap, getAnkiMindmapByKey } from '@/lib/anki/mindmapStore';
import { loadMindmapDocs, saveMindmapDoc } from '@/lib/anki/mindmapDocsStore';
import { AnkiAnchor } from '@/lib/anki/types';
import type { Verse } from '@/lib/types';
import { Save, Eye, FileJson, Layers, PenTool, Split, Image as ImageIcon, Download, Upload } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { useTheme } from '@/components/ThemeProvider';

const MindmapEditor = dynamic(() => import('@/components/MindmapEditor'), { ssr: false });
const MindmapViewer = dynamic(() => import('@/components/MindmapViewer'), { ssr: false });
const SplitsModal = dynamic(() => import('@/components/todo/SplitsModal'), { ssr: false });

export default function AnkiDeckTab() {
  const [allVerses, setAllVerses] = useState<Verse[]>([]);
  const [isVersesLoaded, setIsVersesLoaded] = useState(false);
  const [selectedSurah, setSelectedSurah] = useState<number>(2);
  const [splits, setSplits] = useState<Record<number, AnkiAnchor[]>>({});
  const [anchors, setAnchors] = useState<AnkiAnchor[]>([]);
  const [deckName, setDeckName] = useState('QuranLife::Review');
  const [isExporting, setIsExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [exportMode, setExportMode] = useState<'all' | 'single'>('single');
  const [mindmaps, setMindmaps] = useState<Record<string, any>>({});
  const [showMindmapEditor, setShowMindmapEditor] = useState(false);
  const [showMindmapViewer, setShowMindmapViewer] = useState(false);
  const [viewerData, setViewerData] = useState<{ snapshot: any; title: string } | null>(null);
  const [showSplitsModal, setShowSplitsModal] = useState(false);
  const [selectedPart, setSelectedPart] = useState<number>(1);
  const [selectedCluster, setSelectedCluster] = useState<number>(1);
  const [showPartEditor, setShowPartEditor] = useState(false);
  const [showClusterEditor, setShowClusterEditor] = useState(false);
  const [mindmapDocs, setMindmapDocs] = useState<Record<string, string>>({});
  const [editingDocKey, setEditingDocKey] = useState<string | null>(null);
  const [editingDocText, setEditingDocText] = useState('');
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const verses = await getQuranVerses();
        if (!cancelled) setAllVerses(verses);
      } catch {
        if (!cancelled) setAllVerses([]);
      } finally {
        if (!cancelled) setIsVersesLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const loaded = loadSplits();
    setSplits(loaded);
    const mm = loadAnkiMindmaps();
    setMindmaps(mm as any);
    setMindmapDocs(loadMindmapDocs());
  }, []);

  useEffect(() => {
    const current = getSplitsForSurah(selectedSurah, splits);
    if (current.length > 0) setAnchors(current);
    else setAnchors(ensureDefaultSplits(selectedSurah));
  }, [selectedSurah, splits]);

  const surah = getSurah(selectedSurah);
  const currentMindmap = (mindmaps as any)[`surah-${selectedSurah}`] as any;
  const currentPartKey = `part-${selectedPart}`;
  const currentPartMindmap = (mindmaps as any)[currentPartKey] as any;
  const currentMetaKey = `meta-0`;
  const currentMetaMindmap = (mindmaps as any)[currentMetaKey] as any || (mindmaps as any)[`part-0`] as any;
  const currentClusterKey = `cluster-${selectedCluster}`;
  const currentClusterMindmap = (mindmaps as any)[currentClusterKey] as any;
  const builderState = useMemo(() => {
    const sorted = [...anchors].sort((a, b) => a.startVerse - b.startVerse);
    const breaks = sorted.slice(0, -1).map(a => a.endVerse);
    const labels: Record<number, string> = {};
    sorted.forEach(a => { labels[a.endVerse] = a.label; });
    return { breaks, labels };
  }, [anchors]);
  const getDocKey = (k: string) => k;
  const getDocForKey = (k: string) => (mindmapDocs as any)[k] || '';
  const totalCardsPreview = useMemo(() => {
    if (!allVerses.length) return 0;
    const cards = buildAnkiCards(anchors, allVerses);
    return cards.length;
  }, [anchors, allVerses]);

  const allCardsCount = useMemo(() => {
    if (!allVerses.length) return 0;
    let count = 0;
    Object.entries(splits).forEach(([k, arr]) => {
      const sId = Number(k);
      if (!Number.isFinite(sId)) return;
      // only count if anchors valid
      count += arr.length;
    });
    // also include short surahs with auto splits if not in splits
    SURAHS.forEach(s => {
      if (s.verseCount <= 10 && !splits[s.id]) count += 1;
    });
    return count;
  }, [splits, allVerses]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = () => {
    const next = setSplitsForSurah(selectedSurah, anchors, splits);
    setSplits(next);
    showToast(`Saved ${anchors.length} anchor(s) for Surah ${selectedSurah}`);
  };

  const handleAddAnchor = () => {
    const last = anchors[anchors.length - 1];
    const nextStart = last ? last.endVerse + 1 : 1;
    const verseCount = surah?.verseCount || 10;
    if (nextStart > verseCount) {
      showToast('All verses already covered');
      return;
    }
    const nextEnd = Math.min(nextStart + 4, verseCount);
    setAnchors([...anchors, { id: `anchor-${selectedSurah}-${nextStart}-${nextEnd}`, surahId: selectedSurah, startVerse: nextStart, endVerse: nextEnd, label: `Verses ${nextStart}-${nextEnd}` }]);
  };

  const handleAddBreak = (val: number) => {
    const sorted = [...anchors].sort((a, b) => a.startVerse - b.startVerse);
    const idx = sorted.findIndex(a => a.startVerse <= val && val < a.endVerse);
    if (idx === -1) return;
    const target = sorted[idx];
    const left: AnkiAnchor = { id: `anchor-${selectedSurah}-${target.startVerse}-${val}`, surahId: selectedSurah, startVerse: target.startVerse, endVerse: val, label: target.label };
    const right: AnkiAnchor = { id: `anchor-${selectedSurah}-${val + 1}-${target.endVerse}`, surahId: selectedSurah, startVerse: val + 1, endVerse: target.endVerse, label: `Verses ${val + 1}-${target.endVerse}` };
    const next = [...sorted];
    next.splice(idx, 1, left, right);
    setAnchors(next);
  };

  const handleRemoveBreak = (val: number) => {
    const sorted = [...anchors].sort((a, b) => a.startVerse - b.startVerse);
    const idx = sorted.findIndex(a => a.endVerse === val);
    if (idx === -1 || idx + 1 >= sorted.length) return;
    const left = sorted[idx];
    const right = sorted[idx + 1];
    if (right.startVerse !== val + 1) return;
    const merged: AnkiAnchor = { id: `anchor-${selectedSurah}-${left.startVerse}-${right.endVerse}`, surahId: selectedSurah, startVerse: left.startVerse, endVerse: right.endVerse, label: left.label };
    const next = [...sorted];
    next.splice(idx, 2, merged);
    setAnchors(next);
  };

  const handleSaveSplits = async () => {
    const next = setSplitsForSurah(selectedSurah, anchors, splits);
    setSplits(next);
    showToast(`Saved ${anchors.length} groups for Surah ${selectedSurah}`);
    setShowSplitsModal(false);
  };

  const handleImportJson = async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      // Handle both old backup format and new export format with {splits,mindmaps}
      const splitsSource = json.splits || json;
      const imported = importSplitsFromBackup(splitsSource);
      const merged = { ...splits, ...imported };
      saveSplits(merged);
      setSplits(merged);
      if (json.mindmaps && typeof json.mindmaps === 'object') {
        Object.entries(json.mindmaps as Record<string, any>).forEach(([k, v]) => {
          if (!v) return;
          if (k.includes('-')) saveAnkiMindmapByKey(k, v);
          else {
            const sid = Number(k);
            if (Number.isFinite(sid)) saveAnkiMindmap(sid, v);
          }
        });
        setMindmaps(loadAnkiMindmaps() as any);
      }
      if (json.mindmapDocs && typeof json.mindmapDocs === 'object') {
        Object.entries(json.mindmapDocs as Record<string, string>).forEach(([k, v]) => {
          if (typeof v === 'string') saveMindmapDoc(k, v);
        });
        setMindmapDocs(loadMindmapDocs());
      }
      const cur = imported[selectedSurah] || getSplitsForSurah(selectedSurah, merged);
      if (cur) setAnchors(cur);
      if (json.deckName) setDeckName(String(json.deckName));
      showToast(`Imported ${Object.keys(imported).length} surah(s)`);
    } catch (e) {
      showToast('Invalid JSON');
    }
  };

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      let cards;
      const docsMap = loadMindmapDocs();
      if (exportMode === 'single') {
        if (anchors.length === 0) {
          showToast('No anchors to export');
          setIsExporting(false);
          return;
        }
        cards = buildAnkiCards(anchors, allVerses, { mindmapDocsMap: docsMap });
      } else {
        // all surahs
        const allAnchors: AnkiAnchor[] = [];
        Object.entries(splits).forEach(([k, arr]) => allAnchors.push(...arr));
        // add auto for short surahs not in splits
        SURAHS.forEach(s => {
          if (s.verseCount <= 10 && !splits[s.id]) {
            allAnchors.push({ id: `auto-anchor-${s.id}-1-${s.verseCount}`, surahId: s.id, startVerse: 1, endVerse: s.verseCount, label: `Verses 1-${s.verseCount}` });
          }
        });
        if (allAnchors.length === 0) {
          showToast('No splits defined yet');
          setIsExporting(false);
          return;
        }
        cards = buildAnkiCards(allAnchors, allVerses, { mindmapDocsMap: docsMap });
      }
      const blob = await generateApkgBlob(cards, deckName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportMode === 'single' ? `quran-life-surah-${selectedSurah}.apkg` : `quran-life-deck.apkg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`Exported ${cards.length} card(s)`);
    } catch (e) {
      console.error(e);
      showToast('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  if (!isVersesLoaded) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2"><Layers size={20} className="text-[var(--accent)]" /> Anki Deck</h2>
            <p className="text-sm text-[var(--foreground-secondary)] mt-1">Create your review cards. Choose how verses are grouped, then export to Anki.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => {
              const data = { splits, mindmaps, mindmapDocs, exportedAt: new Date().toISOString(), deckName };
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `quran-life-anki-backup-${new Date().toISOString().slice(0,10)}.json`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
              showToast('Backup exported');
            }} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm flex items-center gap-2 hover:bg-[var(--verse-bg)]">
              <Upload size={16} /> Export backup
            </button>
            <label className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm flex items-center gap-2 cursor-pointer hover:bg-[var(--verse-bg)]">
              <FileJson size={16} /> Import backup <input type="file" accept=".json" className="hidden" onChange={e => e.target.files?.[0] && handleImportJson(e.target.files[0])} />
            </label>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="adv-label mb-2 block">Deck name</label>
            <input value={deckName} onChange={e => setDeckName(e.target.value)} className="w-full p-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm" placeholder="QuranLife::Review" />
          </div>
          <div>
            <label className="adv-label mb-2 block">Surah</label>
            <select value={selectedSurah} onChange={e => setSelectedSurah(Number(e.target.value))} className="w-full p-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm">
              {SURAHS.map(s => (
                <option key={s.id} value={s.id}>{s.id}. {s.arabicName} ({s.name}) - {s.verseCount}v</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => setExportMode('single')} className={`px-3 py-2 rounded-xl border text-sm ${exportMode==='single' ? 'border-[var(--accent)] bg-[var(--verse-bg)] text-[var(--accent)]' : 'border-[var(--border)]'}`}>Export single surah</button>
          <button onClick={() => setExportMode('all')} className={`px-3 py-2 rounded-xl border text-sm ${exportMode==='all' ? 'border-[var(--accent)] bg-[var(--verse-bg)] text-[var(--accent)]' : 'border-[var(--border)]'}`}>Export all ({allCardsCount} cards)</button>
          <span className="text-xs text-[var(--foreground-secondary)] self-center ml-2">{exportMode==='single' ? `${totalCardsPreview} card(s) for this surah` : `${allCardsCount} total cards`}</span>
        </div>

        <button onClick={handleExport} disabled={isExporting} className="mt-4 w-full py-3 rounded-xl bg-[var(--accent)] text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50">
          <Download size={18} /> {isExporting ? 'Generating...' : exportMode==='single' ? `Export Surah ${selectedSurah} (.apkg)` : 'Export Full Deck (.apkg)'}
        </button>
        <p className="text-xs text-center text-[var(--foreground-secondary)] mt-2">You can export right away. If you edit a Surah later, export again — your progress in Anki will be kept.</p>
      </div>

      {/* Mindmap + Splits */}
      <div className="card">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2"><ImageIcon size={16} /> Mindmap for {surah?.arabicName}</h3>
          <div className="flex gap-2">
            {currentMindmap?.snapshot || currentMindmap?.imageUrl ? (
              <button onClick={() => setViewerData({ snapshot: currentMindmap.snapshot, title: `Surah ${selectedSurah} - ${surah?.arabicName}` })} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm flex items-center gap-1 hover:bg-[var(--verse-bg)]"><Eye size={14} /> View</button>
            ) : null}
            <button onClick={() => setShowMindmapEditor(true)} className="px-3 py-2 rounded-xl bg-[var(--accent)] text-white text-sm flex items-center gap-1"><PenTool size={14} /> {currentMindmap?.snapshot ? 'Edit Mindmap' : 'Create Mindmap'}</button>
          </div>
        </div>
        {currentMindmap?.snapshot ? (
          <p className="text-xs text-[var(--foreground-secondary)] mt-2">Mindmap saved. It will be shown as a preview.</p>
        ) : (
          <p className="text-xs text-[var(--foreground-secondary)] mt-2">No mindmap yet. Create one with the drawing editor. This is optional.</p>
        )}
        {currentMindmap?.snapshot && (
          <div className="mt-3 border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--background-secondary)]" style={{ height: 220 }}>
            <MindmapViewer snapshot={currentMindmap.snapshot} imageUrl={currentMindmap.imageUrl} imageUrlDark={currentMindmap.imageUrlDark} isDark={false} height="220px" />
          </div>
        )}
        {/* Docs for this mindmap */}
        <div className="mt-4 border-t border-[var(--border)] pt-3">
          <label className="adv-label mb-2 block">Notes for this mindmap (will be added to Anki cards)</label>
          <textarea
            value={editingDocKey === `surah-${selectedSurah}` ? editingDocText : getDocForKey(`surah-${selectedSurah}`)}
            onFocus={() => { setEditingDocKey(`surah-${selectedSurah}`); setEditingDocText(getDocForKey(`surah-${selectedSurah}`)); }}
            onChange={e => setEditingDocText(e.target.value)}
            onBlur={() => {
              if (editingDocKey === `surah-${selectedSurah}`) {
                const next = saveMindmapDoc(`surah-${selectedSurah}`, editingDocText);
                setMindmapDocs(next);
                setEditingDocKey(null);
              }
            }}
            placeholder="Write what this mindmap means, how its parts connect, or any notes you want to see in Anki..."
            className="w-full min-h-[90px] p-3 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm"
          />
          <p className="text-xs text-[var(--foreground-secondary)] mt-1">This text will be saved with the mindmap and added as a field in Anki so you can read it while reviewing.</p>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2"><Split size={16} /> Splits for {surah?.arabicName} ({surah?.name}) - {surah?.verseCount} verses</h3>
          <div className="flex gap-2">
            <button onClick={() => setShowSplitsModal(true)} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm flex items-center gap-1 hover:bg-[var(--verse-bg)]"><Split size={14} /> Edit Splits</button>
            <button onClick={handleSave} className="px-3 py-2 rounded-xl bg-[var(--accent)] text-white text-sm flex items-center gap-1"><Save size={14} /> Save</button>
          </div>
        </div>
        {surah && surah.verseCount <= 10 && anchors.length === 1 && anchors[0].startVerse===1 && anchors[0].endVerse===surah.verseCount && (
          <p className="text-xs text-[var(--foreground-secondary)] mt-2">Short surah auto-split: one card for whole surah. You can still split further.</p>
        )}
        <div className="mt-3 grid gap-2">
          {anchors.length === 0 ? (
            <p className="text-sm text-[var(--foreground-secondary)]">No groups yet. Use Edit Splits to create them.</p>
          ) : (
            anchors.slice().sort((a,b)=>a.startVerse-b.startVerse).map(a => (
              <div key={a.id} className="flex items-center justify-between p-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm">
                <span>{a.startVerse}-{a.endVerse} — {a.label}</span>
                <span className="text-xs opacity-60">{a.endVerse - a.startVerse + 1} verses</span>
              </div>
            ))
          )}
        </div>
        <p className="text-xs text-[var(--foreground-secondary)] mt-3">Tap Edit Splits to use the visual splitter from the main app - it shows your mindmap preview and lets you drag to split.</p>
        <div className="mt-3 flex gap-2">
          <button onClick={() => setShowPreview(v=>!v)} className="px-3 py-2 rounded-xl border border-[var(--border)] text-sm flex items-center gap-1"><Eye size={14} /> {showPreview ? 'Hide' : 'Preview'} </button>
        </div>
        {showPreview && (
          <div className="mt-3 grid gap-2 max-h-96 overflow-y-auto border border-[var(--border)] rounded-xl p-2 bg-[var(--background-secondary)]">
            {buildAnkiCards(anchors, allVerses).map((c, i) => (
              <div key={i} className="p-2 rounded-lg border border-[var(--border)] bg-[var(--background)]">
                <div className="text-sm font-medium">{c.arabicName} {c.startVerse}-{c.endVerse} - {c.anchorLabel}</div>
                <div className="text-xs opacity-70 mt-1">{c.verseTexts.join(' | ').slice(0,120)} {c.verseTexts.join(' ').length>120?'...':''}</div>
                {c.relatedGroups.length>0 && <div className="text-xs mt-1 opacity-70">Similar to: {c.relatedGroups.join(', ')}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Part Mindmaps - bring back part & meta */}
      <div className="card">
        <h3 className="font-semibold flex items-center gap-2"><Layers size={16} /> Part & Meta Mindmaps</h3>
        <p className="text-xs text-[var(--foreground-secondary)] mt-1">These are the cluster-level maps for each Juz and the meta overview. They were hidden before - now you can edit them here.</p>
        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="adv-label mb-2 block">Part</label>
            <select value={selectedPart} onChange={e => setSelectedPart(Number(e.target.value))} className="w-full p-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm">
              <option value={0}>Meta (Overview across all parts)</option>
              <option value={1}>Part 1 - Surah 1-5</option>
              <option value={2}>Part 2 - Surah 6-9</option>
              <option value={3}>Part 3 - Surah 10-24</option>
              <option value={4}>Part 4 - Surah 25-33</option>
              <option value={5}>Part 5 - Surah 34-49</option>
              <option value={6}>Part 6 - Surah 50-66</option>
              <option value={7}>Part 7 - Surah 67-114</option>
              <option value={8}>All Quran</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button onClick={() => setShowPartEditor(true)} className="flex-1 py-2 rounded-xl bg-[var(--accent)] text-white text-sm flex items-center justify-center gap-1"><PenTool size={14} /> {((mindmaps as any)[`part-${selectedPart}`] || (mindmaps as any)[`meta-0`])?.snapshot ? 'Edit' : 'Create'} Part Mindmap</button>
            {((mindmaps as any)[`part-${selectedPart}`] || (mindmaps as any)[`meta-0`])?.snapshot && (
              <button onClick={() => setViewerData({ snapshot: ((mindmaps as any)[`part-${selectedPart}`] || (mindmaps as any)[`meta-0`])?.snapshot, title: selectedPart===0 ? 'Meta Overview' : `Part ${selectedPart}` })} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm"><Eye size={14} /></button>
            )}
          </div>
        </div>
        {( (mindmaps as any)[`part-${selectedPart}`] || (selectedPart===0 && (mindmaps as any)[`meta-0`]) )?.snapshot && (
          <div className="mt-3 border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--background-secondary)]" style={{ height: 180 }}>
            <MindmapViewer snapshot={((mindmaps as any)[`part-${selectedPart}`] || (mindmaps as any)[`meta-0`])?.snapshot} isDark={false} height="180px" />
          </div>
        )}
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <label className="adv-label mb-2 block">Notes for this part mindmap (added to Anki)</label>
          <textarea
            value={editingDocKey === `part-${selectedPart}` ? editingDocText : getDocForKey(`part-${selectedPart}`)}
            onFocus={() => { setEditingDocKey(`part-${selectedPart}`); setEditingDocText(getDocForKey(`part-${selectedPart}`)); }}
            onChange={e => setEditingDocText(e.target.value)}
            onBlur={() => {
              if (editingDocKey === `part-${selectedPart}`) {
                const next = saveMindmapDoc(`part-${selectedPart}`, editingDocText);
                setMindmapDocs(next);
                setEditingDocKey(null);
              }
            }}
            placeholder="Explain this part's theme and how its Surahs connect..."
            className="w-full min-h-[80px] p-3 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm"
          />
        </div>
      </div>

      {/* Cluster Mindmaps */}
      <div className="card">
        <h3 className="font-semibold flex items-center gap-2"><Layers size={16} /> Cluster Mindmaps</h3>
        <p className="text-xs text-[var(--foreground-secondary)] mt-1">Cluster maps group related Surahs across parts. Edit them here - same editor as surah maps.</p>
        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="adv-label mb-2 block">Cluster</label>
            <select value={selectedCluster} onChange={e => setSelectedCluster(Number(e.target.value))} className="w-full p-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm">
              {Array.from({ length: 7 }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>Cluster {n}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button onClick={() => setShowClusterEditor(true)} className="flex-1 py-2 rounded-xl bg-[var(--accent)] text-white text-sm flex items-center justify-center gap-1"><PenTool size={14} /> {(mindmaps as any)[`cluster-${selectedCluster}`]?.snapshot ? 'Edit' : 'Create'} Cluster Mindmap</button>
            {(mindmaps as any)[`cluster-${selectedCluster}`]?.snapshot && (
              <button onClick={() => setViewerData({ snapshot: (mindmaps as any)[`cluster-${selectedCluster}`].snapshot, title: `Cluster ${selectedCluster}` })} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm"><Eye size={14} /></button>
            )}
          </div>
        </div>
        {(mindmaps as any)[`cluster-${selectedCluster}`]?.snapshot && (
          <div className="mt-3 border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--background-secondary)]" style={{ height: 180 }}>
            <MindmapViewer snapshot={(mindmaps as any)[`cluster-${selectedCluster}`].snapshot} isDark={false} height="180px" />
          </div>
        )}
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <label className="adv-label mb-2 block">Notes for this cluster (added to Anki)</label>
          <textarea
            value={editingDocKey === `cluster-${selectedCluster}` ? editingDocText : getDocForKey(`cluster-${selectedCluster}`)}
            onFocus={() => { setEditingDocKey(`cluster-${selectedCluster}`); setEditingDocText(getDocForKey(`cluster-${selectedCluster}`)); }}
            onChange={e => setEditingDocText(e.target.value)}
            onBlur={() => {
              if (editingDocKey === `cluster-${selectedCluster}`) {
                const next = saveMindmapDoc(`cluster-${selectedCluster}`, editingDocText);
                setMindmapDocs(next);
                setEditingDocKey(null);
              }
            }}
            placeholder="Describe this cluster's theme..."
            className="w-full min-h-[80px] p-3 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm"
          />
        </div>
      </div>

        <div className="text-center text-xs text-[var(--foreground-secondary)]">
        <p>Your cards will show verses step by step with context. Similar verses are highlighted to help you tell them apart. Mindmap notes you write above are added as a field in Anki so you can read them while reviewing.</p>
      </div>

      {showMindmapEditor && (
        <div className="fixed inset-0 z-[100] bg-[var(--background)]">
          <MindmapEditor
            surahId={selectedSurah}
            initialSnapshot={currentMindmap?.snapshot}
            onClose={() => setShowMindmapEditor(false)}
            onSave={async (snapshot, images) => {
              const next = saveAnkiMindmap(selectedSurah, { snapshot, isComplete: true });
              setMindmaps(next as any);
              setShowMindmapEditor(false);
              showToast('Mindmap saved');
            }}
            title={`${surah?.arabicName} mindmap`}
          />
        </div>
      )}

      {showPartEditor && (
        <div className="fixed inset-0 z-[100] bg-[var(--background)]">
          <MindmapEditor
            partId={selectedPart}
            initialSnapshot={((mindmaps as any)[`part-${selectedPart}`] || (mindmaps as any)[`meta-0`])?.snapshot}
            onClose={() => setShowPartEditor(false)}
            onSave={async (snapshot, images) => {
              const key = selectedPart === 0 ? 'meta-0' : `part-${selectedPart}`;
              const next = saveAnkiMindmapByKey(key, { snapshot, isComplete: true, kind: selectedPart === 0 ? 'meta' : 'part', partId: selectedPart });
              setMindmaps(next as any);
              setShowPartEditor(false);
              showToast('Part mindmap saved');
            }}
            title={`${selectedPart === 0 ? 'Meta' : `Part ${selectedPart}`} mindmap`}
          />
        </div>
      )}

      {showClusterEditor && (
        <div className="fixed inset-0 z-[100] bg-[var(--background)]">
          <MindmapEditor
            partId={selectedCluster}
            initialSnapshot={(mindmaps as any)[`cluster-${selectedCluster}`]?.snapshot}
            onClose={() => setShowClusterEditor(false)}
            onSave={async (snapshot, images) => {
              const key = `cluster-${selectedCluster}`;
              const next = saveAnkiMindmapByKey(key, { snapshot, isComplete: true, kind: 'cluster', partId: selectedCluster });
              setMindmaps(next as any);
              setShowClusterEditor(false);
              showToast('Cluster mindmap saved');
            }}
            title={`Cluster ${selectedCluster} mindmap`}
          />
        </div>
      )}

      {showSplitsModal && surah && (
        <SplitsModal
          isOpen={showSplitsModal}
          onClose={() => setShowSplitsModal(false)}
          isMobile={false}
          surahId={selectedSurah}
          verseCount={surah.verseCount}
          builderState={builderState}
          mindmapImageUrl={currentMindmap?.imageUrl || null}
          mindmapImageUrlDark={currentMindmap?.imageUrlDark || null}
          snapshot={currentMindmap?.snapshot}
          isDark={isDark}
          onAddBreak={handleAddBreak}
          onRemoveBreak={handleRemoveBreak}
          onSave={handleSaveSplits}
          hasReviewedHistory={false}
          hasSuspendedCards={false}
        />
      )}

      {viewerData && (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setViewerData(null)}>
          <div className="bg-[var(--background)] rounded-2xl overflow-hidden w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-3 border-b border-[var(--border)] flex items-center justify-between">
              <span className="font-semibold">{viewerData.title}</span>
              <button onClick={() => setViewerData(null)} className="p-1 rounded hover:bg-[var(--verse-bg)]">✕</button>
            </div>
            <div className="flex-1 overflow-hidden" style={{ height: 600 }}>
              <MindmapViewer snapshot={viewerData.snapshot} isDark={false} height="600px" />
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[var(--background-secondary)] border border-[var(--border)] shadow-lg rounded-xl px-4 py-2 text-sm z-50">{toast}</div>
      )}
    </div>
  );
}
