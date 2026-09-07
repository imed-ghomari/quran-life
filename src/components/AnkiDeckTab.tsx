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
  const [mindmaps, setMindmaps] = useState<Record<number, any>>({});
  const [showMindmapEditor, setShowMindmapEditor] = useState(false);
  const [showMindmapViewer, setShowMindmapViewer] = useState(false);
  const [showSplitsModal, setShowSplitsModal] = useState(false);
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
    setMindmaps(mm);
  }, []);

  useEffect(() => {
    const current = getSplitsForSurah(selectedSurah, splits);
    if (current.length > 0) setAnchors(current);
    else setAnchors(ensureDefaultSplits(selectedSurah));
  }, [selectedSurah, splits]);

  const surah = getSurah(selectedSurah);
  const currentMindmap = mindmaps[selectedSurah];
  const builderState = useMemo(() => {
    const sorted = [...anchors].sort((a, b) => a.startVerse - b.startVerse);
    const breaks = sorted.slice(0, -1).map(a => a.endVerse);
    const labels: Record<number, string> = {};
    sorted.forEach(a => { labels[a.endVerse] = a.label; });
    return { breaks, labels };
  }, [anchors]);
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
        const mm = json.mindmaps as Record<number, any>;
        Object.entries(mm).forEach(([k, v]) => {
          const sid = Number(k);
          if (Number.isFinite(sid) && v) saveAnkiMindmap(sid, v);
        });
        setMindmaps(loadAnkiMindmaps());
      } else if (json.mindmaps === undefined && json.splits === undefined) {
        // Try mindmaps at top level alongside splits
        const maybeMindmaps = json.mindmaps || json.ankiMindmaps;
        if (maybeMindmaps) {
          Object.entries(maybeMindmaps).forEach(([k, v]) => {
            const sid = Number(k);
            if (Number.isFinite(sid) && v) saveAnkiMindmap(sid, v);
          });
          setMindmaps(loadAnkiMindmaps());
        }
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
            <h2 className="text-xl font-bold flex items-center gap-2"><Layers size={20} className="text-[var(--accent)]" /> Anki Deck</h2>
            <p className="text-sm text-[var(--foreground-secondary)] mt-1">Create your review cards. Choose how verses are grouped, then export to Anki.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => {
              const data = { splits, mindmaps, exportedAt: new Date().toISOString(), deckName };
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
              <button onClick={() => setShowMindmapViewer(true)} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm flex items-center gap-1 hover:bg-[var(--verse-bg)]"><Eye size={14} /> View</button>
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

        <div className="text-center text-xs text-[var(--foreground-secondary)]">
        <p>Your cards will show verses step by step with context. Similar verses are highlighted to help you tell them apart.</p>
      </div>

      {showMindmapEditor && (
        <div className="fixed inset-0 z-[100] bg-[var(--background)]">
          <MindmapEditor
            surahId={selectedSurah}
            initialSnapshot={currentMindmap?.snapshot}
            onClose={() => setShowMindmapEditor(false)}
            onSave={async (snapshot, images) => {
              const next = saveAnkiMindmap(selectedSurah, { snapshot, isComplete: true });
              setMindmaps(next);
              setShowMindmapEditor(false);
              showToast('Mindmap saved');
            }}
            title={`${surah?.arabicName} mindmap`}
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
