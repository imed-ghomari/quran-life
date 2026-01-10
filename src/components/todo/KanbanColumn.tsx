'use client';

import React from 'react';
import { Droppable } from '@hello-pangea/dnd';
import KanbanCard from './KanbanCard';
import { KanbanItem } from './types';
import { Inbox, Activity, CheckCircle2 } from 'lucide-react';

interface KanbanColumnProps {
    id: string;
    title: string;
    items: KanbanItem[];
    isMobile: boolean;
    onCardClick: (item: KanbanItem) => void;
    // New props for card actions
    onEditMindmap: (item: KanbanItem) => void;
    onImportMindmap: (item: KanbanItem) => void;
    onDeleteMindmap: (item: KanbanItem) => void;
    onChangeSplits: (item: KanbanItem) => void;
    getHasMindmap: (item: KanbanItem) => boolean;
    getDocLink: (item: KanbanItem) => string | undefined;
}

const getColumnIcon = (columnId: string) => {
    switch (columnId) {
        case 'backlog': return <Inbox size={18} />;
        case 'in-progress': return <Activity size={18} />;
        case 'complete': return <CheckCircle2 size={18} />;
        default: return <Inbox size={18} />;
    }
};

const KanbanColumn = ({
    id,
    title,
    items,
    isMobile,
    onCardClick,
    onEditMindmap,
    onImportMindmap,
    onDeleteMindmap,
    onChangeSplits,
    getHasMindmap,
    getDocLink
}: KanbanColumnProps) => {
    return (
        <div className={`
            flex flex-col flex-1 min-w-[320px] transition-all duration-300
            ${isMobile ? 'min-h-[200px] mb-4' : 'max-w-[420px] h-full'}
        `}>
            {/* Structural Containment Background */}
            <div className="flex flex-col h-full bg-[var(--foreground)]/[0.02] dark:bg-black/20 rounded-2xl p-5 border border-[var(--border)] shadow-sm">
                {/* Header Area - Now contained */}
                <div className="flex items-center mb-6 px-2 pt-2 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-lg bg-[var(--verse-bg)] text-[var(--accent)] border border-[var(--accent)]/10">
                                {getColumnIcon(id)}
                            </div>
                            <h3 className="text-[15px] font-bold tracking-tight text-[var(--foreground)]">{title}</h3>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-[var(--verse-bg)] text-[10px] font-bold text-[var(--accent)] border border-[var(--accent)]/10">
                            {items.length}
                        </span>
                    </div>
                </div>

                {/* Cards Area - Horizontal scroll on mobile, vertical on desktop */}
                <Droppable droppableId={id} direction={isMobile ? 'horizontal' : 'vertical'}>
                    {(provided) => (
                        <div
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                            className={`
                                flex-1 min-h-[150px] custom-scrollbar
                                ${isMobile
                                    ? 'flex flex-row gap-4 overflow-x-auto overflow-y-hidden pb-2'
                                    : 'flex flex-col space-y-4 overflow-y-auto'
                                }
                            `}
                        >
                            {items.map((item, index) => (
                                <KanbanCard
                                    key={item.id}
                                    item={item}
                                    index={index}
                                    isMobile={isMobile}
                                    hasMindmap={getHasMindmap(item)}
                                    docLink={getDocLink(item)}
                                    onEditMindmap={() => onEditMindmap(item)}
                                    onImportMindmap={() => onImportMindmap(item)}
                                    onDeleteMindmap={() => onDeleteMindmap(item)}
                                    onChangeSplits={() => onChangeSplits(item)}
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
