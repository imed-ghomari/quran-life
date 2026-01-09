// ========================================
// FSRS v6 Spaced Repetition Scheduler
// ========================================

import {
    fsrs,
    createEmptyCard,
    Rating,
    State,
    generatorParameters,
    Card,
    ReviewLog as FSRSReviewLog,
    FSRS,
    FSRSParameters
} from 'ts-fsrs';

// ========================================
// Types
// ========================================

export type FSRSCardState = 'New' | 'Learning' | 'Review' | 'Relearning';

export interface FSRSState {
    due: string;              // ISO date when card is next due
    stability: number;        // Memory stability (days)
    difficulty: number;       // Card difficulty (1-10, default 5.0)
    elapsed_days: number;     // Days since last review
    scheduled_days: number;   // Interval to next review
    reps: number;             // Total review count
    lapses: number;           // Times forgotten (for leech tracking)
    state: FSRSCardState;
    last_review: string;      // ISO date of last review
    // For suspension recovery
    preSuspensionStability?: number;
}

export interface ReviewLogEntry {
    id: string;
    nodeId: string;           // MemoryNode.id
    timestamp: string;        // ISO datetime
    rating: 'Again' | 'Good'; // Binary rating
    // Snapshot before review (for optimizer)
    state: FSRSCardState;
    stability: number;
    difficulty: number;
    elapsed_days: number;
    scheduled_days: number;
}

export interface OptimizationMeta {
    lastOptimizedAt: string | null;
    logCountAtLastOptimization: number;
    customWeights: number[] | null;  // 19 FSRS v6 weights
}

// ========================================
// FSRS Instance Management
// ========================================

let cachedFSRS: FSRS | null = null;
let cachedWeights: number[] | null = null;

/**
 * Create or get cached FSRS instance
 */
export function createFSRS(customWeights?: number[] | null): FSRS {
    // Return cached instance if weights haven't changed
    if (cachedFSRS && JSON.stringify(cachedWeights) === JSON.stringify(customWeights)) {
        return cachedFSRS;
    }

    const params = generatorParameters({
        enable_fuzz: true,
        enable_short_term: false,  // Skip learning steps for binary rating simplicity
        ...(customWeights ? { w: customWeights } : {})
    });

    cachedFSRS = fsrs(params);
    cachedWeights = customWeights || null;
    return cachedFSRS;
}

// ========================================
// Card State Helpers
// ========================================

/**
 * Convert ts-fsrs State enum to our string state
 */
function stateToString(state: State): FSRSCardState {
    switch (state) {
        case State.New: return 'New';
        case State.Learning: return 'Learning';
        case State.Review: return 'Review';
        case State.Relearning: return 'Relearning';
        default: return 'New';
    }
}

/**
 * Convert our string state to ts-fsrs State enum
 */
function stringToState(state: FSRSCardState): State {
    switch (state) {
        case 'New': return State.New;
        case 'Learning': return State.Learning;
        case 'Review': return State.Review;
        case 'Relearning': return State.Relearning;
        default: return State.New;
    }
}

/**
 * Convert FSRSState to ts-fsrs Card
 */
function stateToCard(fsrsState: FSRSState): Card {
    // Handle invalid/empty due date (e.g. from suspended cards) by defaulting to now
    let due = new Date(fsrsState.due);
    if (isNaN(due.getTime())) {
        due = new Date();
    }

    // Handle invalid last_review
    let last_review: Date | undefined;
    if (fsrsState.last_review) {
        last_review = new Date(fsrsState.last_review);
        if (isNaN(last_review.getTime())) {
            last_review = undefined;
        }
    }

    return {
        due,
        stability: fsrsState.stability,
        difficulty: fsrsState.difficulty,
        elapsed_days: fsrsState.elapsed_days,
        scheduled_days: fsrsState.scheduled_days,
        reps: fsrsState.reps,
        lapses: fsrsState.lapses,
        state: stringToState(fsrsState.state),
        last_review,
        learning_steps: 0,  // Not used with enable_short_term: false
    };
}

/**
 * Convert ts-fsrs Card to FSRSState
 */
function cardToState(card: Card): FSRSState {
    return {
        due: card.due.toISOString().split('T')[0],
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days: card.elapsed_days,
        scheduled_days: card.scheduled_days,
        reps: card.reps,
        lapses: card.lapses,
        state: stateToString(card.state),
        last_review: card.last_review ? card.last_review.toISOString().split('T')[0] : '',
    };
}

// ========================================
// Core FSRS Functions
// ========================================

/**
 * Create a new FSRS state for a fresh card
 */
export function createNewFSRSState(): FSRSState {
    const card = createEmptyCard(new Date());
    return cardToState(card);
}

/**
 * Process a review with binary rating
 * @param state Current FSRS state
 * @param remembered true = Good, false = Again
 * @param nodeId The MemoryNode ID for logging
 * @param customWeights Optional personalized weights
 * @returns Updated state and review log entry
 */
export function reviewCard(
    state: FSRSState,
    remembered: boolean,
    nodeId: string,
    customWeights?: number[] | null
): { newState: FSRSState; log: ReviewLogEntry } {
    const f = createFSRS(customWeights);
    const card = stateToCard(state);
    const now = new Date();

    // Map binary rating: Remembered → Good (3), Forgot → Again (1)
    const rating = remembered ? Rating.Good : Rating.Again;

    // Get scheduling result
    const result = f.next(card, now, rating);

    // Create log entry (snapshot of state BEFORE review)
    const log: ReviewLogEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        nodeId,
        timestamp: now.toISOString(),
        rating: remembered ? 'Good' : 'Again',
        state: state.state,
        stability: state.stability,
        difficulty: state.difficulty,
        elapsed_days: state.elapsed_days,
        scheduled_days: state.scheduled_days,
    };

    return {
        newState: cardToState(result.card),
        log,
    };
}

/**
 * Get preview of next due dates for each rating (for UI display)
 */
export function getSchedulingPreview(
    state: FSRSState,
    customWeights?: number[] | null
): { again: string; good: string } {
    const f = createFSRS(customWeights);
    const card = stateToCard(state);
    const now = new Date();

    const results = f.repeat(card, now);

    const formatDays = (dueDate: Date): string => {
        const days = Math.round((dueDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
        if (days <= 0) return 'Today';
        if (days === 1) return '1d';
        return `${days}d`;
    };

    return {
        again: formatDays(results[Rating.Again].card.due),
        good: formatDays(results[Rating.Good].card.due),
    };
}

// ========================================
// Manual State Overrides
// ========================================

type MaturityPreset = 'reset' | 'medium' | 'strong' | 'mastered';

/**
 * Create FSRS state for manual maturity presets
 * - Reset: New state (as if never seen)
 * - Medium: Review state, stability = 31 days
 * - Strong: Review state, stability = 120 days
 * - Mastered: Review state, stability = 365 days
 */
export function createPresetState(preset: MaturityPreset): FSRSState {
    const now = new Date();
    const defaultDifficulty = 5.0;

    switch (preset) {
        case 'reset':
            return createNewFSRSState();

        case 'medium': {
            const stability = 31;
            const dueDate = new Date(now);
            dueDate.setDate(dueDate.getDate() + stability);
            return {
                due: dueDate.toISOString().split('T')[0],
                stability,
                difficulty: defaultDifficulty,
                elapsed_days: 0,
                scheduled_days: stability,
                reps: 1,
                lapses: 0,
                state: 'Review',
                last_review: now.toISOString().split('T')[0],
            };
        }

        case 'strong': {
            const stability = 120;
            const dueDate = new Date(now);
            dueDate.setDate(dueDate.getDate() + stability);
            return {
                due: dueDate.toISOString().split('T')[0],
                stability,
                difficulty: defaultDifficulty,
                elapsed_days: 0,
                scheduled_days: stability,
                reps: 3,
                lapses: 0,
                state: 'Review',
                last_review: now.toISOString().split('T')[0],
            };
        }

        case 'mastered': {
            const stability = 365;
            const dueDate = new Date(now);
            dueDate.setDate(dueDate.getDate() + stability);
            return {
                due: dueDate.toISOString().split('T')[0],
                stability,
                difficulty: defaultDifficulty,
                elapsed_days: 0,
                scheduled_days: stability,
                reps: 5,
                lapses: 0,
                state: 'Review',
                last_review: now.toISOString().split('T')[0],
            };
        }

        default:
            return createNewFSRSState();
    }
}

// ========================================
// Bury (Postpone without algorithm)
// ========================================

/**
 * Bury a card: Set due date to tomorrow WITHOUT modifying FSRS parameters
 */
export function buryCard(state: FSRSState): FSRSState {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    return {
        ...state,
        due: tomorrow.toISOString().split('T')[0],
        // DO NOT modify stability, difficulty, or any other FSRS parameters
    };
}

// ========================================
// Unsuspend (Continue FSRS naturally)
// ========================================

/**
 * Unsuspend a card: Set to Relearning state and make due today
 * This continues the FSRS cycle naturally
 */
export function unsuspendCard(state: FSRSState): FSRSState {
    const today = new Date().toISOString().split('T')[0];

    return {
        ...state,
        state: 'Relearning',
        due: today,
        preSuspensionStability: state.stability,
        // Don't reset stability/difficulty - let FSRS handle naturally on next review
    };
}

// ========================================
// Retrievability Calculation
// ========================================

/**
 * Calculate memory retrievability (probability of recall)
 * FSRS formula: R = (1 + elapsed_days / (9 * stability)) ^ -1
 */
export function getRetrievability(stability: number, elapsedDays: number): number {
    if (stability <= 0) return 0;
    return Math.pow(1 + elapsedDays / (9 * stability), -1);
}

/**
 * Format retrievability as user-friendly text
 */
export function formatRecallChance(retrievability: number): string {
    const percent = Math.round(retrievability * 100);
    if (percent >= 90) return `${percent}% Fresh`;
    if (percent >= 70) return `${percent}% Good`;
    if (percent >= 50) return `${percent}% Fading`;
    return `${percent}% Due`;
}

// ========================================
// Maturity Level (for statistics)
// ========================================

export type MaturityLevel = 'new' | 'medium' | 'strong' | 'mastered';

/**
 * Get maturity level from stability (compatible with existing charts)
 */
export function getMaturityFromStability(stability: number): MaturityLevel {
    if (stability >= 90) return 'mastered';
    if (stability >= 30) return 'strong';
    if (stability >= 14) return 'medium';
    return 'new';
}

// ========================================
// SM-2 to FSRS Migration
// ========================================

interface SM2State {
    interval: number;
    repetition: number;
    easeFactor: number;
    dueDate: string;
    lastReview: string;
    relearningStep?: number;
    preSuspensionInterval?: number;
}

/**
 * Migrate SM-2 state to FSRS state
 */
export function migrateSM2ToFSRS(sm2: SM2State): FSRSState {
    // Map SM-2 interval directly to FSRS stability
    const stability = sm2.interval || 0;

    // Map easeFactor to difficulty (inverted scale)
    // SM-2 EF: 1.3 (hard) to 2.5+ (easy)
    // FSRS difficulty: 1 (easy) to 10 (hard)
    const difficulty = Math.max(1, Math.min(10, 10 - (sm2.easeFactor - 1.3) * 6));

    // Determine state
    let state: FSRSCardState = 'New';
    if (sm2.relearningStep) {
        state = 'Relearning';
    } else if (sm2.interval > 0) {
        state = 'Review';
    } else if (sm2.repetition > 0) {
        state = 'Learning';
    }

    return {
        due: sm2.dueDate,
        stability,
        difficulty: Math.round(difficulty * 10) / 10,
        elapsed_days: 0,
        scheduled_days: sm2.interval || 0,
        reps: sm2.repetition || 0,
        lapses: 0,
        state,
        last_review: sm2.lastReview || '',
        preSuspensionStability: sm2.preSuspensionInterval,
    };
}

/**
 * Check if a scheduler state is SM-2 format (needs migration)
 */
export function isSM2State(scheduler: any): boolean {
    return 'interval' in scheduler && !('stability' in scheduler);
}
