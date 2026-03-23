import { createNewFSRSState } from '@/lib/fsrs';
import { db } from '@/lib/instant';
import { resolveEntityId, stableEntityId } from '@/lib/instantIds';
import { transactWithRetry } from '@/lib/instantTransact';
import { Anchor, MemoryNode } from '@/lib/types';

type SyncVerseSegmentNodesInput = {
    userId: string;
    surahId: number;
    anchors: Array<Pick<Anchor, 'id' | 'startVerse' | 'endVerse'>>;
    existingNodes: MemoryNode[];
    shouldCreateMissingRanges: boolean;
    shouldResetSchedulers: boolean;
    batchSize?: number;
    nowIso?: string;
    onProgress?: (completed: number, total: number) => void;
};

type SyncVerseSegmentNodesResult = {
    created: number;
    updated: number;
    deleted: number;
};

const getRangeKey = (startVerse: number, endVerse: number) => `${startVerse}-${endVerse}`;

const getVerseSegmentEntityId = (userId: string, surahId: number, startVerse: number, endVerse: number) =>
    resolveEntityId(
        undefined,
        'memory_node',
        userId,
        stableEntityId('memory_node', 'verse_segment', surahId, startVerse, endVerse)
    );

export const syncVerseSegmentNodesForSurah = async ({
    userId,
    surahId,
    anchors,
    existingNodes,
    shouldCreateMissingRanges,
    shouldResetSchedulers,
    batchSize = 25,
    nowIso = new Date().toISOString(),
    onProgress,
}: SyncVerseSegmentNodesInput): Promise<SyncVerseSegmentNodesResult> => {
    const desiredAnchors = anchors
        .map((anchor) => ({
            id: anchor.id || `anchor-${surahId}-${Number(anchor.startVerse)}-${Number(anchor.endVerse)}`,
            startVerse: Number(anchor.startVerse),
            endVerse: Number(anchor.endVerse),
        }))
        .filter((anchor) =>
            Number.isFinite(anchor.startVerse) &&
            Number.isFinite(anchor.endVerse) &&
            anchor.startVerse > 0 &&
            anchor.endVerse >= anchor.startVerse
        );

    const desiredRangeKeys = new Set(desiredAnchors.map((anchor) => getRangeKey(anchor.startVerse, anchor.endVerse)));
    const existingByRange = new Map<string, MemoryNode>();
    existingNodes.forEach((node) => {
        const startVerse = Number(node.startVerse);
        const endVerse = Number(node.endVerse);
        if (!Number.isFinite(startVerse) || !Number.isFinite(endVerse)) return;
        existingByRange.set(getRangeKey(startVerse, endVerse), node);
    });

    const operations: Array<{ tx: any }> = [];
    let created = 0;
    let updated = 0;
    let deleted = 0;

    existingNodes.forEach((node) => {
        const startVerse = Number(node.startVerse);
        const endVerse = Number(node.endVerse);
        if (!Number.isFinite(startVerse) || !Number.isFinite(endVerse)) return;
        if (desiredRangeKeys.has(getRangeKey(startVerse, endVerse))) return;
        operations.push({
            tx: db.tx.memoryNodes[String(node.id)].delete(),
        });
        deleted += 1;
    });

    if (shouldCreateMissingRanges) {
        desiredAnchors.forEach((anchor) => {
            const rangeKey = getRangeKey(anchor.startVerse, anchor.endVerse);
            const existingNode = existingByRange.get(rangeKey);

            if (existingNode) {
                operations.push({
                    tx: db.tx.memoryNodes[String(existingNode.id)].update({
                        ...existingNode,
                        type: 'verse_segment',
                        surahId,
                        startVerse: anchor.startVerse,
                        endVerse: anchor.endVerse,
                        targetId: anchor.id,
                        scheduler: shouldResetSchedulers ? createNewFSRSState() : existingNode.scheduler,
                        createdAt: shouldResetSchedulers ? nowIso : existingNode.createdAt,
                    } as MemoryNode),
                });
                updated += 1;
                return;
            }

            const nodeId = getVerseSegmentEntityId(userId, surahId, anchor.startVerse, anchor.endVerse);
            operations.push({
                tx: db.tx.memoryNodes[nodeId].create({
                    id: nodeId,
                    type: 'verse_segment',
                    surahId,
                    startVerse: anchor.startVerse,
                    endVerse: anchor.endVerse,
                    targetId: anchor.id,
                    scheduler: createNewFSRSState(),
                    createdAt: nowIso,
                    userId,
                } as any),
            });
            created += 1;
        });
    }

    if (operations.length === 0) {
        onProgress?.(0, 0);
        return { created, updated, deleted };
    }

    for (let i = 0; i < operations.length; i += batchSize) {
        const batch = operations.slice(i, i + batchSize).map((entry) => entry.tx);
        await transactWithRetry(batch.length === 1 ? batch[0] : batch);
        onProgress?.(Math.min(operations.length, i + batch.length), operations.length);
    }

    return { created, updated, deleted };
};
