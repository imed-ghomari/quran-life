'use client';
import React from 'react';
import { TFolder, TFile } from 'obsidian';
import type { AnkiAnchor, MindmapKind, MindmapRecord } from '@/lib/anki/types';
import { getSurah } from '@/lib/quranData';
import { sanitizeAnchors, buildAnchorsFromBreaks } from '@/lib/anki/splitStore';
import type { VaultStore } from '@/plugin/storage/vaultAdapter';
import { VAULT_PATHS } from '@/plugin/storage/vaultAdapter';
import type { AnkiExportPrefs, SortDir } from '@/lib/anki/ankiExportPrefs';

const { useCallback, useEffect, useRef, useState } = React;

export type VaultMindmap = MindmapRecord;

function kindFromKey(key: string): MindmapKind {
  if (key.startsWith('part-')) return 'part';
  if (key.startsWith('meta-')) return 'meta';
  if (key.startsWith('cluster-')) return 'cluster';
  return 'surah';
}

// Vault-backed replacement for src/lib/anki/splitStore.ts localStorage
// Vault-only: no premade data. Stats/export count exactly what is on disk
// (user-created mindmaps, splits, docs shared directly between users).
export function useVaultSplits(vaultStore: VaultStore, surahId: number) {
  const [anchors, setAnchors] = useState<AnkiAnchor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Generation guard: a slow load for a previous surah must not overwrite the
  // current one (same guarantee the old per-effect `cancelled` flag gave).
  const loadGen = useRef(0);
  const load = useCallback(async () => {
    const gen = ++loadGen.current;
    // Reset immediately so consumers never see the previous surah's anchors
    // while the new surah is loading (prevents stale sync + wrong-surah flash).
    setAnchors([]);
    setIsLoading(true);
    const raw = await vaultStore.loadSplitsForSurah(surahId);
    if (gen !== loadGen.current) return;
    const surah = getSurah(surahId);
    const normalized = raw.map((a): AnkiAnchor | null => {
      const sv = Number(a?.startVerse); const ev = Number(a?.endVerse);
      if (!Number.isFinite(sv) || !Number.isFinite(ev)) return null;
      if (sv <= 0 || ev < sv) return null;
      if (surah && (ev > surah.verseCount || sv > surah.verseCount)) return null;
      return {
        id: typeof a?.id === 'string' && a.id.trim() ? a.id : `anchor-${surahId}-${sv}-${ev}`,
        surahId,
        startVerse: sv,
        endVerse: ev,
        label: typeof a?.label === 'string' && a.label.trim() ? a.label : `Verses ${sv}-${ev}`,
      };
    }).filter((a): a is AnkiAnchor => a !== null);
    const sanitized = sanitizeAnchors(surahId, normalized);
    const finalAnchors = sanitized.length ? sanitized : normalized;
    setAnchors(finalAnchors);
    setIsLoading(false);
  }, [vaultStore, surahId]);

  useEffect(() => { void load(); }, [load]);

  const saveAnchors = useCallback(async (next: AnkiAnchor[]) => {
    setAnchors(next);
    await vaultStore.saveSplitsForSurah(surahId, next);
  }, [vaultStore, surahId]);

  const addBreak = useCallback(async (breakVerse: number, verseCount: number) => {
    const currentBreaks = [...anchors].sort((a, b) => a.startVerse - b.startVerse).slice(0, -1).map(a => a.endVerse);
    if (currentBreaks.includes(breakVerse)) return;
    const nextBreaks = [...currentBreaks, breakVerse].sort((a, b) => a - b);
    const next = buildAnchorsFromBreaks(surahId, nextBreaks, verseCount);
    await saveAnchors(next.length ? next : []);
  }, [anchors, surahId, saveAnchors]);

  const removeBreak = useCallback(async (breakVerse: number, verseCount: number) => {
    const currentBreaks = [...anchors].sort((a, b) => a.startVerse - b.startVerse).slice(0, -1).map(a => a.endVerse);
    if (!currentBreaks.includes(breakVerse)) return;
    const nextBreaks = currentBreaks.filter(b => b !== breakVerse);
    const next = buildAnchorsFromBreaks(surahId, nextBreaks, verseCount);
    await saveAnchors(next.length ? next : []);
  }, [anchors, surahId, saveAnchors]);

  return { anchors, saveAnchors, addBreak, removeBreak, isLoading, reload: load };
}

// Vault-backed mindmaps (replaces src/lib/anki/mindmapStore.ts)
export function useVaultMindmap(vaultStore: VaultStore, key: string) {
  const [mindmap, setMindmap] = useState<VaultMindmap | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const data = await vaultStore.loadMindmap(key);
    if (data && typeof data === 'object') {
      setMindmap({ ...data, key, kind: data.kind || kindFromKey(key) });
    } else {
      setMindmap(null);
    }
    setIsLoading(false);
  }, [vaultStore, key]);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async (patch: Partial<VaultMindmap>) => {
    const next: VaultMindmap = {
      ...(mindmap ?? { key, kind: kindFromKey(key) }),
      ...patch,
      key,
      updatedAt: new Date().toISOString(),
    };
    setMindmap(next);
    await vaultStore.saveMindmap(key, next);
    return next;
  }, [vaultStore, key, mindmap]);

  const remove = useCallback(async () => {
    setMindmap(null);
    await vaultStore.deleteMindmap(key);
  }, [vaultStore, key]);

  // Subscribe to external sync changes: vault.on('modify') for this key
  // For hidden plugin folder, vault.on won't fire, so also poll via adapter
  useEffect(() => {
    const { vault } = vaultStore.app;
    const mindmapPath = VAULT_PATHS.mindmapFile(vaultStore.root, key);
    const ref = vault.on('modify', (file) => {
      if (file.path === mindmapPath) void load();
    });
    return () => vault.offref(ref);
  }, [vaultStore, key, load]);

  return { mindmap, save, remove, isLoading, reload: load };
}

export function useVaultMindmaps(vaultStore: VaultStore) {
  const [all, setAll] = useState<Record<string, VaultMindmap>>({});
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    const { vault } = vaultStore.app;
    const dirPath = VAULT_PATHS.mindmapsDir(vaultStore.root);
    let files: string[] = [];
    // Hidden folders are invisible to the vault API, so list them through the adapter first
    try {
      const listed = await vault.adapter.list(dirPath);
      files = listed.files;
    } catch { /* folder not created yet */ }
    if (files.length === 0) {
      const dir = vault.getAbstractFileByPath(dirPath);
      if (dir instanceof TFolder) {
        files = dir.children.filter((c): c is TFile => c instanceof TFile && c.extension === 'json').map(c => c.path);
      }
    }
    const out: Record<string, VaultMindmap> = {};
    for (const filePath of files) {
      const base = (filePath.split('/').pop() ?? '').replace(/\.json$/, '');
      if (!base) continue;
      const data = await vaultStore.loadMindmap(base);
      if (data) out[base] = { ...data, key: base, kind: data.kind || kindFromKey(base) };
    }
    setAll(out);
    setIsLoading(false);
  }, [vaultStore]);

  useEffect(() => { void reload(); }, [reload]);

  return { mindmaps: all, isLoading, reload };
}

// Anki export prefs (partOrder + surahOrder)
export function useVaultAnkiExportPrefs(vaultStore: VaultStore) {
  const [prefs, setPrefs] = useState<AnkiExportPrefs | null>(null);
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
  const save = useCallback(async (next: AnkiExportPrefs) => {
    setPrefs(next);
    await vaultStore.saveAnkiExportPrefs(next);
  }, [vaultStore]);
  const setPartOrder = useCallback(async (dir: SortDir) => {
    const cur = prefs ?? await vaultStore.loadAnkiExportPrefs();
    const updated: AnkiExportPrefs = { ...cur, partOrder: dir };
    setPrefs(updated);
    await vaultStore.saveAnkiExportPrefs(updated);
    return updated;
  }, [vaultStore, prefs]);
  const setSurahOrder = useCallback(async (dir: SortDir) => {
    const cur = prefs ?? await vaultStore.loadAnkiExportPrefs();
    const updated: AnkiExportPrefs = { ...cur, surahOrder: dir };
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
    const { vault } = vaultStore.app;
    const docPath = VAULT_PATHS.docFile(vaultStore.root, key);
    const ref = vault.on('modify', (file) => {
      if (file.path === docPath) void load();
    });
    return () => vault.offref(ref);
  }, [vaultStore, key, load]);

  return { content, save, isLoading, reload: load };
}
