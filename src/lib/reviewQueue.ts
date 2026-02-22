import { AppSettings, MemoryNode, MindMap } from '@/lib/types';
import { getEffectiveSurahAnchors } from '@/lib/surahSplits';

const toPositiveInt = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const toNonNegativeInt = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export const resolveReviewNodeSurahId = (node: Partial<MemoryNode>): number | null => {
    const direct = toPositiveInt((node as any).surahId);
    if (direct) return direct;
    const target = String((node as any).targetId || '');
    const anchorMatch = target.match(/^anchor-(\d+)-\d+-\d+$/);
    if (anchorMatch) return toPositiveInt(anchorMatch[1]);
    const mindmapMatch = target.match(/^mindmap-(\d+)$/);
    if (mindmapMatch) return toPositiveInt(mindmapMatch[1]);
    return null;
};

export const resolveReviewNodePartId = (node: Partial<MemoryNode>): number | null => {
    const direct = toNonNegativeInt((node as any).partId);
    if (direct !== null) return direct;
    const target = String((node as any).targetId || '');
    const partMatch = target.match(/^part-mindmap-(\d+)$/);
    if (!partMatch) return null;
    return toNonNegativeInt(partMatch[1]);
};

const hasAnchorForNode = (node: MemoryNode, mindmaps: MindMap[]) => {
    if (node.type !== 'verse_segment') return true;
    const surahId = resolveReviewNodeSurahId(node);
    if (!surahId) return true;
    const mm = mindmaps.find(m => Number((m as any).surahId) === surahId);
    const anchors = getEffectiveSurahAnchors(surahId, mm);
    if (anchors.length === 0) return false;
    return anchors.some(a => Number(a.startVerse) === Number(node.startVerse) && Number(a.endVerse) === Number(node.endVerse));
};

const getMindmapFreshnessScore = (mindmap: MindMap) => {
    const updatedAt = Date.parse(String((mindmap as any)?.updatedAt || ''));
    if (Number.isFinite(updatedAt)) return updatedAt;
    const createdAt = Date.parse(String((mindmap as any)?.createdAt || ''));
    if (Number.isFinite(createdAt)) return createdAt;
    return 0;
};

const canonicalizeMindmaps = (mindmaps: MindMap[]) => {
    const bySurah = new Map<number, MindMap>();
    for (const mm of mindmaps) {
        const surahId = Number((mm as any)?.surahId);
        if (!Number.isFinite(surahId) || surahId <= 0) continue;
        const existing = bySurah.get(surahId);
        if (!existing) {
            bySurah.set(surahId, mm);
            continue;
        }
        const nextScore = getMindmapFreshnessScore(mm);
        const existingScore = getMindmapFreshnessScore(existing);
        if (nextScore > existingScore) {
            bySurah.set(surahId, mm);
            continue;
        }
        if (nextScore === existingScore && String((mm as any)?.id || '') > String((existing as any)?.id || '')) {
            bySurah.set(surahId, mm);
        }
    }
    return Array.from(bySurah.values());
};

const toPositiveIntLoose = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const toOptionalString = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const getFallbackAnchorId = (startVerse: unknown, endVerse: unknown): string => {
    const start = toPositiveIntLoose(startVerse) ?? 1;
    const end = toPositiveIntLoose(endVerse) ?? start;
    return `range-${start}-${end}`;
};

export const getVerseGroupKey = (input: {
    surahId: unknown;
    anchorId?: unknown;
    startVerse?: unknown;
    endVerse?: unknown;
}) => {
    const surahId = toPositiveIntLoose(input.surahId);
    if (!surahId) return null;
    const anchorId = toOptionalString(input.anchorId) || getFallbackAnchorId(input.startVerse, input.endVerse);
    return `${surahId}-${anchorId}`;
};

export const deriveSuspendedVerseGroupKeys = (
    errors: Array<any>,
    threshold: number = 3,
    acknowledgedAtByGroup?: Record<string, string>
) => {
    const counts = new Map<string, number>();
    const latestErrorTimestampMs = new Map<string, number>();

    errors.forEach((error) => {
        if (String(error?.nodeType || '') !== 'verse_segment') return;
        const key = getVerseGroupKey({
            surahId: error?.surahId,
            anchorId: error?.anchorId,
            startVerse: error?.startVerse,
            endVerse: error?.endVerse
        });
        if (!key) return;
        counts.set(key, (counts.get(key) || 0) + 1);
        const ts = Date.parse(String(error?.timestamp || ''));
        const ms = Number.isFinite(ts) ? ts : 0;
        const existing = latestErrorTimestampMs.get(key) ?? 0;
        if (ms >= existing) {
            latestErrorTimestampMs.set(key, ms);
        }
    });

    const suspended = new Set<string>();
    counts.forEach((count, key) => {
        if (count < threshold) return;
        const latestErrorMs = latestErrorTimestampMs.get(key) ?? 0;
        const ackIso = acknowledgedAtByGroup?.[key];
        const ackMs = ackIso ? Date.parse(ackIso) : Number.NaN;
        if (Number.isFinite(ackMs) && ackMs >= latestErrorMs) return;
        suspended.add(key);
    });
    return suspended;
};

export const filterReviewQueueNodes = (
    nodes: MemoryNode[],
    settings: Partial<AppSettings> | undefined,
    mindmaps: MindMap[],
    suspendedVerseGroupKeys?: Set<string>
) => {
    const canonicalMindmaps = canonicalizeMindmaps(mindmaps);
    const hasKanbanState = !!settings?.kanbanColumns && Object.keys(settings.kanbanColumns).length > 0;
    const completeIds = new Set<string>(hasKanbanState ? (settings?.kanbanColumns?.complete || []) : []);
    const skippedSurahIds = new Set<number>((settings?.skippedSurahs || []).map((id) => Number(id)).filter((id) => Number.isFinite(id)));
    const completeExitBehavior = settings?.completeExitBehavior ?? 'mindmap_only';

    return nodes.filter(node => {
        const surahId = resolveReviewNodeSurahId(node);
        if (surahId && skippedSurahIds.has(surahId)) return false;

        if (node.type === 'mindmap') {
            if (!hasKanbanState) return true;
            return surahId ? completeIds.has(`surah-${surahId}`) : true;
        }

        if (node.type === 'part_mindmap') {
            if (!hasKanbanState) return true;
            const partId = resolveReviewNodePartId(node);
            return partId !== null ? completeIds.has(`part-${partId}`) : true;
        }

        if (node.type === 'verse_segment') {
            if (hasKanbanState && completeExitBehavior === 'mindmap_and_verses' && surahId && !completeIds.has(`surah-${surahId}`)) {
                return false;
            }
            const verseGroupKey = getVerseGroupKey({
                surahId,
                anchorId: (node as any)?.targetId,
                startVerse: (node as any)?.startVerse,
                endVerse: (node as any)?.endVerse
            });
            if (verseGroupKey && suspendedVerseGroupKeys?.has(verseGroupKey)) {
                return false;
            }
            return hasAnchorForNode(node, canonicalMindmaps);
        }

        return true;
    });
};
