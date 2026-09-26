import { SURAHS } from '@/lib/quranData';
import { getReviewVerseChunkDescriptors } from '@/lib/reviewVerseChunks';
import { surahAyahToAbsolute, getMutashabihatForAbsolute } from '@/lib/mutashabihat';
import { AnkiAnchor, AnkiCard } from './types';
import type { Verse } from '@/lib/types';

function absoluteToKey(absolute: number): string {
  let remaining = absolute;
  for (const s of SURAHS) {
    if (remaining <= s.verseCount) return `${s.id}:${remaining}`;
    remaining -= s.verseCount;
  }
  return '114:6';
}

const getSurah = (id: number) => SURAHS.find(s => s.id === id);

export function buildAnkiCards(
  anchors: AnkiAnchor[],
  verses: Verse[],
  options?: { includeRelated?: boolean; mindmapDocsMap?: Record<string, string> }
): AnkiCard[] {
  const includeRelated = options?.includeRelated ?? true;
  const mindmapDocsMap = options?.mindmapDocsMap || {};
  const verseMap = new Map<string, Verse>();
  verses.forEach(v => verseMap.set(`${v.surahId}:${v.ayahId}`, v));

  return anchors.map(anchor => {
    const surah = getSurah(anchor.surahId);
    const verseTexts: string[] = [];
    const verseIds: number[] = [];
    const chunks: string[][] = [];
    const relatedSet = new Set<string>();

    for (let ayah = anchor.startVerse; ayah <= anchor.endVerse; ayah++) {
      const verse = verseMap.get(`${anchor.surahId}:${ayah}`);
      const text = verse?.text || '';
      verseTexts.push(text);
      verseIds.push(ayah);
      const c = getReviewVerseChunkDescriptors(text).map(d => d.text);
      chunks.push(c.length ? c : [text]);

      if (includeRelated) {
        const abs = surahAyahToAbsolute(anchor.surahId, ayah);
        const sims = getMutashabihatForAbsolute(abs, []);
        sims.forEach(entry => {
          const allAbs = [...entry.sources, ...entry.matches];
          allAbs.forEach(a => {
            if (a !== abs) {
              const key = absoluteToKey(a);
              relatedSet.add(key);
            }
          });
        });
      }
    }

    // context: up to 5 verses before start
    const contextVerses: { ayahId: number; text: string }[] = [];
    for (let k = 1; k <= 5; k++) {
      const ayah = anchor.startVerse - k;
      if (ayah < 1) break;
      const v = verseMap.get(`${anchor.surahId}:${ayah}`);
      if (v) contextVerses.unshift({ ayahId: v.ayahId, text: v.text });
    }
    // keep only 2 normally, but we bake 5; template shows 2->5
    // relatedGroups formatting
    const relatedGroups = Array.from(relatedSet).slice(0, 8); // cap

    const tags: string[] = [];
    tags.push(`surah::${anchor.surahId}`);
    tags.push('verse-group');
    if (relatedGroups.length > 0) tags.push('mutashabihat');

    const guid = `ql-${anchor.surahId}-${anchor.startVerse}-${anchor.endVerse}`;
    const docsKey = `surah-${anchor.surahId}`;
    const mindmapDocs = mindmapDocsMap[docsKey] || '';

    return {
      id: guid,
      surahId: anchor.surahId,
      surahName: surah?.name || `Surah ${anchor.surahId}`,
      arabicName: surah?.arabicName || '',
      startVerse: anchor.startVerse,
      endVerse: anchor.endVerse,
      anchorId: anchor.id,
      anchorLabel: anchor.label,
      verseTexts,
      verseIds,
      chunks,
      contextVerses,
      relatedGroups,
      tags,
      mindmapDocs,
      mindmapSnapshotKey: docsKey,
      mindmapImage: '', // filled at export time from snapshot -> media
    };
  });
}

export function getVerseCountForSurah(surahId: number): number {
  return getSurah(surahId)?.verseCount || 0;
}

export function buildMindmapCards(
  mindmaps: Record<string, any>,
  mindmapDocsMap: Record<string, string> = {}
): import('./types').AnkiMindmapCard[] {
  const cards: import('./types').AnkiMindmapCard[] = [];
  for (const [key, val] of Object.entries(mindmaps)) {
    if (!val?.snapshot) continue;
    // Only include surah/part/meta that have a mindmap (snapshot)
    const kind = (val.kind as any) || (key.startsWith('surah-') ? 'surah' : key.startsWith('part-') ? 'part' : key.startsWith('meta-') ? 'meta' : 'surah');
    if (!['surah', 'part', 'meta'].includes(kind)) continue;

    let title = '';
    let surahId: number | undefined;
    let partId: number | undefined;
    const tags: string[] = ['mindmap'];

    if (kind === 'surah') {
      const sid = Number(val.surahId || key.replace('surah-', '')) || Number(key.replace('surah-', ''));
      surahId = sid;
      const surah = getSurah(sid);
      title = surah ? `${surah.arabicName} - Surah ${sid} (${surah.name})` : `Surah ${sid}`;
      tags.push(`surah::${sid}`, `mindmap::surah-${sid}`);
    } else if (kind === 'part') {
      const pid = Number(val.partId || key.replace('part-', '')) || 1;
      partId = pid;
      // Part ranges as in AnkiDeckTab (only 7 parts)
      const partLabels: Record<number, string> = {
        1: 'Part 1 - Surah 1-5',
        2: 'Part 2 - Surah 6-9',
        3: 'Part 3 - Surah 10-24',
        4: 'Part 4 - Surah 25-33',
        5: 'Part 5 - Surah 34-49',
        6: 'Part 6 - Surah 50-66',
        7: 'Part 7 - Surah 67-114',
      };
      title = partLabels[pid] || `Part ${pid}`;
      tags.push(`part::${pid}`, `mindmap::part-${pid}`);
    } else if (kind === 'meta') {
      title = 'Meta Overview - All Parts';
      tags.push('part::meta', 'mindmap::meta-0');
    }

    const docsKey = key;
    const mindmapDocs = mindmapDocsMap[docsKey] || '';

    cards.push({
      id: `ql-mindmap-${key}`,
      key,
      kind: kind as any,
      surahId,
      partId,
      title,
      tags,
      mindmapDocs,
      mindmapImage: '', // filled at export time
    });
  }
  return cards;
}
