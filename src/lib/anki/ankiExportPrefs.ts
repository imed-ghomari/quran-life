'use client';

export type SortDir = 'asc' | 'desc';

export interface AnkiExportPrefs {
  /** Order of parts in new-card `due`. `desc` = 7→1 (last part first, previous default), `asc` = 1→7. */
  partOrder: SortDir;
  /** Order of surahs within each part. `asc` = first surah → last (e.g. Part 7: 67→114), `desc` = last → first (114→67). */
  surahOrder: SortDir;
}

export const DEFAULT_ANKI_EXPORT_PREFS: AnkiExportPrefs = {
  partOrder: 'desc',  // keep previous behavior: last part first (7→1) then 7's surahs, then 6...
  surahOrder: 'asc',  // within each part: first surah → last
};

function parseDir(v: unknown, fallback: SortDir): SortDir {
  if (v === 'asc' || v === 'desc') return v;
  if (typeof v === 'string') {
    const low = v.toLowerCase().trim();
    if (low === 'asc' || low === 'ascending' || low === 'first') return 'asc';
    if (low === 'desc' || low === 'descending' || low === 'last') return 'desc';
  }
  return fallback;
}

export function normalizeAnkiExportPrefs(raw: unknown): AnkiExportPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_ANKI_EXPORT_PREFS };
  const record = raw as Record<string, unknown>;
  // New shape: { partOrder, surahOrder }
  if ('partOrder' in record || 'surahOrder' in record) {
    return {
      partOrder: parseDir(record.partOrder, DEFAULT_ANKI_EXPORT_PREFS.partOrder),
      surahOrder: parseDir(record.surahOrder, DEFAULT_ANKI_EXPORT_PREFS.surahOrder),
    };
  }
  // Legacy per-part shape: { partSurahOrder: {1:'asc',...} } or { partSort } — migrate to global surahOrder
  const legacy = record.partSurahOrder ?? record.partSort ?? record;
  if (legacy && typeof legacy === 'object') {
    // If legacy had per-part dirs, use majority or any desc → global desc, else asc
    let anyDesc = false;
    let anyAsc = false;
    for (const v of Object.values(legacy as Record<string, unknown>)) {
      if (v === 'desc') anyDesc = true;
      if (v === 'asc') anyAsc = true;
    }
    // Prefer desc if any part was set to desc (preserves user's intent to reverse somewhere)
    const inferredSurahOrder: SortDir = anyDesc ? 'desc' : anyAsc ? 'asc' : 'asc';
    // Legacy had no partOrder, keep default desc for parts
    return { partOrder: DEFAULT_ANKI_EXPORT_PREFS.partOrder, surahOrder: inferredSurahOrder };
  }
  return { ...DEFAULT_ANKI_EXPORT_PREFS };
}
