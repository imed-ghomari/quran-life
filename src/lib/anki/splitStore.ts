'use client';

import { AnkiAnchor } from './types';
import { getSurah } from '@/lib/quranData';

const LS_SPLITS_KEY = 'quran-life:anki:splits:v1';

export type SurahSplits = Record<number, AnkiAnchor[]>; // key surahId

function normalizeAnchor(surahId: number, a: any): AnkiAnchor | null {
  const startVerse = Number(a?.startVerse);
  const endVerse = Number(a?.endVerse);
  if (!Number.isFinite(startVerse) || !Number.isFinite(endVerse)) return null;
  if (startVerse <= 0 || endVerse < startVerse) return null;
  const surah = getSurah(surahId);
  if (surah && (endVerse > surah.verseCount || startVerse > surah.verseCount)) return null;
  return {
    id: typeof a?.id === 'string' && a.id.trim() ? a.id : `anchor-${surahId}-${startVerse}-${endVerse}`,
    surahId,
    startVerse,
    endVerse,
    label: typeof a?.label === 'string' && a.label.trim() ? a.label : `Verses ${startVerse}-${endVerse}`,
  };
}

export function loadSplits(): SurahSplits {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LS_SPLITS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const out: SurahSplits = {};
    Object.entries(parsed).forEach(([k, arr]) => {
      const surahId = Number(k);
      if (!Number.isFinite(surahId)) return;
      if (!Array.isArray(arr)) return;
      const anchors = (arr as any[]).map(a => normalizeAnchor(surahId, a)).filter(Boolean) as AnkiAnchor[];
      if (anchors.length) out[surahId] = anchors;
    });
    return out;
  } catch {
    return {};
  }
}

export function saveSplits(splits: SurahSplits) {
  try {
    localStorage.setItem(LS_SPLITS_KEY, JSON.stringify(splits));
  } catch {}
}

export function getSplitsForSurah(surahId: number, all: SurahSplits): AnkiAnchor[] {
  return all[surahId] || [];
}

export function setSplitsForSurah(surahId: number, anchors: AnkiAnchor[], all: SurahSplits): SurahSplits {
  const next = { ...all };
  if (anchors.length === 0) delete next[surahId];
  else next[surahId] = anchors;
  saveSplits(next);
  return next;
}

export function importSplitsFromBackup(json: any): SurahSplits {
  const out: SurahSplits = {};
  // Try to parse mindmaps style: [{ surahId, anchors }] or object
  try {
    if (Array.isArray(json)) {
      json.forEach((entry: any) => {
        const surahId = Number(entry?.surahId ?? entry?.surah_id);
        const anchors = entry?.anchors;
        if (!Number.isFinite(surahId) || !Array.isArray(anchors)) return;
        const normalized = anchors.map((a: any) => normalizeAnchor(surahId, a)).filter(Boolean) as AnkiAnchor[];
        if (normalized.length) out[surahId] = normalized;
      });
    } else if (json && typeof json === 'object') {
      // { "5": [{startVerse,endVerse,label}], ... } or { mindmaps: [...] }
      const source = json.mindmaps || json.splits || json;
      if (Array.isArray(source)) {
        source.forEach((entry: any) => {
          const surahId = Number(entry?.surahId);
          const anchors = entry?.anchors;
          if (!Number.isFinite(surahId) || !Array.isArray(anchors)) return;
          const normalized = anchors.map((a: any) => normalizeAnchor(surahId, a)).filter(Boolean) as AnkiAnchor[];
          if (normalized.length) out[surahId] = normalized;
        });
      } else {
        Object.entries(source).forEach(([k, arr]) => {
          const surahId = Number(k);
          if (!Number.isFinite(surahId) || !Array.isArray(arr)) return;
          const normalized = (arr as any[]).map(a => normalizeAnchor(surahId, a)).filter(Boolean) as AnkiAnchor[];
          if (normalized.length) out[surahId] = normalized;
        });
      }
    }
  } catch {}
  return out;
}

// Default: for surahs <=10 verses, single anchor; else need creation
export function ensureDefaultSplits(surahId: number): AnkiAnchor[] {
  const surah = getSurah(surahId);
  if (!surah) return [];
  if (surah.verseCount <= 10) {
    return [{ id: `auto-anchor-${surahId}-1-${surah.verseCount}`, surahId, startVerse: 1, endVerse: surah.verseCount, label: `Verses 1-${surah.verseCount}` }];
  }
  return [];
}
