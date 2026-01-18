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
    isTablet?: boolean;
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
    isTablet,
    onCardClick,
    onEditMindmap,
    onImportMindmap,
    onDeleteMindmap,
    onChangeSplits,
    getHasMindmap,
    getDocLink
}: KanbanColumnProps) => {
    return (
        <div 
            className={`
                roadmap-column flex flex-col !rounded-[14px]
                ${isMobile || isTablet 
                    ? `w-full flex-1 min-h-0 !p-3 ${isTablet ? '!p-4' : ''}` 
                    : 'h-full max-h-full !p-4'
                }
            `}
            style={isMobile || isTablet ? { height: 'auto' } : undefined}
        >
            {/* Header Area */}
            <div 
                className={`
                    column-header !mb-3 !pb-2 
                    ${isMobile || isTablet ? 'sticky top-0 z-10 bg-[var(--background-secondary)] !-mt-3 !pt-3 !-mx-3 !px-3 border-b border-[var(--border)]' : ''}
                `}
                style={isMobile || isTablet ? {
                    backgroundColor: 'var(--background-secondary)', 
                    // Add explicit light mode override here if CSS variable isn't resolving correctly in sticky context, 
                    // but the class usually handles it.
                } : undefined}
            >
                {/* Icon with subtle styling matching roadmap theme */}
                <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                    id === 'complete' ? 'text-[var(--success)] bg-[var(--success)]/10' : 
                    id === 'in-progress' ? 'text-amber-500 bg-amber-500/10' : 
                    'text-[var(--foreground-secondary)] bg-[var(--foreground)]/5'
                }`}>
                    {getColumnIcon(id)}
                </div>
                <h3>{title}</h3>
                <span className="ml-auto text-xs font-medium text-[var(--foreground-secondary)] bg-[var(--background)] px-2 py-0.5 rounded-full border border-[var(--border)]">
                    {items.length}
                </span>
            </div>

            {/* Cards Area */}
            <Droppable 
                droppableId={id} 
                direction={isMobile || isTablet ? "horizontal" : "vertical"}
                ignoreContainerClipping={isMobile || isTablet}
            >
                {(provided) => (
                    <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className={`
                            column-content min-h-[100px] relative
                            ${isMobile || isTablet 
                                ? '!flex !flex-row gap-3 overflow-x-auto pb-2 snap-x snap-mandatory overscroll-x-contain !overflow-y-hidden' 
                                : 'flex-1 overflow-y-auto custom-scrollbar pr-1 pb-24'
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
    );
};

export default KanbanColumn;
