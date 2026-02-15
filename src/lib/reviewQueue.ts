import { AppSettings, MemoryNode, MindMap } from '@/lib/types';

const toPositiveInt = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
    const direct = toPositiveInt((node as any).partId);
    if (direct) return direct;
    const target = String((node as any).targetId || '');
    const partMatch = target.match(/^part-mindmap-(\d+)$/);
    if (!partMatch) return null;
    return toPositiveInt(partMatch[1]);
};

const hasAnchorForNode = (node: MemoryNode, mindmaps: MindMap[]) => {
    if (node.type !== 'verse_segment') return true;
    const surahId = resolveReviewNodeSurahId(node);
    if (!surahId) return true;
    const mm = mindmaps.find(m => Number((m as any).surahId) === surahId);
    const anchors = mm?.anchors || [];
    if (anchors.length === 0) return false;
    return anchors.some(a => Number(a.startVerse) === Number(node.startVerse) && Number(a.endVerse) === Number(node.endVerse));
};

export const filterReviewQueueNodes = (
    nodes: MemoryNode[],
    settings: Partial<AppSettings> | undefined,
    mindmaps: MindMap[]
) => {
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
            return partId ? completeIds.has(`part-${partId}`) : true;
        }

        if (node.type === 'verse_segment') {
            if (hasKanbanState && completeExitBehavior === 'mindmap_and_verses' && surahId && !completeIds.has(`surah-${surahId}`)) {
                return false;
            }
            return hasAnchorForNode(node, mindmaps);
        }

        return true;
    });
};
