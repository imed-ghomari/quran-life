// ========================================
// Core Types for Phased Qur'an Learning System
// ========================================

// Traditional Qur'anic Part Classifications
export type QuranPart = 1 | 2 | 3 | 4 | 5; // 5 = All Quran

export const PART_NAMES: Record<QuranPart, { arabic: string; english: string; surahs: [number, number] }> = {
    1: { arabic: "السبع الطوال", english: "As-Sab'ut-Tiwal (The Seven Long Ones)", surahs: [1, 9] },
    2: { arabic: "المئون", english: "Al-Mi'un (The Hundreds)", surahs: [10, 32] },
    3: { arabic: "المثاني", english: "Al-Mathani (The Oft-Repeated)", surahs: [33, 49] },
    4: { arabic: "المفصل", english: "Al-Mufassal (The Clearly Divided)", surahs: [50, 114] },
    5: { arabic: "القرآن الكريم", english: "All Quran", surahs: [1, 114] },
};

// Surah metadata
export interface Surah {
    id: number;          // 1-114
    name: string;        // English transliteration
    arabicName: string;  // Arabic
    verseCount: number;
    part: QuranPart;
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
export type MemoryNodeType = 'verse_segment' | 'transition';

// MemoryNode (ONLY thing scheduled by SM-2)
export interface MemoryNode {
    id: string;
    type: MemoryNodeType;
    targetId: string;      // VerseSegment.id or Transition.id
    scheduler: SM2State;
    createdAt: string;
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
    anchors: Anchor[]; // Assuming VerseAnchor is a typo and should be Anchor based on existing Anchor interface
    isComplete: boolean;
    tldrawSnapshot?: any; // JSON snapshot of the whiteboard state
}

export interface PartMindMap {
    partId: QuranPart; // 1 | 2 | 3 | 4
    imageUrl: string | null;
    description: string;
    isComplete: boolean;
    tldrawSnapshot?: any;
}

// Transition (optional, for continuity issues)
export interface Transition {
    id: string;
    fromSegmentId: string;
    toSegmentId: string;
    cue: string;            // Phonetic or semantic anchor
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
    transitions: Transition[];
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

// VerseSegment ID helper
export function createSegmentId(surahId: number, startVerse: number, endVerse: number): string {
    return `${surahId}-${startVerse}-${endVerse}`;
}

// Parse segment ID
export function parseSegmentId(id: string): { surahId: number; startVerse: number; endVerse: number } {
    const [surahId, startVerse, endVerse] = id.split('-').map(Number);
    return { surahId, startVerse, endVerse };
}
