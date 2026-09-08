'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_DAILY_TARGET_MINUTES, clampDailyTargetMinutes } from '@/lib/dailyPortionUtils';
import { ACTIVE_PART_OPTIONS, ALL_QURAN_PART, QuranPart } from '@/lib/types';
import type { VaultStore } from '@/plugin/storage/vaultAdapter';

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
function parseSettings(raw: any): LocalDailySettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const activePart = isValidQuranPart(raw.activePart) ? raw.activePart as QuranPart : DEFAULT_SETTINGS.activePart;
  const dailyTargetMinutes = Number.isFinite(Number(raw.dailyTargetMinutes))
    ? clampDailyTargetMinutes(Number(raw.dailyTargetMinutes))
    : DEFAULT_SETTINGS.dailyTargetMinutes;
  const dailyPortionMode = raw.dailyPortionMode === 'reading' ? 'reading' : 'audio';
  const dailyReadingStyle = raw.dailyReadingStyle === 'line_by_line' ? 'line_by_line' : 'paragraph';
  const skippedSurahs = normalizeSkippedSurahs(raw.skippedSurahs);
  return { activePart, dailyTargetMinutes, dailyPortionMode, dailyReadingStyle, skippedSurahs, updatedAt: raw.updatedAt };
}
function parseProgress(raw: any): ListeningProgressEntryLocal[] {
  if (!raw || typeof raw !== 'object') return [];
  // vault stores progress as { [partId]: entry } or array? support both
  if (Array.isArray(raw)) {
    return raw.filter((e: any) => Number.isFinite(Number(e.partId))).map((e: any) => ({
      partId: Number(e.partId),
      lastVerseIndex: Number.isFinite(Number(e.lastVerseIndex)) ? Math.max(0, Math.trunc(Number(e.lastVerseIndex))) : 0,
      nextStartVerseKey: typeof e.nextStartVerseKey === 'string' ? e.nextStartVerseKey : undefined,
      cycles: Number.isFinite(Number(e.cycles)) ? Number(e.cycles) : 0,
      updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : undefined,
    }));
  }
  // object map: { "1": {...}, "2": {...} }
  const entries: ListeningProgressEntryLocal[] = [];
  for (const [k, v] of Object.entries(raw)) {
    const partId = Number(k);
    if (!Number.isFinite(partId)) continue;
    const e: any = v;
    entries.push({
      partId,
      lastVerseIndex: Number.isFinite(Number(e.lastVerseIndex)) ? Math.max(0, Math.trunc(Number(e.lastVerseIndex))) : 0,
      nextStartVerseKey: typeof e.nextStartVerseKey === 'string' ? e.nextStartVerseKey : undefined,
      cycles: Number.isFinite(Number(e.cycles)) ? Number(e.cycles) : 0,
      updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : undefined,
    });
  }
  return entries;
}

// Hook that mirrors useLocalDailySettings but backed by VaultStore (Resilio-synced)
export function useVaultDailySettings(vaultStore: VaultStore) {
  const [settings, setSettingsState] = useState<LocalDailySettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = await vaultStore.loadSettings<any>(null as any);
      if (cancelled) return;
      setSettingsState(raw ? parseSettings(raw) : { ...DEFAULT_SETTINGS });
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [vaultStore]);

  const saveSettings = useCallback(async (patch: Partial<LocalDailySettings>) => {
    setSettingsState(prev => {
      const next: LocalDailySettings = { ...prev, ...patch } as LocalDailySettings;
      if (patch.skippedSurahs !== undefined) next.skippedSurahs = normalizeSkippedSurahs(patch.skippedSurahs);
      if (patch.dailyTargetMinutes !== undefined) next.dailyTargetMinutes = clampDailyTargetMinutes(Number(patch.dailyTargetMinutes));
      if (patch.activePart !== undefined && !isValidQuranPart(patch.activePart)) next.activePart = prev.activePart;
      const payload = { ...next, updatedAt: new Date().toISOString() };
      void vaultStore.saveSettings(payload);
      return payload;
    });
  }, [vaultStore]);

  const resetSettings = useCallback(async () => {
    const next = { ...DEFAULT_SETTINGS, updatedAt: new Date().toISOString() };
    setSettingsState(next);
    await vaultStore.saveSettings(next);
  }, [vaultStore]);

  return useMemo(() => ({ settings, saveSettings, resetSettings, isLoading }), [settings, saveSettings, resetSettings, isLoading]);
}

export function useVaultListeningProgress(vaultStore: VaultStore) {
  const [progress, setProgress] = useState<ListeningProgressEntryLocal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    // Load from split files: daily/progress/part-*.json + legacy daily/progress.json
    // For now load legacy single file first, then per-part
    const legacy = await vaultStore.loadSettings<any>(null as any); // settings.json not progress
    // Try to load progress via vaultStore.loadProgress for each part 1..8
    const entries: ListeningProgressEntryLocal[] = [];
    for (let partId = 1; partId <= 8; partId++) {
      const data = await vaultStore.loadProgress(partId);
      if (data && typeof data === 'object') {
        // data is single entry object { partId, lastVerseIndex, ... } or array
        if (Array.isArray(data)) {
          for (const e of data) if (Number(e.partId) === partId) entries.push(e);
        } else if (Number(data.partId) === partId || data.lastVerseIndex !== undefined) {
          entries.push({
            partId,
            lastVerseIndex: Number(data.lastVerseIndex) || 0,
            nextStartVerseKey: data.nextStartVerseKey,
            cycles: Number(data.cycles) || 0,
            updatedAt: data.updatedAt,
          });
        }
      }
    }
    // Fallback: try legacy dailyProgress path if exists (single json array)
    if (entries.length === 0) {
      const rawLegacy = await (vaultStore as any).app?.vault?.getAbstractFileByPath ? null : null;
    }
    return entries;
  }, [vaultStore]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Try to read QuranLife/daily/progress.json if exists (backward compat)
      // and also per-part files
      const perPart: ListeningProgressEntryLocal[] = [];
      for (let partId = 1; partId <= 8; partId++) {
        const entry = await vaultStore.loadProgress(partId);
        if (entry) {
          if (Array.isArray(entry)) perPart.push(...entry);
          else if (typeof entry === 'object' && (entry as any).partId !== undefined) perPart.push(entry as any);
          else if (typeof entry === 'object' && (entry as any).lastVerseIndex !== undefined) perPart.push({ partId, ...(entry as any) });
        }
      }
      // Also try legacy combined file at daily/progress.json (old vaultAdapter used single file)
      const legacyCombined = await vaultStore.loadSettings<any>(null as any); // not needed
      if (!cancelled) {
        setProgress(perPart.length ? perPart : []);
        setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [vaultStore]);

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
      void vaultStore.saveProgress(entry.partId, nextEntry);
      return next;
    });
  }, [vaultStore]);

  const deleteProgress = useCallback(async (partId: number) => {
    setProgress(prev => {
      const next = prev.filter(p => p.partId !== partId);
      void vaultStore.saveProgress(partId, null as any); // delete file handled via save with empty?
      // Actually vaultStore.saveProgress will create file; to delete we need to delete file via vault
      // Do direct vault delete via app
      const app: any = (vaultStore as any).app;
      const path = `QuranLife/daily/progress/part-${partId}.json`;
      const file = app?.vault?.getAbstractFileByPath?.(path);
      if (file) void app.vault.delete(file);
      return next;
    });
  }, [vaultStore]);

  const resetProgress = useCallback(async (partId?: number) => {
    if (partId === undefined) {
      setProgress([]);
      for (let pid = 1; pid <= 8; pid++) {
        const app: any = (vaultStore as any).app;
        const path = `QuranLife/daily/progress/part-${pid}.json`;
        const file = app?.vault?.getAbstractFileByPath?.(path);
        if (file) try { await app.vault.delete(file); } catch {}
      }
      return;
    }
    setProgress(prev => {
      const next = prev.filter(p => p.partId !== partId);
      const app: any = (vaultStore as any).app;
      const path = `QuranLife/daily/progress/part-${partId}.json`;
      const file = app?.vault?.getAbstractFileByPath?.(path);
      if (file) void app.vault.delete(file);
      return next;
    });
  }, [vaultStore]);

  return useMemo(() => ({ progress, saveProgress, deleteProgress, resetProgress, isLoading }), [progress, saveProgress, deleteProgress, resetProgress, isLoading]);
}

export function useVaultDailyStore(vaultStore: VaultStore) {
  const settingsQ = useVaultDailySettings(vaultStore);
  const progressQ = useVaultListeningProgress(vaultStore);
  return { settingsQ, progressQ };
}
