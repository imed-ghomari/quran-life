'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_DAILY_TARGET_MINUTES, clampDailyTargetMinutes } from '@/lib/dailyPortionUtils';
import { ACTIVE_PART_OPTIONS, ALL_QURAN_PART, QuranPart } from '@/lib/types';

export type DailyPortionMode = 'audio' | 'reading';
export type DailyReadingStyle = 'line_by_line' | 'paragraph';

export interface LocalDailySettings {
  activePart: QuranPart;
  dailyTargetMinutes: number;
  dailyPortionMode: DailyPortionMode;
  dailyReadingStyle: DailyReadingStyle;
  skippedSurahs: number[];
  updatedAt?: string;
}

export interface ListeningProgressEntryLocal {
  partId: number;
  lastVerseIndex?: number;
  nextStartVerseKey?: string;
  cycles?: number;
  updatedAt?: string;
}

const LS_SETTINGS_KEY = 'quran-life:daily:settings:v1';
const LS_PROGRESS_KEY = 'quran-life:daily:progress:v1';
const LS_LISTENING_STATS_KEY = 'quran-life:daily:listeningStats:v1'; // kept for compatibility, not essential

const DEFAULT_SETTINGS: LocalDailySettings = {
  activePart: ALL_QURAN_PART,
  dailyTargetMinutes: DEFAULT_DAILY_TARGET_MINUTES,
  dailyPortionMode: 'audio',
  dailyReadingStyle: 'paragraph',
  skippedSurahs: [],
};

function isValidQuranPart(value: unknown): value is QuranPart {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= ALL_QURAN_PART;
}

function normalizeSkippedSurahs(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const s = new Set<number>();
  value.forEach(v => {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 1 && n <= 114) s.add(n);
  });
  return Array.from(s).sort((a, b) => a - b);
}

function parseSettings(raw: string | null): LocalDailySettings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw);
    const activePart = isValidQuranPart(parsed.activePart) ? parsed.activePart as QuranPart : DEFAULT_SETTINGS.activePart;
    const dailyTargetMinutes = Number.isFinite(Number(parsed.dailyTargetMinutes))
      ? clampDailyTargetMinutes(Number(parsed.dailyTargetMinutes))
      : DEFAULT_SETTINGS.dailyTargetMinutes;
    const dailyPortionMode = parsed.dailyPortionMode === 'reading' ? 'reading' : 'audio';
    const dailyReadingStyle = parsed.dailyReadingStyle === 'line_by_line' ? 'line_by_line' : 'paragraph';
    const skippedSurahs = normalizeSkippedSurahs(parsed.skippedSurahs);
    return { activePart, dailyTargetMinutes, dailyPortionMode, dailyReadingStyle, skippedSurahs, updatedAt: parsed.updatedAt };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function parseProgress(raw: string | null): ListeningProgressEntryLocal[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e: any) => Number.isFinite(Number(e.partId))).map((e: any) => ({
      partId: Number(e.partId),
      lastVerseIndex: Number.isFinite(Number(e.lastVerseIndex)) ? Math.max(0, Math.trunc(Number(e.lastVerseIndex))) : 0,
      nextStartVerseKey: typeof e.nextStartVerseKey === 'string' ? e.nextStartVerseKey : undefined,
      cycles: Number.isFinite(Number(e.cycles)) ? Number(e.cycles) : 0,
      updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : undefined,
    }));
  } catch {
    return [];
  }
}

export function useLocalDailySettings() {
  const [settings, setSettingsState] = useState<LocalDailySettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LS_SETTINGS_KEY) : null;
    setSettingsState(parseSettings(raw));
    setIsLoading(false);
  }, []);

  const persist = useCallback((next: LocalDailySettings) => {
    const payload = { ...next, updatedAt: new Date().toISOString() };
    setSettingsState(payload);
    try {
      localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(payload));
    } catch {}
  }, []);

  const saveSettings = useCallback(async (patch: Partial<LocalDailySettings>) => {
    setSettingsState(prev => {
      const next: LocalDailySettings = { ...prev, ...patch } as LocalDailySettings;
      if (patch.skippedSurahs !== undefined) next.skippedSurahs = normalizeSkippedSurahs(patch.skippedSurahs);
      if (patch.dailyTargetMinutes !== undefined) next.dailyTargetMinutes = clampDailyTargetMinutes(Number(patch.dailyTargetMinutes));
      if (patch.activePart !== undefined && !isValidQuranPart(patch.activePart)) next.activePart = prev.activePart;
      const payload = { ...next, updatedAt: new Date().toISOString() };
      try {
        localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(payload));
      } catch {}
      return payload;
    });
  }, []);

  const resetSettings = useCallback(async () => {
    const next = { ...DEFAULT_SETTINGS, updatedAt: new Date().toISOString() };
    setSettingsState(next);
    try {
      localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  return useMemo(() => ({ settings, saveSettings, resetSettings, isLoading }), [settings, saveSettings, resetSettings, isLoading]);
}

export function useLocalListeningProgress() {
  const [progress, setProgress] = useState<ListeningProgressEntryLocal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LS_PROGRESS_KEY) : null;
    setProgress(parseProgress(raw));
    setIsLoading(false);
  }, []);

  const saveProgress = useCallback(async (entry: ListeningProgressEntryLocal) => {
    setProgress(prev => {
      const now = new Date().toISOString();
      const normalizedLastVerseIndex = Number.isFinite(Number(entry.lastVerseIndex))
        ? Math.max(0, Math.trunc(Number(entry.lastVerseIndex)))
        : 0;
      const nextEntry: ListeningProgressEntryLocal = {
        partId: entry.partId,
        lastVerseIndex: normalizedLastVerseIndex,
        nextStartVerseKey: entry.nextStartVerseKey,
        cycles: entry.cycles ?? 0,
        updatedAt: entry.updatedAt || now,
      };
      const existingIdx = prev.findIndex(p => p.partId === entry.partId);
      let next: ListeningProgressEntryLocal[];
      if (existingIdx >= 0) {
        next = [...prev];
        next[existingIdx] = nextEntry;
      } else {
        next = [...prev, nextEntry];
      }
      try {
        localStorage.setItem(LS_PROGRESS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const deleteProgress = useCallback(async (partId: number) => {
    setProgress(prev => {
      const next = prev.filter(p => p.partId !== partId);
      try {
        localStorage.setItem(LS_PROGRESS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const resetProgress = useCallback(async (partId?: number) => {
    if (partId === undefined) {
      setProgress([]);
      try { localStorage.removeItem(LS_PROGRESS_KEY); } catch {}
      try { localStorage.removeItem(LS_LISTENING_STATS_KEY); } catch {}
      return;
    }
    setProgress(prev => {
      const next = prev.filter(p => p.partId !== partId);
      try { localStorage.setItem(LS_PROGRESS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return useMemo(() => ({ progress, saveProgress, deleteProgress, resetProgress, isLoading }), [progress, saveProgress, deleteProgress, resetProgress, isLoading]);
}

// Unified hook for convenience
export function useLocalDailyStore() {
  const settingsQ = useLocalDailySettings();
  const progressQ = useLocalListeningProgress();
  return { settingsQ, progressQ };
}
