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
                        card group relative cursor-pointer hover:border-[var(--accent)] transition-all duration-200 p-4
                        ${snapshot.isDragging ? 'shadow-xl ring-2 ring-[var(--accent)] rotate-2 z-50' : ''}
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
                        <span className="status-badge" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
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
                        <span className="status-badge" style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}>
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
                        <span className={`status-badge ${pComplete ? 'learned' : ''}`} style={!pComplete ? { background: 'rgba(59,130,246,0.1)', color: '#3b82f6' } : undefined}>
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
                        <span className={`status-badge ${sComplete ? 'learned' : ''}`} style={!sComplete ? { background: 'rgba(249,115,22,0.1)', color: '#f97316' } : undefined}>
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
