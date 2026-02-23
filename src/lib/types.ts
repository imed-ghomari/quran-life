// ========================================
// Core Types for Phased Qur'an Learning System
// ========================================

import { FSRSState } from './fsrs';

// Qur'anic part classifications used by the app
export type QuranPart = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; // 8 = All Quran
export type PartMindMapId = 0 | QuranPart; // 0 = Meta map, 1..7 = parts, 8 = all Quran
export const LEGACY_ALL_QURAN_PART = 5 as const; // pre-v2 "All Quran" id
export const ALL_QURAN_PART = 8 as const;
export const CORE_QURAN_PARTS = [1, 2, 3, 4, 5, 6, 7] as const;
export type CoreQuranPart = (typeof CORE_QURAN_PARTS)[number];

export const ACTIVE_PART_OPTIONS: ReadonlyArray<{ id: QuranPart; name: string }> = [
    { id: 1, name: 'Surah 1-5' },
    { id: 2, name: 'Surah 6-9' },
    { id: 3, name: 'Surah 10-24' },
    { id: 4, name: 'Surah 25-33' },
    { id: 5, name: 'Surah 34-49' },
    { id: 6, name: 'Surah 50-66' },
    { id: 7, name: 'Surah 67-114' },
    { id: ALL_QURAN_PART, name: 'All Quran' },
];

export const PART_NAMES: Record<QuranPart, { arabic: string; english: string; surahs: [number, number] }> = {
    1: { arabic: "السور 1-5", english: "Surah 1-5", surahs: [1, 5] },
    2: { arabic: "السور 6-9", english: "Surah 6-9", surahs: [6, 9] },
    3: { arabic: "السور 10-24", english: "Surah 10-24", surahs: [10, 24] },
    4: { arabic: "السور 25-33", english: "Surah 25-33", surahs: [25, 33] },
    5: { arabic: "السور 34-49", english: "Surah 34-49", surahs: [34, 49] },
    6: { arabic: "السور 50-66", english: "Surah 50-66", surahs: [50, 66] },
    7: { arabic: "السور 67-114", english: "Surah 67-114", surahs: [67, 114] },
    8: { arabic: "القرآن الكريم", english: "All Quran", surahs: [1, 114] },
};

// Surah metadata
export interface Surah {
    id: number;          // 1-114
    name: string;        // English transliteration
    arabicName: string;  // Arabic
    verseCount: number;
    part: CoreQuranPart;
}

// Verse (reference data, never scheduled)
export interface Verse {
    surahId: number;
    ayahId: number;
    text: string;
}

// VerseSegment status (phase-aware)
export type VerseSegmentStatus =
    | 'inactive'           // Not yet in scope
    | 'listening'          // Phase 1: passive exposure
    | 'ready_to_memorize'  // Listening mature, mindmap complete
    | 'memorizing'         // Phase 2: active recall
    | 'maintained';        // Phase 3: long-term retention

// VerseSegment (learning unit)
export interface VerseSegment {
    id: string;                    // `${surahId}-${startVerse}-${endVerse}`
    surahId: number;
    startVerse: number;
    endVerse: number;
    status: VerseSegmentStatus;
}

// SM-2 Scheduler State
export interface SM2State {
    interval: number;      // Days until next review
    repetition: number;    // Number of successful reviews
    easeFactor: number;    // 1.3 - 2.5+
    dueDate: string;       // ISO date (YYYY-MM-DD)
    lastReview: string;    // ISO date
}

// MemoryNode types
export type MemoryNodeType = 'verse_segment' | 'mindmap' | 'part_mindmap';

// MemoryNode (ONLY thing scheduled by SM-2/FSRS)
export interface MemoryNode {
    id: string;
    type: MemoryNodeType;
    surahId?: number; // Optional context
    partId?: PartMindMapId; // Optional context
    startVerse?: number; // Optional context
    endVerse?: number; // Optional context
    targetId?: string;      // Legacy: VerseSegment.id
    scheduler: SM2State | FSRSState;
    createdAt?: string;
}

export interface AudioSettings {
    selectedReciterId: string;
    playbackSpeed?: PlaybackSpeed;
    playbackState?: {
        reciterId?: string;
        surahId: number;
        ayahId: number;
        timestamp: number;
    };
    updatedAt: string;
}

export interface AppSettings {
    id?: string;
    completionDays: number;
    activePart: QuranPart;
    partSystemVersion?: number;
    learnedVerses: { [surahId: string]: number[] };
    skippedSurahs?: number[];
    todoDefaultFilter?: 'all' | 'maintenance' | 'construction';
    reviewSortOrder?: 'surah_grouped' | 'due_date' | 'type_grouped';
    completeExitBehavior?: 'mindmap_only' | 'mindmap_and_verses';
    kanbanSortOrder?: 'type_then_number' | 'number_only' | 'manual';
    dailyPortionMode?: 'audio' | 'reading';
    dailyReadingStyle?: 'line_by_line' | 'paragraph';
    todayDefaultMode?: 'daily' | 'review';
    theme?: 'light' | 'dark' | 'system';
    accentTheme?: 'default' | 'dracula' | 'nord' | 'catppuccin' | 'solarized' | 'tokyo-night';
    updatedAt?: string;
    isOnboardingComplete?: boolean;
    kanbanColumns?: Record<string, string[]>;
    suspendedVerseGroupsAcknowledged?: Record<string, string>;
    audioSettings?: AudioSettings;
    userId?: string;
    lastSyncedAt?: string;
}

// Anchor (maps meaning to verse ranges)
export interface Anchor {
    id: string;
    surahId: number;
    startVerse: number;
    endVerse: number;
    label: string;          // Short semantic phrase
}

// MindMap (scaffold, NOT scheduled)
export interface MindMap {
    surahId: number;
    imageUrl: string | null;  // Uploaded screenshot
    imageUrlDark?: string | null; // Dark mode screenshot
    anchors: Anchor[]; // Assuming VerseAnchor is a typo and should be Anchor based on existing Anchor interface
    isComplete: boolean;
    tldrawSnapshot?: any; // JSON snapshot of the whiteboard state
    updatedAt?: string;
    storagePath?: string;
    _isRemote?: boolean;
    deletedAt?: string;
    source?: 'premade' | 'custom';
    premadeId?: string;
    premadeImportedAt?: string;
    premadeEdited?: boolean;
}

export interface PartMindMap {
    partId: PartMindMapId; // 0 = meta map, 1..7 are parts, 8 is all Quran
    imageUrl: string | null;
    imageUrlDark?: string | null;
    description: string;
    isComplete: boolean;
    tldrawSnapshot?: any;
    updatedAt?: string;
    storagePath?: string;
    _isRemote?: boolean;
    deletedAt?: string;
    source?: 'premade' | 'custom';
    premadeId?: string;
    premadeImportedAt?: string;
    premadeEdited?: boolean;
}

// ListeningStats (per-surah, no scheduler)
export interface ListeningStats {
    surahId: number;
    totalMinutes: number;
    rotationCount: number;
    lastListened: string;   // ISO date
}

// LearningScope (control layer)
export interface LearningScope {
    activePart: QuranPart | null;           // Current listening focus
    activeSurahs: number[];                 // Surahs in active scope
    enabledPhases: VerseSegmentStatus[];    // Which phases are enabled
}

// RecitationLog entry
export interface StallPoint {
    verseId: number;
    timestamp: string;
}

// RecitationLog (diagnostic, no scheduling effects)
export interface RecitationLog {
    id: string;
    surahId: number;
    startedAt: string;
    stallPoints: StallPoint[];
    completed: boolean;
}

// Playback speed options
export type PlaybackSpeed = 0.75 | 1 | 1.25 | 1.5 | 2;

// Audio player state
export interface AudioPlayerState {
    isPlaying: boolean;
    currentVerseIndex: number;
    speed: PlaybackSpeed;
    isLooping: boolean;
}

// Complete application state
export interface AppState {
    surahs: Surah[];
    verses: Verse[];
    segments: VerseSegment[];
    memoryNodes: MemoryNode[];
    mindMaps: Record<number, MindMap>;        // keyed by surahId
    listeningStats: Record<number, ListeningStats>;  // keyed by surahId
    recitationLogs: RecitationLog[];
    learningScope: LearningScope;
}

// Maturity threshold (minutes of listening needed)
export const LISTENING_MATURITY_MULTIPLIER = 2; // 2 min per verse

export function getMaturityThreshold(verseCount: number): number {
    return verseCount * LISTENING_MATURITY_MULTIPLIER;
}

// Audio file path helper
export function getAudioPath(surahId: number, ayahId: number): string {
    const surahStr = surahId.toString().padStart(3, '0');
    const ayahStr = ayahId.toString().padStart(3, '0');
    return `/audio/${surahStr}${ayahStr}.mp3`;
}

// MemoryNode Utility Helpers
export function getNodeStability(node: MemoryNode): number {
    if (!node.scheduler) return 0;
    return (node.scheduler as any).stability || 0;
}

export function getNodeDifficulty(node: MemoryNode): number {
    if (!node.scheduler) return 0;
    return (node.scheduler as any).difficulty || 0;
}

export function getNodeReps(node: MemoryNode): number {
    if (!node.scheduler) return 0;
    return (node.scheduler as any).reps || (node.scheduler as any).repetition || 0;
}

export function getNodeDueDate(node: MemoryNode): string | null {
    if (!node.scheduler) return null;
    return (node.scheduler as any).due || (node.scheduler as any).dueDate || null;
}

export function hasNodeBeenReviewed(scheduler: any): boolean {
    if (!scheduler) return false;
    if ('reps' in scheduler) return scheduler.reps > 0;
    if ('repetition' in scheduler) return scheduler.repetition > 0;
    return false;
}

// VerseSegment ID helper
export function createSegmentId(surahId: number, startVerse: number, endVerse: number): string {
    return `${surahId}-${startVerse}-${endVerse}`;
}

// Parse segment ID
export function parseSegmentId(id: string): { surahId: number; startVerse: number; endVerse: number } {
    const [surahId, startVerse, endVerse] = id.split('-').map(Number);
    return { surahId, startVerse, endVerse };
}

// Helper for Maturity Updates
export function getMaturityState(level: 'reset' | 'medium' | 'strong' | 'mastered'): Partial<FSRSState> {
    const now = new Date().toISOString();
    switch (level) {
        case 'reset':
             return {
                due: now,
                stability: 0,
                difficulty: 0,
                elapsed_days: 0,
                scheduled_days: 0,
                reps: 0,
                lapses: 0,
                state: 'New',
                last_review: now
            };
        case 'medium':
            return {
                due: new Date(Date.now() + 14 * 86400000).toISOString(),
                stability: 14,
                difficulty: 5,
                reps: 3,
                state: 'Review',
                scheduled_days: 14,
                last_review: now
            };
        case 'strong':
             return {
                due: new Date(Date.now() + 30 * 86400000).toISOString(),
                stability: 30,
                difficulty: 5,
                reps: 5,
                state: 'Review',
                scheduled_days: 30,
                last_review: now
            };
        case 'mastered':
             return {
                due: new Date(Date.now() + 90 * 86400000).toISOString(),
                stability: 90,
                difficulty: 5,
                reps: 8,
                state: 'Review',
                scheduled_days: 90,
                last_review: now
            };
    }
    return {};
}

// Mutashabihat Types
export interface MutashabihatDecision {
    id: string; // absoluteAyah or absoluteAyah-phraseId
    phraseId: string;
    status: 'confirmed' | 'ignored' | 'pending' | 'solved_mindmap' | 'solved_note';
    confirmedAt?: string;
    notes?: string;
    userId?: string;
    timestamp?: string;
}

export interface CustomMutashabih {
    id: string;
    verseId: string; // surah:ayah
    phrase?: string;
    targetVerseId: string;
    surahId: number;
    ayahId: number;
    targetSurahId: number;
    targetAyahId: number;
    notes?: string;
    createdAt: string;
    status?: 'confirmed' | 'ignored' | 'pending' | 'solved_mindmap' | 'solved_note';
    userId?: string;
}
