'use client';

import React from 'react';
import { getQuranVerses, getSurah, getSurahsByPart, SURAHS, splitVerseDisplayWords, splitVerseHighlightWords, mapDisplayToHighlightIndices } from '@/lib/quranData';
import { getDailyPortion } from '@/lib/dailyPortions';
import { Verse, ACTIVE_PART_OPTIONS, QuranPart, ALL_QURAN_PART } from '@/lib/types';
import { CheckCircle, BookOpen, Check, RotateCcw, Headphones, Book, Undo2 } from 'lucide-react';
import { useVaultDailySettings, useVaultListeningProgress } from '@/plugin/hooks/useVaultDailyStore';
import type { VaultStore } from '@/plugin/storage/vaultAdapter';
import { useDailyPortionTiming } from '@/hooks/useDailyPortionTiming';
import {
  DEFAULT_DAILY_TARGET_MINUTES,
  getProgressStartIndexFromEligibleSurahs,
} from '@/lib/dailyPortionUtils';

import AudioPlayerLocal from '@/components/AudioPlayerLocal';

const { useState, useEffect, useRef, useMemo, useCallback, startTransition } = React;

type DailyPortionSurahGroup = {
  surahId: number;
  verses: Verse[];
};

/** Local calendar day key (YYYY-MM-DD) — matches how completions are stored. */
function currentDayKey(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function groupVersesBySurah(verses: Verse[]): DailyPortionSurahGroup[] {
  const groups: DailyPortionSurahGroup[] = [];
  for (const verse of verses) {
    const prev = groups[groups.length - 1];
    if (prev && prev.surahId === verse.surahId) prev.verses.push(verse);
    else groups.push({ surahId: verse.surahId, verses: [verse] });
  }
  return groups;
}

export default function DailyPortionObsidian({ vaultStore }: { vaultStore: VaultStore }) {
  const { settings, saveSettings, isLoading: settingsLoading } = useVaultDailySettings(vaultStore);
  const { progress: listeningProgress, saveProgress, resetProgress, isLoading: progressLoading } = useVaultListeningProgress(vaultStore);
  const { averageSecondsPerWordBySurah } = useDailyPortionTiming();

  const [allVerses, setAllVerses] = useState<Verse[]>([]);
  const [isVersesLoaded, setIsVersesLoaded] = useState(false);
  const [todaysPortion, setTodaysPortion] = useState<Verse[]>([]);
  const [currentVerseIndex, setCurrentVerseIndex] = useState(0);
  const [highlightedWordIndex, setHighlightedWordIndex] = useState<number>(-1);
  const [listeningComplete, setListeningComplete] = useState(false);
  const [toast, setToast] = useState<{ id: string; msg: string } | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);

  const verseContainerRef = useRef<HTMLDivElement>(null);
  const wordElementRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const lastPortionKeyRef = useRef<string>('');

  // Load verses
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const verses = await getQuranVerses();
        if (cancelled) return;
        setAllVerses(verses);
      } catch {
        if (!cancelled) setAllVerses([]);
      } finally {
        if (!cancelled) setIsVersesLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const activeProgress = useMemo(() => {
    return listeningProgress.find(p => p.partId === settings.activePart);
  }, [listeningProgress, settings.activePart]);

  const eligibleSurahs = useMemo(() => {
    const skipped = new Set(settings.skippedSurahs || []);
    return getSurahsByPart(settings.activePart).filter(s => !skipped.has(s.id));
  }, [settings.activePart, settings.skippedSurahs]);

  const portionData = useMemo(() => {
    if (allVerses.length === 0) {
      return {
        portion: [] as Verse[],
        startVerseIndex: 0,
        versesPerDay: 0,
        totalVerses: 0,
        startVerseKey: undefined as string | undefined,
        nextStartVerseIndex: 0,
        nextStartVerseKey: undefined as string | undefined,
        derivedCompletionDays: 0,
        snappedMinutes: 0,
        lastUpdateAt: undefined as string | undefined,
      };
    }
    if (eligibleSurahs.length === 0) {
      return {
        portion: [] as Verse[],
        startVerseIndex: 0,
        versesPerDay: 0,
        totalVerses: 0,
        startVerseKey: undefined,
        nextStartVerseIndex: 0,
        nextStartVerseKey: undefined,
        derivedCompletionDays: 0,
        snappedMinutes: 0,
        lastUpdateAt: undefined,
      };
    }
    const activeSurahIds = new Set(eligibleSurahs.map(s => s.id));
    const allVersesInPart = allVerses.filter(v => activeSurahIds.has(v.surahId));
    const totalVerses = allVersesInPart.length;
    if (totalVerses === 0) {
      return {
        portion: [] as Verse[],
        startVerseIndex: 0,
        versesPerDay: 0,
        totalVerses: 0,
        startVerseKey: undefined,
        nextStartVerseIndex: 0,
        nextStartVerseKey: undefined,
        derivedCompletionDays: 0,
        snappedMinutes: 0,
        lastUpdateAt: activeProgress?.updatedAt,
      };
    }
    const startIdx = getProgressStartIndexFromEligibleSurahs(eligibleSurahs, activeProgress);
    const portionResult = getDailyPortion(allVersesInPart, {
      dailyTargetMinutes: settings.dailyTargetMinutes || DEFAULT_DAILY_TARGET_MINUTES,
      mode: settings.dailyPortionMode ?? 'audio',
      nextStartVerseKey: activeProgress?.nextStartVerseKey,
      legacyStartIndex: startIdx,
      averageSecondsPerWordBySurah,
    });
    return {
      portion: portionResult.portion,
      startVerseIndex: portionResult.startVerseIndex,
      versesPerDay: portionResult.portion.length,
      totalVerses,
      startVerseKey: portionResult.startVerseKey,
      nextStartVerseIndex: portionResult.nextStartVerseIndex,
      nextStartVerseKey: portionResult.nextStartVerseKey,
      derivedCompletionDays: portionResult.derivedCompletionDays,
      snappedMinutes: portionResult.snappedMinutes,
      lastUpdateAt: activeProgress?.updatedAt,
    };
  }, [allVerses, averageSecondsPerWordBySurah, settings.dailyTargetMinutes, settings.dailyPortionMode, eligibleSurahs, activeProgress]);

  // Initialize listeningComplete based on progress date.
  // Progress written by this build records `completedOnDay` explicitly, so
  // undoing an accidental completion (which sets it to null) is respected even
  // though `updatedAt` is still today. Older files keep the day comparison.
  const hasCompletionFlag = !!activeProgress && Object.prototype.hasOwnProperty.call(activeProgress, 'completedOnDay');
  useEffect(() => {
    if (hasCompletionFlag) {
      setListeningComplete((activeProgress as any)?.completedOnDay === currentDayKey());
      return;
    }
    if (!portionData.lastUpdateAt) {
      setListeningComplete(false);
      return;
    }
    const lastUpdate = new Date(portionData.lastUpdateAt);
    const now = new Date();
    setListeningComplete(lastUpdate.toDateString() === now.toDateString());
  }, [hasCompletionFlag, activeProgress?.completedOnDay, portionData.lastUpdateAt]);

  // Sync nextStartVerseKey if missing
  useEffect(() => {
    if (!settings) return;
    if (!activeProgress || activeProgress.nextStartVerseKey || !portionData.startVerseKey) return;
    void saveProgress({
      partId: settings.activePart,
      lastVerseIndex: activeProgress.lastVerseIndex,
      nextStartVerseKey: portionData.startVerseKey,
      cycles: activeProgress.cycles || 0,
      updatedAt: activeProgress.updatedAt,
    });
  }, [portionData.startVerseKey, activeProgress, saveProgress, settings]);

  useEffect(() => {
    if (!portionData.portion.length) {
      lastPortionKeyRef.current = '';
      setTodaysPortion([]);
      setCurrentVerseIndex(0);
      return;
    }
    const first = portionData.portion[0];
    const last = portionData.portion[portionData.portion.length - 1];
    const portionKey = `${first.surahId}:${first.ayahId}-${last.surahId}:${last.ayahId}-${portionData.portion.length}`;
    if (portionKey !== lastPortionKeyRef.current) {
      lastPortionKeyRef.current = portionKey;
      setTodaysPortion(portionData.portion);
      setCurrentVerseIndex(0);
    }
  }, [portionData]);

  const currentDailyVerse = todaysPortion[currentVerseIndex] ?? null;
  // Display words keep mushaf ornaments (۞/۩) for rendering; highlight words
  // exclude them so segment indices line up 1:1 with recitation timings.
  const dailyDisplayWords = useMemo(() => splitVerseDisplayWords(currentDailyVerse?.text ?? ''), [currentDailyVerse?.text]);
  const dailyHighlightWordCount = useMemo(() => splitVerseHighlightWords(currentDailyVerse?.text ?? '').length, [currentDailyVerse?.text]);
  const dailyDisplayToHighlight = useMemo(() => mapDisplayToHighlightIndices(dailyDisplayWords), [dailyDisplayWords]);
  const handleAudioWordIndexChange = useCallback((index: number) => {
    startTransition(() => setHighlightedWordIndex(index));
  }, []);

  const dailyPortionSurahGroups = useMemo(() => groupVersesBySurah(todaysPortion), [todaysPortion]);
  const readOnlyMode = settings.dailyPortionMode === 'reading';
  const dailyReadingStyle = settings.dailyReadingStyle ?? 'paragraph';
  const isLoaded = isVersesLoaded && !settingsLoading && !progressLoading;

  // Cycle progress — same logic as web DailyPortion, mirrors Anki export progress bar
  const cycleProgressPercent = useMemo(() => {
    if (portionData.totalVerses <= 0) return 0;
    const raw = (portionData.startVerseIndex / portionData.totalVerses) * 100;
    return Math.max(0, Math.min(100, raw));
  }, [portionData.startVerseIndex, portionData.totalVerses]);

  const cycleCurrentDay = useMemo(() => {
    if (portionData.totalVerses <= 0 || portionData.derivedCompletionDays <= 0) return 0;
    const approx = Math.ceil((portionData.startVerseIndex / portionData.totalVerses) * portionData.derivedCompletionDays);
    return Math.max(1, Math.min(portionData.derivedCompletionDays, approx || 1));
  }, [portionData.startVerseIndex, portionData.totalVerses, portionData.derivedCompletionDays]);

  const showToast = useCallback((msg: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToast({ id, msg });
    setTimeout(() => setToast(prev => (prev?.id === id ? null : prev)), 3000);
  }, []);

  const handleComplete = async () => {
    if (isCompleting) return;
    if (portionData.totalVerses <= 0) return;
    setIsCompleting(true);
    const cycleCompleted = portionData.nextStartVerseIndex === 0 && portionData.portion.length > 0;
    const cycles = (activeProgress?.cycles || 0) + (cycleCompleted ? 1 : 0);
    const afterUpdatedAt = new Date().toISOString();
    try {
      await saveProgress({
        partId: settings.activePart,
        lastVerseIndex: portionData.nextStartVerseIndex,
        nextStartVerseKey: portionData.nextStartVerseKey,
        cycles,
        updatedAt: afterUpdatedAt,
        completedOnDay: currentDayKey(),
        // Snapshot of the state right before completing, so an accidental tap
        // can be undone (persisted → still undoable after a reload).
        undo: {
          lastVerseIndex: portionData.startVerseIndex,
          nextStartVerseKey: portionData.startVerseKey,
          cycles: activeProgress?.cycles || 0,
          updatedAt: activeProgress?.updatedAt,
        },
      });
      setListeningComplete(true);
      showToast(cycleCompleted ? 'Cycle completed! Restarting from beginning.' : 'Daily portion completed!');
    } catch (e) {
      console.error(e);
      showToast('Failed to save. Try again.');
    } finally {
      setIsCompleting(false);
    }
  };

  // Undo today's completion: restores the portion that was open before "Mark
  // Complete" was pressed (and clears the completion flag) so the user does not
  // lose a day by tapping the button by mistake.
  // Only today's completion is undoable — an older snapshot would otherwise
  // rewind progress the user already moved on from.
  const canUndoComplete = !!activeProgress?.undo && activeProgress?.completedOnDay === currentDayKey();
  const handleUndoComplete = async () => {
    if (isCompleting) return;
    const undo = activeProgress?.undo;
    if (!undo) { showToast('Nothing to undo'); return; }
    setIsCompleting(true);
    try {
      await saveProgress({
        partId: settings.activePart,
        lastVerseIndex: undo.lastVerseIndex ?? 0,
        nextStartVerseKey: undo.nextStartVerseKey,
        cycles: undo.cycles ?? 0,
        updatedAt: undo.updatedAt,
        completedOnDay: null,
        undo: null,
      });
      setListeningComplete(false);
      showToast('Completion undone — today\u2019s portion is open again');
    } catch (e) {
      console.error(e);
      showToast('Failed to undo. Try again.');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleResetCurrent = async () => {
    try { if (typeof confirm === 'function' && !confirm('Reset progress for current part? This will restart daily portion from the beginning.')) return; } catch {}
    await resetProgress(settings.activePart);
    setListeningComplete(false);
    showToast('Progress reset for this part.');
  };

  const handlePartChange = async (partId: QuranPart) => {
    await saveSettings({ activePart: partId });
    setListeningComplete(false);
  };

  const otherPartsWithContent = useMemo(() => {
    const skipped = new Set(settings.skippedSurahs || []);
    return ACTIVE_PART_OPTIONS.filter(opt => {
      if (opt.id === settings.activePart) return false;
      const surahs = getSurahsByPart(opt.id).filter(s => !skipped.has(s.id));
      return surahs.length > 0;
    });
  }, [settings.activePart, settings.skippedSurahs]);

  // Reset stale word refs/highlight when the verse changes (refs are indexed
  // by highlight-word position, so a longer previous verse must not linger).
  useEffect(() => {
    wordElementRefs.current = [];
  }, [currentDailyVerse?.surahId, currentDailyVerse?.ayahId]);

  // Smooth scroll for audio word highlight
  useEffect(() => {
    if (highlightedWordIndex !== -1 && verseContainerRef.current) {
      const wordEl = wordElementRefs.current[highlightedWordIndex];
      if (wordEl) {
        const container = verseContainerRef.current;
        const containerRect = container.getBoundingClientRect();
        const wordRect = wordEl.getBoundingClientRect();
        const padding = 12;
        const isOutOfView = wordRect.top < containerRect.top + padding || wordRect.bottom > containerRect.bottom - padding;
        if (isOutOfView) {
          const offset = wordRect.top - containerRect.top;
          const targetTop = container.scrollTop + offset - container.clientHeight / 2 + wordRect.height / 2;
          container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
        }
      }
    }
  }, [currentVerseIndex, highlightedWordIndex]);

  const openPluginSettings = useCallback(() => {
    try {
      const app: any = (vaultStore as any)?.app ?? (window as any).app;
      if (app?.setting?.open) {
        app.setting.open();
        // try to open Quran Life tab
        setTimeout(() => {
          try { app.setting.openTabById?.('quran-life'); } catch {}
        }, 150);
      } else {
        showToast('Open Settings → Quran Life → Daily Portion');
      }
    } catch { showToast('Open Settings → Quran Life → Daily Portion'); }
  }, [vaultStore, showToast]);

  if (!isLoaded) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'40vh', flexDirection:'column', gap:10, padding:24 }}>
      <div style={{ width:28, height:28, border:'3px solid var(--background-modifier-border)', borderTopColor:'var(--interactive-accent)', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      <span style={{ fontSize:'0.9em', color:'var(--text-muted)' }}>Loading…</span>
    </div>
  );
  if (allVerses.length === 0) return (
    <div style={{ padding:24, textAlign:'center', maxWidth:520, margin:'0 auto' }}>
      <div style={{ padding:'20px', border:'1px solid var(--background-modifier-border)', borderRadius:12, background:'var(--background-secondary)' }}>
        <p style={{ fontWeight:600, margin:'0 0 6px 0', color:'var(--text-normal)' }}>Quran data not found</p>
        <p style={{ fontSize:'0.85em', color:'var(--text-muted)', margin:'0 0 12px 0' }}>Missing <code>qpc-hafs-word-by-word.json</code></p>
        <button onClick={()=>window.location.reload()} style={{ marginTop:14, padding:'6px 14px', borderRadius:8, border:'1px solid var(--background-modifier-border)', background:'var(--interactive-accent)', color:'var(--text-on-accent)', cursor:'pointer', fontWeight:600 }}>Reload</button>
      </div>
    </div>
  );

  // Obsidian-native inline styles helpers
  const cardBase: React.CSSProperties = {
    border: '1px solid var(--background-modifier-border)',
    borderRadius: 12,
    background: 'var(--background-secondary)',
    padding: 16,
  };

  // Inject Obsidian-friendly overrides for AudioPlayerLocal (which uses web CSS vars)
  const obsidianAudioCss = `
    .quran-life-daily .audio-player { background: var(--background-secondary) !important; border: none !important; border-radius: 0 !important; padding: 10px 12px !important; }
    @media (max-width: 700px) {
      /* Overflow safety is mobile-only; desktop keeps its exact spacing. */
      .quran-life-daily, .quran-life-daily * { box-sizing: border-box; }
      .quran-life-daily { width: 100%; padding: 10px !important; padding-bottom: calc(10px + 96px + env(safe-area-inset-bottom, 0px)) !important; gap: 12px !important; }
    }
    .quran-life-daily .reciter-select-container { margin-bottom: 8px; }
    .quran-life-daily .reciter-select { width: 100%; min-height: 40px; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 16px; }
    .quran-life-daily .player-progress { height: 6px; background: var(--background-modifier-border); border-radius: 999px; overflow: hidden; margin: 8px 0; }
    .quran-life-daily .progress-bar { height: 100%; background: transparent; }
    .quran-life-daily .progress-fill { height: 100%; background: var(--interactive-accent); transition: width 0.2s; }
    .quran-life-daily .player-controls { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin: 8px 0 4px; }
    .quran-life-daily .time-display { font-size: 0.78em; color: var(--text-muted); font-weight: 500; font-variant-numeric: tabular-nums; }
    .quran-life-daily .time-remaining { opacity: 0.7; }
    .quran-life-daily .undo-complete-btn { border-color: var(--interactive-accent); color: var(--interactive-accent); }
    .quran-life-daily .control-buttons { display: flex; gap: 6px; align-items: center; }
    .quran-life-daily .control-btn { width: 36px; height: 36px; border-radius: 8px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
    .quran-life-daily .play-btn { width: 44px; height: 44px; border-radius: 999px; border: none; background: var(--interactive-accent); color: var(--text-on-accent); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-weight: 700; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
    .quran-life-daily .play-btn:disabled, .quran-life-daily .control-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .quran-life-daily .speed-control { display: flex; gap: 6px; align-items: center; }
    .quran-life-daily .speed-btn { padding: 4px 8px; min-height: 36px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 0.78em; font-weight: 600; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
    .quran-life-daily .audio-word { padding: 1px 3px; border-radius: 6px; }
    .quran-life-daily .audio-word--active { background: color-mix(in srgb, var(--interactive-accent) 18%, transparent) !important; color: var(--text-normal) !important; box-shadow: 0 0 0 1px color-mix(in srgb, var(--interactive-accent) 30%, transparent) !important; border: 1px solid color-mix(in srgb, var(--interactive-accent) 22%, var(--background-primary)) !important; }
    /* Mobile-only layout tweaks (desktop keeps the original spacing). */
    @media (max-width: 700px) {
      .quran-life-daily .time-display { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; min-width: 0; }
    }
    @media (max-width: 480px) {
      /* Keep the elapsed/total/remaining readout visible on its own row above the
         transport controls instead of squeezing it out of view. */
      .quran-life-daily .player-controls { justify-content: space-between; }
      .quran-life-daily .time-display { flex: 1 0 100%; order: -1; justify-content: center; text-align: center; }
      .quran-life-daily .speed-btn { min-width: 52px; }
    }
  `;

  return (
    <div className="quran-life-daily" style={{ padding:'16px', paddingBottom:'calc(16px + 96px + env(safe-area-inset-bottom, 0px))', maxWidth:720, margin:'0 auto', display:'flex', flexDirection:'column', gap:16, color:'var(--text-normal)' }}>
      <style>{obsidianAudioCss}</style>
      {/* Header — Obsidian native */}
      <div style={{ display:'flex', flexDirection:'column', gap:6, paddingBottom:12, borderBottom:'1px solid var(--background-modifier-border)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:32, height:32, borderRadius:8, background:'var(--interactive-accent)', color:'var(--text-on-accent)' }}>
            <BookOpen size={18} />
          </span>
          <h2 style={{ margin:0, fontSize:'1.35em', fontWeight:700, letterSpacing:'-0.01em' }}>Daily Portion</h2>
          <span style={{ marginLeft:'auto', display:'inline-flex', alignItems:'center', gap:6, padding:'4px 8px', borderRadius:999, background:'var(--background-modifier-border)', fontSize:'0.72em', fontWeight:600, color:'var(--text-muted)' }}>
            {readOnlyMode ? <Book size={12}/> : <Headphones size={12}/>}
            {readOnlyMode ? 'Reading' : 'Listening'} • {settings.dailyTargetMinutes} min/day
          </span>
        </div>
        <div style={{ fontSize:'0.84em', color:'var(--text-muted)', lineHeight:1.4 }}>
          {eligibleSurahs.length > 0 ? (
            <span>{portionData.totalVerses} verses • ~{Math.round(portionData.snappedMinutes)} min • {portionData.derivedCompletionDays} days</span>
          ) : (
            <span>No surahs selected</span>
          )}
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:2 }}>
          <button
            onClick={openPluginSettings}
            style={{ padding:'5px 10px', borderRadius:6, border:'1px solid var(--background-modifier-border)', background:'var(--background-primary)', color:'var(--text-normal)', cursor:'pointer', fontSize:'0.8em', fontWeight:500 }}
          >
            Settings
          </button>
        </div>
      </div>

      {/* Cycle Progress Bar — mirrors AnkiDeck export progress bar (importer-progress-bar style) — now includes current Quran part */}
      {eligibleSurahs.length > 0 && portionData.totalVerses > 0 && (
        <div style={{ ...cardBase, padding:'10px 12px', display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap', fontSize:'0.78em', color:'var(--text-muted)' }}>
            <span style={{ fontWeight:700, color:'var(--text-normal)', fontSize:'0.95em' }}>Cycle progress</span>
            <span style={{ display:'inline-flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
              <span>{portionData.startVerseIndex}/{portionData.totalVerses} verses • {Math.round(cycleProgressPercent)}% • Day {cycleCurrentDay}/{portionData.derivedCompletionDays} • Cycle {activeProgress?.cycles ?? 0}</span>
              <span style={{ padding:'2px 8px', borderRadius:999, background:'var(--background-secondary)', border:'1px solid var(--background-modifier-border)', fontSize:'0.92em', fontWeight:600, color:'var(--text-muted)' }}>
                {ACTIVE_PART_OPTIONS.find(o=>o.id===settings.activePart)?.name}
              </span>
            </span>
          </div>
          <div style={{ width:'100%', height:8, background:'var(--background-modifier-border)', borderRadius:999, overflow:'hidden', boxShadow:'inset 0 0 0 1px var(--background-modifier-border)' } as React.CSSProperties}>
            <div style={{ width: `${Math.max(0, Math.min(100, cycleProgressPercent))}%`, height:'100%', background:'var(--interactive-accent)', transition:'width 0.25s ease', borderRadius:999 }} />
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.72em', color:'var(--text-faint)' }}>
            <span>Start: {portionData.startVerseKey || '1:1'}</span>
            <span>Next: {portionData.nextStartVerseKey || '—'}</span>
          </div>
        </div>
      )}

      {/* Main content — differentiated player vs reader */}
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        {listeningComplete || eligibleSurahs.length === 0 ? (
          <div style={{ ...cardBase, textAlign:'center', padding:'28px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
            {listeningComplete ? (
              <>
                <span style={{ display:'inline-flex', padding:10, borderRadius:999, background:'color-mix(in srgb, var(--interactive-accent) 14%, transparent)', color:'var(--interactive-accent)', border:'1px solid color-mix(in srgb, var(--interactive-accent) 22%, transparent)' }}>
                  <CheckCircle size={36} style={{ color:'var(--interactive-accent)' }} />
                </span>
                <p style={{ fontWeight:700, fontSize:'1.05em', margin:0 }}>Completed</p>
                <p style={{ fontSize:'0.86em', color:'var(--text-muted)', margin:0, maxWidth:380 }}>Come back tomorrow.</p>
                <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:8, width:'100%', maxWidth:360, alignItems:'stretch' }}>
                  {canUndoComplete && (
                    <button
                      onClick={handleUndoComplete}
                      disabled={isCompleting}
                      title="Undo today's completion and keep this portion open"
                      style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--interactive-accent)', background:'color-mix(in srgb, var(--interactive-accent) 12%, transparent)', color:'var(--interactive-accent)', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6, cursor:isCompleting?'not-allowed':'pointer', fontSize:'0.86em', fontWeight:600, opacity:isCompleting?0.7:1 }}
                    >
                      <Undo2 size={14} /> Undo completion (pressed by mistake?)
                    </button>
                  )}
                  <button onClick={handleResetCurrent} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--background-modifier-border)', background:'var(--background-primary)', color:'var(--text-normal)', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6, cursor:'pointer', fontSize:'0.86em' }}>
                    <RotateCcw size={14} /> Restart this part
                  </button>
                  {otherPartsWithContent.length > 0 && (
                    <div style={{ display:'flex', flexDirection:'column', gap:6, textAlign:'left', padding:10, border:'1px solid var(--background-modifier-border)', borderRadius:8, background:'var(--background-primary)' }}>
                      <span style={{ fontSize:'0.8em', color:'var(--text-muted)', fontWeight:600 }}>Or switch part</span>
                      <select
                        className="dropdown"
                        style={{ width:'100%', padding:'6px 8px', borderRadius:6, border:'1px solid var(--background-modifier-border)', background:'var(--background-primary)', color:'var(--text-normal)' }}
                        value=""
                        onChange={e => handlePartChange(Number(e.target.value) as QuranPart)}
                      >
                        <option value="" disabled>Select a part…</option>
                        {otherPartsWithContent.map(opt => (
                          <option key={opt.id} value={opt.id}>{opt.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <BookOpen size={36} style={{ opacity:0.45 }} />
                <p style={{ fontWeight:600, margin:0 }}>No surahs</p>
                <p style={{ fontSize:'0.85em', color:'var(--text-muted)', margin:0 }}>Select surahs in Settings.</p>
                <button onClick={openPluginSettings} style={{ marginTop:6, padding:'7px 14px', borderRadius:8, background:'var(--interactive-accent)', color:'var(--text-on-accent)', border:'none', cursor:'pointer', fontWeight:600, fontSize:'0.85em' }}>
                  Open Settings
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {!readOnlyMode ? (
              <>
                <div style={{ ...cardBase, background:'var(--background-primary)', borderLeft:'3px solid var(--interactive-accent)', display:'flex', flexDirection:'column', gap:12 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 8px', borderRadius:6, background:'var(--interactive-accent)', color:'var(--text-on-accent)', fontSize:'0.72em', fontWeight:700, letterSpacing:'0.02em' }}>
                      <Headphones size={12} /> PLAYER
                    </span>
                    <span style={{ marginLeft:'auto', fontSize:'0.74em', color:'var(--text-muted)' }}>{currentVerseIndex+1} / {todaysPortion.length}</span>
                  </div>
                  {/* Audio player — Obsidian-native wrapper */}
                  <div style={{ border:'1px solid var(--background-modifier-border)', borderRadius:10, overflow:'hidden', background:'var(--background-secondary)' }}>
                    <AudioPlayerLocal
                      verses={todaysPortion}
                      currentVerseIndex={currentVerseIndex}
                      currentVerseWordCount={dailyHighlightWordCount}
                      onVerseChange={setCurrentVerseIndex}
                      onWordIndexChange={handleAudioWordIndexChange}
                      obsidianApp={(vaultStore as any)?.app}
                      onUndoComplete={canUndoComplete ? handleUndoComplete : undefined}
                      isUndoingComplete={isCompleting}
                    />
                  </div>
                </div>

                {/* VERSE PREVIEW — reader preview for audio mode, visually distinct */}
                <div
                  ref={verseContainerRef}
                  style={{
                    border:'1px solid var(--background-modifier-border)',
                    borderRadius:12,
                    background:'var(--background-secondary)',
                    padding:'16px',
                    maxHeight:'42vh',
                    minHeight:120,
                    overflowY:'auto',
                    display:'flex',
                    flexDirection:'column',
                    gap:8,
                  }}
                >
                  {currentDailyVerse ? (
                    <>
                      <div style={{ fontSize:'0.78em', color:'var(--text-muted)', fontWeight:600, letterSpacing:'0.02em' }}>
                        {getSurah(currentDailyVerse.surahId)?.arabicName} • Ayah {currentDailyVerse.ayahId}
                      </div>
                      {(currentDailyVerse.ayahId === 1 ? (currentDailyVerse.surahId !== 1 && currentDailyVerse.surahId !== 9) : currentVerseIndex === 0) ? (
                        <div style={{ fontFamily:'var(--font-text, serif)', textAlign:'center', color:'var(--text-muted)', fontSize:'1.05em', padding:'4px 0', borderBottom:'1px dashed var(--background-modifier-border)', marginBottom:4 }}>
                          {currentDailyVerse.ayahId === 1 ? 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ' : 'أَعُوذُ بِٱللَّهِ مِنَ ٱلشَّيْطَانِ ٱلرَّجِيمِ'}
                        </div>
                      ) : null}
                      <div style={{ fontFamily:'var(--font-text, serif)', fontSize:'1.20em', lineHeight:2, direction:'rtl', textAlign:'right', color:'var(--text-normal)' }}>
                        {dailyDisplayWords.map((word, i) => {
                          const hi = dailyDisplayToHighlight[i] ?? -1;
                          const isActive = hi !== -1 && hi === highlightedWordIndex;
                          return (
                          <span
                            key={i}
                            ref={el => { if (hi !== -1) wordElementRefs.current[hi] = el; }}
                            style={{
                              display:'inline-block',
                              padding:'1px 3px',
                              margin:'1px',
                              borderRadius:6,
                              background: isActive ? 'color-mix(in srgb, var(--interactive-accent) 18%, transparent)' : 'transparent',
                              color: isActive ? 'var(--text-normal)' : 'inherit',
                              boxShadow: isActive ? '0 0 0 1px color-mix(in srgb, var(--interactive-accent) 30%, transparent)' : 'none',
                              border: isActive ? '1px solid color-mix(in srgb, var(--interactive-accent) 22%, var(--background-primary))' : '1px solid transparent',
                              transition:'background 0.15s, color 0.15s',
                            }}
                          >
                            {word}
                          </span>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <span style={{ color:'var(--text-faint)', fontSize:'0.85em' }}>Select a verse</span>
                  )}
                </div>
              </>
            ) : (
              <div style={{ ...cardBase, background:'var(--background-primary)', borderLeft:'3px solid var(--interactive-accent)', display:'flex', flexDirection:'column', gap:12, maxHeight:'62vh', overflow:'hidden' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, paddingBottom:8, borderBottom:'1px solid var(--background-modifier-border)' }}>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 8px', borderRadius:6, background:'color-mix(in srgb, var(--interactive-accent) 14%, transparent)', color:'var(--interactive-accent)', fontSize:'0.72em', fontWeight:700, letterSpacing:'0.02em', border:'1px solid color-mix(in srgb, var(--interactive-accent) 22%, transparent)' }}>
                    <Book size={12} /> READER
                  </span>
                  <span style={{ fontSize:'0.76em', color:'var(--text-muted)', fontWeight:500 }}>{dailyReadingStyle === 'paragraph' ? 'Paragraph' : 'Line by line'}</span>
                </div>
                <div style={{ flex:1, overflowY:'auto', paddingRight:4, display:'flex', flexDirection:'column', gap:14, minHeight:0 }}>
                  {dailyReadingStyle === 'paragraph' ? (
                    dailyPortionSurahGroups.map((group, idx) => {
                      const surah = getSurah(group.surahId);
                      const firstVerse = group.verses[0];
                      if (!firstVerse) return null;
                      return (
                        <div key={`${group.surahId}-${idx}`} style={{ display:'flex', flexDirection:'column', gap:8 }}>
                          {surah && (
                            <div style={{ textAlign:'center', padding:'10px 8px', background:'var(--background-secondary)', border:'1px solid var(--background-modifier-border)', borderRadius:8 }}>
                              <div style={{ fontWeight:700, fontSize:'1.15em', color:'var(--text-normal)' }}>{surah.arabicName}</div>
                              <div style={{ fontSize:'0.78em', color:'var(--text-muted)', marginTop:2 }}>{surah.name} • {surah.id} • {group.verses.length} verses</div>
                              {firstVerse.ayahId === 1 ? (
                                surah.id !== 9 && surah.id !== 1 && <div style={{ marginTop:6, fontSize:'1.05em', color:'var(--text-muted)', fontFamily:'var(--font-text, serif)' }}>بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</div>
                              ) : (
                                <div style={{ marginTop:6, fontSize:'1.05em', color:'var(--text-muted)', fontFamily:'var(--font-text, serif)' }}>أَعُوذُ بِٱللَّهِ مِنَ ٱلشَّيْطَانِ ٱلرَّجِيمِ</div>
                              )}
                            </div>
                          )}
                          <div style={{ padding:'12px', background:'var(--background-secondary)', border:'1px solid var(--background-modifier-border)', borderRadius:8, textAlign:'justify', direction:'rtl', lineHeight:1.9 }}>
                            {group.verses.map(v => (
                              <span key={`${v.surahId}-${v.ayahId}`} style={{ display:'inline' }}>
                                <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', minWidth:18, height:18, padding:'0 4px', margin:'0 4px 0 6px', borderRadius:999, background:'var(--background-modifier-border)', color:'var(--text-muted)', fontSize:'0.6em', fontWeight:700, verticalAlign:'middle' }}>{v.ayahId}</span>
                                <span style={{ fontFamily:'var(--font-text, serif)', fontSize:'1.28em', color:'var(--text-normal)' }}>{v.text}</span>
                                {' '}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    todaysPortion.map((v, idx) => {
                      const prev = idx > 0 ? todaysPortion[idx - 1] : null;
                      const isNewSurah = !prev || prev.surahId !== v.surahId;
                      const surah = getSurah(v.surahId);
                      return (
                        <div key={`${v.surahId}-${v.ayahId}-${idx}`} style={{ display:'flex', flexDirection:'column', gap:6 }}>
                          {isNewSurah && surah && (
                            <div style={{ textAlign:'center', padding:'8px', background:'var(--background-secondary)', border:'1px solid var(--background-modifier-border)', borderRadius:8 }}>
                              <div style={{ fontWeight:700, fontSize:'1.05em' }}>{surah.arabicName}</div>
                              <div style={{ fontSize:'0.78em', color:'var(--text-muted)' }}>{surah.name} • Surah {surah.id}</div>
                              {v.ayahId === 1 ? (
                                surah.id !== 9 && surah.id !== 1 && <div style={{ marginTop:4, fontFamily:'var(--font-text, serif)', color:'var(--text-muted)' }}>بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</div>
                              ) : (
                                <div style={{ marginTop:4, fontFamily:'var(--font-text, serif)', color:'var(--text-muted)' }}>أَعُوذُ بِٱللَّهِ مِنَ ٱلشَّيْطَانِ ٱلرَّجِيمِ</div>
                              )}
                            </div>
                          )}
                          <div style={{ display:'flex', gap:10, alignItems:'baseline', padding:'10px 12px', background:'var(--background-secondary)', border:'1px solid var(--background-modifier-border)', borderRadius:8, direction:'rtl', textAlign:'right' }}>
                            <span style={{ flex:1, fontFamily:'var(--font-text, serif)', fontSize:'1.28em', lineHeight:1.8, color:'var(--text-normal)' }}>{v.text}</span>
                            <span style={{ flexShrink:0, display:'inline-flex', alignItems:'center', justifyContent:'center', width:22, height:22, borderRadius:999, background:'var(--interactive-accent)', color:'var(--text-on-accent)', fontSize:'0.7em', fontWeight:700 }}>{v.ayahId}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            <div style={{ display:'flex', flexDirection:'column', gap:8, padding:'12px', border:'1px solid var(--background-modifier-border)', borderRadius:12, background:'var(--background-secondary)', marginBottom:'env(safe-area-inset-bottom, 0px)' }}>
              <button
                onClick={handleComplete}
                disabled={isCompleting}
                style={{
                  width:'100%',
                  padding:'10px 14px',
                  borderRadius:8,
                  border:'none',
                  background: isCompleting ? 'var(--background-modifier-border)' : 'var(--interactive-accent)',
                  color: 'var(--text-on-accent)',
                  fontWeight:700,
                  fontSize:'0.95em',
                  display:'inline-flex',
                  alignItems:'center',
                  justifyContent:'center',
                  gap:8,
                  cursor: isCompleting ? 'not-allowed' : 'pointer',
                  opacity: isCompleting ? 0.7 : 1,
                }}
              >
                <Check size={18} /> {isCompleting ? 'Saving…' : 'Mark Complete'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Bottom safe-area spacer for Obsidian mobile toolbar */}
      <div style={{ height:'calc(24px + env(safe-area-inset-bottom, 0px))', flexShrink:0 }} aria-hidden />

      {toast && (
        <div style={{ position:'fixed', bottom:'calc(18px + env(safe-area-inset-bottom, 0px))', left:'50%', transform:'translateX(-50%)', background:'var(--background-secondary)', border:'1px solid var(--background-modifier-border)', boxShadow:'0 8px 24px rgba(0,0,0,0.14)', borderRadius:10, padding:'8px 14px', fontSize:'0.86em', display:'flex', alignItems:'center', gap:8, zIndex:50, color:'var(--text-normal)' }}>
          <CheckCircle size={14} style={{ color:'var(--interactive-accent)' }} /> {toast.msg}
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
