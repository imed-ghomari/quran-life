import { Verse } from '@/lib/types';

const CONTEXTUAL_BREAK_SUFFIXES = ['ۘ', 'ۙ', 'ۚ', 'ۖ', 'ۗ', 'ۛ', 'ۜ', '۝'] as const;
const CONTEXTUAL_BREAK_TOKENS = new Set<string>([
    ...CONTEXTUAL_BREAK_SUFFIXES,
    'ج',
    'قلى',
    'صلى',
    'م',
    'لا',
]);
const MAX_REVEAL_WORDS = 10;

type ReviewChunkToken = {
    text: string;
    wordIndex: number;
};

export type ReviewChunkWordRange = [number, number];

export type ReviewVerseChunkDescriptor = {
    chunkIndex: number;
    text: string;
    wordRange: ReviewChunkWordRange;
};

function splitLongSegment(tokens: ReviewChunkToken[], maxWords: number): ReviewChunkToken[][] {
    if (tokens.length <= maxWords) return [tokens];

    const midpoint = Math.ceil(tokens.length / 2);
    return [
        ...splitLongSegment(tokens.slice(0, midpoint), maxWords),
        ...splitLongSegment(tokens.slice(midpoint), maxWords),
    ];
}

function tokenizeVerseForReviewChunks(text: string | undefined | null): ReviewChunkToken[] {
    const normalized = typeof text === 'string' ? text.trim() : '';
    if (!normalized) return [];

    const rawTokens = normalized.split(/\s+/).filter(Boolean);
    const tokens: ReviewChunkToken[] = [];
    let wordIndex = 1;

    for (const rawToken of rawTokens) {
        if (tokens.length > 0 && CONTEXTUAL_BREAK_TOKENS.has(rawToken)) {
            tokens[tokens.length - 1] = {
                ...tokens[tokens.length - 1],
                text: `${tokens[tokens.length - 1].text}${rawToken}`,
            };
            continue;
        }

        tokens.push({ text: rawToken, wordIndex });
        wordIndex += 1;
    }

    return tokens;
}

export function getReviewVerseChunkDescriptors(text: string | undefined | null): ReviewVerseChunkDescriptor[] {
    const tokens = tokenizeVerseForReviewChunks(text);
    if (tokens.length === 0) return [];

    const primarySegments: ReviewChunkToken[][] = [];
    let currentSegment: ReviewChunkToken[] = [];

    for (const token of tokens) {
        currentSegment.push(token);

        if (CONTEXTUAL_BREAK_SUFFIXES.some((mark) => token.text.endsWith(mark))) {
            primarySegments.push(currentSegment);
            currentSegment = [];
        }
    }

    if (currentSegment.length > 0) {
        primarySegments.push(currentSegment);
    }

    return primarySegments
        .flatMap((segment) => splitLongSegment(segment, MAX_REVEAL_WORDS))
        .map((segment, chunkIndex) => {
            const startWord = segment[0]?.wordIndex;
            const endWord = segment[segment.length - 1]?.wordIndex;
            if (!Number.isFinite(startWord) || !Number.isFinite(endWord)) return null;
            return {
                chunkIndex,
                text: segment.map((token) => token.text).join(' '),
                wordRange: [startWord, endWord] as ReviewChunkWordRange,
            };
        })
        .filter((segment): segment is ReviewVerseChunkDescriptor => !!segment && !!segment.text);
}

export function splitVerseIntoReviewChunks(text: string | undefined | null): string[] {
    return getReviewVerseChunkDescriptors(text).map((segment) => segment.text);
}

export function getReviewChunkWordRange(
    text: string | undefined | null,
    chunkIndex: number | null | undefined
): ReviewChunkWordRange | null {
    if (!Number.isFinite(Number(chunkIndex))) return null;
    const descriptors = getReviewVerseChunkDescriptors(text);
    return descriptors.find((descriptor) => descriptor.chunkIndex === Number(chunkIndex))?.wordRange ?? null;
}

export function doWordRangesOverlap(
    left: ReviewChunkWordRange | null | undefined,
    right: ReviewChunkWordRange | null | undefined
): boolean {
    if (!left || !right) return false;
    const [leftStart, leftEnd] = left;
    const [rightStart, rightEnd] = right;
    if (![leftStart, leftEnd, rightStart, rightEnd].every((value) => Number.isFinite(value))) {
        return false;
    }
    return Math.max(leftStart, rightStart) <= Math.min(leftEnd, rightEnd);
}

type VerseReviewFailureContextInput = {
    verses: Array<Pick<Verse, 'ayahId' | 'text'>>;
    currentVerseInReview: number;
    revealedChunks: number;
};

export type VerseReviewFailureContext = {
    ayahId: number | null;
    verseIndex: number;
    chunkIndex: number | null;
    chunkCount: number;
    chunkText: string | null;
    chunkWordRange: ReviewChunkWordRange | null;
};

export function resolveVerseReviewFailureContext({
    verses,
    currentVerseInReview,
    revealedChunks,
}: VerseReviewFailureContextInput): VerseReviewFailureContext {
    if (!Array.isArray(verses) || verses.length === 0) {
        return {
            ayahId: null,
            verseIndex: -1,
            chunkIndex: null,
            chunkCount: 0,
            chunkText: null,
            chunkWordRange: null,
        };
    }

    const safeCurrentVerseIndex = Math.max(0, Math.min(currentVerseInReview, verses.length - 1));
    const isAtBeginningOfUnrevealedVerse = revealedChunks === 0;
    const targetVerseIndex =
        isAtBeginningOfUnrevealedVerse && safeCurrentVerseIndex > 0
            ? safeCurrentVerseIndex - 1
            : safeCurrentVerseIndex;
    const targetVerse = verses[targetVerseIndex] || verses[safeCurrentVerseIndex];
    const chunks = getReviewVerseChunkDescriptors(targetVerse?.text ?? '');

    if (chunks.length === 0) {
        return {
            ayahId: Number(targetVerse?.ayahId) || null,
            verseIndex: targetVerseIndex,
            chunkIndex: null,
            chunkCount: 0,
            chunkText: typeof targetVerse?.text === 'string' ? targetVerse.text : null,
            chunkWordRange: null,
        };
    }

    const chunkIndex = targetVerseIndex !== safeCurrentVerseIndex
        ? chunks.length - 1
        : revealedChunks > 0
            ? Math.min(chunks.length - 1, Math.max(0, revealedChunks - 1))
            : 0;

    return {
        ayahId: Number(targetVerse?.ayahId) || null,
        verseIndex: targetVerseIndex,
        chunkIndex,
        chunkCount: chunks.length,
        chunkText: chunks[chunkIndex]?.text || null,
        chunkWordRange: chunks[chunkIndex]?.wordRange || null,
    };
}
