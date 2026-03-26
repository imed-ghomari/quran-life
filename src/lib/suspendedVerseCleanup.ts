import { db } from '@/lib/instant';
import { transactWithRetry } from '@/lib/instantTransact';
import { getVerseGroupKey } from '@/lib/reviewQueue';
import { Anchor, MemoryNode } from '@/lib/types';

const getRangeKey = (startVerse: number, endVerse: number) => `${startVerse}-${endVerse}`;

const toAnchorLike = (anchor: Pick<Anchor, 'id' | 'startVerse' | 'endVerse'>, surahId: number) => ({
    id: anchor.id || `anchor-${surahId}-${Number(anchor.startVerse)}-${Number(anchor.endVerse)}`,
    startVerse: Number(anchor.startVerse),
    endVerse: Number(anchor.endVerse),
});

export const getImpactedSplitVerseGroupKeys = (input: {
    surahId: number;
    previousAnchors: Array<Pick<Anchor, 'id' | 'startVerse' | 'endVerse'>>;
    nextAnchors: Array<Pick<Anchor, 'id' | 'startVerse' | 'endVerse'>>;
}) => {
    const previousByRange = new Map<string, ReturnType<typeof toAnchorLike>>();
    input.previousAnchors.forEach((anchor) => {
        const normalized = toAnchorLike(anchor, input.surahId);
        if (!Number.isFinite(normalized.startVerse) || !Number.isFinite(normalized.endVerse)) return;
        previousByRange.set(getRangeKey(normalized.startVerse, normalized.endVerse), normalized);
    });

    const nextByRange = new Map<string, ReturnType<typeof toAnchorLike>>();
    input.nextAnchors.forEach((anchor) => {
        const normalized = toAnchorLike(anchor, input.surahId);
        if (!Number.isFinite(normalized.startVerse) || !Number.isFinite(normalized.endVerse)) return;
        nextByRange.set(getRangeKey(normalized.startVerse, normalized.endVerse), normalized);
    });

    const impactedGroupKeys = new Set<string>();
    const rangeKeys = new Set([...previousByRange.keys(), ...nextByRange.keys()]);

    rangeKeys.forEach((rangeKey) => {
        const previousAnchor = previousByRange.get(rangeKey);
        const nextAnchor = nextByRange.get(rangeKey);
        if (previousAnchor && nextAnchor) return;

        if (previousAnchor) {
            const key = getVerseGroupKey({
                surahId: input.surahId,
                anchorId: previousAnchor.id,
                startVerse: previousAnchor.startVerse,
                endVerse: previousAnchor.endVerse,
            });
            if (key) impactedGroupKeys.add(key);
        }

        if (nextAnchor) {
            const key = getVerseGroupKey({
                surahId: input.surahId,
                anchorId: nextAnchor.id,
                startVerse: nextAnchor.startVerse,
                endVerse: nextAnchor.endVerse,
            });
            if (key) impactedGroupKeys.add(key);
        }
    });

    return impactedGroupKeys;
};

export const getSuspendedReviewErrorCleanupPlan = (input: {
    errors: Array<any>;
    groupKeys: Iterable<string>;
    acknowledgedAtByGroup?: Record<string, string>;
    kanbanColumns?: Record<string, string[]>;
    resolveGroupKeyFromError?: (error: any) => string | null;
    threshold?: number;
}) => {
    const threshold = input.threshold ?? 3;
    const counts = new Map<string, number>();
    const latestErrorTimestampMs = new Map<string, number>();

    input.errors.forEach((error) => {
        if (String(error?.nodeType || '') !== 'verse_segment') return;
        const key = input.resolveGroupKeyFromError
            ? input.resolveGroupKeyFromError(error)
            : getVerseGroupKey({
                surahId: error?.surahId,
                anchorId: error?.anchorId,
                startVerse: error?.startVerse,
                endVerse: error?.endVerse,
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

    const activeSuspendedGroupKeys = new Set<string>();
    counts.forEach((count, key) => {
        if (count < threshold) return;
        const latestErrorMs = latestErrorTimestampMs.get(key) ?? 0;
        const ackIso = input.acknowledgedAtByGroup?.[key];
        const ackMs = ackIso ? Date.parse(ackIso) : Number.NaN;
        if (Number.isFinite(ackMs) && ackMs >= latestErrorMs) return;
        activeSuspendedGroupKeys.add(key);
    });
    const kanbanSuspendedGroupKeys = new Set<string>();
    Object.values(input.kanbanColumns || {}).forEach((itemIds) => {
        itemIds.forEach((itemId) => {
            if (!itemId.startsWith('suspended-')) return;
            kanbanSuspendedGroupKeys.add(itemId.slice('suspended-'.length));
        });
    });

    const suspendedCardGroupKeys = new Set<string>([
        ...activeSuspendedGroupKeys,
        ...kanbanSuspendedGroupKeys,
    ]);
    const targetGroupKeys = new Set(Array.from(input.groupKeys).filter((key) => suspendedCardGroupKeys.has(key)));
    if (targetGroupKeys.size === 0) {
        return { errorIds: [] as string[], groupCount: 0 };
    }

    const errorIds = input.errors
        .filter((error) => {
            if (String(error?.nodeType || '') !== 'verse_segment') return false;
            const key = input.resolveGroupKeyFromError
                ? input.resolveGroupKeyFromError(error)
                : getVerseGroupKey({
                    surahId: error?.surahId,
                    anchorId: error?.anchorId,
                    startVerse: error?.startVerse,
                    endVerse: error?.endVerse,
                });
            return !!key && targetGroupKeys.has(key);
        })
        .map((error) => String(error?.id || '').trim())
        .filter((errorId) => errorId.length > 0);

    return {
        errorIds,
        groupCount: targetGroupKeys.size,
    };
};

export const getSuspendedReviewErrorCleanupPlanForNodes = (input: {
    errors: Array<any>;
    nodes: MemoryNode[];
    acknowledgedAtByGroup?: Record<string, string>;
    kanbanColumns?: Record<string, string[]>;
    resolveGroupKeyFromError?: (error: any) => string | null;
    threshold?: number;
}) => {
    const groupKeys = input.nodes
        .filter((node) => node.type === 'verse_segment')
        .map((node) =>
            getVerseGroupKey({
                surahId: (node as any)?.surahId,
                anchorId: (node as any)?.targetId,
                startVerse: (node as any)?.startVerse,
                endVerse: (node as any)?.endVerse,
            })
        )
        .filter((key): key is string => !!key);

    return getSuspendedReviewErrorCleanupPlan({
        errors: input.errors,
        groupKeys,
        acknowledgedAtByGroup: input.acknowledgedAtByGroup,
        kanbanColumns: input.kanbanColumns,
        resolveGroupKeyFromError: input.resolveGroupKeyFromError,
        threshold: input.threshold,
    });
};

export const deleteReviewErrorsByIds = async (
    errorIds: string[],
    batchSize: number = 25,
    onProgress?: (completed: number, total: number) => void
) => {
    const uniqueIds = Array.from(new Set(errorIds.filter((errorId) => errorId.trim().length > 0)));
    if (uniqueIds.length === 0) {
        onProgress?.(0, 0);
        return 0;
    }

    for (let i = 0; i < uniqueIds.length; i += batchSize) {
        const batch = uniqueIds.slice(i, i + batchSize);
        const writes = batch.map((errorId) => db.tx.reviewErrors[errorId].delete());
        await transactWithRetry(writes.length === 1 ? writes[0] : writes);
        onProgress?.(Math.min(uniqueIds.length, i + batch.length), uniqueIds.length);
    }

    return uniqueIds.length;
};

export const removeSuspendedKanbanItems = (
    kanbanColumns: Record<string, string[]> | undefined,
    groupKeys: Iterable<string>
) => {
    const itemIdsToRemove = new Set(Array.from(groupKeys, (groupKey) => `suspended-${groupKey}`));
    const current = kanbanColumns || {};
    const nextEntries = Object.entries(current).map(([columnId, itemIds]) => [
        columnId,
        itemIds.filter((itemId) => !itemIdsToRemove.has(itemId)),
    ]);
    return Object.fromEntries(nextEntries);
};
