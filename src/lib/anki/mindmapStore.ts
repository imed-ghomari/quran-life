'use client';

import { readStored, writeStored } from '@/lib/pluginStorage';

const LS_MINDMAPS_KEY = 'quran-life:anki:mindmaps:v1';

export type AnkiMindmap = {
  surahId?: number;
  partId?: number;
  kind: 'surah' | 'part' | 'meta' | 'cluster';
  key: string; // e.g. "surah-2", "part-3", "meta-0", "cluster-1"
  snapshot?: unknown;
  imageUrl?: string | null;
  imageUrlDark?: string | null;
  isComplete?: boolean;
  updatedAt?: string;
};

type Stored = Record<string, AnkiMindmap>;

function makeKey(kind: string, id: number): string {
  return `${kind}-${id}`;
}

export function loadAnkiMindmaps(): Stored {
  if (typeof window === 'undefined') return {};
  try {
    const raw = readStored(LS_MINDMAPS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const out: Stored = {};
    Object.entries(parsed as Record<string, Partial<AnkiMindmap>>).forEach(([k, v]) => {
      // Support old format where key was numeric surahId
      if (!isNaN(Number(k)) && v && !v.key) {
        const surahId = Number(k);
        const key = makeKey('surah', surahId);
        out[key] = {
          key,
          kind: 'surah',
          surahId,
          snapshot: v?.snapshot,
          imageUrl: v?.imageUrl || null,
          imageUrlDark: v?.imageUrlDark || null,
          isComplete: !!v?.isComplete,
          updatedAt: v?.updatedAt,
        };
      } else {
        const key = String(v?.key || k);
        const kind = v?.kind || (key.startsWith('part-') ? 'part' : key.startsWith('meta-') ? 'meta' : key.startsWith('cluster-') ? 'cluster' : 'surah');
        out[key] = {
          key,
          kind,
          surahId: v?.surahId,
          partId: v?.partId,
          snapshot: v?.snapshot,
          imageUrl: v?.imageUrl || null,
          imageUrlDark: v?.imageUrlDark || null,
          isComplete: !!v?.isComplete,
          updatedAt: v?.updatedAt,
        };
      }
    });
    return out;
  } catch {
    return {};
  }
}

export function saveAnkiMindmapByKey(key: string, data: Partial<AnkiMindmap>) {
  const all = loadAnkiMindmaps();
  const prefix = key.split('-')[0];
  const fallbackKind: AnkiMindmap['kind'] =
    prefix === 'part' || prefix === 'meta' || prefix === 'cluster' || prefix === 'surah' ? prefix : 'surah';
  const existing: AnkiMindmap = all[key] || { key, kind: fallbackKind };
  const next = { ...existing, ...data, key, updatedAt: new Date().toISOString() };
  all[key] = next;
  try {
    writeStored(LS_MINDMAPS_KEY, JSON.stringify(all));
  } catch { /* best-effort only; ignore */ }
  try { removeDeletedMindmapKey(key); } catch { /* best-effort only; ignore */ }
  return all;
}

export function saveAnkiMindmap(surahId: number, data: Partial<AnkiMindmap>) {
  const key = makeKey('surah', surahId);
  return saveAnkiMindmapByKey(key, { ...data, surahId, kind: 'surah', key });
}

export function saveAnkiPartMindmap(partId: number, kind: 'part' | 'meta' | 'cluster' = 'part', data: Partial<AnkiMindmap>) {
  const key = makeKey(kind, partId);
  return saveAnkiMindmapByKey(key, { ...data, partId, kind, key });
}


export function getAnkiMindmap(surahId: number): AnkiMindmap | undefined {
  return loadAnkiMindmaps()[makeKey('surah', surahId)];
}

export function getAnkiMindmapByKey(key: string): AnkiMindmap | undefined {
  return loadAnkiMindmaps()[key];
}

export function deleteAnkiMindmap(surahId: number) {
  const key = makeKey('surah', surahId);
  const all = loadAnkiMindmaps();
  delete all[key];
  try { writeStored(LS_MINDMAPS_KEY, JSON.stringify(all)); } catch { /* best-effort only; ignore */ }
  try { addDeletedMindmapKey(key); } catch { /* best-effort only; ignore */ }
  return all;
}

export function deleteAnkiMindmapByKey(key: string) {
  const all = loadAnkiMindmaps();
  delete all[key];
  try { writeStored(LS_MINDMAPS_KEY, JSON.stringify(all)); } catch { /* best-effort only; ignore */ }
  try { addDeletedMindmapKey(key); } catch { /* best-effort only; ignore */ }
  return all;
}

const LS_DELETED_KEY = 'quran-life:anki:deletedMindmaps:v1';export function loadDeletedMindmapKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = readStored(LS_DELETED_KEY);
    if (!raw) return new Set();
    const arr: unknown = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch { return new Set(); }
}
export function addDeletedMindmapKey(key: string) {
  const s = loadDeletedMindmapKeys();
  s.add(key);
  try { writeStored(LS_DELETED_KEY, JSON.stringify([...s])); } catch { /* best-effort only; ignore */ }
}
export function removeDeletedMindmapKey(key: string) {
  const s = loadDeletedMindmapKeys();
  s.delete(key);
  try { writeStored(LS_DELETED_KEY, JSON.stringify([...s])); } catch { /* best-effort only; ignore */ }
}
