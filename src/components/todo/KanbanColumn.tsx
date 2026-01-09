import React from 'react';
import { Droppable } from '@hello-pangea/dnd';
import KanbanCard from './KanbanCard';
import { KanbanItem } from './types';
import { MoreHorizontal, Plus } from 'lucide-react';

interface KanbanColumnProps {
    id: string;
    title: string;
    items: KanbanItem[];
    isMobile: boolean;
    onCardClick: (item: KanbanItem) => void;
}

const KanbanColumn = ({ id, title, items, isMobile, onCardClick }: KanbanColumnProps) => {
    return (
        <div className={`flex flex-col h-full ${isMobile ? 'min-h-[180px] mb-6' : 'min-w-[300px] max-w-[300px] h-[calc(100vh-120px)] rounded-xl bg-[var(--background-secondary)] border border-[var(--border)]'}`}>
            {/* Header */}
            <div className={`p-4 flex items-center justify-between ${isMobile ? 'mb-2 px-1' : 'border-b border-[var(--border)]'}`}>
                <div className="flex items-center gap-2">
                    {/* Circle indicator */}
                    <div className={`w-3 h-3 rounded-full border-2 ${getStatusColor(id)}`} />
                    <h3 className="font-semibold text-sm">{title}</h3>
                    <span className="text-xs text-[var(--foreground-secondary)] ml-2">{items.length}</span>
                </div>
                <div className="flex items-center text-[var(--foreground-secondary)]">
                    <Plus size={16} className="cursor-pointer hover:text-[var(--foreground)] mr-2" />
                    <MoreHorizontal size={16} className="cursor-pointer hover:text-[var(--foreground)]" />
                </div>
            </div>

            {/* Droppable Area */}
            <Droppable droppableId={id} direction={isMobile ? 'horizontal' : 'vertical'}>
                {(provided, snapshot) => (
                    <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`
                            flex-1 p-2 transition-colors
                            ${isMobile ? 'flex overflow-x-auto gap-3 pb-4 min-h-[140px] items-start' : 'overflow-y-auto flex flex-col gap-4'}
                            ${snapshot.isDraggingOver ? 'bg-[var(--accent)]/5 rounded-lg' : ''}
                        `}
                        style={{
                            scrollbarWidth: 'none', // Hide scrollbar for cleaner look
                            msOverflowStyle: 'none'
                        }}
                    >
                        {items.map((item, index) => (
                            <div key={item.id} className={isMobile ? 'min-w-[280px] max-w-[280px]' : ''}>
                                <KanbanCard
                                    item={item}
                                    index={index}
                                    onClick={() => onCardClick(item)}
                                />
                            </div>
                        ))}
                        {provided.placeholder}

                        {/* Empty State placeholder if needed */}
                        {items.length === 0 && !snapshot.isDraggingOver && (
                            <div className={`flex items-center justify-center border-2 border-dashed border-[var(--border)] rounded-lg p-4 opacity-50 ${isMobile ? 'min-w-[200px] h-[100px]' : 'h-[100px]'}`}>
                                <span className="text-xs text-[var(--foreground-secondary)]">Drop items here</span>
                            </div>
                        )}
                    </div>
                )}
            </Droppable>
        </div>
    );
};

function getStatusColor(id: string) {
    switch (id) {
        case 'backlog': return 'border-gray-400';
        case 'todo': return 'border-blue-400';
        case 'in-progress': return 'border-yellow-400';
        case 'complete': return 'border-green-400';
        default: return 'border-gray-400';
    }
}

export default KanbanColumn;
