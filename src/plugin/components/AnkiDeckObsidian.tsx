'use client';
import React from 'react';
import { getQuranVerses, getSurah, SURAHS } from '@/lib/quranData';
import { buildAnkiCards, buildMindmapCards } from '@/lib/anki/cardBuilder';
import { generateApkgBlob } from '@/lib/anki/apkgExport';
import { AnkiAnchor } from '@/lib/anki/types';
import type { MindmapSnapshot } from '@/lib/mindmapSnapshot';
import type { Verse } from '@/lib/types';
import { useVaultSplits, useVaultMindmap, useVaultDoc, useVaultMindmaps, useVaultAnkiExportPrefs } from '@/plugin/hooks/useVaultAnkiStore';
import type { VaultStore } from '@/plugin/storage/vaultAdapter';
import { buildAnchorsFromBreaks, ensureDefaultSplits } from '@/lib/anki/splitStore';
import { Eye, Layers, PenTool, Split, Download, Trash2, Check, X, FileText, BarChart3, ChevronLeft, ChevronRight } from 'lucide-react';
import MindmapEditor from '@/plugin/components/MindmapEditorObsidian';
import MindmapViewer from '@/plugin/components/MindmapViewerObsidian';

const { useEffect, useMemo, useState, useCallback } = React;

/**
 * Splits/docs written by hand (or by an older build) may use `surah-2` while
 * this view writes `surah-002`. Normalize both to one stats key so files dropped
 * directly into the plugin data folder are recognized like view-made entries.
 */
const normalizeStoreKey = (key: string): string => {
  const k = String(key).trim();
  const surah = k.match(/^surah-0*(\d+)$/i);
  if (surah) return `surah-${Number(surah[1])}`;
  const part = k.match(/^part-0*(\d+)$/i);
  if (part) return `part-${Number(part[1])}`;
  const meta = k.match(/^meta-0*(\d+)$/i);
  if (meta) return `meta-${Number(meta[1])}`;
  return k;
};

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
  const [editorInitialSnapshot, setEditorInitialSnapshot] = useState<MindmapSnapshot | null>(null);
  const [showAllVerses, setShowAllVerses] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [showMindmapPreview, setShowMindmapPreview] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Progress popup inspired by obsidian-importer/src/progress-ui.ts (cloned at ./obsidian-importer) — shows status, bar (via --importer-progress), stats and log
  const [exportProgress, setExportProgress] = useState<null | { status: string; current: number; total: number; logs: string[]; verseCards?: number; mindmapCards?: number; mindmapDone?: number; mindmapTotal?: number }>(null);
  const { mindmap: currentMindmap, save: saveMindmap, remove: deleteMindmap } = useVaultMindmap(vaultStore, selectedMindmapKey);
  const { mindmaps: allMindmaps } = useVaultMindmaps(vaultStore);
  const { anchors: vaultAnchors, saveAnchors, isLoading: isSplitsLoading } = useVaultSplits(vaultStore, selectedSurah);
  const { content: docContent, save: saveDoc } = useVaultDoc(vaultStore, selectedMindmapKey);
  const { prefs: ankiExportPrefs } = useVaultAnkiExportPrefs(vaultStore);
  const [localAnchors, setLocalAnchors] = useState<AnkiAnchor[]>([]);
  const [editingDocText, setEditingDocText] = useState('');
  // Latest local splits for auto-flush on mindmap switch/unmount. Assigned during
  // render so switch-cleanups always read the freshest value (effect ordering safe).
  const localAnchorsRef = React.useRef<AnkiAnchor[]>([]);
  localAnchorsRef.current = localAnchors;
  // True once the user edits splits and no successful persist has happened yet.
  // Used to avoid writing spurious default files for untouched surahs on switch.
  const splitsDirtyRef = React.useRef(false);
  // Latest doc text + its key for the same auto-flush treatment (blur may not fire on switch).
  const editingDocTextRef = React.useRef('');
  editingDocTextRef.current = editingDocText;
  const docSavedRef = React.useRef('');
  useEffect(() => { docSavedRef.current = docContent; }, [docContent]);
  const [showStatsDetails, setShowStatsDetails] = useState(false);
  const [allSplitsForStats, setAllSplitsForStats] = useState<Record<number, AnkiAnchor[]>>({});
  const [allDocsForStats, setAllDocsForStats] = useState<Record<string, string>>({});

  useEffect(() => { setEditingDocText(docContent); }, [docContent]);
  // Adopt vault splits once the current surah has finished loading. The loading
  // guard prevents the previous surah's (now reset) anchors from clobbering the
  // new surah's editor, and a successful adopt clears the dirty flag.
  useEffect(() => {
    if (isSplitsLoading) return;
    if (vaultAnchors.length) setLocalAnchors(vaultAnchors);
    else setLocalAnchors(ensureDefaultSplits(selectedSurah));
    splitsDirtyRef.current = false;
  }, [vaultAnchors, selectedSurah, isSplitsLoading]);

  // Auto-flush unsaved splits + notes when switching mindmaps (or unmounting).
  // Split +/- edits update local state; without this, switching the dropdown
  // discards them via the adopt effect above. The cleanup runs for the previous
  // surah/key before the new one loads, persisting exactly what the user left.
  useEffect(() => {
    const surahAtMount = selectedSurah;
    const keyAtMount = selectedMindmapKey;
    return () => {
      try {
        if (splitsDirtyRef.current) {
          const pending = localAnchorsRef.current;
          if (Array.isArray(pending) && pending.length && pending.every(a => a && a.surahId === surahAtMount)) {
            splitsDirtyRef.current = false;
            void vaultStore.saveSplitsForSurah(surahAtMount, pending).catch(() => { splitsDirtyRef.current = true; });
          }
        }
      } catch { /* best-effort only; ignore */ }
      try {
        const pendingDoc = editingDocTextRef.current;
        if (typeof pendingDoc === 'string' && pendingDoc !== docSavedRef.current) {
          docSavedRef.current = pendingDoc;
          void vaultStore.saveDoc(keyAtMount, pendingDoc).catch(() => { /* best-effort only; ignore */ });
        }
      } catch { /* best-effort only; ignore */ }
    };
  }, [selectedSurah, selectedMindmapKey, vaultStore]);

  // Load all splits/docs for Deck Statistics.
  // Folders are enumerated instead of probing one key at a time: that way files
  // added directly in the plugin data folder (`splits/surah-2.json`,
  // `docs/surah-2.md`, `surah-002.*`, part/meta keys…) or synced from another
  // device count exactly like entries created in this view. Previously docs were
  // only discovered through `allMindmaps`, so standalone notes were invisible.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const splits: Record<number, AnkiAnchor[]> = {};
      try {
        const all = await vaultStore.loadAllSplits();
        for (const [sidRaw, arr] of Object.entries(all || {})) {
          const sid = Number(sidRaw);
          if (!Number.isFinite(sid) || !Array.isArray(arr) || arr.length === 0) continue;
          splits[sid] = arr;
        }
      } catch { /* best-effort only; ignore */ }
      if (Object.keys(splits).length === 0) {
        // Fallback for platforms where folder listing returns nothing
        for (let sid=1; sid<=114; sid++) {
          const arr = await vaultStore.loadSplitsForSurah(sid);
          if (arr && arr.length) splits[sid] = arr;
        }
      }
      const docs: Record<string, string> = {};
      try {
        const stored = await vaultStore.loadAllDocs();
        for (const [key, content] of Object.entries(stored || {})) {
          if (typeof content === 'string' && content.trim()) docs[normalizeStoreKey(key)] = content;
        }
      } catch { /* best-effort only; ignore */ }
      // Keys edited in this view whose file may not be flushed yet
      for (const key of Object.keys(allMindmaps)) {
        const normalized = normalizeStoreKey(key);
        if (docs[normalized]) continue;
        const d = await vaultStore.loadDoc(key);
        if (typeof d === 'string' && d.trim()) docs[normalized] = d;
      }
      const currentKey = normalizeStoreKey(selectedMindmapKey);
      if (editingDocText.trim() && !docs[currentKey]) docs[currentKey] = editingDocText;
      if (!cancelled) {
        setAllSplitsForStats(splits);
        setAllDocsForStats(docs);
      }
    })();
    return () => { cancelled = true; };
  }, [vaultStore, allMindmaps, editingDocText, selectedMindmapKey]);

  const surah = getSurah(selectedSurah);
  // One-time Quran corpus download (fresh installs only): byte progress for
  // the loading gate, plus an error state with retry instead of a dead view.
  const [quranDownload, setQuranDownload] = useState<null | { downloaded: number; total: number | null }>(null);
  const [quranError, setQuranError] = useState<string | null>(null);
  const [quranAttempt, setQuranAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let ok = false;
      try {
        if (allVerses.length) {
          if (!cancelled) { setIsVersesLoaded(true); }
          return;
        }
        const verses = await getQuranVerses((downloaded, total) => {
          if (!cancelled) setQuranDownload({ downloaded, total });
        });
        if (cancelled) return;
        if (!verses.length) throw new Error('Quran data came back empty — check your connection and retry.');
        setQuranError(null);
        setAllVerses(verses);
        ok = true;
      } catch (e) {
        if (!cancelled) {
          setAllVerses([]);
          setQuranError(String((e as Error)?.message || e || 'Could not load Quran data.'));
        }
      }
      finally {
        // Only mark loaded when verses exist — on failure the error card
        // (with retry) shows instead of an empty view.
        if (!cancelled) {
          setQuranDownload(null);
          if (ok) setIsVersesLoaded(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [selectedSurah, allVerses.length, quranAttempt]);

  const builderState = useMemo(() => {
    const sorted = [...localAnchors].sort((a,b)=>a.startVerse-b.startVerse);
    const breaks = sorted.slice(0,-1).map(a=>a.endVerse);
    return { breaks, anchors: sorted };
  }, [localAnchors]);

  const showToast = useCallback((msg: string) => { setToast(msg); window.setTimeout(()=>setToast(null),3000); }, []);

  const mindmapOrder = useMemo(() => [...SURAHS.map(s => `surah-${s.id}`), 'meta-0', 'part-1', 'part-2', 'part-3', 'part-4', 'part-5', 'part-6', 'part-7'], []);
  const stepMindmap = useCallback((dir: 1 | -1) => {
    setSelectedMindmapKey(prev => {
      const i = mindmapOrder.indexOf(prev);
      if (i === -1) return dir === 1 ? mindmapOrder[0] : mindmapOrder[mindmapOrder.length - 1];
      return mindmapOrder[(i + dir + mindmapOrder.length) % mindmapOrder.length];
    });
  }, [mindmapOrder]);

  const handleAddBreak = (val: number) => {
    const vc = surah?.verseCount; if (!vc) return;
    const next = buildAnchorsFromBreaks(selectedSurah, [...builderState.breaks, val].sort((a,b)=>a-b), vc);
    const resolved = next.length ? next : ensureDefaultSplits(selectedSurah);
    setLocalAnchors(resolved);
    // Persist immediately so switching mindmaps never loses the edit, even if
    // the user never presses Save. The Save button remains as explicit confirm.
    splitsDirtyRef.current = true;
    void (async () => {
      try {
        await saveAnchors(resolved);
        // Only clear dirty if no newer edit superseded this save (concurrent writes).
        if (localAnchorsRef.current === resolved) splitsDirtyRef.current = false;
      }
      catch { /* keep dirty so the switch-flush retries */ }
    })();
  };
  const handleRemoveBreak = (val: number) => {
    const vc = surah?.verseCount; if (!vc) return;
    const nextBreaks = builderState.breaks.filter(b=>b!==val);
    const next = buildAnchorsFromBreaks(selectedSurah, nextBreaks, vc);
    const resolved = next.length ? next : ensureDefaultSplits(selectedSurah);
    setLocalAnchors(resolved);
    // Same immediate persist as handleAddBreak (see above).
    splitsDirtyRef.current = true;
    void (async () => {
      try {
        await saveAnchors(resolved);
        // Only clear dirty if no newer edit superseded this save (concurrent writes).
        if (localAnchorsRef.current === resolved) splitsDirtyRef.current = false;
      }
      catch { /* keep dirty so the switch-flush retries */ }
    })();
  };
  // Splits persist on every change (see handleAddBreak/handleRemoveBreak plus the
  // switch/unmount flush), so there is no explicit Save action anymore.

  // Silent persist for autosave + pre-exit save. Must NOT close the editor,
  // must NOT toast/banner — the editor stays open until the user closes it manually.
  // Save-state feedback lives in the editor top-bar indicator.
  const handleSaveMindmap = useCallback(async (snapshot: MindmapSnapshot) => {
    await saveMindmap({ snapshot, isComplete: true });
  }, [saveMindmap]);

  // Frozen snapshot captured at open time so autosave-driven parent re-renders
  // don't churn the editor's initialSnapshot prop mid-edit (no remount/focus loss).
  const openMindmapEditor = useCallback(() => {
    setEditorInitialSnapshot(currentMindmap?.snapshot ?? null);
    setShowMindmapEditor(true);
  }, [currentMindmap?.snapshot]);
  const closeMindmapEditor = useCallback(() => {
    setShowMindmapEditor(false);
  }, []);

  const handleDeleteMindmap = async () => {
    await deleteMindmap();
    setShowDeleteConfirm(false);
    setShowMindmapPreview(false);
    showToast('Mindmap deleted');
  };

  const handleDocSave = async () => {
    const snapshot = editingDocText;
    await saveDoc(snapshot);
    docSavedRef.current = snapshot;
    showToast('Notes saved');
  };

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportProgress({ status: 'Preparing export…', current: 0, total: 100, logs: ['Starting export...'] });
    const updateProgress = (patch: Partial<{ status: string; current: number; logs: string[]; verseCards: number; mindmapCards: number; mindmapDone: number; mindmapTotal: number }>) => {
      setExportProgress(prev => prev ? { ...prev, ...patch, logs: patch.logs ?? prev.logs } : null);
    };
    const pushLog = (msg: string) => setExportProgress(prev => prev ? { ...prev, logs: [...prev.logs, msg] } : null);
    try {
      updateProgress({ status: 'Loading verses…', current: 3 });
      let versesForExport = allVerses;
      if (!versesForExport.length) {
        try {
          versesForExport = await getQuranVerses((downloaded, total) => {
            const pct = total ? ` ${Math.min(99, Math.round((downloaded / total) * 100))}%` : '';
            updateProgress({ status: `Downloading Quran data (one-time)${pct}…`, current: 3 });
          });
          setAllVerses(versesForExport);
          pushLog(`Loaded ${versesForExport.length} verses`);
        } catch { /* best-effort only; ignore */ }
      }
      else pushLog(`Verses cached: ${versesForExport.length}`);

      updateProgress({ status: 'Loading splits…', current: 5 });
      const fullSplits: Record<number, AnkiAnchor[]> = {};
      // Enumerate the splits folder first so files added directly in the plugin
      // data folder (regardless of `surah-N.json` zero-padding) are exported too.
      try {
        const allSplits = await vaultStore.loadAllSplits();
        for (const [sidRaw, arr] of Object.entries(allSplits || {})) {
          const sid = Number(sidRaw);
          if (!Number.isFinite(sid) || !Array.isArray(arr) || arr.length === 0) continue;
          fullSplits[sid] = arr;
        }
      } catch { /* best-effort only; ignore */ }
      if (Object.keys(fullSplits).length === 0) {
        for (let sid=1; sid<=114; sid++) {
          const arr = await vaultStore.loadSplitsForSurah(sid);
          if (arr && arr.length) fullSplits[sid] = arr;
          if (sid % 20 === 0 || sid === 114) {
            updateProgress({ current: 5 + Math.round((sid/114)*25), status: `Loading splits ${sid}/114…` });
            // allow UI to repaint
            await new Promise(r => window.setTimeout(r, 0));
          }
        }
      }
      if (!fullSplits[selectedSurah] && localAnchors.length) fullSplits[selectedSurah] = localAnchors;
      pushLog(`Loaded splits for ${Object.keys(fullSplits).length} surahs`);
      updateProgress({ current: 32, status: 'Ensuring short surahs…' });
      const mindmapKeys = new Set(Object.keys(allMindmaps).filter(k => allMindmaps[k]?.snapshot));
      // Vault-only: every surah WITH a mindmap exports at least 1 verse group.
      // Short surahs (<=10 verses) and mindmap-linked surahs without saved splits
      // get a single auto group — the same fallback Deck Statistics uses, so both
      // numbers always match. Splits without a mindmap are never exported.
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
      // Notes added directly in the data folder (regardless of key zero-padding) are exported too.
      try {
        const storedDocs = await vaultStore.loadAllDocs();
        for (const [key, content] of Object.entries(storedDocs || {})) {
          const normalized = normalizeStoreKey(key);
          if (docsMap[normalized] === undefined) docsMap[normalized] = content;
        }
      } catch { /* best-effort only; ignore */ }
      updateProgress({ current: 48, status: 'Building cards…' });
      const mindmapCards = buildMindmapCards(allMindmaps, docsMap);
      if (filteredAnchors.length===0 && mindmapCards.length===0) {
        showToast('No mindmap-linked surah to export — create a mindmap first');
        setExportProgress(null);
        setIsExporting(false);
        return;
      }
      const cards = buildAnkiCards(filteredAnchors, versesForExport, { mindmapDocsMap: docsMap });
      pushLog(`Built ${cards.length} verse cards + ${mindmapCards.length} mindmap cards`);
      updateProgress({ current: 60, status: `Rendering mindmaps & packaging…`, verseCards: cards.length, mindmapCards: mindmapCards.length });
      // Global partOrder + surahOrder from Obsidian settings → vault file meta/anki-export.json
      let exportPrefs: import('@/lib/anki/ankiExportPrefs').AnkiExportPrefs | null = null;
      try { exportPrefs = ankiExportPrefs ?? await vaultStore.loadAnkiExportPrefs(); } catch { /* best-effort only; ignore */ }
      const prefsSummary = exportPrefs ? `partOrder=${exportPrefs.partOrder} surahOrder=${exportPrefs.surahOrder}` : 'default partOrder=desc surahOrder=asc';
      pushLog(`Anki sort prefs: ${prefsSummary}`);
      // generateApkgBlob reports 0-100 for its internal phases (mindmap media 5-80), map to 60-96
      // mmDone/mmTotal are live mindmap render counts — shown dynamically in the stats + status
      const blob = await generateApkgBlob(cards, deckName, (p, mmDone, mmTotal)=> {
        const mapped = 60 + Math.round((p/100)*35);
        setExportProgress(prev => {
          if (!prev) return prev;
          const rendering = mmTotal ? (mmDone ?? 0) < mmTotal : p < 80;
          return {
            ...prev,
            current: Math.min(96, mapped),
            status: rendering && mmTotal ? `Rendering mindmaps ${mmDone ?? 0}/${mmTotal}…` : (p < 80 ? `Rendering mindmaps ${p}%…` : `Packaging ${p}%…`),
            mindmapDone: mmDone ?? prev.mindmapDone,
            mindmapTotal: mmTotal ?? prev.mindmapTotal,
          };
        });
      }, mindmapCards, allMindmaps, exportPrefs);
      updateProgress({ current: 98, status: 'Finalizing download…' });
      // Mobile WebView often blocks the anchor download with no error — also
      // persist the .apkg into the vault so the export is never lost.
      try {
        const savedPath = await vaultStore.saveApkgFile('quran-life-deck.apkg', blob);
        pushLog(`Saved to vault: ${savedPath}`);
      } catch (e) {
        pushLog(`Vault save skipped: ${String((e as Error)?.message || e)}`);
      }
      // Trigger browser download of the .apkg blob.
      const url = URL.createObjectURL(blob);
      const a = document.body.createEl('a', { href: url });
      a.download = 'quran-life-deck.apkg';
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      updateProgress({ current: 100, status: `Complete: ${cards.length} verse + ${mindmapCards.length} mindmap cards`, verseCards: cards.length, mindmapCards: mindmapCards.length });
      pushLog(`Download started: ${deckName}.apkg`);
      showToast(`Exported ${cards.length} verse cards + ${mindmapCards.length} mindmap cards`);
      // keep progress visible briefly then auto-close if user doesn't click Done
      window.setTimeout(() => {
        setExportProgress(prev => prev && prev.current === 100 ? null : prev);
        setIsExporting(false);
      }, 2200);
      return;
    } catch (e) { console.error(e); showToast('Export failed'); setExportProgress(prev => prev ? { ...prev, status: 'Failed — see console', logs: [...prev.logs, String((e as Error)?.message || e)] } : null); window.setTimeout(()=>{ setExportProgress(null); }, 2500); }
    finally {
      // if already set to 100, let timeout close; otherwise ensure closed
      window.setTimeout(()=>{ setExportProgress(prev => (prev && prev.current < 100 ? null : prev)); }, 3000);
      setIsExporting(false);
    }
  };

  if (!isVersesLoaded) {
    const fmtMB = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
    const pct = quranDownload && quranDownload.total
      ? Math.min(99, Math.round((quranDownload.downloaded / quranDownload.total) * 100))
      : null;
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'30vh', flexDirection:'column', gap:10, padding:24 }}>
        {quranError && !quranDownload ? (
          <>
            <span style={{ fontSize:'2em' }}>⚠️</span>
            <span style={{ fontSize:'0.9em', fontWeight:700, color:'var(--text-normal)', textAlign:'center' }}>Quran data couldn't load</span>
            <span style={{ fontSize:'0.8em', color:'var(--text-muted)', textAlign:'center', maxWidth:380 }}>{quranError} First launch needs internet once to fetch the Quran text — afterwards everything works offline.</span>
            <button onClick={() => { setQuranError(null); setQuranAttempt(a => a + 1); }} style={{ padding:'8px 18px', borderRadius:8, background:'var(--interactive-accent)', color:'var(--text-on-accent)', border:'none', cursor:'pointer', fontWeight:600, fontSize:'0.9em' }}>Retry</button>
          </>
        ) : (
          <>
            <div style={{ width:24, height:24, border:'3px solid var(--background-modifier-border)', borderTopColor:'var(--interactive-accent)', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
            <span style={{ fontSize:'0.85em', color:'var(--text-muted)' }}>
              {quranDownload
                ? `Downloading Quran data (one-time)${pct !== null ? ` — ${pct}%` : quranDownload.downloaded > 0 ? ` — ${fmtMB(quranDownload.downloaded)}` : '…'}` : 'Loading verses…'}
            </span>
            {quranDownload && (
              <div style={{ width:'100%', maxWidth:320, height:8, background:'var(--background-secondary)', borderRadius:999, overflow:'hidden', boxShadow:'inset 0 0 0 1px var(--background-modifier-border)' }}>
                <div style={{ width: pct !== null ? `${pct}%` : '30%', height:'100%', background:'var(--interactive-accent)', borderRadius:999, transition:'width 0.3s ease' }} />
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  const displayTitle = isPartOrMeta ? (selectedMindmapKey==='meta-0' ? 'Meta Overview' : `Part ${selectedMindmapKey.replace('part-','')}`) : `${surah?.arabicName} • Surah ${selectedSurah}`;
  const vc = surah?.verseCount || 0;

  const cardBase: React.CSSProperties = {
    border: '1px solid var(--background-modifier-border)',
    borderRadius: 12,
    background: 'var(--background-primary)',
    padding: 16,
  };

  // Embedded editor: renders inline inside the Obsidian ItemView content so the
  // native tab header (tabs + title bar) stays visible for multitasking.
  // Previously this used createPortal + position:fixed to document.body which
  // covered the entire Obsidian window including the tab bar.
  if (showMindmapEditor) {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '65vh', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--background-primary)', color: 'var(--text-normal)', margin: 0, padding: 0, gap: 0, alignSelf: 'stretch' }}>
        <MindmapEditor
          initialSnapshot={editorInitialSnapshot}
          surahId={isPartOrMeta ? undefined : selectedSurah}
          partId={isPartOrMeta ? Number(selectedMindmapKey.replace('part-', '').replace('meta-', '')) : undefined}
          onSave={handleSaveMindmap}
          onClose={closeMindmapEditor}
          title={displayTitle}
          vaultStore={vaultStore}
        />
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
          /* Editor fills the leaf edge-to-edge: kill the inherited view padding/gap
             so there is no unused strip between the Obsidian tab bar and our top bar. */
          .view-content.quran-life-anki { padding: 0 !important; margin: 0 !important; gap: 0 !important; }
          .view-content.quran-life-anki > .quran-life-react-root { padding: 0 !important; margin: 0 !important; gap: 0 !important; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="quran-life-anki" style={{ position:'relative', padding:'16px', maxWidth:720, margin:'0 auto', width:'100%', display:'flex', flexDirection:'column', gap:16, color:'var(--text-normal)' }}>
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
      <div className="ql-card" style={{ ...cardBase, borderLeft:'3px solid var(--interactive-accent)', display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 8px', borderRadius:6, background:'color-mix(in srgb, var(--interactive-accent) 14%, transparent)', color:'var(--interactive-accent)', fontSize:'0.72em', fontWeight:700, letterSpacing:'0.02em', border:'1px solid color-mix(in srgb, var(--interactive-accent) 22%, transparent)' }}>
            <Download size={12} /> EXPORT
          </span>
          <span style={{ fontSize:'0.78em', color:'var(--text-faint)' }}>Generate .apkg for Anki</span>
        </div>
        <div className="ql-export-row" style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input value={deckName} onChange={e=>setDeckName(e.target.value)} placeholder="QuranLife::Review" style={{ flex:1, minWidth:0, padding:'8px 10px', borderRadius:8, border:'1px solid var(--background-modifier-border)', background:'var(--background-secondary)', color:'var(--text-normal)', fontSize:'0.9em' }} />
          <button onClick={() => void handleExport()} disabled={isExporting} style={{ padding:'8px 14px', borderRadius:8, background:'var(--interactive-accent)', color:'var(--text-on-accent)', border:'none', display:'inline-flex', gap:6, alignItems:'center', cursor:'pointer', fontWeight:600, fontSize:'0.9em', opacity:isExporting?0.7:1 }}>
            <Download size={16} /> {isExporting?'Exporting…':'Export to Anki'}
          </button>
        </div>
        {ankiExportPrefs && (
          <div style={{ fontSize:'0.72em', color:'var(--text-faint)', lineHeight:1.4, padding:'6px 8px', border:'1px dashed var(--background-modifier-border)', borderRadius:8, background:'var(--background-secondary)' }}>
            <span style={{ fontWeight:700, color:'var(--text-muted)' }}>Anki sort:</span> partOrder={ankiExportPrefs.partOrder} ({ankiExportPrefs.partOrder==='asc'?'1→7':'7→1'}) • surahOrder={ankiExportPrefs.surahOrder} ({ankiExportPrefs.surahOrder==='asc'?'first→last':'last→first'}) <span style={{ opacity:0.7 }}>— change in Settings → Anki Export</span>
          </div>
        )}

      </div>

      {/* Mindmap Selector & Actions — matching Daily tone */}
      <div className="ql-card" style={{ ...cardBase, borderLeft:'3px solid var(--interactive-accent)', display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          <label style={{ fontSize:'0.78em', fontWeight:700, color:'var(--text-muted)', letterSpacing:'0.03em', textTransform:'uppercase' }}>Mindmap to edit</label>
          <div style={{ display:'flex', gap:6, alignItems:'stretch' }}>
            <button onClick={()=>stepMindmap(-1)} title="Previous mindmap" aria-label="Previous mindmap" style={{ padding:'0 10px', minHeight:'40px', borderRadius:8, border:'1px solid var(--background-modifier-border)', background:'var(--background-secondary)', color:'var(--text-normal)', display:'inline-flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}><ChevronLeft size={16}/></button>
            <select value={selectedMindmapKey} onChange={e=>setSelectedMindmapKey(e.target.value)} className="dropdown" style={{ flex:1, minWidth:0, padding:'10px 12px', minHeight:'40px', lineHeight:'1.4', borderRadius:8, border:'1px solid var(--background-modifier-border)', background:'var(--background-secondary)', color:'var(--text-normal)', fontSize:'0.9em' }}>
              <optgroup label="Surahs">{SURAHS.map(s=> <option key={`surah-${s.id}`} value={`surah-${s.id}`}>{s.id}. {s.arabicName} ({s.name})</option>)}</optgroup>
              <optgroup label="Parts & Meta"><option value="meta-0">Meta • Overview</option><option value="part-1">Part 1 • 1-5</option><option value="part-2">Part 2 • 6-9</option><option value="part-3">Part 3 • 10-24</option><option value="part-4">Part 4 • 25-33</option><option value="part-5">Part 5 • 34-49</option><option value="part-6">Part 6 • 50-66</option><option value="part-7">Part 7 • 67-114</option></optgroup>
            </select>
            <button onClick={()=>stepMindmap(1)} title="Next mindmap" aria-label="Next mindmap" style={{ padding:'0 10px', minHeight:'40px', borderRadius:8, border:'1px solid var(--background-modifier-border)', background:'var(--background-secondary)', color:'var(--text-normal)', display:'inline-flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}><ChevronRight size={16}/></button>
          </div>

        </div>

        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {currentMindmap?.snapshot ? <button onClick={()=>setShowMindmapPreview(v=>!v)} style={{ padding:'7px 12px', borderRadius:8, border:'1px solid var(--background-modifier-border)', background:'var(--background-secondary)', color:'var(--text-normal)', display:'inline-flex', gap:6, alignItems:'center', cursor:'pointer', fontSize:'0.85em' }}><Eye size={14}/>{showMindmapPreview?'Hide preview':'View'}</button> : null}
          {currentMindmap?.snapshot ? <button onClick={()=>setShowDeleteConfirm(true)} style={{ padding:'7px 12px', borderRadius:8, border:'1px solid var(--text-error)', color:'var(--text-error)', background:'var(--background-secondary)', display:'inline-flex', gap:6, alignItems:'center', cursor:'pointer', fontSize:'0.85em' }}><Trash2 size={14}/>Delete</button> : null}
          <button onClick={openMindmapEditor} style={{ padding:'7px 14px', borderRadius:8, background:'var(--interactive-accent)', color:'var(--text-on-accent)', border:'none', display:'inline-flex', gap:6, alignItems:'center', cursor:'pointer', fontWeight:600, fontSize:'0.85em', marginLeft:'auto' }}><PenTool size={14}/>{currentMindmap?.snapshot ? 'Edit Mindmap' : 'Create Mindmap'}</button>
        </div>

        {currentMindmap?.snapshot && showMindmapPreview && !showMindmapEditor && (
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

            <div className={`ql-splits-row${showPreview ? '' : ' ql-no-preview'}`}>
              <div className="ql-splits-editor">
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
                <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:8, border:'1px dashed var(--background-modifier-border)', color:'var(--text-faint)', fontSize:'0.78em' }}>
                    <Check size={12}/> Saved automatically on every change
                  </span>
                  <button onClick={()=>setShowPreview(v=>!v)} style={{ padding:'7px 12px', borderRadius:8, border:'1px solid var(--background-modifier-border)', background:'var(--background-primary)', color:'var(--text-muted)', display:'inline-flex', gap:6, alignItems:'center', cursor:'pointer', fontSize:'0.85em', marginLeft:'auto' }}><Eye size={14}/>{showPreview ? 'Hide' : 'Preview'}</button>
                </div>
              </div>
              {showPreview && (
                <div className="ql-splits-preview">
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
            <textarea value={editingDocText} onChange={e=>setEditingDocText(e.target.value)} onBlur={() => void handleDocSave()} placeholder="Notes…" style={{ width:'100%', minHeight:90, padding:'10px', borderRadius:8, border:'1px solid var(--background-modifier-border)', background:'var(--background-secondary)', color:'var(--text-normal)', fontSize:'0.9em', lineHeight:1.5, resize:'vertical' }} />
          </div>
      </div>

      {/* Deck Statistics — matching Daily tone */}
      {(() => {
        const surahMindmapCount = Object.keys(allMindmaps).filter(k => k.startsWith('surah-') && allMindmaps[k]?.snapshot).length;
        const partMetaCount = Object.keys(allMindmaps).filter(k => (k.startsWith('part-') || k.startsWith('meta-')) && allMindmaps[k]?.snapshot).length;
        // Vault-only: verse groups that will actually be exported — one entry per
        // surah WITH a mindmap (splits length, or 1 auto-group when the mindmap
        // has no saved splits yet). Splits without a mindmap are not exported,
        // so they must not inflate the count.
        const totalVerseGroups = SURAHS.reduce((acc, s) => {
          const hasMM = !!allMindmaps[`surah-${s.id}`]?.snapshot;
          if (!hasMM) return acc;
          const groups = allSplitsForStats[s.id]?.length ?? 0;
          return acc + (groups > 0 ? groups : 1);
        }, 0);
        const surahsWithSplits = surahMindmapCount;
        const docsWithContent = Object.keys(allDocsForStats).filter(k => {
          const v = allDocsForStats[k];
          return typeof v === 'string' && v.trim().length > 0 && !v.includes('_Not added yet._');
        }).length;
        const docsTotal = Object.keys(allDocsForStats).filter(k => typeof allDocsForStats[k] === 'string' && allDocsForStats[k].trim().length > 0).length;
        return (
          <div className="ql-card" style={{ ...cardBase, borderLeft:'3px solid var(--interactive-accent)', display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ display:'inline-flex', gap:6, alignItems:'center', fontSize:'0.95em', fontWeight:700 }}><BarChart3 size={16} style={{ color:'var(--interactive-accent)' }} /> Deck Statistics</span>
              <button onClick={()=>setShowStatsDetails(v=>!v)} style={{ padding:'5px 10px', borderRadius:8, border:'1px solid var(--background-modifier-border)', background:'var(--background-secondary)', color:'var(--text-normal)', fontSize:'0.8em', cursor:'pointer' }}>{showStatsDetails ? 'Hide details' : 'Show details'}</button>
            </div>
            <div className="ql-stats-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(110px, 1fr))', gap:8 }}>
              {[
                { val: `${surahMindmapCount}/114`, label: 'Surahs with mindmap' },
                { val: `${partMetaCount}/8`, label: 'Parts/Meta' },
                { val: `${totalVerseGroups}`, label: `Verse groups (${surahsWithSplits} surahs)` },
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
                <div className="ql-table-wrap" style={{ maxHeight:280, overflow:'auto', WebkitOverflowScrolling:'touch', border:'1px solid var(--background-modifier-border)', borderRadius:8, background:'var(--background-secondary)' }}>
                  <table style={{ width:'100%', fontSize:'0.8em', borderCollapse:'collapse' }}>
                    <thead style={{ position:'sticky', top:0, background:'var(--background-secondary)', borderBottom:'1px solid var(--background-modifier-border)', zIndex:1 }}>
                      <tr><th style={{ textAlign:'left', padding:'8px', color:'var(--text-muted)', fontWeight:700 }}>Surah</th><th style={{ padding:'8px', color:'var(--text-muted)' }}>Mindmap</th><th style={{ padding:'8px', color:'var(--text-muted)' }}>Groups</th><th style={{ padding:'8px', color:'var(--text-muted)' }}>Docs</th></tr>
                    </thead>
                    <tbody>
                      {SURAHS.map(s=>{
                        const key=`surah-${s.id}`;
                        const hasMM=!!allMindmaps[key]?.snapshot;
                        const rawGroups=allSplitsForStats[s.id]?.length ?? 0;
                        // Effective export groups: mindmap without saved splits exports as 1 group.
                        const groups=hasMM ? (rawGroups > 0 ? rawGroups : 1) : 0;
                        const doc: string | undefined = allDocsForStats[normalizeStoreKey(key)];
                        const hasDoc=typeof doc==='string' && doc.trim().length>0;
                        const isPlaceholder=hasDoc && doc.includes('_Not added yet._');
                        return (
                          <tr key={s.id} style={{ borderTop:'1px solid var(--background-modifier-border)', background: (hasMM || hasDoc) ? 'var(--background-primary)' : 'transparent' }}>
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
                <div style={{ fontSize:'0.85em', fontWeight:700, marginTop:4 }}>Parts & Meta</div>
                <div style={{ border:'1px solid var(--background-modifier-border)', borderRadius:8, overflow:'hidden', background:'var(--background-secondary)' }}>
                  <table style={{ width:'100%', fontSize:'0.8em', borderCollapse:'collapse' }}>
                    <thead style={{ background:'var(--background-secondary)', borderBottom:'1px solid var(--background-modifier-border)' }}>
                      <tr><th style={{ textAlign:'left', padding:'8px', color:'var(--text-muted)', fontWeight:700 }}>Part</th><th style={{ padding:'8px', color:'var(--text-muted)' }}>Mindmap</th><th style={{ padding:'8px', color:'var(--text-muted)' }}>Docs</th></tr>
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
                      ].map(row=>{
                        const hasMM=!!allMindmaps[row.key]?.snapshot;
                        const doc: string | undefined = allDocsForStats[normalizeStoreKey(row.key)];
                        const hasDoc=typeof doc==='string' && doc.trim().length>0;
                        const isPlaceholder=hasDoc && doc.includes('_Not added yet._');
                        return (
                          <tr key={row.key} style={{ borderTop:'1px solid var(--background-modifier-border)', background: hasMM ? 'var(--background-primary)' : 'transparent' }}>
                            <td style={{ padding:'7px 8px' }}>{row.label} <span style={{ color:'var(--text-faint)', fontSize:'0.85em' }}>({row.key})</span></td>
                            <td style={{ padding:'7px 8px', textAlign:'center' }}>{hasMM ? <Check size={14} style={{ color:'var(--interactive-accent)', display:'inline' }} /> : <X size={14} style={{ display:'inline', opacity:0.3 }} />}</td>
                            <td style={{ padding:'7px 8px', textAlign:'center' }}>{!hasDoc ? <X size={14} style={{ display:'inline', opacity:0.3 }} /> : isPlaceholder ? <span style={{ color:'var(--text-warning)' }}><FileText size={12} style={{ display:'inline' }} />•</span> : <Check size={14} style={{ color:'var(--interactive-accent)', display:'inline' }} />}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize:'0.72em', color:'var(--text-faint)' }}>• = placeholder doc (“Not added yet”). Check = real notes. Groups = verse groups in the export (splits for that surah, or 1 when its mindmap has no saved splits yet).</div>
              </div>
            )}
          </div>
        );
      })()}

      {showDeleteConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:101, padding:16 }}>
          <div style={{ background:'var(--background-primary)', padding:20, borderRadius:12, border:'1px solid var(--background-modifier-border)', minWidth:300, maxWidth:400, boxShadow:'0 8px 24px rgba(0,0,0,0.2)' }}>
            <p style={{ fontWeight:700, margin:'0 0 6px 0' }}>Delete mindmap for {displayTitle}?</p>
            <p style={{ fontSize:'0.85em', color:'var(--text-muted)', margin:0 }}>Removes <code style={{ background:'var(--background-secondary)', padding:'1px 4px', borderRadius:4, border:'1px solid var(--background-modifier-border)' }}>mindmaps/{selectedMindmapKey}.json</code> and keeps tombstone.</p>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
              <button onClick={()=>setShowDeleteConfirm(false)} style={{ padding:'7px 12px', borderRadius:8, border:'1px solid var(--background-modifier-border)', background:'var(--background-secondary)', cursor:'pointer' }}>Cancel</button>
              <button onClick={() => void handleDeleteMindmap()} style={{ padding:'7px 14px', borderRadius:8, background:'var(--text-error)', color:'white', border:'none', cursor:'pointer', fontWeight:600 }}>Delete</button>
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
              <div className="importer-progress-bar" style={{ width:'100%', height:8, background:'var(--background-secondary)', borderRadius:999, overflow:'hidden', boxShadow:'inset 0 0 0 1px var(--background-modifier-border)' }}>
                <div className="importer-progress-bar-inner" style={{ width: `${exportProgress.current}%`, height:'100%', background:'var(--interactive-accent)', transition:'width 0.25s ease', borderRadius:999 }} />
              </div>
              {/* stats — only live numbers: verse total once built, mindmaps rendered x/y while rendering */}
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <div style={{ flex:'1 1 90px', textAlign:'center', padding:'8px 6px', background:'var(--background-secondary)', border:'1px solid var(--background-modifier-border)', borderRadius:8 }}>
                  <div style={{ fontWeight:800, fontSize:'1.05em', fontVariantNumeric:'tabular-nums' }}>{exportProgress.verseCards ?? '—'}</div>
                  <div style={{ fontSize:'0.68em', color:'var(--text-muted)', fontWeight:600, letterSpacing:'0.03em', textTransform:'uppercase' }}>Verse cards</div>
                </div>
                <div style={{ flex:'1 1 90px', textAlign:'center', padding:'8px 6px', background:'var(--background-secondary)', border:'1px solid var(--background-modifier-border)', borderRadius:8 }}>
                  <div style={{ fontWeight:800, fontSize:'1.05em', fontVariantNumeric:'tabular-nums' }}>{exportProgress.mindmapTotal ? `${exportProgress.mindmapDone ?? 0}/${exportProgress.mindmapTotal}` : (exportProgress.mindmapCards ?? '—')}</div>
                  <div style={{ fontSize:'0.68em', color:'var(--text-muted)', fontWeight:600, letterSpacing:'0.03em', textTransform:'uppercase' }}>Mindmaps</div>
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

      {toast && <div style={{ position:'fixed', bottom:'calc(14px + env(safe-area-inset-bottom, 0px))', left:'50%', transform:'translateX(-50%)', background:'var(--background-secondary)', border:'1px solid var(--background-modifier-border)', padding:'8px 14px', borderRadius:10, fontSize:'0.86em', boxShadow:'0 4px 12px rgba(0,0,0,0.12)', display:'flex', alignItems:'center', gap:6, zIndex:50, maxWidth:'calc(100vw - 32px)' }}>{toast}</div>}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        /* Splits editor + preview layout. Mobile-first: the preview sits BELOW the
           verse grid on phones (stacked, full width) and NEXT TO it on desktop.
           Both columns are pure CSS so the two directions cannot get swapped by
           an inline flex row that wraps. */
        .quran-life-anki .ql-splits-row { display: flex; gap: 12px; align-items: stretch; flex-direction: column; }
        .quran-life-anki .ql-splits-editor { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
        .quran-life-anki .ql-splits-preview {
          display: flex; flex-direction: column; gap: 6px; justify-content: flex-start;
          min-width: 0; width: 100%; max-height: 180px; overflow: auto;
          border: 1px solid var(--background-modifier-border); border-radius: 8px;
          padding: 8px; background: var(--background-primary);
        }
        @media (min-width: 701px) {
          .quran-life-anki .ql-splits-row { flex-direction: row; }
          .quran-life-anki .ql-splits-editor { flex: 1 1 70%; }
          .quran-life-anki .ql-splits-row.ql-no-preview .ql-splits-editor { flex: 1 1 100%; }
          .quran-life-anki .ql-splits-preview { flex: 0 0 30%; width: auto; max-height: none; overflow: visible; }
        }
        @media (max-width: 700px) {
          /* Overlap safety only on phones/tablets; desktop layout is untouched. */
          .quran-life-anki, .quran-life-anki * { box-sizing: border-box; }
          .quran-life-anki { width: 100%; padding: 10px !important; padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px)) !important; gap: 12px !important; }
          .quran-life-anki input, .quran-life-anki select, .quran-life-anki textarea, .quran-life-anki button { max-width: 100%; }
          .quran-life-anki .ql-card { padding: 12px !important; border-radius: 10px !important; gap: 10px !important; }
          .quran-life-anki .ql-export-row { flex-wrap: wrap; }
          .quran-life-anki .ql-export-row > button { flex: 1 1 100% !important; justify-content: center; white-space: nowrap; }
          .quran-life-anki .ql-stats-grid { grid-template-columns: repeat(auto-fit, minmax(94px, 1fr)) !important; }
          .quran-life-anki .ql-table-wrap { max-height: 240px !important; }
          .quran-life-anki .ql-table-wrap table { min-width: 420px; }
          .quran-life-anki button { min-height: 36px; }
        }
      `}</style>
    </div>
  );
}
