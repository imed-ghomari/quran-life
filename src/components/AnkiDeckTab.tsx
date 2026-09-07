'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { getQuranVerses, getSurah, SURAHS } from '@/lib/quranData';
import { buildAnkiCards } from '@/lib/anki/cardBuilder';
import { generateApkgBlob } from '@/lib/anki/apkgExport';
import { loadSplits, saveSplits, getSplitsForSurah, setSplitsForSurah, importSplitsFromBackup, ensureDefaultSplits } from '@/lib/anki/splitStore';
import { loadAnkiMindmaps, saveAnkiMindmap, getAnkiMindmap } from '@/lib/anki/mindmapStore';
import { AnkiAnchor } from '@/lib/anki/types';
import type { Verse } from '@/lib/types';
import { Upload, Download, Plus, Trash2, Save, Eye, FileJson, Layers, PenTool, Split, Image as ImageIcon } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';

const MindmapEditor = dynamic(() => import('@/components/MindmapEditor'), { ssr: false });
const MindmapViewer = dynamic(() => import('@/components/MindmapViewer'), { ssr: false });

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
  const [mindmaps, setMindmaps] = useState<Record<number, any>>({});
  const [showMindmapEditor, setShowMindmapEditor] = useState(false);
  const [showMindmapViewer, setShowMindmapViewer] = useState(false);

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
    setMindmaps(mm);
  }, []);

  useEffect(() => {
    const current = getSplitsForSurah(selectedSurah, splits);
    if (current.length > 0) setAnchors(current);
    else setAnchors(ensureDefaultSplits(selectedSurah));
  }, [selectedSurah, splits]);

  const surah = getSurah(selectedSurah);
  const currentMindmap = mindmaps[selectedSurah];
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

  const handleRemove = (idx: number) => {
    setAnchors(anchors.filter((_, i) => i !== idx));
  };

  const handleAnchorChange = (idx: number, patch: Partial<AnkiAnchor>) => {
    setAnchors(anchors.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  };

  const handleImportJson = async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const imported = importSplitsFromBackup(json);
      const merged = { ...splits, ...imported };
      saveSplits(merged);
      setSplits(merged);
      // refresh current
      const cur = imported[selectedSurah] || getSplitsForSurah(selectedSurah, merged);
      if (cur) setAnchors(cur);
      showToast(`Imported ${Object.keys(imported).length} surah(s) splits`);
    } catch (e) {
      showToast('Invalid JSON');
    }
  };

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      let cards;
      if (exportMode === 'single') {
        if (anchors.length === 0) {
          showToast('No anchors to export');
          setIsExporting(false);
          return;
        }
        cards = buildAnkiCards(anchors, allVerses);
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
        cards = buildAnkiCards(allAnchors, allVerses);
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
            <h2 className="text-xl font-bold flex items-center gap-2"><Layers size={20} className="text-[var(--accent)]" /> Anki Deck Generator</h2>
            <p className="text-sm text-[var(--foreground-secondary)] mt-1">Build verse-group cards with chunk reveal. Edit splits per surah, then export .apkg for Anki.</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm flex items-center gap-2 cursor-pointer hover:bg-[var(--verse-bg)]">
              <FileJson size={16} /> Import JSON <input type="file" accept=".json" className="hidden" onChange={e => e.target.files?.[0] && handleImportJson(e.target.files[0])} />
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
        <p className="text-xs text-center text-[var(--foreground-secondary)] mt-2">First export works without changing splits. Re-export after editing a surah overwrites only that surah in Anki (keep due dates via stable guid).</p>
      </div>

      {/* Mindmap + Splits */}
      <div className="card">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2"><ImageIcon size={16} /> Mindmap for {surah?.arabicName}</h3>
          <div className="flex gap-2">
            {currentMindmap?.snapshot || currentMindmap?.imageUrl ? (
              <button onClick={() => setShowMindmapViewer(true)} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm flex items-center gap-1 hover:bg-[var(--verse-bg)]"><Eye size={14} /> View</button>
            ) : null}
            <button onClick={() => setShowMindmapEditor(true)} className="px-3 py-2 rounded-xl bg-[var(--accent)] text-white text-sm flex items-center gap-1"><PenTool size={14} /> {currentMindmap?.snapshot ? 'Edit Mindmap' : 'Create Mindmap'}</button>
          </div>
        </div>
        {currentMindmap?.snapshot ? (
          <p className="text-xs text-[var(--foreground-secondary)] mt-2">Mindmap saved locally. It will be included as preview in splits editor and exported as reference.</p>
        ) : (
          <p className="text-xs text-[var(--foreground-secondary)] mt-2">No mindmap yet. Create one with tldraw (same editor as main branch). Optional but helps with splitter preview.</p>
        )}
        {currentMindmap?.snapshot && (
          <div className="mt-3 border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--background-secondary)]" style={{ height: 220 }}>
            <MindmapViewer snapshot={currentMindmap.snapshot} imageUrl={currentMindmap.imageUrl} imageUrlDark={currentMindmap.imageUrlDark} isDark={false} height="220px" />
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2"><Split size={16} /> Splits for {surah?.arabicName} ({surah?.name}) - {surah?.verseCount} verses</h3>
          <div className="flex gap-2">
            <button onClick={handleAddAnchor} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm flex items-center gap-1 hover:bg-[var(--verse-bg)]"><Plus size={14} /> Add anchor</button>
            <button onClick={handleSave} className="px-3 py-2 rounded-xl bg-[var(--accent)] text-white text-sm flex items-center gap-1"><Save size={14} /> Save</button>
          </div>
        </div>
        {surah && surah.verseCount <= 10 && anchors.length === 1 && anchors[0].startVerse===1 && anchors[0].endVerse===surah.verseCount && (
          <p className="text-xs text-[var(--foreground-secondary)] mt-2">Short surah auto-split: one card for whole surah. You can still split further.</p>
        )}
        <div className="mt-4 grid gap-3">
          {anchors.length === 0 && <p className="text-sm text-[var(--foreground-secondary)]">No anchors yet. Click Add anchor.</p>}
          {anchors.map((a, idx) => (
            <div key={idx} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--background)] grid gap-2">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs opacity-70">Start</label>
                  <input type="number" min={1} max={surah?.verseCount} value={a.startVerse} onChange={e => handleAnchorChange(idx, { startVerse: Number(e.target.value), id: `anchor-${selectedSurah}-${Number(e.target.value)}-${a.endVerse}` })} className="w-full p-2 rounded-lg border border-[var(--border)] bg-[var(--background-secondary)] text-sm" />
                </div>
                <div>
                  <label className="text-xs opacity-70">End</label>
                  <input type="number" min={1} max={surah?.verseCount} value={a.endVerse} onChange={e => handleAnchorChange(idx, { endVerse: Number(e.target.value), id: `anchor-${selectedSurah}-${a.startVerse}-${Number(e.target.value)}` })} className="w-full p-2 rounded-lg border border-[var(--border)] bg-[var(--background-secondary)] text-sm" />
                </div>
                <div className="flex items-end">
                  <button onClick={() => handleRemove(idx)} className="w-full p-2 rounded-lg border border-[var(--danger)] text-[var(--danger)] text-sm flex items-center justify-center gap-1 hover:bg-[var(--danger)] hover:text-white"><Trash2 size={14} /> Remove</button>
                </div>
              </div>
              <div>
                <label className="text-xs opacity-70">Label (meaning anchor)</label>
                <input value={a.label} onChange={e => handleAnchorChange(idx, { label: e.target.value })} className="w-full p-2 rounded-lg border border-[var(--border)] bg-[var(--background-secondary)] text-sm" placeholder={`Verses ${a.startVerse}-${a.endVerse}`} />
              </div>
              <div className="text-xs text-[var(--foreground-secondary)]">ID: {a.id}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={() => setShowPreview(v=>!v)} className="px-3 py-2 rounded-xl border border-[var(--border)] text-sm flex items-center gap-1"><Eye size={14} /> {showPreview ? 'Hide' : 'Preview'} cards</button>
        </div>
        {showPreview && (
          <div className="mt-4 grid gap-2 max-h-96 overflow-y-auto border border-[var(--border)] rounded-xl p-2 bg-[var(--background-secondary)]">
            {buildAnkiCards(anchors, allVerses).map((c, i) => (
              <div key={i} className="p-2 rounded-lg border border-[var(--border)] bg-[var(--background)]">
                <div className="text-sm font-medium">{c.arabicName} {c.startVerse}-{c.endVerse} - {c.anchorLabel}</div>
                <div className="text-xs opacity-70 mt-1">{c.verseTexts.join(' | ').slice(0,120)} {c.verseTexts.join(' ').length>120?'...':''}</div>
                <div className="text-xs mt-1">Chunks: {c.chunks.map(arr=>arr.join(' / ')).join(' || ').slice(0,120)}</div>
                {c.relatedGroups.length>0 && <div className="text-xs mt-1 opacity-70">Related: {c.relatedGroups.join(', ')}</div>}
                <div className="text-xs mt-1">Tags: {c.tags.join(', ')}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-center text-xs text-[var(--foreground-secondary)]">
        <p>Generates verse-group cards with chunk reveal JS, context verses, and mutashabihat tags. Mindmap preview above is from your tldraw editor (same as main branch).</p>
      </div>

      {showMindmapEditor && (
        <div className="fixed inset-0 z-[100] bg-[var(--background)]">
          <MindmapEditor
            surahId={selectedSurah}
            initialSnapshot={currentMindmap?.snapshot}
            onClose={() => setShowMindmapEditor(false)}
            onSave={async (snapshot, images) => {
              // images are Blobs for light/dark; we store snapshot only for now
              const next = saveAnkiMindmap(selectedSurah, { snapshot, isComplete: true });
              setMindmaps(next);
              setShowMindmapEditor(false);
              showToast('Mindmap saved');
            }}
            title={`${surah?.arabicName} mindmap`}
          />
        </div>
      )}

      {showMindmapViewer && currentMindmap?.snapshot && (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowMindmapViewer(false)}>
          <div className="bg-[var(--background)] rounded-2xl overflow-hidden w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-3 border-b border-[var(--border)] flex items-center justify-between">
              <span className="font-semibold">Mindmap Preview - Surah {selectedSurah}</span>
              <button onClick={() => setShowMindmapViewer(false)} className="p-1 rounded hover:bg-[var(--verse-bg)]">✕</button>
            </div>
            <div className="flex-1 overflow-hidden" style={{ height: 600 }}>
              <MindmapViewer snapshot={currentMindmap.snapshot} imageUrl={currentMindmap.imageUrl} imageUrlDark={currentMindmap.imageUrlDark} isDark={false} height="600px" />
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
