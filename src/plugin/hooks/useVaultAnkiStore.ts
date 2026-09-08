'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnkiAnchor } from '@/lib/anki/types';
import { getSurah } from '@/lib/quranData';
import { sanitizeAnchors, buildAnchorsFromBreaks } from '@/lib/anki/splitStore';
import type { VaultStore } from '@/plugin/storage/vaultAdapter';

// Vault-backed replacement for src/lib/anki/splitStore.ts localStorage
export function useVaultSplits(vaultStore: VaultStore, surahId: number) {
  const [anchors, setAnchors] = useState<AnkiAnchor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
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
      setAnchors(sanitized.length ? sanitized : normalized);
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
  useEffect(() => {
    const app: any = (vaultStore as any).app;
    if (!app?.vault?.on) return;
    const ref = app.vault.on('modify', (file: any) => {
      if (file?.path === `QuranLife/mindmaps/${key}.json`) void load();
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
    const dir = app?.vault?.getAbstractFileByPath?.('QuranLife/mindmaps');
    if (!dir || !dir.children) { setIsLoading(false); return; }
    const out: Record<string, VaultMindmap> = {};
    for (const child of dir.children) {
      if (child.extension !== 'json') continue;
      const key = child.basename; // surah-2
      const data = await vaultStore.loadMindmap(key);
      if (data) out[key] = { key, ...data } as VaultMindmap;
    }
    setAll(out);
    setIsLoading(false);
  }, [vaultStore]);

  useEffect(() => { void reload(); }, [reload]);

  return { mindmaps: all, isLoading, reload };
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
    if (!app?.vault?.on) return;
    const ref = app.vault.on('modify', (file: any) => {
      if (file?.path === `QuranLife/docs/${key}.md`) void load();
    });
    return () => app.vault.offref?.(ref);
  }, [vaultStore, key, load]);

  return { content, save, isLoading, reload: load };
}
