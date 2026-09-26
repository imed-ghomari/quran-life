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
    const raw = window.localStorage.getItem(LS_SPLITS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const out: SurahSplits = {};
    Object.entries(parsed).forEach(([k, arr]) => {
      const surahId = Number(k);
      if (!Number.isFinite(surahId)) return;
      if (!Array.isArray(arr)) return;
      const anchors = (arr as any[]).map(a => normalizeAnchor(surahId, a)).filter(Boolean) as AnkiAnchor[];
      const sanitized = sanitizeAnchors(surahId, anchors);
      if (sanitized.length) out[surahId] = sanitized;
      else if (anchors.length) out[surahId] = anchors; // fallback keep original if sanitize empties but original had data
    });
    return out;
  } catch {
    return {};
  }
}

export function saveSplits(splits: SurahSplits) {
  try {
    window.localStorage.setItem(LS_SPLITS_KEY, JSON.stringify(splits));
  } catch { /* best-effort only; ignore */ }
}

export function sanitizeAnchors(surahId: number, anchors: AnkiAnchor[]): AnkiAnchor[] {
  if (!anchors.length) return anchors;
  const surah = getSurah(surahId);
  const verseCount = surah?.verseCount;
  const sorted = [...anchors].sort((a, b) => a.startVerse - b.startVerse || a.endVerse - b.endVerse);
  const result: AnkiAnchor[] = [];
  let expected = 1;
  for (const a of sorted) {
    if (a.startVerse !== expected) continue;
    if (verseCount && a.endVerse > verseCount) continue;
    result.push({
      ...a,
      label: a.label || `Verses ${a.startVerse}-${a.endVerse}`,
    });
    expected = a.endVerse + 1;
    if (verseCount && expected > verseCount) break;
  }
  // If sanitize produced empty or partial coverage but original had valid chain starting at 1,
  // try to fallback to the longest valid chain that starts at 1 by scanning all sorted anchors
  // (already done). If still empty, return original sorted deduped sequential if possible.
  // For corrupted data with multiple overlapping coverings, this keeps the first covering.
  // If no anchor starts at 1, return empty (will be handled as no splits)
  if (result.length === 0) {
    // try to find any anchor starting at 1 as fallback
    const first = sorted.find(a => a.startVerse === 1);
    if (first) return [first];
  }
  return result;
}

export function buildAnchorsFromBreaks(surahId: number, breaks: number[], verseCount?: number): AnkiAnchor[] {
  const vc = verseCount ?? getSurah(surahId)?.verseCount ?? 0;
  if (!vc) return [];
  const uniq = Array.from(new Set(breaks)).filter(b => b > 0 && b < vc).sort((a, b) => a - b);
  const boundaries = [1, ...uniq.map(b => b + 1), vc + 1];
  const anchors: AnkiAnchor[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1] - 1;
    if (start > end || start < 1 || end > vc) continue;
    anchors.push({
      id: `anchor-${surahId}-${start}-${end}`,
      surahId,
      startVerse: start,
      endVerse: end,
      label: `Verses ${start}-${end}`,
    });
  }
  return anchors;
}

export function getSplitsForSurah(surahId: number, all: SurahSplits): AnkiAnchor[] {
  const raw = all[surahId] || [];
  return sanitizeAnchors(surahId, raw);
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
        const sanitized = sanitizeAnchors(surahId, normalized);
        if (sanitized.length) out[surahId] = sanitized;
        else if (normalized.length) out[surahId] = normalized;
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
          const sanitized = sanitizeAnchors(surahId, normalized);
          if (sanitized.length) out[surahId] = sanitized;
          else if (normalized.length) out[surahId] = normalized;
        });
      } else {
        Object.entries(source).forEach(([k, arr]) => {
          const surahId = Number(k);
          if (!Number.isFinite(surahId) || !Array.isArray(arr)) return;
          const normalized = (arr as any[]).map(a => normalizeAnchor(surahId, a)).filter(Boolean) as AnkiAnchor[];
          const sanitized = sanitizeAnchors(surahId, normalized);
          if (sanitized.length) out[surahId] = sanitized;
          else if (normalized.length) out[surahId] = normalized;
        });
      }
    }
  } catch { /* best-effort only; ignore */ }
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
