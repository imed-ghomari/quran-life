'use client';
import React from 'react';
import { DEFAULT_DAILY_TARGET_MINUTES, clampDailyTargetMinutes } from '@/lib/dailyPortionUtils';
import { getAudioPlayerReciterList } from '@/lib/audio';
import { readStored } from '@/lib/pluginStorage';
import { ALL_QURAN_PART, QuranPart } from '@/lib/types';
import type { PlaybackSpeed } from '@/lib/types';
import type { VaultStore } from '@/plugin/storage/vaultAdapter';
import type { App, EventRef, TAbstractFile } from 'obsidian';

const { useCallback, useEffect, useMemo, useState } = React;

export type DailyPortionMode = 'audio' | 'reading';
export type DailyReadingStyle = 'line_by_line' | 'paragraph';

export interface LocalDailySettings {
  activePart: QuranPart;
  dailyTargetMinutes: number;
  dailyPortionMode: DailyPortionMode;
  dailyReadingStyle: DailyReadingStyle;
  dailyPlaybackSpeed: PlaybackSpeed;
  /** Player + portion-sizing reciter (single source of truth). */
  dailyReciterId: string;
  skippedSurahs: number[];
  updatedAt?: string;
}

export interface ListeningProgressEntryLocal {
  partId: number;
  lastVerseIndex?: number;
  nextStartVerseKey?: string;
  cycles?: number;
  updatedAt?: string;
  /**
   * Local calendar day (YYYY-MM-DD) the portion was completed on, or null when
   * the completion was undone. Optional/absent for progress written by older
   * builds — those fall back to the `updatedAt` day comparison.
   */
  completedOnDay?: string | null;
  /**
   * Values from just before the last completion, so an accidental "Mark
   * Complete" can be undone (even after a reload, since it is persisted).
   */
  undo?: { lastVerseIndex?: number; nextStartVerseKey?: string; cycles?: number; updatedAt?: string } | null;
}

const SPEED_OPTIONS: PlaybackSpeed[] = [0.75, 1, 1.25, 1.5, 2, 2.5, 3];

function normalizePlaybackSpeed(v: unknown): PlaybackSpeed {
  const n = Number(v);
  if ((SPEED_OPTIONS as number[]).includes(n)) return n as PlaybackSpeed;
  return 1;
}

const DEFAULT_SETTINGS: LocalDailySettings = {
  activePart: ALL_QURAN_PART,
  dailyTargetMinutes: DEFAULT_DAILY_TARGET_MINUTES,
  dailyPortionMode: 'audio',
  dailyReadingStyle: 'paragraph',
  dailyPlaybackSpeed: 1,
  dailyReciterId: getAudioPlayerReciterList()[0]?.id ?? '',
  skippedSurahs: [],
};

function isValidQuranPart(value: unknown): value is QuranPart {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= ALL_QURAN_PART;
}
/** Narrow an unknown JSON value to a string-keyed object (never launders to a final type). */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
/** True when a stored value carries at least a numeric partId (persisted progress shape). */
function isStoredProgressEntry(value: unknown): value is ListeningProgressEntryLocal {
  const rec = asRecord(value);
  return !!rec && typeof rec.partId === 'number';
}
/**
 * Rebuild a progress entry from a stored record, copying only known fields so
 * the `in`-checks in `saveProgress` keep their absent-vs-null meaning.
 */
function fromStoredProgress(partId: number, rec: Record<string, unknown>): ListeningProgressEntryLocal {
  const next: ListeningProgressEntryLocal = {
    partId: typeof rec.partId === 'number' ? rec.partId : partId,
  };
  if (typeof rec.lastVerseIndex === 'number') next.lastVerseIndex = rec.lastVerseIndex;
  if (typeof rec.nextStartVerseKey === 'string') next.nextStartVerseKey = rec.nextStartVerseKey;
  if (typeof rec.cycles === 'number') next.cycles = rec.cycles;
  if (typeof rec.updatedAt === 'string') next.updatedAt = rec.updatedAt;
  if ('completedOnDay' in rec) next.completedOnDay = typeof rec.completedOnDay === 'string' ? rec.completedOnDay : null;
  if ('undo' in rec) {
    const undoRec = asRecord(rec.undo);
    next.undo = undoRec
      ? {
          ...(typeof undoRec.lastVerseIndex === 'number' ? { lastVerseIndex: undoRec.lastVerseIndex } : {}),
          ...(typeof undoRec.nextStartVerseKey === 'string' ? { nextStartVerseKey: undoRec.nextStartVerseKey } : {}),
          ...(typeof undoRec.cycles === 'number' ? { cycles: undoRec.cycles } : {}),
          ...(typeof undoRec.updatedAt === 'string' ? { updatedAt: undoRec.updatedAt } : {}),
        }
      : null;
  }
  return next;
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
/**
 * Same migration as the Settings tab: the legacy player choice
 * (`selected_reciter_id`) becomes the Daily Portion default on first read.
 */
function normalizeDailyReciterId(value: unknown): string {
  const playerReciters = getAudioPlayerReciterList();
  if (typeof value === 'string' && value && playerReciters.some(r => r.id === value)) return value;
  try {
    const legacy = readStored('selected_reciter_id') ?? '';
    if (legacy && playerReciters.some(r => r.id === legacy)) return legacy;
  } catch { /* storage unavailable */ }
  return playerReciters[0]?.id ?? '';
}
function parseSettings(raw: unknown): LocalDailySettings {
  const rec = asRecord(raw);
  if (!rec) return { ...DEFAULT_SETTINGS };
  const activePart = isValidQuranPart(rec.activePart) ? rec.activePart : DEFAULT_SETTINGS.activePart;
  const dailyTargetMinutes = Number.isFinite(Number(rec.dailyTargetMinutes))
    ? clampDailyTargetMinutes(Number(rec.dailyTargetMinutes))
    : DEFAULT_SETTINGS.dailyTargetMinutes;
  const dailyPortionMode = rec.dailyPortionMode === 'reading' ? 'reading' : 'audio';
  const dailyReadingStyle = rec.dailyReadingStyle === 'line_by_line' ? 'line_by_line' : 'paragraph';
  const dailyPlaybackSpeed = normalizePlaybackSpeed(rec.dailyPlaybackSpeed);
  const skippedSurahs = normalizeSkippedSurahs(rec.skippedSurahs);
  const dailyReciterId = normalizeDailyReciterId(rec.dailyReciterId);
  return {
    activePart,
    dailyTargetMinutes,
    dailyPortionMode,
    dailyReadingStyle,
    dailyPlaybackSpeed,
    dailyReciterId,
    skippedSurahs,
    updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : undefined,
  };
}

// Hook that mirrors useLocalDailySettings but backed by VaultStore (vault-synced)
export function useVaultDailySettings(vaultStore: VaultStore) {
  const [settings, setSettingsState] = useState<LocalDailySettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    const raw = await vaultStore.loadSettings<Record<string, unknown> | null>(null);
    setSettingsState(raw ? parseSettings(raw) : { ...DEFAULT_SETTINGS });
    setIsLoading(false);
  }, [vaultStore]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const raw = await vaultStore.loadSettings<Record<string, unknown> | null>(null);
      if (cancelled) return;
      setSettingsState(raw ? parseSettings(raw) : { ...DEFAULT_SETTINGS });
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [vaultStore]);

  // Listen for external changes from Settings tab (hidden file not triggering vault.on)
  useEffect(() => {
    const handler = () => { void reload(); };
    window.addEventListener('quran-life:daily-settings-changed', handler);
    // Also poll on visibility change (user switches back from Settings)
    const visHandler = () => { if (document.visibilityState === 'visible') void reload(); };
    document.addEventListener('visibilitychange', visHandler);
    // Listen to Obsidian vault modify for visible path fallback
    const app: App = vaultStore.app;
    let ref: EventRef | null = null;
    if (app?.vault?.on) {
      ref = app.vault.on('modify', (file: TAbstractFile) => {
        if (file?.path && file.path.endsWith('settings.json')) void reload();
      });
    }
    return () => {
      window.removeEventListener('quran-life:daily-settings-changed', handler);
      document.removeEventListener('visibilitychange', visHandler);
      if (ref) try { app.vault.offref(ref); } catch { /* best-effort only; ignore */ }
    };
  }, [vaultStore, reload]);

  const saveSettings = useCallback(async (patch: Partial<LocalDailySettings>) => {
    setSettingsState(prev => {
      const next: LocalDailySettings = { ...prev, ...patch };
      if (patch.skippedSurahs !== undefined) next.skippedSurahs = normalizeSkippedSurahs(patch.skippedSurahs);
      if (patch.dailyTargetMinutes !== undefined) next.dailyTargetMinutes = clampDailyTargetMinutes(Number(patch.dailyTargetMinutes));
      if (patch.dailyPlaybackSpeed !== undefined) next.dailyPlaybackSpeed = normalizePlaybackSpeed(patch.dailyPlaybackSpeed);
      if (patch.dailyReciterId !== undefined) next.dailyReciterId = normalizeDailyReciterId(patch.dailyReciterId);
      if (patch.activePart !== undefined && !isValidQuranPart(patch.activePart)) next.activePart = prev.activePart;
      const payload = { ...next, updatedAt: new Date().toISOString() };
      void vaultStore.saveSettings(payload).then(() => {
        try { window.dispatchEvent(new CustomEvent('quran-life:daily-settings-changed')); } catch { /* best-effort only; ignore */ }
      });
      return payload;
    });
  }, [vaultStore]);

  const resetSettings = useCallback(async () => {
    const next = { ...DEFAULT_SETTINGS, updatedAt: new Date().toISOString() };
    setSettingsState(next);
    await vaultStore.saveSettings(next);
    try { window.dispatchEvent(new CustomEvent('quran-life:daily-settings-changed')); } catch { /* best-effort only; ignore */ }
  }, [vaultStore]);

  return useMemo(() => ({ settings, saveSettings, resetSettings, isLoading, reload }), [settings, saveSettings, resetSettings, isLoading, reload]);
}

export function useVaultListeningProgress(vaultStore: VaultStore) {
  const [progress, setProgress] = useState<ListeningProgressEntryLocal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Re-read from disk on demand — files copied in from another vault (or
  // written externally) are picked up without requiring a restart.
  const reload = useCallback(async () => {
    // Try to read QuranLife/daily/progress.json if exists (backward compat)
    // and also per-part files
    const perPart: ListeningProgressEntryLocal[] = [];
    for (let partId = 1; partId <= 8; partId++) {
      const entry: unknown = await vaultStore.loadProgress(partId);
      if (Array.isArray(entry)) {
        for (const item of entry) {
          if (isStoredProgressEntry(item)) perPart.push(item);
        }
      } else {
        const rec = asRecord(entry);
        if (rec && (typeof rec.partId === 'number' || 'lastVerseIndex' in rec)) {
          perPart.push(fromStoredProgress(partId, rec));
        }
      }
    }
    setProgress(perPart.length ? perPart : []);
    setIsLoading(false);
  }, [vaultStore]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await reload();
    })();
    return () => { cancelled = true; };
  }, [vaultStore, reload]);

  // Hidden data files don't fire vault events, so re-read when the user comes
  // back (e.g. after copying progress files in from another vault).
  useEffect(() => {
    const visHandler = () => { if (document.visibilityState === 'visible') void reload(); };
    document.addEventListener('visibilitychange', visHandler);
    return () => document.removeEventListener('visibilitychange', visHandler);
  }, [reload]);

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
      const existing = existingIdx >= 0 ? prev[existingIdx] : undefined;
      // Only carry the completion fields when the caller (or a previous write)
      // set them: writing `completedOnDay: undefined` would hide today's
      // completion for progress files created by older builds.
      if ('completedOnDay' in entry) nextEntry.completedOnDay = entry.completedOnDay ?? null;
      else if (existing && 'completedOnDay' in existing) nextEntry.completedOnDay = existing.completedOnDay ?? null;
      if ('undo' in entry) nextEntry.undo = entry.undo ?? null;
      else if (existing && 'undo' in existing) nextEntry.undo = existing.undo ?? null;
      let next: ListeningProgressEntryLocal[];
      if (existingIdx >= 0) {
        next = [...prev];
        next[existingIdx] = nextEntry;
      } else {
        next = [...prev, nextEntry];
      }
      void vaultStore.saveProgress(entry.partId, nextEntry);
      return next;
    });
  }, [vaultStore]);

  const deleteProgress = useCallback(async (partId: number) => {
    setProgress(prev => {
      const next = prev.filter(p => p.partId !== partId);
      void vaultStore.saveProgress(partId, null);
      // Direct vault delete via app (paths follow the current data root).
      const app: App = vaultStore.app;
      const path = `${vaultStore.root}/daily/progress/part-${partId}.json`;
      const file = app?.vault?.getAbstractFileByPath?.(path);
      if (file) void app.vault.delete(file);
      return next;
    });
  }, [vaultStore]);

  const resetProgress = useCallback(async (partId?: number) => {
    if (partId === undefined) {
      setProgress([]);
      for (let pid = 1; pid <= 8; pid++) {
        const app: App = vaultStore.app;
        const path = `${vaultStore.root}/daily/progress/part-${pid}.json`;
        const file = app?.vault?.getAbstractFileByPath?.(path);
        if (file) try { await app.vault.delete(file); } catch { /* best-effort only; ignore */ }
      }
      return;
    }
    setProgress(prev => {
      const next = prev.filter(p => p.partId !== partId);
      const app: App = vaultStore.app;
      const path = `${vaultStore.root}/daily/progress/part-${partId}.json`;
      const file = app?.vault?.getAbstractFileByPath?.(path);
      if (file) void app.vault.delete(file);
      return next;
    });
  }, [vaultStore]);

  return useMemo(() => ({ progress, saveProgress, deleteProgress, resetProgress, isLoading, reload }), [progress, saveProgress, deleteProgress, resetProgress, isLoading, reload]);
}

export function useVaultDailyStore(vaultStore: VaultStore) {
  const settingsQ = useVaultDailySettings(vaultStore);
  const progressQ = useVaultListeningProgress(vaultStore);
  return { settingsQ, progressQ };
}
