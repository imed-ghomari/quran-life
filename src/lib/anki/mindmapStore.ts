'use client';

const LS_MINDMAPS_KEY = 'quran-life:anki:mindmaps:v1';

export type AnkiMindmap = {
  surahId?: number;
  partId?: number;
  kind: 'surah' | 'part' | 'meta' | 'cluster';
  key: string; // e.g. "surah-2", "part-3", "meta-0", "cluster-1"
  snapshot?: any;
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
    const raw = localStorage.getItem(LS_MINDMAPS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const out: Stored = {};
    Object.entries(parsed).forEach(([k, v]: any) => {
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
        const kind = (v?.kind as any) || (key.startsWith('part-') ? 'part' : key.startsWith('meta-') ? 'meta' : key.startsWith('cluster-') ? 'cluster' : 'surah');
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
  const existing = all[key] || { key, kind: (key.split('-')[0] as any) || 'surah' };
  const next = { ...existing, ...data, key, updatedAt: new Date().toISOString() };
  all[key] = next;
  try {
    localStorage.setItem(LS_MINDMAPS_KEY, JSON.stringify(all));
  } catch {}
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
  const all = loadAnkiMindmaps();
  delete all[makeKey('surah', surahId)];
  try { localStorage.setItem(LS_MINDMAPS_KEY, JSON.stringify(all)); } catch {}
  return all;
}

export function deleteAnkiMindmapByKey(key: string) {
  const all = loadAnkiMindmaps();
  delete all[key];
  try { localStorage.setItem(LS_MINDMAPS_KEY, JSON.stringify(all)); } catch {}
  return all;
}
