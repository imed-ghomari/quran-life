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

type VerseSegmentSyncOperation =
    | { type: 'delete'; nodeId: string }
    | { type: 'update'; nodeId: string; payload: MemoryNode }
    | { type: 'create'; nodeId: string; payload: MemoryNode & { userId: string } };

const getRangeKey = (startVerse: number, endVerse: number) => `${startVerse}-${endVerse}`;

const getVerseSegmentEntityId = (userId: string, surahId: number, startVerse: number, endVerse: number) =>
    resolveEntityId(
        undefined,
        'memory_node',
        userId,
        stableEntityId('memory_node', 'verse_segment', surahId, startVerse, endVerse)
    );

const isInstantAlreadyExistingCreateError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error || '');
    return message.includes('Creating entities that exist');
};

const buildTx = (operation: VerseSegmentSyncOperation, createMode: 'create' | 'update' = 'create') => {
    if (operation.type === 'delete') {
        return db.tx.memoryNodes[operation.nodeId].delete();
    }
    if (operation.type === 'update') {
        return db.tx.memoryNodes[operation.nodeId].update(operation.payload as any);
    }
    if (createMode === 'update') {
        return db.tx.memoryNodes[operation.nodeId].update(operation.payload as any);
    }
    return db.tx.memoryNodes[operation.nodeId].create(operation.payload as any);
};

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
    const desiredAnchorsByRange = new Map<string, {
        id: string;
        startVerse: number;
        endVerse: number;
    }>();
    anchors.forEach((anchor) => {
        const startVerse = Number(anchor.startVerse);
        const endVerse = Number(anchor.endVerse);
        if (
            !Number.isFinite(startVerse) ||
            !Number.isFinite(endVerse) ||
            startVerse <= 0 ||
            endVerse < startVerse
        ) {
            return;
        }
        desiredAnchorsByRange.set(getRangeKey(startVerse, endVerse), {
            id: anchor.id || `anchor-${surahId}-${startVerse}-${endVerse}`,
            startVerse,
            endVerse,
        });
    });
    const desiredAnchors = Array.from(desiredAnchorsByRange.values());

    const desiredRangeKeys = new Set(desiredAnchors.map((anchor) => getRangeKey(anchor.startVerse, anchor.endVerse)));
    const existingByRange = new Map<string, MemoryNode>();
    existingNodes.forEach((node) => {
        const startVerse = Number(node.startVerse);
        const endVerse = Number(node.endVerse);
        if (!Number.isFinite(startVerse) || !Number.isFinite(endVerse)) return;
        existingByRange.set(getRangeKey(startVerse, endVerse), node);
    });

    const operations: VerseSegmentSyncOperation[] = [];
    let created = 0;
    let updated = 0;
    let deleted = 0;

    existingNodes.forEach((node) => {
        const startVerse = Number(node.startVerse);
        const endVerse = Number(node.endVerse);
        if (!Number.isFinite(startVerse) || !Number.isFinite(endVerse)) return;
        if (desiredRangeKeys.has(getRangeKey(startVerse, endVerse))) return;
        operations.push({ type: 'delete', nodeId: String(node.id) });
        deleted += 1;
    });

    if (shouldCreateMissingRanges) {
        desiredAnchors.forEach((anchor) => {
            const rangeKey = getRangeKey(anchor.startVerse, anchor.endVerse);
            const existingNode = existingByRange.get(rangeKey);

            if (existingNode) {
                operations.push({
                    type: 'update',
                    nodeId: String(existingNode.id),
                    payload: {
                        ...existingNode,
                        type: 'verse_segment',
                        surahId,
                        startVerse: anchor.startVerse,
                        endVerse: anchor.endVerse,
                        targetId: anchor.id,
                        scheduler: shouldResetSchedulers ? createNewFSRSState() : existingNode.scheduler,
                        createdAt: shouldResetSchedulers ? nowIso : existingNode.createdAt,
                    } as MemoryNode,
                });
                updated += 1;
                return;
            }

            const nodeId = getVerseSegmentEntityId(userId, surahId, anchor.startVerse, anchor.endVerse);
            operations.push({
                type: 'create',
                nodeId,
                payload: {
                    id: nodeId,
                    type: 'verse_segment',
                    surahId,
                    startVerse: anchor.startVerse,
                    endVerse: anchor.endVerse,
                    targetId: anchor.id,
                    scheduler: createNewFSRSState(),
                    createdAt: nowIso,
                    userId,
                } as MemoryNode & { userId: string },
            });
            created += 1;
        });
    }

    if (operations.length === 0) {
        onProgress?.(0, 0);
        return { created, updated, deleted };
    }

    for (let i = 0; i < operations.length; i += batchSize) {
        const batch = operations.slice(i, i + batchSize);
        try {
            const tx = batch.map((entry) => buildTx(entry));
            await transactWithRetry(tx.length === 1 ? tx[0] : tx);
        } catch (error) {
            if (!isInstantAlreadyExistingCreateError(error)) throw error;
            const fallbackTx = batch.map((entry) =>
                entry.type === 'create' ? buildTx(entry, 'update') : buildTx(entry)
            );
            await transactWithRetry(fallbackTx.length === 1 ? fallbackTx[0] : fallbackTx);
        }
        onProgress?.(Math.min(operations.length, i + batch.length), operations.length);
    }

    return { created, updated, deleted };
};
