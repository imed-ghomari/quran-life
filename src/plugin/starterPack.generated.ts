// GENERATED — do not edit by hand. Regenerate with: npm run starter-pack
// Built from starter-pack/ (0 items). Empty when the folder has no valid files.
export interface StarterPackEntry {
  key: string;
  kind: 'surah' | 'part' | 'meta' | 'cluster';
  surahId: number | null;
  mindmap: Record<string, unknown> | null;
  splits: Array<Record<string, unknown>>;
  doc: string | null;
}
export const STARTER_PACK: StarterPackEntry[] = [];
export const STARTER_PACK_META = { count: 0, builtAt: "2026-09-30T15:24:25.504Z" };
