'use client';

import React, { memo, useMemo } from 'react';
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
    onEditMindmap: (item: KanbanItem) => Promise<void> | void;
    onDeleteMindmap: (item: KanbanItem) => Promise<void> | void;
    onExportMindmap?: (item: KanbanItem) => Promise<void> | void;
    onResetMindmap?: (item: KanbanItem, resetMemoryNodes: boolean) => Promise<void> | void;
    onChangeSplits: (item: KanbanItem) => Promise<void> | void;
    onViewVerseContext?: (item: KanbanItem) => Promise<void> | void;
    onViewSimilarityContext?: (item: KanbanItem) => Promise<void> | void;
    getHasMindmap: (item: KanbanItem) => boolean;
    getHasSplits: (item: KanbanItem) => boolean;
    getHasPremade?: (item: KanbanItem) => boolean;
    getSettingsHref?: (item: KanbanItem) => string | undefined;
    getDocLink: (item: KanbanItem) => string | undefined;
    isItemVisible: (item: KanbanItem) => boolean;
    hasActiveVisibilityFilter: boolean;
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
    onDeleteMindmap,
    onExportMindmap,
    onResetMindmap,
    onChangeSplits,
    onViewVerseContext,
    onViewSimilarityContext,
    getHasMindmap,
    getHasSplits,
    getHasPremade,
    getSettingsHref,
    getDocLink,
    isItemVisible,
    hasActiveVisibilityFilter
}: KanbanColumnProps) => {
    const visibleItems = useMemo(
        () => (hasActiveVisibilityFilter ? items.filter(isItemVisible) : items),
        [hasActiveVisibilityFilter, isItemVisible, items]
    );

    return (
        <div 
            className={`
                kanban-column todo-kanban-column flex flex-col !rounded-[14px] ${
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
                    todo-kanban-column-header !mb-3 !pb-2 
                    ${isMobile ? 'sticky top-0 z-10 bg-[var(--background-secondary)] !-mt-3 !pt-3 !-mx-3 !px-3 border-b border-[var(--border)]' : ''}
                `}
                style={isMobile ? {
                    backgroundColor: 'var(--background-secondary)', 
                    // Add explicit light mode override here if CSS variable isn't resolving correctly in sticky context, 
                    // but the class usually handles it.
                } : undefined}
            >
                <div className="header-icon-badge">
                    {getColumnIcon(id)}
                </div>
                <h3>{title}</h3>
                <span className="ml-auto text-xs font-medium text-[var(--foreground-secondary)] bg-[var(--background)] px-2 py-0.5 rounded-full border border-[var(--border)]">
                    {visibleItems.length}
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
                            todo-kanban-column-content min-h-[100px] relative
                            ${isMobile 
                                ? '!flex !flex-row gap-3 overflow-x-auto custom-scrollbar pb-2 snap-x snap-mandatory overscroll-x-contain !overflow-y-hidden' 
                                : 'flex-1 overflow-y-auto custom-scrollbar pr-1 pb-24'
                            }
                        `}
                    >
                        {visibleItems.map((item, index) => (
                            <KanbanCard
                                key={item.id}
                                item={item}
                                index={index}
                                columnId={id}
                                isMobile={isMobile}
                                hasMindmap={getHasMindmap(item)}
                                hasSplits={getHasSplits(item)}
                                hasPremade={getHasPremade ? getHasPremade(item) : false}
                                appMode={appMode}
                                settingsHref={getSettingsHref ? getSettingsHref(item) : undefined}
                                docLink={getDocLink(item)}
                                onEditMindmap={onEditMindmap}
                                onDeleteMindmap={onDeleteMindmap}
                                onExportMindmap={onExportMindmap}
                                onResetMindmap={onResetMindmap}
                                onChangeSplits={onChangeSplits}
                                onViewVerseContext={onViewVerseContext}
                                onViewSimilarityContext={onViewSimilarityContext}
                            />
                        ))}
                        {provided.placeholder}
                    </div>
                )}
            </Droppable>
        </div>
    );
};

const MemoizedKanbanColumn = memo(KanbanColumn);
MemoizedKanbanColumn.displayName = 'KanbanColumn';

export default MemoizedKanbanColumn;
