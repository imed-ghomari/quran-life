import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { KanbanItem } from './types';
import { AlertTriangle, Brain, Map, MapPinned, Check, MessageSquare, Paperclip, Flag } from 'lucide-react';

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
                        bg-[var(--background)] p-4 rounded-xl border border-[var(--border)]
                        shadow-sm hover:shadow-md transition-all mb-3 cursor-pointer
                        ${snapshot.isDragging ? 'shadow-lg ring-2 ring-[var(--accent)] opacity-90 rotate-2' : ''}
                    `}
                    style={{
                        ...provided.draggableProps.style,
                    }}
                >
                    {renderCardContent(item)}

                    {/* Bottom Action/Info Bar (Fake interactions for now based on screenshot inspiration) */}
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[var(--border)] opacity-60 text-xs">
                        <div className="flex items-center gap-1">
                            <Flag size={12} className={getPriorityColor(item.type)} />
                            <span>Priority</span>
                        </div>
                        {/* <div className="flex items-center gap-1 ml-auto">
                           <MessageSquare size={12} />
                           <span>0</span>
                        </div> */}
                    </div>
                </div>
            )}
        </Draggable>
    );
};

function getPriorityColor(type: string) {
    switch (type) {
        case 'suspended': return 'text-red-500';
        case 'similarity': return 'text-purple-500';
        case 'part': return 'text-blue-500';
        case 'surah': return 'text-green-500';
        default: return 'text-gray-500';
    }
}

function renderCardContent(item: KanbanItem) {
    switch (item.type) {
        case 'suspended':
            const issue = item.data;
            return (
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold px-2 py-1 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                            Suspended
                        </span>
                        <AlertTriangle size={16} className="text-red-500" />
                    </div>
                    <h4 className="font-semibold text-sm mb-1">{`Surah ${issue.surahId}: ${issue.label}`}</h4>
                    <p className="text-xs text-[var(--foreground-secondary)] line-clamp-2">
                        Needs review and creating anchors.
                    </p>
                </div>
            );
        case 'similarity':
            const sim = item.data;
            return (
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold px-2 py-1 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                            Similarity
                        </span>
                        <Brain size={16} className="text-purple-500" />
                    </div>
                    <h4 className="font-semibold text-sm mb-1">{sim.surah?.name}</h4>
                    <p className="text-xs text-[var(--foreground-secondary)]">
                        {sim.count} similarity issues to review.
                    </p>
                </div>
            );
        case 'part':
            const partTask = item.data;
            const pmindmap = partTask.mindmap;
            const pComplete = pmindmap?.isComplete && (!!pmindmap?.imageUrl || !!pmindmap?.tldrawSnapshot);

            return (
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <span className={`text-xs font-bold px-2 py-1 rounded ${pComplete ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'}`}>
                            Part Map
                        </span>
                        <Map size={16} className="text-blue-500" />
                    </div>
                    <h4 className="font-semibold text-sm mb-1">Part {partTask.part}</h4>
                    <p className="text-xs text-[var(--foreground-secondary)]">
                        {pComplete ? 'Mindmap complete' : 'Create Part Mindmap'}
                    </p>
                </div>
            );
        case 'surah':
            const surahTask = item.data;
            const smindmap = surahTask.mindmap;
            const sComplete = smindmap?.isComplete && (!!smindmap?.imageUrl || !!smindmap?.tldrawSnapshot);

            return (
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <span className={`text-xs font-bold px-2 py-1 rounded ${sComplete ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'}`}>
                            Surah Map
                        </span>
                        <MapPinned size={16} className={sComplete ? 'text-green-500' : 'text-yellow-500'} />
                    </div>
                    <h4 className="font-semibold text-sm mb-1">{surahTask.surah.name}</h4>
                    <p className="text-xs text-[var(--foreground-secondary)]">
                        {sComplete ? 'Mindmap complete' : 'Create & review anchors'}
                    </p>
                </div>
            );
        default:
            return null;
    }
}

export default KanbanCard;
