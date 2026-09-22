'use client';
import React from 'react';
import { AnkiAnchor } from '@/lib/anki/types';
import { getSurah } from '@/lib/quranData';
import { sanitizeAnchors, buildAnchorsFromBreaks } from '@/lib/anki/splitStore';
import type { VaultStore } from '@/plugin/storage/vaultAdapter';
import { VAULT_PATHS } from '@/plugin/storage/vaultAdapter';

const { useCallback, useEffect, useState } = React;

// Vault-backed replacement for src/lib/anki/splitStore.ts localStorage
// Vault-only: no premade data. Stats/export count exactly what is on disk
// (user-created mindmaps, splits, docs shared directly between users).
export function useVaultSplits(vaultStore: VaultStore, surahId: number) {
  const [anchors, setAnchors] = useState<AnkiAnchor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Reset immediately so consumers never see the previous surah's anchors
    // while the new surah is loading (prevents stale sync + wrong-surah flash).
    setAnchors([]);
    setIsLoading(true);
    (async () => {
      const raw = await vaultStore.loadSplitsForSurah(surahId);
      if (cancelled) return;
      const surah = getSurah(surahId);
      const normalized = (Array.isArray(raw) ? raw : []).map((a: any) => {
        const sv = Number(a?.startVerse); const ev = Number(a?.endVerse);
        if (!Number.isFinite(sv) || !Number.isFinite(ev)) return null;
        if (sv <= 0 || ev < sv) return null;
        if (surah && (ev > surah.verseCount || sv > surah.verseCount)) return null;
        return { id: typeof a?.id === 'string' && a.id.trim() ? a.id : `anchor-${surahId}-${sv}-${ev}`, surahId, startVerse: sv, endVerse: ev, label: typeof a?.label === 'string' && a.label.trim() ? a.label : `Verses ${sv}-${ev}` } as AnkiAnchor;
      }).filter(Boolean) as AnkiAnchor[];
      const sanitized = sanitizeAnchors(surahId, normalized);
      const finalAnchors = sanitized.length ? sanitized : normalized;
      setAnchors(finalAnchors);
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [vaultStore, surahId]);

  const saveAnchors = useCallback(async (next: AnkiAnchor[]) => {
    setAnchors(next);
    await vaultStore.saveSplitsForSurah(surahId, next);
  }, [vaultStore, surahId]);

  const addBreak = useCallback(async (breakVerse: number, verseCount: number) => {
    const currentBreaks = [...anchors].sort((a,b)=>a.startVerse-b.startVerse).slice(0,-1).map(a=>a.endVerse);
    if (currentBreaks.includes(breakVerse)) return;
    const nextBreaks = [...currentBreaks, breakVerse].sort((a,b)=>a-b);
    const next = buildAnchorsFromBreaks(surahId, nextBreaks, verseCount);
    await saveAnchors(next.length ? next : []);
  }, [anchors, surahId, saveAnchors]);

  const removeBreak = useCallback(async (breakVerse: number, verseCount: number) => {
    const currentBreaks = [...anchors].sort((a,b)=>a.startVerse-b.startVerse).slice(0,-1).map(a=>a.endVerse);
    if (!currentBreaks.includes(breakVerse)) return;
    const nextBreaks = currentBreaks.filter(b=>b!==breakVerse);
    const next = buildAnchorsFromBreaks(surahId, nextBreaks, verseCount);
    await saveAnchors(next.length ? next : []);
  }, [anchors, surahId, saveAnchors]);

  return { anchors, saveAnchors, addBreak, removeBreak, isLoading };
}

// Vault-backed mindmaps (replaces src/lib/anki/mindmapStore.ts)
export interface VaultMindmap {
  key: string; // surah-2, part-1, meta-0
  kind: 'surah' | 'part' | 'meta' | 'cluster';
  surahId?: number;
  partId?: number;
  snapshot?: any;
  imageUrl?: string | null;
  imageUrlDark?: string | null;
  isComplete?: boolean;
  updatedAt?: string;
}

export function useVaultMindmap(vaultStore: VaultStore, key: string) {
  const [mindmap, setMindmap] = useState<VaultMindmap | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const data = await vaultStore.loadMindmap(key);
    if (data && typeof data === 'object') {
      setMindmap({ key, kind: (data.kind as any) || (key.startsWith('part-') ? 'part' : key.startsWith('meta-') ? 'meta' : 'surah'), ...data });
    } else {
      setMindmap(null);
    }
    setIsLoading(false);
  }, [vaultStore, key]);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async (patch: Partial<VaultMindmap>) => {
    const next = { ...(mindmap || { key }), ...patch, key, updatedAt: new Date().toISOString() } as VaultMindmap;
    setMindmap(next);
    await vaultStore.saveMindmap(key, next);
    return next;
  }, [vaultStore, key, mindmap]);

  const remove = useCallback(async () => {
    setMindmap(null);
    await vaultStore.deleteMindmap(key);
  }, [vaultStore, key]);

  // Subscribe to external Resilio changes: vault.on('modify') for this key
  // For hidden plugin folder, vault.on won't fire, so also poll via adapter
  useEffect(() => {
    const app: any = (vaultStore as any).app;
    const expectedPath = `${(vaultStore as any).root || VAULT_PATHS.mindmapsDir((vaultStore as any).root || ".obsidian/plugins/quran-life/data")}/${key}.json`.replace(/\/\//g, "/");
    // Normalize to actual VAULT_PATHS
    const correctPath = VAULT_PATHS.mindmapFile((vaultStore as any).root || ".obsidian/plugins/quran-life/data", key);
    if (!app?.vault?.on) return;
    const ref = app.vault.on('modify', (file: any) => {
      if (file?.path === correctPath || file?.path === expectedPath) void load();
    });
    return () => app.vault.offref?.(ref);
  }, [vaultStore, key, load]);

  return { mindmap, save, remove, isLoading, reload: load };
}

export function useVaultMindmaps(vaultStore: VaultStore) {
  const [all, setAll] = useState<Record<string, VaultMindmap>>({});
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    const app: any = (vaultStore as any).app;
    const dirPath = VAULT_PATHS.mindmapsDir((vaultStore as any).root || ".obsidian/plugins/quran-life/data");
    let files: string[] = [];
    // Try hidden-aware list via VaultStore's adapter
    if ((vaultStore as any).app?.vault?.adapter?.list) {
      try {
        const listed = await (vaultStore as any).app.vault.adapter.list(dirPath);
        if (Array.isArray(listed?.files)) files = listed.files;
      } catch {}
    }
    if (files.length === 0) {
      const dir = app?.vault?.getAbstractFileByPath?.(dirPath);
      if (dir?.children) {
        files = dir.children.filter((c: any) => c.extension === 'json').map((c: any) => c.path);
      }
    }
    const out: Record<string, VaultMindmap> = {};
    for (const filePath of files) {
      const base = filePath.split("/").pop()!.replace(/\.json$/, "");
      const key = base;
      const data = await vaultStore.loadMindmap(key);
      if (data) out[key] = { key, ...data } as VaultMindmap;
    }
    setAll(out);
    setIsLoading(false);
  }, [vaultStore]);

  useEffect(() => { void reload(); }, [reload]);

  return { mindmaps: all, isLoading, reload };
}

// Anki export prefs (partOrder + surahOrder)
export function useVaultAnkiExportPrefs(vaultStore: VaultStore) {
  const [prefs, setPrefs] = useState<import('@/lib/anki/ankiExportPrefs').AnkiExportPrefs | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const p = await vaultStore.loadAnkiExportPrefs();
      setPrefs(p);
    } catch { setPrefs(null); }
    setIsLoading(false);
  }, [vaultStore]);
  useEffect(() => { void load(); }, [load]);
  const save = useCallback(async (next: import('@/lib/anki/ankiExportPrefs').AnkiExportPrefs) => {
    setPrefs(next);
    await vaultStore.saveAnkiExportPrefs(next);
  }, [vaultStore]);
  const setPartOrder = useCallback(async (dir: import('@/lib/anki/ankiExportPrefs').SortDir) => {
    const cur = prefs ?? await vaultStore.loadAnkiExportPrefs();
    const updated: import('@/lib/anki/ankiExportPrefs').AnkiExportPrefs = { ...cur as any, partOrder: dir };
    setPrefs(updated);
    await vaultStore.saveAnkiExportPrefs(updated);
    return updated;
  }, [vaultStore, prefs]);
  const setSurahOrder = useCallback(async (dir: import('@/lib/anki/ankiExportPrefs').SortDir) => {
    const cur = prefs ?? await vaultStore.loadAnkiExportPrefs();
    const updated: import('@/lib/anki/ankiExportPrefs').AnkiExportPrefs = { ...cur as any, surahOrder: dir };
    setPrefs(updated);
    await vaultStore.saveAnkiExportPrefs(updated);
    return updated;
  }, [vaultStore, prefs]);
  return { prefs, isLoading, reload: load, save, setPartOrder, setSurahOrder };
}

// Docs — one markdown per key
export function useVaultDoc(vaultStore: VaultStore, key: string) {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const data = await vaultStore.loadDoc(key);
    setContent(typeof data === 'string' ? data : '');
    setIsLoading(false);
  }, [vaultStore, key]);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async (next: string) => {
    setContent(next);
    await vaultStore.saveDoc(key, next);
  }, [vaultStore, key]);

  useEffect(() => {
    const app: any = (vaultStore as any).app;
    const correctPath = VAULT_PATHS.docFile((vaultStore as any).root || ".obsidian/plugins/quran-life/data", key);
    if (!app?.vault?.on) return;
    const ref = app.vault.on('modify', (file: any) => {
      if (file?.path === correctPath) void load();
    });
    return () => app.vault.offref?.(ref);
  }, [vaultStore, key, load]);

  return { content, save, isLoading, reload: load };
}
