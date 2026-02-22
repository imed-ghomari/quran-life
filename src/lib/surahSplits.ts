import { Anchor, MindMap } from '@/lib/types';
import { getSurah } from '@/lib/quranData';

export const SHORT_SURAH_MAX_VERSES = 10;

const normalizeAnchor = (surahId: number, anchor: any): Anchor | null => {
    const startVerse = Number(anchor?.startVerse);
    const endVerse = Number(anchor?.endVerse);
    if (!Number.isFinite(startVerse) || !Number.isFinite(endVerse)) return null;
    if (startVerse <= 0 || endVerse <= 0 || endVerse < startVerse) return null;

    const fallbackId = `anchor-${surahId}-${startVerse}-${endVerse}`;
    const fallbackLabel = `Verses ${startVerse}-${endVerse}`;

    return {
        id: typeof anchor?.id === 'string' && anchor.id.trim().length > 0 ? anchor.id : fallbackId,
        surahId,
        startVerse,
        endVerse,
        label: typeof anchor?.label === 'string' && anchor.label.trim().length > 0 ? anchor.label : fallbackLabel,
    };
};

export const isShortSurahAutoSplitEligible = (surahId: number) => {
    const surah = getSurah(surahId);
    return !!surah && surah.verseCount <= SHORT_SURAH_MAX_VERSES;
};

export const getEffectiveSurahAnchors = (surahId: number, mindmap?: Partial<MindMap> | null): Anchor[] => {
    const explicitAnchors = (Array.isArray(mindmap?.anchors) ? mindmap!.anchors : [])
        .map((anchor) => normalizeAnchor(surahId, anchor))
        .filter((anchor): anchor is Anchor => !!anchor);

    if (explicitAnchors.length > 0) return explicitAnchors;

    const surah = getSurah(surahId);
    if (!surah || surah.verseCount > SHORT_SURAH_MAX_VERSES) return [];

    return [{
        id: `auto-anchor-${surahId}-1-${surah.verseCount}`,
        surahId,
        startVerse: 1,
        endVerse: surah.verseCount,
        label: `Verses 1-${surah.verseCount}`,
    }];
};
