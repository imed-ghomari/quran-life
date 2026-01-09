export type KanbanItemType = 'suspended' | 'similarity' | 'part' | 'surah';

export interface KanbanItem {
    id: string;
    type: KanbanItemType;
    data: any;
    status: 'backlog' | 'in-progress' | 'complete' | 'review'; // Columns
}

export interface KanbanColumnData {
    id: string;
    title: string;
    items: KanbanItem[];
}
