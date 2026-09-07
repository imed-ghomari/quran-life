import { SURAHS } from '@/lib/quranData';
import { getReviewVerseChunkDescriptors } from '@/lib/reviewVerseChunks';
import { surahAyahToAbsolute, getMutashabihatForAbsolute } from '@/lib/mutashabihat';

function absoluteToKey(absolute: number): string {
  let remaining = absolute;
  for (const s of SURAHS) {
    if (remaining <= s.verseCount) return `${s.id}:${remaining}`;
    remaining -= s.verseCount;
  }
  return '114:6';
}
import { AnkiAnchor, AnkiCard } from './types';
import type { Verse } from '@/lib/types';

const getSurah = (id: number) => SURAHS.find(s => s.id === id);

export function buildAnkiCards(
  anchors: AnkiAnchor[],
  verses: Verse[],
  options?: { includeRelated?: boolean }
): AnkiCard[] {
  const includeRelated = options?.includeRelated ?? true;
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
    tags.push(`range::${anchor.startVerse}-${anchor.endVerse}`);
    if (relatedGroups.length > 0) tags.push('mutashabihat');

    const guid = `ql-${anchor.surahId}-${anchor.startVerse}-${anchor.endVerse}`;

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
    };
  });
}

export function getVerseCountForSurah(surahId: number): number {
  return getSurah(surahId)?.verseCount || 0;
}
