import React from 'react';
import { Droppable } from '@hello-pangea/dnd';
import KanbanCard from './KanbanCard';
import { KanbanItem } from './types';
import { MoreHorizontal } from 'lucide-react';

interface KanbanColumnProps {
    id: string;
    title: string;
    items: KanbanItem[];
    isMobile: boolean;
    onCardClick: (item: KanbanItem) => void;
}

import { Inbox, Activity, CheckCircle2 } from 'lucide-react';

const getColumnIcon = (columnId: string) => {
    switch (columnId) {
        case 'backlog': return <Inbox size={18} />;
        case 'in-progress': return <Activity size={18} />;
        case 'complete': return <CheckCircle2 size={18} />;
        default: return <Inbox size={18} />;
    }
};

const KanbanColumn = ({ id, title, items, isMobile, onCardClick }: KanbanColumnProps) => {
    return (
        <div className={`
            flex flex-col h-full flex-1 min-w-[320px] transition-all duration-300
            ${isMobile ? 'min-h-[180px] mb-8' : 'max-w-[420px]'}
        `}>
            {/* Structural Containment Background */}
            <div className="flex flex-col h-full bg-white/[0.015] rounded-[32px] p-5 border border-white/[0.02]">
                {/* Header Area - Now contained */}
                <div className="flex items-center mb-10 px-2 pt-2">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-lg bg-[var(--verse-bg)] text-[var(--accent)] border border-[var(--accent)] border-opacity-10 opacity-60">
                                {getColumnIcon(id)}
                            </div>
                            <h3 className="text-[15px] font-bold tracking-tight text-[var(--foreground)] opacity-100">{title}</h3>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-[var(--verse-bg)] text-[10px] font-bold text-[var(--accent)] border border-[var(--accent)] border-opacity-10 opacity-70">
                            {items.length}
                        </span>
                    </div>
                </div>

                {/* Cards Area - With consistent vertical rhythm */}
                <Droppable droppableId={id}>
                    {(provided) => (
                        <div
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                            className="flex-1 flex flex-col space-y-4 overflow-y-auto min-h-[150px] custom-scrollbar"
                        >
                            {items.map((item, index) => (
                                <KanbanCard
                                    key={item.id}
                                    item={item}
                                    index={index}
                                    onClick={() => onCardClick(item)}
                                />
                            ))}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </div>
        </div>
    );
};



export default KanbanColumn;
