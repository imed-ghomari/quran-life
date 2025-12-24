// ========================================
// SM-2 Spaced Repetition Scheduler
// ========================================

import { SM2State, MemoryNode, MemoryNodeType } from './types';

/**
 * Creates a new SM-2 state for a fresh MemoryNode
 */
export function createNewSM2State(): SM2State {
    const today = new Date().toISOString().split('T')[0];
    return {
        interval: 0,
        repetition: 0,
        easeFactor: 2.5,
        dueDate: today,
        lastReview: '',
    };
}

/**
 * SM-2 Algorithm Implementation
 * @param grade - 0-5 rating (0-2 = fail, 3-5 = pass)
 * @param state - Current scheduler state
 * @returns Updated scheduler state
 */
export function sm2(grade: 0 | 1 | 2 | 3 | 4 | 5, state: SM2State): SM2State {
    let { interval, repetition, easeFactor } = state;

    if (grade < 3) {
        // Failed: reset to beginning
        repetition = 0;
        interval = 1;
    } else {
        // Passed: advance schedule
        if (repetition === 0) {
            interval = 1;
        } else if (repetition === 1) {
            interval = 6;
        } else {
            interval = Math.round(interval * easeFactor);
        }
        repetition++;
    }

    // Adjust ease factor based on performance
    // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    easeFactor = Math.max(
        1.3,
        easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
    );

    const dueDate = addDays(new Date(), interval).toISOString().split('T')[0];
    const lastReview = new Date().toISOString().split('T')[0];

    return {
        interval,
        repetition,
        easeFactor: Math.round(easeFactor * 100) / 100, // Round to 2 decimal places
        dueDate,
        lastReview,
    };
}

/**
 * Add days to a date
 */
function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

/**
 * Get today's date string in YYYY-MM-DD format
 */
export function getTodayString(): string {
    return new Date().toISOString().split('T')[0];
}

/**
 * Check if a MemoryNode is due for review
 */
export function isDue(node: MemoryNode): boolean {
    const today = getTodayString();
    return node.scheduler.dueDate <= today;
}

/**
 * Get all due MemoryNodes, sorted by due date (oldest first)
 */
export function getDueMemoryNodes(nodes: MemoryNode[]): MemoryNode[] {
    const today = getTodayString();
    return nodes
        .filter(n => n.scheduler.dueDate <= today)
        .sort((a, b) => a.scheduler.dueDate.localeCompare(b.scheduler.dueDate));
}

/**
 * Get overdue days (negative if not yet due)
 */
export function getOverdueDays(node: MemoryNode): number {
    const today = new Date();
    const dueDate = new Date(node.scheduler.dueDate);
    const diff = today.getTime() - dueDate.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Create a new MemoryNode for a VerseSegment
 */
export function createMemoryNode(
    type: MemoryNodeType,
    targetId: string
): MemoryNode {
    return {
        id: `${type}-${targetId}-${Date.now()}`,
        type,
        targetId,
        scheduler: createNewSM2State(),
        createdAt: new Date().toISOString(),
    };
}

/**
 * Grade labels for UI
 */
export const GRADE_LABELS: Record<number, { label: string; description: string; color: string }> = {
    0: { label: 'Complete blackout', description: 'No recall at all', color: '#ef4444' },
    1: { label: 'Incorrect', description: 'Wrong answer, correct one remembered', color: '#f97316' },
    2: { label: 'Incorrect', description: 'Wrong answer, correct one seemed easy', color: '#eab308' },
    3: { label: 'Correct', description: 'Recalled with serious difficulty', color: '#84cc16' },
    4: { label: 'Correct', description: 'Recalled after hesitation', color: '#22c55e' },
    5: { label: 'Perfect', description: 'Instant perfect recall', color: '#10b981' },
};

/**
 * Check if a node is considered "stable" (long-term memory)
 * Stable = interval >= 21 days
 */
export function isStable(node: MemoryNode): boolean {
    return node.scheduler.interval >= 21;
}

/**
 * Get next review date as human-readable string
 */
export function getNextReviewLabel(node: MemoryNode): string {
    const today = new Date();
    const dueDate = new Date(node.scheduler.dueDate);
    const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    if (diffDays < 7) return `Due in ${diffDays} days`;
    if (diffDays < 30) return `Due in ${Math.ceil(diffDays / 7)} weeks`;
    return `Due in ${Math.ceil(diffDays / 30)} months`;
}
