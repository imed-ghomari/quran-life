'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { getQuranVerses, getSurah, SURAHS } from '@/lib/quranData';
import { buildAnkiCards, buildMindmapCards } from '@/lib/anki/cardBuilder';
import { generateApkgBlob } from '@/lib/anki/apkgExport';
import { loadSplits, saveSplits, getSplitsForSurah, setSplitsForSurah, importSplitsFromBackup, ensureDefaultSplits, buildAnchorsFromBreaks, sanitizeAnchors } from '@/lib/anki/splitStore';
import { loadAnkiMindmaps, saveAnkiMindmap, saveAnkiMindmapByKey, getAnkiMindmap, getAnkiMindmapByKey, deleteAnkiMindmapByKey, loadDeletedMindmapKeys } from '@/lib/anki/mindmapStore';
import { loadMindmapDocs, saveMindmapDoc, deleteMindmapDoc } from '@/lib/anki/mindmapDocsStore';
import { AnkiAnchor } from '@/lib/anki/types';
import type { Verse } from '@/lib/types';
import { Save, Eye, Layers, PenTool, Split, Image as ImageIcon, Download, Trash2, BarChart3, Check, X, FileText } from 'lucide-react';
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
  const [exportProgress, setExportProgress] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showExportPopup, setShowExportPopup] = useState(false);
  const [mindmaps, setMindmaps] = useState<Record<string, any>>({});
  const [showMindmapEditor, setShowMindmapEditor] = useState(false);
  const [showSplitsModal, setShowSplitsModal] = useState(false);
  const [showPartEditor, setShowPartEditor] = useState(false);
  const [mindmapDocs, setMindmapDocs] = useState<Record<string, string>>({});
  const [editingDocKey, setEditingDocKey] = useState<string | null>(null);
  const [editingDocText, setEditingDocText] = useState('');
  const [isAnkiDataLoaded, setIsAnkiDataLoaded] = useState(false);
  const [showAllVerses, setShowAllVerses] = useState(false);
  const [isViewerReady, setIsViewerReady] = useState(false);
  const [showMindmapPreview, setShowMindmapPreview] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showStatsDetails, setShowStatsDetails] = useState(false);
  const { theme } = useTheme();
  const [systemIsDark, setSystemIsDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
    if (mq.addEventListener) {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, []);
  const isDark = theme === 'system' ? systemIsDark : theme === 'dark';

  // Lazy: only load verses for selected surah + lightweight cache, not all 6236 at once
  const [surahVerses, setSurahVerses] = useState<Verse[]>([]);
  useEffect(() => {
    let cancelled = false;
    // Use cached allVerses if already loaded, otherwise fetch only needed surah via getQuranVerses then filter
    (async () => {
      try {
        // Try to use already cached allVerses to avoid re-fetching whole file on every tab switch
        if (allVerses.length > 0) {
          const filtered = allVerses.filter(v => v.surahId === selectedSurah);
          if (!cancelled) {
            setSurahVerses(filtered);
            setIsVersesLoaded(true);
          }
          return;
        }
        const verses = await getQuranVerses();
        if (cancelled) return;
        setAllVerses(verses);
        setSurahVerses(verses.filter(v => v.surahId === selectedSurah));
      } catch {
        if (!cancelled) {
          setAllVerses([]);
          setSurahVerses([]);
        }
      } finally {
        if (!cancelled) setIsVersesLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedSurah, allVerses.length]);

  // Lazy: only load splits/mindmaps/docs for selected key, not all 69 snapshots at once
  // Keep lightweight in-memory cache for already-seen keys to avoid re-reading localStorage
  const mindmapCacheRef = useMemo(() => new Map<string, any>(), []);
  const docsCacheRef = useMemo(() => new Map<string, string>(), []);
  const splitsCacheRef = useMemo(() => new Map<number, AnkiAnchor[]>(), []);

  // Persist pending doc edit when switching mindmap (textarea unmounts before onBlur)
  useEffect(() => {
    if (editingDocKey && editingDocKey !== selectedMindmapKey) {
      const keyToSave = editingDocKey;
      const textToSave = editingDocText;
      try {
        const next = saveMindmapDoc(keyToSave, textToSave);
        docsCacheRef.set(keyToSave, textToSave);
        setMindmapDocs(prev => ({ ...prev, ...next, [keyToSave]: textToSave }));
      } catch {}
      setEditingDocKey(null);
    }
  }, [selectedMindmapKey]);

  // Hide preview by default when switching mindmap — reduces initial load
  useEffect(() => {
    setShowMindmapPreview(false);
    setIsViewerReady(false);
    const t = setTimeout(() => setIsViewerReady(true), 120);
    return () => clearTimeout(t);
  }, [selectedMindmapKey]);

  const fetchPremadeForKey = async (key: string) => {
    try {
      const res = await fetch('/premade-anki-data.json', { cache: 'force-cache' } as any);
      if (!res.ok) return null;
      const data = await res.json();
      if (key.startsWith('surah-') || key.startsWith('part-') || key.startsWith('meta-')) {
        if (data.mindmaps?.[key]) return { mindmap: data.mindmaps[key], docs: data.mindmapDocs?.[key], splits: null };
        // For surah also check splits
        const sid = Number(key.replace('surah-', ''));
        if (Number.isFinite(sid) && data.splits?.[String(sid)]) {
          return { mindmap: data.mindmaps?.[key] || null, docs: data.mindmapDocs?.[key] || null, splits: data.splits[String(sid)] };
        }
      }
      return null;
    } catch { return null; }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Start with cached or empty, show skeleton only if selected key not yet cached
      const isSurah = selectedMindmapKey.startsWith('surah-');
      const sid = isSurah ? Number(selectedMindmapKey.replace('surah-', '')) : NaN;

      // Splits: try cache -> localStorage -> premade for this surah only
      let currentAnchors: AnkiAnchor[] | null = null;
      if (Number.isFinite(sid) && splitsCacheRef.has(sid)) {
        currentAnchors = splitsCacheRef.get(sid)!;
      } else if (Number.isFinite(sid)) {
        const bySurah = getSplitsForSurah(sid, loadSplits());
        if (bySurah.length > 0) {
          currentAnchors = bySurah;
          splitsCacheRef.set(sid, bySurah);
        } else {
          // Try premade for this surah only
          const premade = await fetchPremadeForKey(selectedMindmapKey);
          if (premade?.splits && Array.isArray(premade.splits)) {
            const normalized = (premade.splits as any[]).map((a: any) => ({ id: a.id || `anchor-${sid}-${a.startVerse}-${a.endVerse}`, surahId: sid, startVerse: a.startVerse, endVerse: a.endVerse, label: a.label || `Verses ${a.startVerse}-${a.endVerse}` }));
            if (normalized.length) {
              try { localStorage.setItem('quran-life:anki:splits:v1', JSON.stringify({ ...loadSplits(), [sid]: normalized })); } catch {}
              splitsCacheRef.set(sid, normalized);
              currentAnchors = normalized;
            }
          }
        }
      }

      // Mindmap: cache -> localStorage single key -> premade single key (respect deleted)
      const deletedForMM = loadDeletedMindmapKeys();
      let currentMM: any = null;
      if (!deletedForMM.has(selectedMindmapKey)) {
        currentMM = mindmapCacheRef.get(selectedMindmapKey) || null;
        if (!currentMM) {
          const local = getAnkiMindmapByKey(selectedMindmapKey) || (isSurah ? getAnkiMindmap(sid) : null);
          if (local?.snapshot) {
            currentMM = local;
            mindmapCacheRef.set(selectedMindmapKey, local);
          } else {
            const premade = await fetchPremadeForKey(selectedMindmapKey);
            if (premade?.mindmap) {
              saveAnkiMindmapByKey(selectedMindmapKey, premade.mindmap);
              currentMM = premade.mindmap;
              mindmapCacheRef.set(selectedMindmapKey, premade.mindmap);
            }
          }
        }
      } else {
        // deleted premade — ensure not in cache
        mindmapCacheRef.delete(selectedMindmapKey);
      }

      // Docs: cache -> localStorage single key -> premade single key
      let currentDoc = docsCacheRef.get(selectedMindmapKey);
      if (currentDoc === undefined) {
        const localDoc = loadMindmapDocs()[selectedMindmapKey];
        if (typeof localDoc === 'string') {
          currentDoc = localDoc;
          docsCacheRef.set(selectedMindmapKey, localDoc);
        } else {
          const premade = await fetchPremadeForKey(selectedMindmapKey);
          if (typeof premade?.docs === 'string') {
            saveMindmapDoc(selectedMindmapKey, premade.docs);
            currentDoc = premade.docs;
            docsCacheRef.set(selectedMindmapKey, premade.docs);
          } else {
            currentDoc = '';
            docsCacheRef.set(selectedMindmapKey, '');
          }
        }
      }

      if (cancelled) return;

      // Update state only for selected key (lazy) - keep other keys in cache, not in state
      setMindmaps(prev => {
        const next: any = { ...prev };
        if (currentMM) next[selectedMindmapKey] = currentMM;
        // Also keep surah-* alias for displayMindmap lookup
        if (isSurah && currentMM) next[`surah-${sid}`] = currentMM;
        return next;
      });
      setMindmapDocs(prev => {
        const next: any = { ...prev };
        if (currentDoc !== undefined) next[selectedMindmapKey] = currentDoc;
        return next;
      });
      if (Number.isFinite(sid) && currentAnchors) {
        // Update splits map lazily
        setSplits(prev => {
          const next = { ...prev };
          if (currentAnchors && currentAnchors.length) next[sid] = currentAnchors!;
          return next;
        });
      } else if (!Number.isFinite(sid)) {
        // For part/meta, ensure splits not needed but mark loaded
        setSplits(prev => prev);
      }

      // Also do lightweight background merge for missing 77-114 only once per session (not on every switch)
      // Use sessionStorage flag to avoid re-fetching whole premade on every tab switch
      // Bulk persist to localStorage is skipped to avoid quota (13MB > 5-10MB limit); keep in-memory cache and rely on export-time merge.
      try {
        const flag = sessionStorage.getItem('anki-premade-merged-v2');
        if (!flag) {
          sessionStorage.setItem('anki-premade-merged-v2', '1');
          fetch('/premade-anki-data.json', { cache: 'force-cache' } as any)
            .then(r => r.json())
            .then(data => {
              const curMM = loadAnkiMindmaps() as any;
              const deletedSetBg = loadDeletedMindmapKeys();
              let cachedCount = 0;
              Object.entries(data.mindmaps || {}).forEach(([k, v]: any) => {
                if (deletedSetBg.has(k)) return;
                if (v && !curMM[k] && (k.startsWith('surah-') || k.startsWith('part-') || k.startsWith('meta-'))) {
                  mindmapCacheRef.set(k, v);
                  cachedCount++;
                }
              });
              // splits: persist missing premade splits (small, 3KB) so counts + export splits are accurate
              const curSplits = loadSplits();
              let newSplitsCount = 0;
              Object.entries(data.splits || {}).forEach(([k, arr]: any) => {
                const sid = Number(k);
                if (!Number.isFinite(sid) || (curSplits as any)[sid] || !Array.isArray(arr) || arr.length === 0) return;
                const normalized = (arr as any[]).map((a: any) => {
                  const sv = Number(a?.startVerse);
                  const ev = Number(a?.endVerse);
                  if (!Number.isFinite(sv) || !Number.isFinite(ev) || sv <= 0 || ev < sv) return null;
                  const surah = SURAHS.find(s => s.id === sid);
                  if (surah && (ev > surah.verseCount || sv > surah.verseCount)) return null;
                  return { id: typeof a?.id === 'string' && a.id.trim() ? a.id : `anchor-${sid}-${sv}-${ev}`, surahId: sid, startVerse: sv, endVerse: ev, label: typeof a?.label === 'string' && a.label.trim() ? a.label : `Verses ${sv}-${ev}` } as AnkiAnchor;
                }).filter(Boolean) as AnkiAnchor[];
                if (!normalized.length) return;
                const sanitized = sanitizeAnchors(sid, normalized);
                const toSave = sanitized.length ? sanitized : normalized;
                if (toSave.length) {
                  (curSplits as any)[sid] = toSave;
                  newSplitsCount++;
                }
              });
              if (newSplitsCount) {
                try { saveSplits(curSplits); setSplits(curSplits); } catch {}
              }
              // docs: cache missing docs for export field
              const curDocs = loadMindmapDocs();
              let newDocsCount = 0;
              Object.entries(data.mindmapDocs || {}).forEach(([k, v]: any) => {
                if (typeof v === 'string' && v && !curDocs[k]) {
                  (curDocs as any)[k] = v;
                  try { saveMindmapDoc(k, v); } catch {}
                  newDocsCount++;
                }
              });
              if (newDocsCount) setMindmapDocs({ ...curDocs });
              // Update state from cache (not just localStorage) so counts + UI reflect premade without persisting bulk
              if (cachedCount) {
                setMindmaps(prev => {
                  const next: any = { ...prev };
                  mindmapCacheRef.forEach((v, k) => { if (!next[k]) next[k] = v; });
                  // also include already persisted
                  Object.assign(next, curMM);
                  return next;
                });
              }
            })
            .catch(() => {});
        }
      } catch {}

      setIsAnkiDataLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [selectedMindmapKey, selectedSurah]);

  useEffect(() => {
    const current = getSplitsForSurah(selectedSurah, splits);
    if (current.length > 0) setAnchors(current);
    else setAnchors(ensureDefaultSplits(selectedSurah));
    setShowAllVerses(false);
    setShowPreview(false);
    setIsViewerReady(false);
    const t = setTimeout(() => setIsViewerReady(true), 120);
    return () => clearTimeout(t);
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
    const versesForPreview = surahVerses.length ? surahVerses : allVerses;
    if (!versesForPreview.length) return 0;
    const cards = buildAnkiCards(anchors, versesForPreview);
    return cards.length;
  }, [anchors, allVerses, surahVerses]);

  const allCardsCount = useMemo(() => {
    if (!allVerses.length) return 0;
    const mindmapKeys = new Set(Object.keys(mindmaps).filter(k => (mindmaps as any)[k]?.snapshot));
    let count = 0;
    Object.entries(splits).forEach(([k, arr]) => {
      const sId = Number(k);
      if (!Number.isFinite(sId)) return;
      if (!mindmapKeys.has(`surah-${sId}`)) return;
      count += arr.length;
    });
    SURAHS.forEach(s => {
      const key = `surah-${s.id}`;
      if (!mindmapKeys.has(key)) return;
      const hasSplit = !!splits[s.id];
      if (!hasSplit) count += 1; // auto single group for surahs with mindmap but no splits
    });
    // Add mindmap cards: one per surah/part/meta with snapshot
    const mindmapCardCount = Object.keys(mindmaps).filter(k => (mindmaps as any)[k]?.snapshot).length;
    return count + mindmapCardCount;
  }, [splits, allVerses, mindmaps]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleDeleteMindmap = () => {
    const key = selectedMindmapKey;
    deleteAnkiMindmapByKey(key);
    try { deleteMindmapDoc(key); } catch {}
    mindmapCacheRef.delete(key);
    docsCacheRef.delete(key);
    setMindmaps(prev => {
      const next: any = { ...prev };
      delete next[key];
      return next;
    });
    setMindmapDocs(prev => {
      const next: any = { ...prev };
      delete next[key];
      return next;
    });
    setShowMindmapPreview(false);
    setShowDeleteConfirm(false);
    showToast('Mindmap deleted');
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
    const verseCount = surah?.verseCount;
    if (!verseCount || val <= 0 || val >= verseCount) return;
    const currentBreaks = builderState.breaks;
    if (currentBreaks.includes(val)) return;
    // Rebuild from breaks: handles empty anchors (no splits) correctly by treating whole surah as one group
    const nextBreaks = [...currentBreaks, val].sort((a, b) => a - b);
    const next = buildAnchorsFromBreaks(selectedSurah, nextBreaks, verseCount);
    setAnchors(next.length ? next : ensureDefaultSplits(selectedSurah));
  };

  const handleRemoveBreak = (val: number) => {
    const verseCount = surah?.verseCount;
    if (!verseCount) return;
    const currentBreaks = builderState.breaks;
    if (!currentBreaks.includes(val)) return;
    const nextBreaks = currentBreaks.filter(b => b !== val);
    const next = buildAnchorsFromBreaks(selectedSurah, nextBreaks, verseCount);
    // If removal leaves no breaks, buildAnchorsFromBreaks returns single anchor covering whole surah
    // For short surahs fallback, keep default
    if (next.length) setAnchors(next);
    else setAnchors(ensureDefaultSplits(selectedSurah).length ? ensureDefaultSplits(selectedSurah) : next);
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
          if (k.includes('-')) {
            saveAnkiMindmapByKey(k, v);
            mindmapCacheRef.set(k, v);
          } else {
            const sid = Number(k);
            if (Number.isFinite(sid)) {
              saveAnkiMindmap(sid, v);
              const kk = `surah-${sid}`;
              mindmapCacheRef.set(kk, v);
            }
          }
        });
        const nextStorage = loadAnkiMindmaps() as any;
        setMindmaps(prev => ({ ...prev, ...nextStorage }));
      }
      if (json.mindmapDocs && typeof json.mindmapDocs === 'object') {
        Object.entries(json.mindmapDocs as Record<string, string>).forEach(([k, v]) => {
          if (typeof v === 'string') {
            saveMindmapDoc(k, v);
            docsCacheRef.set(k, v);
          }
        });
        const nextDocs = loadMindmapDocs();
        setMindmapDocs(prev => ({ ...prev, ...nextDocs }));
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
    setExportProgress(0);
    try {
      // Ensure all verses are loaded for export (lazy tab may only have surahVerses)
      let versesForExport = allVerses;
      if (!versesForExport.length) {
        try { versesForExport = await getQuranVerses(); setAllVerses(versesForExport); } catch {}
      }
      // Merge local storage with premade so export includes all 50-114 even if not yet persisted (quota / lazy load)
      let docsMap = loadMindmapDocs();
      let fullSplits = loadSplits();
      let fullMindmaps = loadAnkiMindmaps() as any;
      try {
        const res = await fetch('/premade-anki-data.json', { cache: 'force-cache' } as any);
        if (res.ok) {
          const premade = await res.json();
          const deletedSet = loadDeletedMindmapKeys();
          // docs: premade fills missing (skip deleted)
          if (premade.mindmapDocs && typeof premade.mindmapDocs === 'object') {
            Object.entries(premade.mindmapDocs as Record<string, string>).forEach(([k, v]) => {
              if (deletedSet.has(k)) return;
              if (typeof v === 'string' && v && !docsMap[k]) (docsMap as any)[k] = v;
            });
          }
          // mindmaps: premade base, local overrides (user edits win) — skip deleted
          if (premade.mindmaps && typeof premade.mindmaps === 'object') {
            const filteredPremade: any = {};
            Object.entries(premade.mindmaps as any).forEach(([k, v]) => {
              if (!deletedSet.has(k)) filteredPremade[k] = v;
            });
            fullMindmaps = { ...filteredPremade, ...fullMindmaps };
            // ensure deleted keys not present even if in local (should already be deleted, but filter)
            deletedSet.forEach(k => { delete (fullMindmaps as any)[k]; });
          }
          // splits: add premade splits for surahs not in local (sanitized). Empty arrays in premade are ignored -> auto anchor will handle.
          if (premade.splits && typeof premade.splits === 'object') {
            Object.entries(premade.splits as Record<string, any[]>).forEach(([k, arr]) => {
              const sid = Number(k);
              if (!Number.isFinite(sid) || fullSplits[sid]) return;
              if (!Array.isArray(arr) || arr.length === 0) return;
              const normalized = (arr as any[]).map((a: any) => {
                const sv = Number(a?.startVerse);
                const ev = Number(a?.endVerse);
                if (!Number.isFinite(sv) || !Number.isFinite(ev) || sv <= 0 || ev < sv) return null;
                const surah = SURAHS.find(s => s.id === sid);
                if (surah && (ev > surah.verseCount || sv > surah.verseCount)) return null;
                return { id: typeof a?.id === 'string' && a.id.trim() ? a.id : `anchor-${sid}-${sv}-${ev}`, surahId: sid, startVerse: sv, endVerse: ev, label: typeof a?.label === 'string' && a.label.trim() ? a.label : `Verses ${sv}-${ev}` } as AnkiAnchor;
              }).filter(Boolean) as AnkiAnchor[];
              if (!normalized.length) return;
              const sanitized = sanitizeAnchors(sid, normalized);
              if (sanitized.length) fullSplits[sid] = sanitized;
              else if (normalized.length) fullSplits[sid] = normalized;
            });
          }
        }
      } catch {}
      const allAnchors: AnkiAnchor[] = [];
      Object.entries(fullSplits).forEach(([k, arr]) => allAnchors.push(...(arr as any)));
      SURAHS.forEach(s => {
        if (s.verseCount <= 10 && !fullSplits[s.id]) {
          allAnchors.push({ id: `auto-anchor-${s.id}-1-${s.verseCount}`, surahId: s.id, startVerse: 1, endVerse: s.verseCount, label: `Verses 1-${s.verseCount}` });
        }
      });
      // Only export verse groups for surahs that have a mindmap (snapshot) linked — avoids referencing missing media
      const mindmapKeys = new Set(Object.keys(fullMindmaps).filter(k => (fullMindmaps as any)[k]?.snapshot));
      // Also ensure every surah with a mindmap has at least one anchor (default whole-surah) even if no splits yet
      SURAHS.forEach(s => {
        const key = `surah-${s.id}`;
        if (mindmapKeys.has(key) && !allAnchors.some(a => a.surahId === s.id)) {
          allAnchors.push({ id: `auto-anchor-${s.id}-1-${s.verseCount}`, surahId: s.id, startVerse: 1, endVerse: s.verseCount, label: `Verses 1-${s.verseCount}` });
        }
      });
      const filteredAnchors = allAnchors.filter(a => mindmapKeys.has(`surah-${a.surahId}`));
      const mindmapCards = buildMindmapCards(fullMindmaps as any, docsMap);
      if (filteredAnchors.length === 0 && mindmapCards.length === 0) {
        showToast('No surah/part/meta with a linked mindmap to export — create a mindmap first');
        setIsExporting(false);
        return;
      }
      const cards = buildAnkiCards(filteredAnchors, versesForExport, { mindmapDocsMap: docsMap });
      setExportProgress(3);
      const blob = await generateApkgBlob(cards, deckName, (p) => setExportProgress(p), mindmapCards, fullMindmaps);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quran-life-deck.apkg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const mindmapCardsCount = mindmapCards.length;
      showToast(`Exported ${cards.length} verse cards + ${mindmapCardsCount} mindmap cards`);
      if (withBackup) {
        const backup = { splits: fullSplits, mindmaps: fullMindmaps, mindmapDocs: docsMap, deckName, exportedAt: new Date().toISOString() };
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
      setTimeout(() => setExportProgress(0), 800);
    }
  };

  // No full-page skeleton on tab switch — lazy data + preview hidden by default means no hang
  // Show inline loading only where needed; keep tab instantly interactive
  const isInitialLoading = !isVersesLoaded || !isAnkiDataLoaded;

  return (
    <div className="space-y-6">
      {isInitialLoading && (
        <div className="text-xs text-center text-[var(--foreground-secondary)] py-2 animate-pulse">Loading deck…</div>
      )}
      {/* Header */}
      <div className="card">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Layers size={20} className="text-[var(--accent)]" /> Anki Deck</h2>
          <p className="text-sm text-[var(--foreground-secondary)] mt-1">Create your review cards. Choose how verses are grouped, then export to Anki. Use the global Export/Import in the top bar for full backups (includes Daily Portion).</p>
        </div>

        <div className="mt-4 flex gap-3 items-end">
          <div className="flex-1 min-w-0">
            <label className="adv-label mb-2 block">Deck name</label>
            <input value={deckName} onChange={e => setDeckName(e.target.value)} className="w-full p-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm" placeholder="QuranLife::Review" />
          </div>
          <button onClick={() => setShowExportPopup(true)} className="shrink-0 py-2.5 px-4 sm:px-5 rounded-xl bg-[var(--accent)] text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 whitespace-nowrap text-sm">
            <Download size={18} /> Export Full Deck to Anki
          </button>
        </div>
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
                </optgroup>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2"><ImageIcon size={16} /> Mindmap for {displayTitle}</h3>
              <div className="flex gap-2">
                {displayMindmap?.snapshot || displayMindmap?.imageUrl ? (
                  <button onClick={() => setShowMindmapPreview(v => !v)} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm flex items-center gap-1 hover:bg-[var(--verse-bg)]"><Eye size={14} /> {showMindmapPreview ? 'Hide' : 'View'}</button>
                ) : null}
                {displayMindmap?.snapshot ? (
                  <button onClick={() => setShowDeleteConfirm(true)} className="px-3 py-2 rounded-xl border border-red-200 bg-white text-red-600 text-sm flex items-center gap-1 hover:bg-red-50"><Trash2 size={14} /> Delete</button>
                ) : null}
                <button onClick={() => { if (isPartMeta) setShowPartEditor(true); else setShowMindmapEditor(true); }} className="px-3 py-2 rounded-xl bg-[var(--accent)] text-white text-sm flex items-center gap-1"><PenTool size={14} /> {displayMindmap?.snapshot ? 'Edit Mindmap' : 'Create Mindmap'}</button>
              </div>
            </div>
            {displayMindmap?.snapshot ? (
              <p className="text-xs text-[var(--foreground-secondary)] mt-2">Mindmap saved. Click View to preview.</p>
            ) : (
              <p className="text-xs text-[var(--foreground-secondary)] mt-2">No mindmap yet. Create one with the drawing editor. This is optional.</p>
            )}
            {displayMindmap?.snapshot && showMindmapPreview && !showMindmapEditor && !showPartEditor && isViewerReady && (
              <div className="mt-3 border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--background-secondary)]" style={{ height: 220 }}>
                <MindmapViewer snapshot={displayMindmap.snapshot} imageUrl={displayMindmap.imageUrl} imageUrlDark={displayMindmap.imageUrlDark} isDark={isDark} height="220px" />
              </div>
            )}
            {displayMindmap?.snapshot && showMindmapPreview && !showMindmapEditor && !showPartEditor && !isViewerReady && (
              <div className="mt-3 border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--background-secondary)] flex items-center justify-center" style={{ height: 220 }}>
                <span className="text-xs text-[var(--foreground-secondary)]">Loading preview…</span>
              </div>
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
                          <div className={`flex gap-3 ${showPreview ? 'items-start' : 'items-stretch'}`}>
                            <div className={`${showPreview ? 'w-[70%]' : 'w-full'} grid gap-2`}>
                              <div className="flex flex-wrap gap-1.5">
                                {(showAllVerses ? Array.from({ length: verseCount }, (_, i) => i + 1) : Array.from({ length: Math.min(verseCount, 60) }, (_, i) => i + 1)).map(v => {
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
                                {verseCount > 60 && !showAllVerses && (
                                  <button onClick={() => setShowAllVerses(true)} className="px-2 py-1 rounded-lg border border-dashed border-[var(--border)] text-xs bg-[var(--background)] hover:bg-[var(--verse-bg)]">
                                    +{verseCount - 60} more
                                  </button>
                                )}
                                {showAllVerses && verseCount > 60 && (
                                  <button onClick={() => setShowAllVerses(false)} className="px-2 py-1 rounded-lg border text-xs bg-[var(--background)] hover:bg-[var(--verse-bg)]">
                                    Show less
                                  </button>
                                )}
                              </div>
                              <div className="flex gap-2 mt-2">
                                <button onClick={handleSave} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs flex items-center gap-1"><Save size={12} /> Save Splits</button>
                                <button onClick={() => setShowPreview(v=>!v)} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs flex items-center gap-1"><Eye size={12} /> {showPreview ? 'Hide' : 'Preview'}</button>
                              </div>
                            </div>
                            {showPreview && (
                              <div className="w-[30%] grid gap-1.5 max-h-[220px] overflow-y-auto border border-[var(--border)] rounded-lg p-1.5 bg-[var(--background)] content-start">
                                {buildAnkiCards(anchors, surahVerses.length ? surahVerses : allVerses).map((c, i) => (
                                  <div key={i} className="text-xs"><b>{c.startVerse}-{c.endVerse}</b> — {c.anchorLabel}</div>
                                ))}
                                {buildAnkiCards(anchors, surahVerses.length ? surahVerses : allVerses).length === 0 && <div className="text-xs opacity-60">No groups</div>}
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
                    const nextStorage = saveMindmapDoc(selectedMindmapKey, editingDocText);
                    docsCacheRef.set(selectedMindmapKey, editingDocText);
                    setMindmapDocs(prev => ({ ...prev, ...nextStorage, [selectedMindmapKey]: editingDocText }));
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

        {/* Deck Statistics */}
        {(() => {
          const surahMindmapCount = Object.keys(mindmaps).filter(k => k.startsWith('surah-') && (mindmaps as any)[k]?.snapshot).length;
          const partMetaCount = Object.keys(mindmaps).filter(k => (k.startsWith('part-') || k.startsWith('meta-')) && (mindmaps as any)[k]?.snapshot).length;
          const totalVerseGroups = SURAHS.reduce((acc, s) => {
            const hasMM = !!(mindmaps as any)[`surah-${s.id}`]?.snapshot;
            if (!hasMM) return acc;
            const groups = splits[s.id]?.length;
            return acc + (groups && groups > 0 ? groups : 1);
          }, 0);
          const docsWithContent = Object.keys(mindmapDocs).filter(k => {
            const v = (mindmapDocs as any)[k];
            return typeof v === 'string' && v.trim().length > 0 && !v.includes('_Not added yet._');
          }).length;
          const docsTotal = Object.keys(mindmapDocs).filter(k => typeof (mindmapDocs as any)[k] === 'string' && (mindmapDocs as any)[k].trim().length > 0).length;
          return (
            <div className="card">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2"><BarChart3 size={16} /> Deck Statistics</h3>
                <button onClick={() => setShowStatsDetails(v => !v)} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs flex items-center gap-1 hover:bg-[var(--verse-bg)]">
                  {showStatsDetails ? 'Hide details' : 'Show details'}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                <div className="p-3 rounded-xl bg-[var(--background-secondary)] border border-[var(--border)] text-center">
                  <div className="text-lg font-bold">{surahMindmapCount}/114</div>
                  <div className="text-xs text-[var(--foreground-secondary)]">Surahs with mindmap</div>
                </div>
                <div className="p-3 rounded-xl bg-[var(--background-secondary)] border border-[var(--border)] text-center">
                  <div className="text-lg font-bold">{partMetaCount}/8</div>
                  <div className="text-xs text-[var(--foreground-secondary)]">Parts/Meta with mindmap</div>
                </div>
                <div className="p-3 rounded-xl bg-[var(--background-secondary)] border border-[var(--border)] text-center">
                  <div className="text-lg font-bold">{totalVerseGroups}</div>
                  <div className="text-xs text-[var(--foreground-secondary)]">Verse groups</div>
                </div>
                <div className="p-3 rounded-xl bg-[var(--background-secondary)] border border-[var(--border)] text-center">
                  <div className="text-lg font-bold">{docsWithContent}/{docsTotal}</div>
                  <div className="text-xs text-[var(--foreground-secondary)]">Docs with notes</div>
                  <div className="text-[10px] text-[var(--foreground-secondary)] opacity-70">excl. placeholders</div>
                </div>
              </div>
              {showStatsDetails && (
                <div className="mt-4 border-t border-[var(--border)] pt-3">
                  <h4 className="text-sm font-medium mb-2">Surahs 1-114</h4>
                  <div className="max-h-[320px] overflow-y-auto border border-[var(--border)] rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-[var(--background-secondary)] border-b border-[var(--border)]">
                        <tr>
                          <th className="text-left p-2 font-medium">Surah</th>
                          <th className="text-center p-2 font-medium">Mindmap</th>
                          <th className="text-center p-2 font-medium">Groups</th>
                          <th className="text-center p-2 font-medium">Docs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {SURAHS.map(s => {
                          const key = `surah-${s.id}`;
                          const hasMM = !!(mindmaps as any)[key]?.snapshot;
                          const groups = hasMM ? (splits[s.id]?.length ?? 1) : 0;
                          const doc = (mindmapDocs as any)[key] as string | undefined;
                          const hasDoc = typeof doc === 'string' && doc.trim().length > 0;
                          const isPlaceholder = hasDoc && doc.includes('_Not added yet._');
                          return (
                            <tr key={s.id} className="border-t border-[var(--border)] hover:bg-[var(--verse-bg)]">
                              <td className="p-2">
                                <span className="font-medium">{s.id}.</span> {s.arabicName} <span className="opacity-60">({s.name})</span>
                              </td>
                              <td className="p-2 text-center">
                                {hasMM ? <Check size={14} className="inline text-green-600" /> : <X size={14} className="inline text-[var(--foreground-secondary)] opacity-40" />}
                              </td>
                              <td className="p-2 text-center">
                                {hasMM ? <span className="px-1.5 py-0.5 rounded bg-[var(--verse-bg)] border border-[var(--border)]">{groups}</span> : <span className="opacity-40">—</span>}
                              </td>
                              <td className="p-2 text-center">
                                {!hasDoc ? <X size={14} className="inline text-[var(--foreground-secondary)] opacity-40" /> : isPlaceholder ? <span title="Placeholder" className="inline-flex items-center gap-1 text-amber-600"><FileText size={12} />•</span> : <Check size={14} className="inline text-green-600" />}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <h4 className="text-sm font-medium mt-4 mb-2">Parts & Meta</h4>
                  <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-[var(--background-secondary)] border-b border-[var(--border)]">
                        <tr>
                          <th className="text-left p-2 font-medium">Part</th>
                          <th className="text-center p-2 font-medium">Mindmap</th>
                          <th className="text-center p-2 font-medium">Docs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { key: 'meta-0', label: 'Meta Overview' },
                          { key: 'part-1', label: 'Part 1 — Surah 1-5' },
                          { key: 'part-2', label: 'Part 2 — Surah 6-9' },
                          { key: 'part-3', label: 'Part 3 — Surah 10-24' },
                          { key: 'part-4', label: 'Part 4 — Surah 25-33' },
                          { key: 'part-5', label: 'Part 5 — Surah 34-49' },
                          { key: 'part-6', label: 'Part 6 — Surah 50-66' },
                          { key: 'part-7', label: 'Part 7 — Surah 67-114' },
                        ].map(row => {
                          const hasMM = !!(mindmaps as any)[row.key]?.snapshot;
                          const doc = (mindmapDocs as any)[row.key] as string | undefined;
                          const hasDoc = typeof doc === 'string' && doc.trim().length > 0;
                          const isPlaceholder = hasDoc && doc.includes('_Not added yet._');
                          return (
                            <tr key={row.key} className="border-t border-[var(--border)] hover:bg-[var(--verse-bg)]">
                              <td className="p-2">{row.label} <span className="opacity-60">({row.key})</span></td>
                              <td className="p-2 text-center">{hasMM ? <Check size={14} className="inline text-green-600" /> : <X size={14} className="inline text-[var(--foreground-secondary)] opacity-40" />}</td>
                              <td className="p-2 text-center">{!hasDoc ? <X size={14} className="inline text-[var(--foreground-secondary)] opacity-40" /> : isPlaceholder ? <span title="Placeholder" className="inline-flex items-center gap-1 text-amber-600"><FileText size={12} />•</span> : <Check size={14} className="inline text-green-600" />}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-[var(--foreground-secondary)] mt-2">• = placeholder doc (“Not added yet”). Check = real notes. Groups = verse groups for deck (1 if mindmap but no splits).</p>
                </div>
              )}
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
              const key = `surah-${selectedSurah}`;
              const nextStorage = saveAnkiMindmap(selectedSurah, { snapshot, isComplete: true });
              const newEntry: any = { key, kind: 'surah', surahId: selectedSurah, snapshot, isComplete: true, updatedAt: new Date().toISOString() };
              mindmapCacheRef.set(key, { ...mindmapCacheRef.get(key), ...newEntry });
              setMindmaps(prev => ({ ...prev, ...(nextStorage as any), [key]: { ...(prev as any)[key], ...newEntry } }));
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
                const nextStorage = saveAnkiMindmapByKey(key, { snapshot, isComplete: true, kind: isMeta ? 'meta' : 'part', partId });
                const newEntry: any = { key, kind: isMeta ? 'meta' : 'part', partId, snapshot, isComplete: true, updatedAt: new Date().toISOString() };
                mindmapCacheRef.set(key, { ...mindmapCacheRef.get(key), ...newEntry });
                setMindmaps(prev => ({ ...prev, ...(nextStorage as any), [key]: { ...(prev as any)[key], ...newEntry } }));
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
        confirmLabel="Export Deck + Backup"
        cancelLabel="Cancel"
        isDestructive={false}
        isProcessing={isExporting}
        progress={isExporting ? exportProgress : undefined}
        onConfirm={() => handleExport(true)}
        onCancel={() => setShowExportPopup(false)}
      >
        <div className="space-y-3 text-sm">
          <div className="p-3 rounded-xl bg-[var(--verse-bg)] border border-[var(--border)]">
            <div className="font-medium mb-2">What will be exported:</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>{allCardsCount} total cards ({allCardsCount - Object.keys(mindmaps).filter(k=>(mindmaps as any)[k]?.snapshot).length} verse groups + {Object.keys(mindmaps).filter(k=>(mindmaps as any)[k]?.snapshot).length} mindmap image cards)</li>
              <li>{Object.keys(mindmaps).filter(k=>k.startsWith('surah-')).length} Surah mindmaps (each → verse groups + 1 mindmap card)</li>
              <li>{Object.keys(mindmaps).filter(k=>k.startsWith('part-')||k.startsWith('meta-')).length} Part & Meta mindmaps (each → 1 mindmap card only)</li>
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

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title="Delete mindmap?"
        message={`Delete mindmap for ${selectedMindmapKey === 'meta-0' ? 'Meta Overview' : selectedMindmapKey.startsWith('part-') ? `Part ${selectedMindmapKey.replace('part-','')}` : `${surah?.arabicName || 'Surah'} ${selectedSurah}`} ? This will remove the drawing and its notes. Export will no longer include it unless you recreate it.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={handleDeleteMindmap}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[var(--background-secondary)] border border-[var(--border)] shadow-lg rounded-xl px-4 py-2 text-sm z-50">{toast}</div>
      )}
    </div>
  );
}
