import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { KanbanItem } from './types';
import { AlertTriangle, Brain, Map, MapPinned, Check, PenTool, Layout, BookOpen, Clock } from 'lucide-react';

interface KanbanCardProps {
    item: KanbanItem;
    index: number;
    onClick: () => void;
}

const KanbanCard = ({ item, index, onClick }: KanbanCardProps) => {
    return (
        <Draggable draggableId={item.id} index={index}>
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    onClick={onClick}
                    className={`
                        group relative bg-[var(--background)] p-4 rounded-xl border border-[var(--border)]
                        shadow-sm hover:shadow-md hover:border-[var(--accent)] transition-all duration-200 cursor-pointer
                        ${snapshot.isDragging ? 'shadow-xl ring-2 ring-[var(--accent)] rotate-2 z-50' : 'mb-3'}
                    `}
                    style={{
                        ...provided.draggableProps.style,
                    }}
                >
                    {renderCardContent(item)}

                    {/* Hover Indicator */}
                    <div className="absolute inset-y-0 left-0 w-1 bg-[var(--accent)] rounded-l-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
            )}
        </Draggable>
    );
};

function renderCardContent(item: KanbanItem) {
    switch (item.type) {
        case 'suspended':
            const issue = item.data;
            return (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300">
                            <AlertTriangle size={12} strokeWidth={3} />
                            Critical
                        </span>
                        <span className="text-[10px] text-[var(--foreground-secondary)] font-mono">
                            {issue.surahId}:{issue.startVerse}
                        </span>
                    </div>
                    <div>
                        <h4 className="font-semibold text-sm leading-tight text-[var(--foreground)] mb-1 group-hover:text-[var(--accent)] transition-colors">
                            Surah {issue.surahId} Fix
                        </h4>
                        <p className="text-xs text-[var(--foreground-secondary)] line-clamp-2 leading-relaxed">
                            {issue.label || "Review anchors to fix suspended status."}
                        </p>
                    </div>
                </div>
            );

        case 'similarity':
            const sim = item.data;
            return (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">
                            <Brain size={12} strokeWidth={3} />
                            Similarity
                        </span>
                    </div>
                    <div>
                        <h4 className="font-semibold text-sm leading-tight text-[var(--foreground)] mb-1 group-hover:text-[var(--accent)] transition-colors">
                            {sim.surah?.name} Analysis
                        </h4>
                        <p className="text-xs text-[var(--foreground-secondary)]">
                            {sim.count} pending confusion points.
                        </p>
                    </div>
                </div>
            );

        case 'part':
            const partTask = item.data;
            const pmindmap = partTask.mindmap;
            const pComplete = pmindmap?.isComplete && (!!pmindmap?.imageUrl || !!pmindmap?.tldrawSnapshot);

            return (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider ${pComplete
                            ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                            }`}>
                            <Layout size={12} strokeWidth={3} />
                            {pComplete ? 'Done' : 'Part Map'}
                        </span>
                    </div>
                    <div>
                        <h4 className="font-semibold text-sm leading-tight text-[var(--foreground)] mb-1 group-hover:text-[var(--accent)] transition-colors">
                            Juz&apos; {partTask.part} Map
                        </h4>
                        <div className="flex items-center gap-2 mt-2">
                            <div className="h-1.5 flex-1 bg-[var(--border)] rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full ${pComplete ? 'bg-green-500 w-full' : 'bg-blue-500 w-[10%]'}`}
                                />
                            </div>
                            <span className="text-[10px] text-[var(--foreground-secondary)] font-mono">
                                {pComplete ? '100%' : 'Start'}
                            </span>
                        </div>
                    </div>
                </div>
            );

        case 'surah':
            const surahTask = item.data;
            const smindmap = surahTask.mindmap;
            const sComplete = smindmap?.isComplete && (!!smindmap?.imageUrl || !!smindmap?.tldrawSnapshot);

            return (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider ${sComplete
                            ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300'
                            : 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300'
                            }`}>
                            <MapPinned size={12} strokeWidth={3} />
                            {surahTask.surah.verseCount} Verses
                        </span>
                    </div>
                    <div>
                        <h4 className="font-semibold text-sm leading-tight text-[var(--foreground)] mb-1 group-hover:text-[var(--accent)] transition-colors">
                            {surahTask.surah.name}
                        </h4>
                        {sComplete ? (
                            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                                <Check size={12} /> Mindmap Ready
                            </p>
                        ) : (
                            <p className="text-xs text-[var(--foreground-secondary)] flex items-center gap-1">
                                <PenTool size={10} /> Create mindmap
                            </p>
                        )}
                    </div>
                </div>
            );
        default:
            return null;
    }
}

export default KanbanCard;
