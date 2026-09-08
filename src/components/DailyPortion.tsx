'use client';

import { useState, useEffect, useRef, useMemo, useCallback, startTransition } from 'react';
import dynamic from 'next/dynamic';
import { getQuranVerses, getSurah, getSurahsByPart, SURAHS } from '@/lib/quranData';
import { getDailyPortion } from '@/lib/dailyPortions';
import { Verse, ACTIVE_PART_OPTIONS, QuranPart, ALL_QURAN_PART } from '@/lib/types';
import { CheckCircle, BookOpen, Settings, ChevronDown, X, Check, RotateCcw, Sliders, Headphones, Book } from 'lucide-react';
import { useLocalDailySettings, useLocalListeningProgress, DailyPortionMode } from '@/hooks/useLocalDailyStore';
import { useDailyPortionTiming } from '@/hooks/useDailyPortionTiming';
import {
  DEFAULT_DAILY_TARGET_MINUTES,
  estimateVerseDurationMinutes,
  getProgressStartIndexFromEligibleSurahs,
  getVerseKey,
} from '@/lib/dailyPortionUtils';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { useTheme } from '@/components/ThemeProvider';

const AudioPlayerLocal = dynamic(() => import('@/components/AudioPlayerLocal'), { ssr: false });

type DailyPortionSurahGroup = {
  surahId: number;
  verses: Verse[];
};

function groupVersesBySurah(verses: Verse[]): DailyPortionSurahGroup[] {
  const groups: DailyPortionSurahGroup[] = [];
  for (const verse of verses) {
    const prev = groups[groups.length - 1];
    if (prev && prev.surahId === verse.surahId) prev.verses.push(verse);
    else groups.push({ surahId: verse.surahId, verses: [verse] });
  }
  return groups;
}

function getLocalDayKeyNow() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function DailyPortion() {
  const { settings, saveSettings, isLoading: settingsLoading } = useLocalDailySettings();
  const { progress: listeningProgress, saveProgress, resetProgress, isLoading: progressLoading } = useLocalListeningProgress();
  const { averageSecondsPerWordBySurah } = useDailyPortionTiming();
  const { theme } = useTheme();

  const [allVerses, setAllVerses] = useState<Verse[]>([]);
  const [isVersesLoaded, setIsVersesLoaded] = useState(false);
  const [todaysPortion, setTodaysPortion] = useState<Verse[]>([]);
  const [currentVerseIndex, setCurrentVerseIndex] = useState(0);
  const [highlightedWordIndex, setHighlightedWordIndex] = useState<number>(-1);
  const [listeningComplete, setListeningComplete] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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
      startVerseIndex: 0,
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

  // Initialize listeningComplete based on progress date
  useEffect(() => {
    if (!portionData.lastUpdateAt) {
      setListeningComplete(false);
      return;
    }
    const lastUpdate = new Date(portionData.lastUpdateAt);
    const now = new Date();
    if (lastUpdate.toDateString() === now.toDateString()) {
      setListeningComplete(true);
    } else {
      setListeningComplete(false);
    }
  }, [portionData.lastUpdateAt]);

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
  const dailyPreviewWords = useMemo(() => (currentDailyVerse?.text ?? '').split(' ').filter(Boolean), [currentDailyVerse?.text]);
  const handleAudioWordIndexChange = useCallback((index: number) => {
    startTransition(() => setHighlightedWordIndex(index));
  }, []);

  const dailyPortionSurahGroups = useMemo(() => groupVersesBySurah(todaysPortion), [todaysPortion]);
  const readOnlyMode = settings.dailyPortionMode === 'reading';
  const dailyReadingStyle = settings.dailyReadingStyle ?? 'paragraph';
  const isLoaded = isVersesLoaded && !settingsLoading && !progressLoading;

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

  const handleResetCurrent = async () => {
    if (!confirm('Reset progress for current part? This will restart daily portion from the beginning.')) return;
    await resetProgress(settings.activePart);
    setListeningComplete(false);
    showToast('Progress reset for this part.');
  };
  const handleResetAll = async () => {
    if (!confirm('Reset ALL progress? This will clear all parts.')) return;
    await resetProgress();
    setListeningComplete(false);
    showToast('All progress reset.');
  };

  const toggleSurah = async (surahId: number) => {
    const current = new Set(settings.skippedSurahs || []);
    if (current.has(surahId)) current.delete(surahId);
    else current.add(surahId);
    await saveSettings({ skippedSurahs: Array.from(current) });
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

  if (!isLoaded) return <PageSkeleton />;

  return (
    <div className="content-wrapper">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BookOpen size={24} className="text-[var(--accent)]" />
              Daily Portion
            </h1>
            <p className="text-sm text-[var(--foreground-secondary)] mt-1">
              {eligibleSurahs.length > 0 ? (
                <>
                  {portionData.totalVerses} verses in scope • ~{Math.round(portionData.snappedMinutes)} min today • {portionData.derivedCompletionDays} day cycle
                </>
              ) : (
                'No surahs selected'
              )}
            </p>
          </div>
          <button
            onClick={() => setShowSettings(v => !v)}
            className="p-2 rounded-xl border border-[var(--border)] bg-[var(--background-secondary)] hover:bg-[var(--verse-bg)] transition"
            aria-label="Settings"
          >
            <Settings size={20} />
          </button>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="card mb-6" style={{ animation: 'fadeUp 0.2s ease' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Sliders size={18} />
                Configure Daily Portion
              </h2>
              <button onClick={() => setShowSettings(false)} className="p-1 rounded hover:bg-[var(--verse-bg)]">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-6">
              {/* Part selection */}
              <div>
                <label className="adv-label mb-2 block">Qur&apos;an Part</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {ACTIVE_PART_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => handlePartChange(opt.id)}
                      className={`p-3 rounded-xl border text-sm font-medium transition text-left ${settings.activePart === opt.id ? 'border-[var(--accent)] bg-[var(--verse-bg)] text-[var(--accent)]' : 'border-[var(--border)] bg-[var(--background)] hover:bg-[var(--verse-bg)]'}`}
                    >
                      <div className="font-semibold">{opt.name}</div>
                      <div className="text-xs opacity-70">{getSurahsByPart(opt.id).length} surahs</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Daily target & mode */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="adv-label mb-2 block">Daily Target: {settings.dailyTargetMinutes} minutes</label>
                  <input
                    type="range"
                    min={5}
                    max={180}
                    step={5}
                    value={settings.dailyTargetMinutes}
                    onChange={e => saveSettings({ dailyTargetMinutes: Number(e.target.value) })}
                    className="w-full accent-[var(--accent)]"
                  />
                  <div className="flex justify-between text-xs text-[var(--foreground-secondary)]">
                    <span>5 min</span>
                    <span>~{portionData.derivedCompletionDays} days to complete</span>
                    <span>180 min</span>
                  </div>
                </div>
                <div>
                  <label className="adv-label mb-2 block">Mode</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => saveSettings({ dailyPortionMode: 'audio' })}
                      className={`p-3 rounded-xl border flex items-center gap-2 justify-center font-medium ${settings.dailyPortionMode === 'audio' ? 'border-[var(--accent)] bg-[var(--verse-bg)] text-[var(--accent)]' : 'border-[var(--border)]'}`}
                    >
                      <Headphones size={16} /> Listening
                    </button>
                    <button
                      onClick={() => saveSettings({ dailyPortionMode: 'reading' })}
                      className={`p-3 rounded-xl border flex items-center gap-2 justify-center font-medium ${settings.dailyPortionMode === 'reading' ? 'border-[var(--accent)] bg-[var(--verse-bg)] text-[var(--accent)]' : 'border-[var(--border)]'}`}
                    >
                      <Book size={16} /> Reading
                    </button>
                  </div>
                  {settings.dailyPortionMode === 'reading' && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => saveSettings({ dailyReadingStyle: 'paragraph' })}
                        className={`p-2 rounded-lg border text-sm ${settings.dailyReadingStyle === 'paragraph' ? 'border-[var(--accent)] bg-[var(--verse-bg)] text-[var(--accent)]' : 'border-[var(--border)]'}`}
                      >
                        Paragraph
                      </button>
                      <button
                        onClick={() => saveSettings({ dailyReadingStyle: 'line_by_line' })}
                        className={`p-2 rounded-lg border text-sm ${settings.dailyReadingStyle === 'line_by_line' ? 'border-[var(--accent)] bg-[var(--verse-bg)] text-[var(--accent)]' : 'border-[var(--border)]'}`}
                      >
                        Line by Line
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Surah selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="adv-label">Surahs in Portion ({eligibleSurahs.length}/{getSurahsByPart(settings.activePart).length} selected)</label>
                  <div className="flex gap-2">
                    <button onClick={() => saveSettings({ skippedSurahs: [] })} className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--verse-bg)]">Select All</button>
                    <button onClick={() => saveSettings({ skippedSurahs: getSurahsByPart(settings.activePart).map(s => s.id) })} className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--verse-bg)]">Clear All</button>
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto border border-[var(--border)] rounded-xl p-2 bg-[var(--background)] custom-scrollbar">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                    {getSurahsByPart(settings.activePart).map(surah => {
                      const isSkipped = (settings.skippedSurahs || []).includes(surah.id);
                      const isSelected = !isSkipped;
                      return (
                        <label key={surah.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-[var(--verse-bg)] ${isSelected ? '' : 'opacity-60'}`}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSurah(surah.id)} className="accent-[var(--accent)]" />
                          <span className="text-sm flex-1">
                            <span className="font-medium">{surah.id}. {surah.arabicName}</span>
                            <span className="text-xs text-[var(--foreground-secondary)] ml-1">({surah.name} • {surah.verseCount}v)</span>
                          </span>
                          {isSelected && <Check size={14} className="text-[var(--accent)]" />}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <p className="text-xs text-[var(--foreground-secondary)] mt-2">Uncheck surahs you want to exclude from daily portions. Progress resets to handle new scope.</p>
              </div>

              {/* Reset */}
              <div className="border-t border-[var(--border)] pt-4">
                <label className="adv-label mb-2 block">Reset Progress</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={handleResetCurrent} className="p-3 rounded-xl border border-[var(--border)] hover:bg-[var(--verse-bg)] flex items-center justify-center gap-2 text-sm">
                    <RotateCcw size={16} /> Reset This Part
                  </button>
                  <button onClick={handleResetAll} className="p-3 rounded-xl border border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white flex items-center justify-center gap-2 text-sm">
                    <X size={16} /> Reset All Parts
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-[var(--foreground-secondary)]">
                  <span>Current pointer:</span>
                  <code className="px-2 py-1 rounded bg-[var(--verse-bg)] border border-[var(--border)]">{activeProgress?.nextStartVerseKey || '1:1 (start)'}</code>
                  <span>• Cycle {activeProgress?.cycles || 0}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Daily Portion Card */}
        <div className="card">
          {listeningComplete || eligibleSurahs.length === 0 ? (
            <div className="empty-state py-12 text-center">
              {listeningComplete ? (
                <>
                  <CheckCircle size={48} className="mx-auto text-[var(--success)] mb-3" />
                  <p className="font-semibold text-lg">Daily portion complete!</p>
                  <p className="text-sm text-[var(--foreground-secondary)] mt-1">You&apos;ve finished today&apos;s reading. Come back tomorrow for the next portion.</p>
                  <div className="mt-6 flex flex-col items-center gap-3">
                    <button onClick={handleResetCurrent} className="px-4 py-2 rounded-xl border border-[var(--border)] text-sm flex items-center gap-2">
                      <RotateCcw size={16} /> Restart Part
                    </button>
                    {otherPartsWithContent.length > 0 && (
                      <div className="w-full max-w-xs">
                        <p className="text-xs text-[var(--foreground-secondary)] mb-2">Or switch part:</p>
                        <select
                          className="w-full p-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm"
                          value=""
                          onChange={e => handlePartChange(Number(e.target.value) as QuranPart)}
                        >
                          <option value="" disabled>
                            Select a part...
                          </option>
                          {otherPartsWithContent.map(opt => (
                            <option key={opt.id} value={opt.id}>
                              {opt.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <BookOpen size={48} className="mx-auto opacity-40 mb-3" />
                  <p className="font-medium">No surahs selected</p>
                  <p className="text-sm text-[var(--foreground-secondary)] mt-1">Select at least one surah in settings to generate a portion.</p>
                  <button onClick={() => setShowSettings(true)} className="mt-4 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm">
                    Open Settings
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm text-[var(--foreground-secondary)]">
                  <span className="font-medium text-[var(--foreground)]">{todaysPortion.length} verses</span>
                  {portionData.startVerseKey && portionData.nextStartVerseKey && (
                    <span className="ml-2">
                      Next: {portionData.nextStartVerseKey}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-1 rounded-full bg-[var(--verse-bg)] border border-[var(--border)]">
                    {settings.dailyPortionMode === 'audio' ? 'Listening' : 'Reading'} • {settings.dailyTargetMinutes} min/day
                  </span>
                </div>
              </div>

              {!readOnlyMode ? (
                <div className="audio-mode-section">
                  <div className="mb-3">
                    <AudioPlayerLocal
                      verses={todaysPortion}
                      currentVerseIndex={currentVerseIndex}
                      currentVerseWordCount={dailyPreviewWords.length}
                      onVerseChange={setCurrentVerseIndex}
                      onWordIndexChange={handleAudioWordIndexChange}
                    />
                  </div>
                  <div
                    ref={verseContainerRef}
                    className="verse-item daily-verse-preview p-4 border rounded-xl overflow-y-auto"
                    style={{ maxHeight: '45vh', minHeight: '120px' }}
                  >
                    {currentDailyVerse && (
                      <>
                        <div className="verse-ref font-arabic text-sm opacity-70 mb-1">
                          {getSurah(currentDailyVerse.surahId)?.arabicName} : {currentDailyVerse.ayahId}
                        </div>
                        {currentDailyVerse.ayahId === 1 ? (
                          currentDailyVerse.surahId !== 1 &&
                          currentDailyVerse.surahId !== 9 && (
                            <div className="arabic-text text-center opacity-80 mb-2" style={{ fontSize: '1.1rem' }}>
                              بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ
                            </div>
                          )
                        ) : currentVerseIndex === 0 ? (
                          <div className="arabic-text text-center opacity-80 mb-2" style={{ fontSize: '1.1rem' }}>
                            أَعُوذُ بِٱللَّهِ مِنَ ٱلشَّيْطَانِ ٱلرَّجِيمِ
                          </div>
                        ) : null}
                        <div className="arabic-text" style={{ fontSize: '1.35rem', lineHeight: 2 }}>
                          {dailyPreviewWords.map((word, i) => (
                            <span
                              key={i}
                              ref={el => {
                                wordElementRefs.current[i] = el;
                              }}
                              className={`audio-word ${i === highlightedWordIndex ? 'audio-word--active' : ''}`}
                            >
                              {word}{' '}
                            </span>
                          ))}
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs text-[var(--foreground-secondary)]">
                          <span>
                            Verse {currentVerseIndex + 1} / {todaysPortion.length}
                          </span>
                          <div className="flex gap-1">
                            <button
                              onClick={() => setCurrentVerseIndex(v => Math.max(0, v - 1))}
                              disabled={currentVerseIndex === 0}
                              className="px-2 py-1 rounded border border-[var(--border)] disabled:opacity-40"
                            >
                              Prev
                            </button>
                            <button
                              onClick={() => setCurrentVerseIndex(v => Math.min(todaysPortion.length - 1, v + 1))}
                              disabled={currentVerseIndex === todaysPortion.length - 1}
                              className="px-2 py-1 rounded border border-[var(--border)] disabled:opacity-40"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="read-view custom-scrollbar max-h-[60vh] overflow-y-auto pr-1">
                  {dailyReadingStyle === 'paragraph' ? (
                    dailyPortionSurahGroups.map((group, idx) => {
                      const surah = getSurah(group.surahId);
                      const firstVerse = group.verses[0];
                      if (!firstVerse) return null;
                      return (
                        <div key={`${group.surahId}-${idx}`} className="mb-4">
                          {surah && (
                            <div className="text-center py-3 my-2 bg-[var(--verse-bg)] rounded-lg">
                              <h3 className="font-arabic" style={{ fontSize: '1.2rem' }}>
                                {surah.arabicName}
                              </h3>
                              {firstVerse.ayahId === 1 ? (
                                surah.id !== 9 && surah.id !== 1 && <p className="arabic-text" style={{ fontSize: '1.1rem' }}>بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</p>
                              ) : (
                                <p className="arabic-text opacity-80" style={{ fontSize: '1.1rem' }}>أَعُوذُ بِٱللَّهِ مِنَ ٱلشَّيْطَانِ ٱلرَّجِيمِ</p>
                              )}
                            </div>
                          )}
                          <div className="verse-item" style={{ textAlign: 'right' }}>
                            <div className="grouped-verse" style={{ fontSize: '1.05rem', lineHeight: 1.95, textAlign: 'justify', textAlignLast: 'right' as any }}>
                              {group.verses.map(v => (
                                <span key={`${v.surahId}-${v.ayahId}`} className="grouped-verse-block">
                                  <span className="verse-badge" style={{ fontSize: '0.6rem', padding: '1px 4px' }}>{v.ayahId}</span>
                                  <span className="grouped-verse-text arabic-text" style={{ fontSize: '1.25rem', lineHeight: 1.9 }}>{v.text}</span>
                                </span>
                              ))}
                            </div>
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
                        <div key={idx}>
                          {isNewSurah && surah && (
                            <div className="text-center py-3 my-2 bg-[var(--verse-bg)] rounded-lg">
                              <h3 className="font-arabic" style={{ fontSize: '1.2rem' }}>{surah.arabicName}</h3>
                              {v.ayahId === 1 ? (
                                surah.id !== 9 && surah.id !== 1 && <p className="arabic-text" style={{ fontSize: '1.1rem' }}>بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</p>
                              ) : (
                                <p className="arabic-text opacity-80" style={{ fontSize: '1.1rem' }}>أَعُوذُ بِٱللَّهِ مِنَ ٱلشَّيْطَانِ ٱلرَّجِيمِ</p>
                              )}
                            </div>
                          )}
                          <div className="verse-item" style={{ display: 'block', marginBottom: '0.5rem', textAlign: 'right' }}>
                            <span className="verse-ref" style={{ float: 'left', fontSize: '0.7rem' }}>{v.ayahId}</span>
                            <span className="arabic-text" style={{ fontSize: '1.25rem' }}>{v.text}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              <div className="mt-6">
                <button
                  onClick={handleComplete}
                  disabled={isCompleting}
                  className="w-full py-3 rounded-xl bg-[var(--success)] text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
                >
                  <Check size={20} /> {isCompleting ? 'Saving...' : 'Mark Complete'}
                </button>
                <p className="text-xs text-center text-[var(--foreground-secondary)] mt-2">
                  This advances to next portion. You can undo via browser back or reset in settings.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="text-center mt-6 text-xs text-[var(--foreground-secondary)]">
          <p>Works offline • Progress saved locally • PWA installable</p>
          <p className="mt-1">Configure surahs, timing and mode in settings (gear icon).</p>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[var(--background-secondary)] border border-[var(--border)] shadow-lg rounded-xl px-4 py-2 text-sm flex items-center gap-2 z-50">
          <CheckCircle size={16} className="text-[var(--success)]" /> {toast.msg}
        </div>
      )}
    </div>
  );
}
