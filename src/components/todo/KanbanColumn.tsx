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
    appMode: 'owner' | 'user';
    onCardClick: (item: KanbanItem) => void;
    // New props for card actions
    onEditMindmap: (item: KanbanItem) => void;
    onImportMindmap: (item: KanbanItem) => void;
    onDeleteMindmap: (item: KanbanItem) => void;
    onExportMindmap?: (item: KanbanItem) => void;
    onResetMindmap?: (item: KanbanItem) => void;
    onChangeSplits: (item: KanbanItem) => void;
    onViewVerseContext?: (item: KanbanItem) => void;
    onViewSimilarityContext?: (item: KanbanItem) => void;
    getHasMindmap: (item: KanbanItem) => boolean;
    getHasSplits: (item: KanbanItem) => boolean;
    getHasPremade?: (item: KanbanItem) => boolean;
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
    appMode,
    onCardClick,
    onEditMindmap,
    onImportMindmap,
    onDeleteMindmap,
    onExportMindmap,
    onResetMindmap,
    onChangeSplits,
    onViewVerseContext,
    onViewSimilarityContext,
    getHasMindmap,
    getHasSplits,
    getHasPremade,
    getDocLink
}: KanbanColumnProps) => {
    return (
        <div 
            className={`
                kanban-column roadmap-column flex flex-col !rounded-[14px] ${
                    id === 'backlog' || id === 'in-progress' || id === 'complete'
                        ? 'kanban-column--mobile-flat'
                        : ''
                }
                ${isMobile 
                    ? `w-full flex-1 min-h-0 !p-3` 
                    : 'h-full max-h-full !p-4'
                }
            `}
            style={isMobile ? { height: 'auto' } : undefined}
        >
            {/* Header Area */}
            <div 
                className={`
                    column-header !mb-3 !pb-2 
                    ${isMobile ? 'sticky top-0 z-10 bg-[var(--background-secondary)] !-mt-3 !pt-3 !-mx-3 !px-3 border-b border-[var(--border)]' : ''}
                `}
                style={isMobile ? {
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
                direction={isMobile ? "horizontal" : "vertical"}
                ignoreContainerClipping={isMobile}
            >
                {(provided) => (
                    <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className={`
                            column-content min-h-[100px] relative
                            ${isMobile 
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
                                hasSplits={getHasSplits(item)}
                                hasPremade={getHasPremade ? getHasPremade(item) : false}
                                appMode={appMode}
                                docLink={getDocLink(item)}
                                onEditMindmap={() => onEditMindmap(item)}
                                onImportMindmap={() => onImportMindmap(item)}
                                onDeleteMindmap={() => onDeleteMindmap(item)}
                                onExportMindmap={onExportMindmap ? () => onExportMindmap(item) : undefined}
                                onResetMindmap={onResetMindmap ? () => onResetMindmap(item) : undefined}
                                onChangeSplits={() => onChangeSplits(item)}
                                onViewVerseContext={onViewVerseContext ? () => onViewVerseContext(item) : undefined}
                                onViewSimilarityContext={onViewSimilarityContext ? () => onViewSimilarityContext(item) : undefined}
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
