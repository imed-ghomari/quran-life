'use client';
import React from 'react';
import { AnkiAnchor } from '@/lib/anki/types';
import { getSurah } from '@/lib/quranData';
import { sanitizeAnchors, buildAnchorsFromBreaks } from '@/lib/anki/splitStore';
import type { VaultStore } from '@/plugin/storage/vaultAdapter';
import { VAULT_PATHS, isHiddenPath } from '@/plugin/storage/vaultAdapter';

const { useCallback, useEffect, useMemo, useState } = React;

// Premade cache — like web's fetch('/premade-anki-data.json') with force-cache
let premadeCache: any | null = null;
let premadePromise: Promise<any | null> | null = null;
async function loadPremade(app: any): Promise<any | null> {
  if (premadeCache) return premadeCache;
  if (premadePromise) return premadePromise;
  premadePromise = (async () => {
    const candidates = [
      'public/premade-anki-data.json',
      'premade-anki-data.json',
      '.obsidian/plugins/quran-life/premade-anki-data.json',
      '.obsidian/plugins/quran-life/public/premade-anki-data.json',
      '.obsidian/plugins/quran-life/data/premade-anki-data.json',
      'QuranLife/premade-anki-data.json',
      'QuranLife/assets/premade-anki-data.json',
    ];
    // Try adapter.read for vault-visible and hidden
    for (const cand of candidates) {
      try {
        const raw = await app?.vault?.adapter?.read(cand);
        if (raw && raw.trim().startsWith("{")) {
          const parsed = JSON.parse(raw);
          premadeCache = parsed;
          return parsed;
        }
      } catch {}
    }
    // Try getResourcePath fetch (app://)
    if (app?.vault?.adapter?.getResourcePath) {
      for (const cand of candidates) {
        try {
          const url = app.vault.adapter.getResourcePath(cand);
          if (!url) continue;
          const res = await fetch(url);
          if (res.ok) {
            const j = await res.json();
            premadeCache = j;
            return j;
          }
        } catch {}
      }
    }
    // Try web fetch for dev (will fail in Obsidian but ok)
    try {
      const res = await fetch('/premade-anki-data.json', { cache: 'force-cache' } as any);
      if (res.ok) {
        const j = await res.json();
        premadeCache = j;
        return j;
      }
    } catch {}
    return null;
  })();
  const res = await premadePromise;
  premadeCache = res;
  premadePromise = null;
  return res;
}

// Vault-backed replacement for src/lib/anki/splitStore.ts localStorage
export function useVaultSplits(vaultStore: VaultStore, surahId: number) {
  const [anchors, setAnchors] = useState<AnkiAnchor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      let raw = await vaultStore.loadSplitsForSurah(surahId);
      let usedPremade = false;
      // Fallback to premade if vault has no splits for this surah (like web's premadeForStats)
      if ((!raw || raw.length === 0) && (vaultStore as any).app) {
        const premade = await loadPremade((vaultStore as any).app);
        const arr = premade?.splits?.[String(surahId)] || premade?.splits?.[surahId];
        if (Array.isArray(arr) && arr.length) {
          raw = arr;
          usedPremade = true;
        }
      }
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
      // Persist premade to vault for future offline (don't overwrite user splits)
      if (usedPremade && finalAnchors.length && (await vaultStore.loadSplitsForSurah(surahId)).length === 0) {
        try { await vaultStore.saveSplitsForSurah(surahId, finalAnchors); } catch {}
      }
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
    let data = await vaultStore.loadMindmap(key);
    // Fallback to premade if vault has no mindmap and not deleted (like web's premadeForStats)
    if ((!data || !data.snapshot) && (vaultStore as any).app) {
      const deleted = await vaultStore.loadDeletedKeys();
      if (!deleted.has(key)) {
        const premade = await loadPremade((vaultStore as any).app);
        const pm = premade?.mindmaps?.[key];
        if (pm?.snapshot) {
          data = pm;
          // Persist premade to vault for offline and Resilio sync (don't overwrite user data)
          try { await vaultStore.saveMindmap(key, pm); } catch {}
        }
      }
    }
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
    const root = (vaultStore as any).root || VAULT_PATHS.mindmapsDir((vaultStore as any).root || ".obsidian/plugins/quran-life/data");
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
    // Merge premade for keys not in vault and not deleted (like web's premadeForStats)
    try {
      const deleted = await vaultStore.loadDeletedKeys();
      const premade = await loadPremade(app);
      if (premade?.mindmaps) {
        for (const [k, v] of Object.entries(premade.mindmaps as Record<string, any>)) {
          if (deleted.has(k)) continue;
          if (!out[k] && (v as any)?.snapshot) {
            out[k] = { key: k, ...(v as any) } as VaultMindmap;
            // Persist premade to vault for future offline (fire and forget)
            vaultStore.saveMindmap(k, v).catch(()=>{});
          }
        }
      }
    } catch {}
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
    let data = await vaultStore.loadDoc(key);
    if ((!data || !data.trim()) && (vaultStore as any).app) {
      const premade = await loadPremade((vaultStore as any).app);
      const pmDoc = premade?.mindmapDocs?.[key];
      if (typeof pmDoc === 'string' && pmDoc.trim()) {
        data = pmDoc;
        // Persist premade doc to vault
        try { await vaultStore.saveDoc(key, pmDoc); } catch {}
      }
    }
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
