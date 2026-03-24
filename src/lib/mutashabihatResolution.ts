import { absoluteToSurahAyah } from '@/lib/mutashabihat';
import { MutashabihatDecision } from '@/lib/types';

type DecisionLike = Partial<Pick<MutashabihatDecision, 'phraseId' | 'status' | 'confirmedAt'>> | null | undefined;
type SimilarityLike = {
    phraseId: string;
    sources?: number[];
    matches?: number[];
};

type DecisionCollection = Record<string, DecisionLike> | DecisionLike[] | Map<string, DecisionLike>;

const getDecisionByKey = (decisions: DecisionCollection, key: string): DecisionLike => {
    if (decisions instanceof Map) {
        return decisions.get(key);
    }
    if (Array.isArray(decisions)) {
        return decisions.find((decision) => decision?.phraseId === key);
    }
    return decisions[key];
};

export const buildMutashabihatDecisionKey = (absolute: number, phraseId: string) =>
    `${absolute}-${phraseId}`;

export const isMutashabihatDecisionResolved = (decision: DecisionLike) =>
    !!decision && (decision.status === 'ignored' || !!decision.confirmedAt);

export const hasMutashabihatDecisionStatusSelected = (decision: DecisionLike) =>
    !!decision && typeof decision.status === 'string' && decision.status !== 'pending';

export const getSimilarityCandidateAbsolutes = (
    absolute: number,
    entry: Pick<SimilarityLike, 'sources' | 'matches'>,
    options?: { sameSurahOnly?: boolean }
) => {
    const sameSurahOnly = options?.sameSurahOnly ?? false;
    const currentSurahId = absoluteToSurahAyah(absolute).surahId;

    return Array.from(new Set<number>([
        absolute,
        ...(Array.isArray(entry.sources) ? entry.sources : []),
        ...(Array.isArray(entry.matches) ? entry.matches : []),
    ])).filter((absRef) => {
        if (!sameSurahOnly) return true;
        return absoluteToSurahAyah(absRef).surahId === currentSurahId;
    });
};

export const getMatchingMutashabihatDecision = (
    decisions: DecisionCollection,
    absolute: number,
    entry: Pick<SimilarityLike, 'phraseId' | 'sources' | 'matches'>,
    predicate?: (decision: DecisionLike) => boolean,
    options?: { sameSurahOnly?: boolean }
) => {
    const candidateAbsolutes = getSimilarityCandidateAbsolutes(absolute, entry, options);

    for (const candidateAbsolute of candidateAbsolutes) {
        const decision = getDecisionByKey(decisions, buildMutashabihatDecisionKey(candidateAbsolute, entry.phraseId));
        if (!decision) continue;
        if (!predicate || predicate(decision)) {
            return {
                absolute: candidateAbsolute,
                decision,
            };
        }
    }

    return null;
};

export const isSimilarityEntryResolved = (
    decisions: DecisionCollection,
    absolute: number,
    entry: Pick<SimilarityLike, 'phraseId' | 'sources' | 'matches'>,
    options?: { sameSurahOnly?: boolean }
) =>
    !!getMatchingMutashabihatDecision(
        decisions,
        absolute,
        entry,
        isMutashabihatDecisionResolved,
        options
    );

export const hasSimilarityEntrySelectedStatus = (
    decisions: DecisionCollection,
    absolute: number,
    entry: Pick<SimilarityLike, 'phraseId' | 'sources' | 'matches'>,
    options?: { sameSurahOnly?: boolean }
) =>
    !!getMatchingMutashabihatDecision(
        decisions,
        absolute,
        entry,
        hasMutashabihatDecisionStatusSelected,
        options
    );

export const getSimilarityEntryResolutionMeta = (
    decisions: DecisionCollection,
    absolute: number,
    entry: Pick<SimilarityLike, 'phraseId' | 'sources' | 'matches'>,
    options?: { sameSurahOnly?: boolean }
) => {
    const match = getMatchingMutashabihatDecision(
        decisions,
        absolute,
        entry,
        isMutashabihatDecisionResolved,
        options
    );

    return {
        resolved: !!match,
        ignored: match?.decision?.status === 'ignored',
        decision: match?.decision,
        absolute: match?.absolute ?? null,
    };
};
