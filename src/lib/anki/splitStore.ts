'use client';

import { AnkiAnchor } from './types';
import { getSurah } from '@/lib/quranData';
import { readStored, writeStored } from '@/lib/pluginStorage';

const LS_SPLITS_KEY = 'quran-life:anki:splits:v1';

export type SurahSplits = Record<number, AnkiAnchor[]>; // key surahId

/** Narrow an unknown JSON value to a traversable record. */
const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

function normalizeAnchor(surahId: number, a: unknown): AnkiAnchor | null {
  const rec = asRecord(a);
  const startVerse = Number(rec.startVerse);
  const endVerse = Number(rec.endVerse);
  if (!Number.isFinite(startVerse) || !Number.isFinite(endVerse)) return null;
  if (startVerse <= 0 || endVerse < startVerse) return null;
  const surah = getSurah(surahId);
  if (surah && (endVerse > surah.verseCount || startVerse > surah.verseCount)) return null;
  return {
    id: typeof rec.id === 'string' && rec.id.trim() ? rec.id : `anchor-${surahId}-${startVerse}-${endVerse}`,
    surahId,
    startVerse,
    endVerse,
    label: typeof rec.label === 'string' && rec.label.trim() ? rec.label : `Verses ${startVerse}-${endVerse}`,
  };
}

export function loadSplits(): SurahSplits {
  if (typeof window === 'undefined') return {};
  try {
    const raw = readStored(LS_SPLITS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const out: SurahSplits = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([k, arr]) => {
      const surahId = Number(k);
      if (!Number.isFinite(surahId)) return;
      if (!Array.isArray(arr)) return;
      const anchors = arr.map((a: unknown) => normalizeAnchor(surahId, a)).filter(Boolean) as AnkiAnchor[];
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
    writeStored(LS_SPLITS_KEY, JSON.stringify(splits));
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

export function importSplitsFromBackup(json: unknown): SurahSplits {
  const out: SurahSplits = {};
  // Try to parse mindmaps style: [{ surahId, anchors }] or object
  try {
    if (Array.isArray(json)) {
      const list: unknown[] = json;
      list.forEach((entry: unknown) => {
        const rec = asRecord(entry);
        const surahId = Number(rec.surahId ?? rec.surah_id);
        const anchors: unknown = rec.anchors;
        if (!Number.isFinite(surahId) || !Array.isArray(anchors)) return;
        const normalized = anchors.map((a: unknown) => normalizeAnchor(surahId, a)).filter(Boolean) as AnkiAnchor[];
        const sanitized = sanitizeAnchors(surahId, normalized);
        if (sanitized.length) out[surahId] = sanitized;
        else if (normalized.length) out[surahId] = normalized;
      });
    } else if (json && typeof json === 'object') {
      // { "5": [{startVerse,endVerse,label}], ... } or { mindmaps: [...] }
      const rec = asRecord(json);
      const source: unknown = rec.mindmaps || rec.splits || json;
      if (Array.isArray(source)) {
        const list: unknown[] = source;
        list.forEach((entry: unknown) => {
          const entryRec = asRecord(entry);
          const surahId = Number(entryRec.surahId);
          const anchors: unknown = entryRec.anchors;
          if (!Number.isFinite(surahId) || !Array.isArray(anchors)) return;
          const normalized = anchors.map((a: unknown) => normalizeAnchor(surahId, a)).filter(Boolean) as AnkiAnchor[];
          const sanitized = sanitizeAnchors(surahId, normalized);
          if (sanitized.length) out[surahId] = sanitized;
          else if (normalized.length) out[surahId] = normalized;
        });
      } else {
        const sourceRec = asRecord(source);
        Object.entries(sourceRec).forEach(([k, arr]) => {
          const surahId = Number(k);
          if (!Number.isFinite(surahId) || !Array.isArray(arr)) return;
          const normalized = arr.map((a: unknown) => normalizeAnchor(surahId, a)).filter(Boolean) as AnkiAnchor[];
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
