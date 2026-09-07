'use client';

const LS_MINDMAPS_KEY = 'quran-life:anki:mindmaps:v1';

export type AnkiMindmap = {
  surahId: number;
  snapshot?: any;
  imageUrl?: string | null;
  imageUrlDark?: string | null;
  isComplete?: boolean;
  updatedAt?: string;
};

type Stored = Record<number, AnkiMindmap>;

export function loadAnkiMindmaps(): Stored {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LS_MINDMAPS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const out: Stored = {};
    Object.entries(parsed).forEach(([k, v]: any) => {
      const surahId = Number(k);
      if (!Number.isFinite(surahId)) return;
      out[surahId] = {
        surahId,
        snapshot: v?.snapshot,
        imageUrl: v?.imageUrl || null,
        imageUrlDark: v?.imageUrlDark || null,
        isComplete: !!v?.isComplete,
        updatedAt: v?.updatedAt,
      };
    });
    return out;
  } catch {
    return {};
  }
}

export function saveAnkiMindmap(surahId: number, data: Partial<AnkiMindmap>) {
  const all = loadAnkiMindmaps();
  const existing = all[surahId] || { surahId };
  const next = { ...existing, ...data, surahId, updatedAt: new Date().toISOString() };
  all[surahId] = next;
  try {
    localStorage.setItem(LS_MINDMAPS_KEY, JSON.stringify(all));
  } catch {}
  return all;
}

export function getAnkiMindmap(surahId: number): AnkiMindmap | undefined {
  return loadAnkiMindmaps()[surahId];
}

export function deleteAnkiMindmap(surahId: number) {
  const all = loadAnkiMindmaps();
  delete all[surahId];
  try { localStorage.setItem(LS_MINDMAPS_KEY, JSON.stringify(all)); } catch {}
  return all;
}
