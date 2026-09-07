export type AnkiAnchor = {
  id: string;
  surahId: number;
  startVerse: number;
  endVerse: number;
  label: string;
};

export type AnkiCard = {
  id: string; // stable guid per surah-start-end
  surahId: number;
  surahName: string;
  arabicName: string;
  startVerse: number;
  endVerse: number;
  anchorId: string;
  anchorLabel: string;
  verseTexts: string[]; // per ayah text
  verseIds: number[]; // ayah numbers
  chunks: string[][]; // per verse chunks
  contextVerses: { ayahId: number; text: string }[];
  relatedGroups: string[]; // e.g. "2:23 ~ 11:45"
  tags: string[];
  mindmapDocs?: string; // docs for this mindmap, added to Anki field
  mindmapSnapshotKey?: string; // key for mindmap
  mindmapImage?: string; // <img> tag for rendered tldraw snapshot, filled at export
};

export type AnkiMindmapCard = {
  id: string; // stable guid per mindmap key
  key: string; // e.g. "surah-50", "part-1", "meta-0"
  kind: 'surah' | 'part' | 'meta';
  surahId?: number;
  partId?: number;
  title: string; // e.g. "Surah 50 - Qaf" or "Part 1"
  tags: string[];
  mindmapDocs?: string;
  mindmapImage?: string;
};

export type AnkiExportOptions = {
  deckName: string;
  includeContext: boolean;
  includeRelated: boolean;
  includeTags: boolean;
};

export const DEFAULT_ANKI_EXPORT_OPTIONS: AnkiExportOptions = {
  deckName: 'QuranLife::Review',
  includeContext: true,
  includeRelated: true,
  includeTags: true,
};
