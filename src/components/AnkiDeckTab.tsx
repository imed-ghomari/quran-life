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
import ConfirmationModal from '@/components/todo/ConfirmationModal';

const MindmapEditor = dynamic(() => import('@/components/MindmapEditor'), { ssr: false });
const MindmapViewer = dynamic(() => import('@/components/MindmapViewer'), { ssr: false });
const SplitsModal = dynamic(() => import('@/components/todo/SplitsModal'), { ssr: false });

export default function AnkiDeckTab() {
  const [allVerses, setAllVerses] = useState<Verse[]>([]);
  const [isVersesLoaded, setIsVersesLoaded] = useState(false);
  const [selectedMindmapKey, setSelectedMindmapKey] = useState<string>('surah-50');
  const selectedSurah = useMemo(() => {
    if (selectedMindmapKey.startsWith('surah-')) return Number(selectedMindmapKey.replace('surah-','')) || 50;
    return 2;
  }, [selectedMindmapKey]);
  const isPartOrMeta = selectedMindmapKey.startsWith('part-') || selectedMindmapKey.startsWith('meta-');
  const [splits, setSplits] = useState<Record<number, AnkiAnchor[]>>({});
  const [anchors, setAnchors] = useState<AnkiAnchor[]>([]);
  const [deckName, setDeckName] = useState('QuranLife::Review');
  const [isExporting, setIsExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showExportPopup, setShowExportPopup] = useState(false);
  const [mindmaps, setMindmaps] = useState<Record<string, any>>({});
  const [showMindmapEditor, setShowMindmapEditor] = useState(false);
  const [showMindmapViewer, setShowMindmapViewer] = useState(false);
  const [viewerData, setViewerData] = useState<{ snapshot: any; title: string } | null>(null);
  const [showSplitsModal, setShowSplitsModal] = useState(false);
  const [showPartEditor, setShowPartEditor] = useState(false);
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
    const mm = loadAnkiMindmaps() as any;
    const docs = loadMindmapDocs();
    const hasData = Object.keys(loaded).length > 0 || Object.keys(mm).length > 0;
    if (!hasData) {
      fetch('/premade-anki-data.json')
        .then(r => r.json())
        .then(data => {
          let newSplits = loaded;
          let hasNewSplits = false;
          if (data.splits && typeof data.splits === 'object') {
            const premadeSplits: Record<string, any> = {};
            Object.entries(data.splits as Record<string, any>).forEach(([k, v]) => {
              if (Array.isArray(v)) premadeSplits[k] = v;
            });
            if (Object.keys(premadeSplits).length > 0) {
              try { localStorage.setItem('quran-life:anki:splits:v1', JSON.stringify(premadeSplits)); } catch {}
              newSplits = premadeSplits as any;
              hasNewSplits = true;
            }
          }
          if (data.mindmaps && typeof data.mindmaps === 'object') {
            Object.entries(data.mindmaps as Record<string, any>).forEach(([k, v]) => {
              if (v) saveAnkiMindmapByKey(k, v);
            });
          }
          if (data.mindmapDocs && typeof data.mindmapDocs === 'object') {
            Object.entries(data.mindmapDocs as Record<string, string>).forEach(([k, v]) => saveMindmapDoc(k, v));
          }
          setSplits(hasNewSplits ? (newSplits as any) : loaded);
          setMindmaps(loadAnkiMindmaps() as any);
          setMindmapDocs(loadMindmapDocs());
        })
        .catch(() => {
          setSplits(loaded);
          setMindmaps(mm);
          setMindmapDocs(docs);
        });
    } else {
      setSplits(loaded);
      setMindmaps(mm);
      setMindmapDocs(docs);
    }
  }, []);

  useEffect(() => {
    const current = getSplitsForSurah(selectedSurah, splits);
    if (current.length > 0) setAnchors(current);
    else setAnchors(ensureDefaultSplits(selectedSurah));
  }, [selectedSurah, splits]);

  const surah = getSurah(selectedSurah);
  const currentMindmap = (mindmaps as any)[`surah-${selectedSurah}`] as any;
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

  const handleExport = async (withBackup = true) => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const docsMap = loadMindmapDocs();
      const allAnchors: AnkiAnchor[] = [];
      Object.entries(splits).forEach(([k, arr]) => allAnchors.push(...arr));
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
      const cards = buildAnkiCards(allAnchors, allVerses, { mindmapDocsMap: docsMap });
      const blob = await generateApkgBlob(cards, deckName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quran-life-deck.apkg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`Exported ${cards.length} cards`);
      if (withBackup) {
        const backup = { splits, mindmaps, mindmapDocs: docsMap, deckName, exportedAt: new Date().toISOString() };
        const bBlob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const bUrl = URL.createObjectURL(bBlob);
        const b = document.createElement('a');
        b.href = bUrl;
        b.download = `quran-life-anki-backup-${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(b);
        b.click();
        b.remove();
        URL.revokeObjectURL(bUrl);
      }
      setShowExportPopup(false);
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

        <div className="mt-4">
          <label className="adv-label mb-2 block">Deck name</label>
          <input value={deckName} onChange={e => setDeckName(e.target.value)} className="w-full p-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm" placeholder="QuranLife::Review" />
        </div>

        <button onClick={() => setShowExportPopup(true)} className="mt-4 w-full py-3 rounded-xl bg-[var(--accent)] text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90">
          <Download size={18} /> Export Full Deck to Anki
        </button>
        <p className="text-xs text-center text-[var(--foreground-secondary)] mt-2">One file contains everything - verse groups, mindmaps, and notes. Re-importing updates existing cards and keeps your progress.</p>
      </div>

      {/* Mindmap - unified, selector now inside this card */}
      {(() => {
        const isPartMeta = selectedMindmapKey.startsWith('part-') || selectedMindmapKey.startsWith('meta-');
        const displayMindmap = isPartMeta ? (mindmaps as any)[selectedMindmapKey] as any : currentMindmap;
        const displayTitle = isPartMeta
          ? (selectedMindmapKey === 'meta-0' ? 'Meta Overview' : `Part ${selectedMindmapKey.replace('part-','')}`)
          : `${surah?.arabicName} - Surah ${selectedSurah}`;
        const displaySurah = surah;
        return (
          <div className="card">
            <div className="mb-3">
              <label className="adv-label mb-2 block">Mindmap to edit</label>
              <select value={selectedMindmapKey} onChange={e => setSelectedMindmapKey(e.target.value)} className="w-full p-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm">
                <optgroup label="Surahs">
                  {SURAHS.map(s => (
                    <option key={`surah-${s.id}`} value={`surah-${s.id}`}>{s.id}. {s.arabicName} ({s.name})</option>
                  ))}
                </optgroup>
                <optgroup label="Parts & Meta">
                  <option value="meta-0">Meta - Overview across all parts</option>
                  <option value="part-1">Part 1 - Surah 1-5</option>
                  <option value="part-2">Part 2 - Surah 6-9</option>
                  <option value="part-3">Part 3 - Surah 10-24</option>
                  <option value="part-4">Part 4 - Surah 25-33</option>
                  <option value="part-5">Part 5 - Surah 34-49</option>
                  <option value="part-6">Part 6 - Surah 50-66</option>
                  <option value="part-7">Part 7 - Surah 67-114</option>
                  <option value="part-8">All Quran</option>
                </optgroup>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2"><ImageIcon size={16} /> Mindmap for {displayTitle}</h3>
              <div className="flex gap-2">
                {displayMindmap?.snapshot || displayMindmap?.imageUrl ? (
                  <button onClick={() => setViewerData({ snapshot: displayMindmap.snapshot, title: displayTitle })} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm flex items-center gap-1 hover:bg-[var(--verse-bg)]"><Eye size={14} /> View</button>
                ) : null}
                <button onClick={() => { if (isPartMeta) setShowPartEditor(true); else setShowMindmapEditor(true); }} className="px-3 py-2 rounded-xl bg-[var(--accent)] text-white text-sm flex items-center gap-1"><PenTool size={14} /> {displayMindmap?.snapshot ? 'Edit Mindmap' : 'Create Mindmap'}</button>
              </div>
            </div>
            {displayMindmap?.snapshot ? (
              <p className="text-xs text-[var(--foreground-secondary)] mt-2">Mindmap saved. It will be shown as a preview.</p>
            ) : (
              <p className="text-xs text-[var(--foreground-secondary)] mt-2">No mindmap yet. Create one with the drawing editor. This is optional.</p>
            )}
            {displayMindmap?.snapshot && !isPartMeta && (
              <div className="mt-3 border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--background-secondary)]" style={{ height: 220 }}>
                <MindmapViewer snapshot={displayMindmap.snapshot} imageUrl={displayMindmap.imageUrl} imageUrlDark={displayMindmap.imageUrlDark} isDark={false} height="220px" />
              </div>
            )}
            {displayMindmap?.snapshot && isPartMeta && (
              <p className="text-xs text-[var(--foreground-secondary)] mt-2">Preview hidden until you click View.</p>
            )}
            {!isPartMeta && displaySurah && (
              <div className="mt-4 border-t border-[var(--border)] pt-3">
                <h4 className="font-medium text-sm flex items-center gap-2"><Split size={14} /> Define Splits for this Surah</h4>
                <p className="text-xs text-[var(--foreground-secondary)] mt-1">Drag to split where the mindmap changes topic. This defines your Anki groups.</p>
                <div className="mt-3 rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--background-secondary)]">
                  <div className="p-2">
                    {/* Inline visual splitter - same as modal but embedded */}
                    <div className="splits-inline-editor">
                      {(() => {
                        const verseCount = displaySurah.verseCount;
                        const breaks = builderState.breaks;
                        return (
                          <div className="grid gap-2">
                            <div className="flex flex-wrap gap-1.5">
                              {Array.from({ length: verseCount }, (_, i) => i + 1).map(v => {
                                const isBreak = breaks.includes(v);
                                const isLast = v === verseCount;
                                return (
                                  <div key={v} className="flex items-center gap-1">
                                    <span className="px-2 py-1 rounded-lg border text-xs bg-[var(--background)]" style={{ borderColor: isBreak ? 'var(--accent)' : 'var(--border)' }}>{v}</span>
                                    {!isLast && (
                                      <button
                                        onClick={() => isBreak ? handleRemoveBreak(v) : handleAddBreak(v)}
                                        className={`w-6 h-6 rounded-full text-xs flex items-center justify-center border ${isBreak ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'bg-[var(--background)] border-[var(--border)] hover:border-[var(--accent)]'}`}
                                        title={isBreak ? 'Remove split' : 'Add split'}
                                      >
                                        {isBreak ? '×' : '+'}
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            <div className="flex gap-2 mt-2">
                              <button onClick={handleSave} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs flex items-center gap-1"><Save size={12} /> Save Splits</button>
                              <button onClick={() => setShowPreview(v=>!v)} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs"><Eye size={12} /> {showPreview ? 'Hide' : 'Preview'}</button>
                            </div>
                            {showPreview && (
                              <div className="mt-2 grid gap-1.5 max-h-32 overflow-y-auto border border-[var(--border)] rounded-lg p-1.5 bg-[var(--background)]">
                                {buildAnkiCards(anchors, allVerses).slice(0,3).map((c, i) => (
                                  <div key={i} className="text-xs"><b>{c.startVerse}-{c.endVerse}</b> — {c.anchorLabel}</div>
                                ))}
                                {buildAnkiCards(anchors, allVerses).length > 3 && <div className="text-xs opacity-60">+ {buildAnkiCards(anchors, allVerses).length - 3} more groups</div>}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="mt-4 border-t border-[var(--border)] pt-3">
              <label className="adv-label mb-2 block">Notes for this mindmap (will be added to Anki cards)</label>
              <textarea
                value={editingDocKey === selectedMindmapKey ? editingDocText : getDocForKey(selectedMindmapKey)}
                onFocus={() => { setEditingDocKey(selectedMindmapKey); setEditingDocText(getDocForKey(selectedMindmapKey)); }}
                onChange={e => setEditingDocText(e.target.value)}
                onBlur={() => {
                  if (editingDocKey === selectedMindmapKey) {
                    const next = saveMindmapDoc(selectedMindmapKey, editingDocText);
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
          );
        })()}

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

      {showPartEditor && (() => {
        const isMeta = selectedMindmapKey === 'meta-0';
        const partId = isMeta ? 0 : Number(selectedMindmapKey.replace('part-','')) || 1;
        const key = selectedMindmapKey;
        const snap = (mindmaps as any)[key]?.snapshot;
        return (
          <div className="fixed inset-0 z-[100] bg-[var(--background)]">
            <MindmapEditor
              partId={partId}
              initialSnapshot={snap}
              onClose={() => setShowPartEditor(false)}
              onSave={async (snapshot, images) => {
                const next = saveAnkiMindmapByKey(key, { snapshot, isComplete: true, kind: isMeta ? 'meta' : 'part', partId });
                setMindmaps(next as any);
                setShowPartEditor(false);
                showToast(isMeta ? 'Meta mindmap saved' : 'Part mindmap saved');
              }}
              title={`${isMeta ? 'Meta' : `Part ${partId}`} mindmap`}
            />
          </div>
        );
      })()}

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

      <ConfirmationModal
        isOpen={showExportPopup}
        title="Export Full Deck"
        message={`One file contains everything. Re-importing updates existing cards and keeps your progress.`}
        confirmLabel={isExporting ? 'Generating...' : 'Export Deck + Backup'}
        cancelLabel="Cancel"
        isDestructive={false}
        isProcessing={isExporting}
        onConfirm={() => handleExport(true)}
        onCancel={() => setShowExportPopup(false)}
      >
        <div className="space-y-3 text-sm">
          <div className="p-3 rounded-xl bg-[var(--verse-bg)] border border-[var(--border)]">
            <div className="font-medium mb-2">What will be exported:</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>{allCardsCount} verse groups</li>
              <li>{Object.keys(mindmaps).filter(k=>k.startsWith('surah-')).length} Surah mindmaps</li>
              <li>{Object.keys(mindmaps).filter(k=>k.startsWith('part-')||k.startsWith('meta-')).length} Part & Meta mindmaps</li>
              <li>{Object.keys(mindmapDocs).length} notes</li>
            </ul>
          </div>
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm">
            <div className="font-medium">Backup will also be downloaded</div>
            <p className="text-xs mt-1 opacity-80">A small JSON backup is downloaded together with the .apkg. Keep it. If browser storage is cleared, use Import backup to restore.</p>
          </div>
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-sm">
            <div className="font-medium">If you changed splits for a Surah</div>
            <p className="text-xs mt-1 opacity-80">Old groups for that Surah get new IDs. Before re-importing, delete that Surah's old cards in Anki: open Browser, search <code>deck:QuranLife tag:surah::50</code> (change number), select all, delete. Then import the new file. Unchanged Surahs keep their due dates.</p>
          </div>
        </div>
      </ConfirmationModal>

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
