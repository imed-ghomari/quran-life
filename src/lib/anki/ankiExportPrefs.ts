'use client';

export type SortDir = 'asc' | 'desc';

export const CORE_PART_IDS = [1, 2, 3, 4, 5, 6, 7] as const;
export type CorePartId = typeof CORE_PART_IDS[number];

export interface AnkiExportPrefs {
  /** Per-part surah order for Anki new-card `due`. Also controls verse-group order within that part when desired. */
  partSurahOrder: Record<number, SortDir>;
}

export const DEFAULT_ANKI_EXPORT_PREFS: AnkiExportPrefs = {
  partSurahOrder: { 1: 'asc', 2: 'asc', 3: 'asc', 4: 'asc', 5: 'asc', 6: 'asc', 7: 'asc' },
};

export function normalizeAnkiExportPrefs(raw: any): AnkiExportPrefs {
  const out: Record<number, SortDir> = { ...DEFAULT_ANKI_EXPORT_PREFS.partSurahOrder } as Record<number, SortDir>;
  const src = raw && typeof raw === 'object' ? (raw.partSurahOrder ?? raw.partSort ?? raw) : null;
  if (src && typeof src === 'object') {
    for (const pid of CORE_PART_IDS) {
      const v = (src as any)[String(pid)] ?? (src as any)[pid];
      if (v === 'asc' || v === 'desc') out[pid] = v;
      else if (typeof v === 'string') {
        const low = v.toLowerCase().trim();
        if (low === 'asc' || low === 'ascending' || low === '1' || low === 'first') out[pid] = 'asc';
        else if (low === 'desc' || low === 'descending' || low === '-1' || low === 'last') out[pid] = 'desc';
      }
    }
  }
  return { partSurahOrder: out };
}

export function getPartSortDir(prefs: AnkiExportPrefs | undefined | null, partId: number): SortDir {
  if (!prefs || !prefs.partSurahOrder) return 'asc';
  const v = (prefs.partSurahOrder as any)[partId] ?? (prefs.partSurahOrder as any)[String(partId)];
  return v === 'desc' ? 'desc' : 'asc';
}

// LocalStorage fallback for web / tests (mirrors vault file)
const LS_KEY = 'quran-life:anki:export-sort:v1';

export function loadAnkiExportPrefsLocal(): AnkiExportPrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_ANKI_EXPORT_PREFS, partSurahOrder: { ...DEFAULT_ANKI_EXPORT_PREFS.partSurahOrder } };
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_ANKI_EXPORT_PREFS, partSurahOrder: { ...DEFAULT_ANKI_EXPORT_PREFS.partSurahOrder } };
    return normalizeAnkiExportPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_ANKI_EXPORT_PREFS, partSurahOrder: { ...DEFAULT_ANKI_EXPORT_PREFS.partSurahOrder } };
  }
}

export function saveAnkiExportPrefsLocal(prefs: AnkiExportPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(normalizeAnkiExportPrefs(prefs)));
  } catch {}
}
