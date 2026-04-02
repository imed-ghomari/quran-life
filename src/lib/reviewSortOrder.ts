export const REVIEW_SORT_ORDERS = ['surah_grouped', 'due_date', 'type_grouped'] as const;

export type ReviewSortOrder = (typeof REVIEW_SORT_ORDERS)[number];

const REVIEW_SORT_ORDER_SET = new Set<string>(REVIEW_SORT_ORDERS);

const REVIEW_SORT_ORDER_ALIASES: Record<string, ReviewSortOrder> = {
    'part-surah-verse': 'type_grouped',
    'part_surah_verse': 'type_grouped',
    'type-grouped': 'type_grouped',
    'surah-grouped': 'surah_grouped',
    'due-date': 'due_date',
};

export const normalizeReviewSortOrder = (value: unknown): ReviewSortOrder => {
    if (typeof value !== 'string') return 'due_date';
    const trimmed = value.trim();
    if (REVIEW_SORT_ORDER_SET.has(trimmed)) return trimmed as ReviewSortOrder;
    return REVIEW_SORT_ORDER_ALIASES[trimmed] ?? 'due_date';
};
