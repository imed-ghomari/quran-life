// ========================================
// Storage Service - With Part Mindmaps & Review Errors
// ========================================

import { SURAHS } from './quranData';
import { QuranPart, getMaturityThreshold } from './types';
import { get, set, createStore } from 'idb-keyval';

// ========================================
// Storage Engine Migration & Helpers
// ========================================

const customStore = typeof window !== 'undefined' ? createStore('quran-app-db', 'quran-app-store') : undefined;

/**
 * Migration helper to move data from localStorage to IndexedDB once.
 */
async function migrateFromLocalStorage() {
    if (typeof window === 'undefined' || !customStore) return;
    
    const migrationFlag = 'quran-app-migrated-to-idb';
    if (localStorage.getItem(migrationFlag)) return;

    for (const key of Object.values(STORAGE_KEYS)) {
        const value = localStorage.getItem(key);
        if (value) {
            try {
                await set(key, JSON.parse(value), customStore);
            } catch (e) {
                console.error(`Migration failed for key ${key}:`, e);
            }
        }
    }
    
    localStorage.setItem(migrationFlag, 'true');
    console.log('Successfully migrated data from localStorage to IndexedDB');
}

// Initial migration trigger
if (typeof window !== 'undefined') {
    migrateFromLocalStorage();
}

/**
 * Global cache to keep synchronous access for existing UI while persisting asynchronously.
 * This ensures the UI remains snappy while data is safely stored in IndexedDB.
 */
const storageCache: { [key: string]: any } = {};

async function loadIntoCache() {
    if (typeof window === 'undefined' || !customStore) return;
    for (const key of Object.values(STORAGE_KEYS)) {
        storageCache[key] = await get(key, customStore);
    }
}

// Start loading cache
if (typeof window !== 'undefined') {
    loadIntoCache();
}

function getFromCache<T>(key: string, defaultValue: T): T {
    if (typeof window === 'undefined') return defaultValue;
    const cached = storageCache[key];
    return cached !== undefined ? cached : defaultValue;
}

function saveToCacheAndStore(key: string, value: any) {
    storageCache[key] = value;
    if (typeof window !== 'undefined' && customStore) {
        set(key, value, customStore).catch(err => console.error(`Failed to persist ${key}:`, err));
        // Also update localStorage for immediate sync awareness across tabs
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {}
    }
}

const STORAGE_KEYS = {
    SETTINGS: 'quran-app-settings',
    MEMORY_NODES: 'quran-app-memory-nodes',
    MINDMAPS: 'quran-app-mindmaps',
    PART_MINDMAPS: 'quran-app-part-mindmaps',
    LISTENING_PROGRESS: 'quran-app-listening-progress',
    LISTENING_STATS: 'quran-app-listening-stats',
    CYCLE_START: 'quran-app-cycle-start',
    LISTENING_COMPLETE: 'quran-app-listening-complete',
    REVIEW_ERRORS: 'quran-app-review-errors',
    MUTASHABIHAT_DECISIONS: 'quran-app-mutashabihat-decisions',
    CUSTOM_MUTASHABIHAT: 'quran-app-custom-mutashabihat',
};

// ========================================
// Settings
// ========================================

export interface AppSettings {
    completionDays: number;
    activePart: QuranPart;
    learnedVerses: { [surahId: string]: number[] };
    skippedSurahs?: number[];
    lastSyncedAt?: string;
}

const DEFAULT_SETTINGS: AppSettings = {
    completionDays: 30,
    activePart: 4,
    learnedVerses: {},
    skippedSurahs: [],
};

export function getSettings(): AppSettings {
    return getFromCache(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
}

export function saveSettings(settings: AppSettings): void {
    saveToCacheAndStore(STORAGE_KEYS.SETTINGS, settings);
}

export function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    const settings = getSettings();
    settings[key] = value;
    saveSettings(settings);
}

export function isSurahSkipped(surahId: number): boolean {
    const settings = getSettings();
    return settings.skippedSurahs?.includes(surahId) || false;
}

export function toggleSurahSkipped(surahId: number): void {
    const settings = getSettings();
    const current = new Set(settings.skippedSurahs || []);
    if (current.has(surahId)) {
        current.delete(surahId);
    } else {
        current.add(surahId);
        // Also remove any learned data for this surah
        if (settings.learnedVerses[surahId]) {
            delete settings.learnedVerses[surahId];
        }
        pruneSurahArtifacts(surahId);
    }
    settings.skippedSurahs = Array.from(current).sort((a, b) => a - b);
    saveSettings(settings);
}

// ========================================
// Learned Verses Helpers
// ========================================

export function isVerseLearned(surahId: number, ayahId: number): boolean {
    const settings = getSettings();
    return settings.learnedVerses[surahId]?.includes(ayahId) || false;
}

export function toggleVerseLearned(surahId: number, ayahId: number): void {
    const settings = getSettings();
    const surahKey = surahId.toString();
    const current = settings.learnedVerses[surahKey] || [];

    if (current.includes(ayahId)) {
        settings.learnedVerses[surahKey] = current.filter(v => v !== ayahId);
        if (settings.learnedVerses[surahKey].length === 0) {
            delete settings.learnedVerses[surahKey];
        }
    } else {
        settings.learnedVerses[surahKey] = [...current, ayahId].sort((a, b) => a - b);
    }

    saveSettings(settings);
    syncMemoryNodesWithLearned();
}

export function toggleSurahLearned(surahId: number): void {
    const settings = getSettings();
    const surah = SURAHS.find(s => s.id === surahId);
    if (!surah) return;

    const surahKey = surahId.toString();
    const current = settings.learnedVerses[surahKey] || [];

    if (current.length === surah.verseCount) {
        delete settings.learnedVerses[surahKey];
    } else {
        settings.learnedVerses[surahKey] = Array.from({ length: surah.verseCount }, (_, i) => i + 1);
    }

    saveSettings(settings);
    syncMemoryNodesWithLearned();
}

export function getSurahLearnedStatus(surahId: number): { learned: number; total: number } {
    const settings = getSettings();
    const surah = SURAHS.find(s => s.id === surahId);
    if (!surah) return { learned: 0, total: 0 };

    const learned = settings.learnedVerses[surahId]?.length || 0;
    return { learned, total: surah.verseCount };
}

export function getTotalLearnedVerses(): number {
    const settings = getSettings();
    return Object.values(settings.learnedVerses).reduce((sum, verses) => sum + verses.length, 0);
}

export function getLearnedVersesInPart(part: QuranPart): { surahId: number; ayahId: number }[] {
    const settings = getSettings();
    const result: { surahId: number; ayahId: number }[] = [];

    SURAHS.filter(s => s.part === part).forEach(surah => {
        const verses = settings.learnedVerses[surah.id] || [];
        verses.forEach(ayahId => {
            result.push({ surahId: surah.id, ayahId });
        });
    });

    return result;
}

// ========================================
// Memory Nodes (SM-2)
// ========================================

export interface SM2State {
    interval: number;
    repetition: number;
    easeFactor: number;
    dueDate: string;
    lastReview: string;
}

export interface MemoryNode {
    id: string;
    type: 'verse' | 'mindmap' | 'part_mindmap';
    surahId?: number;
    partId?: QuranPart;
    startVerse?: number;
    endVerse?: number;
    scheduler: SM2State;
}

export function getMemoryNodes(): MemoryNode[] {
    return getFromCache(STORAGE_KEYS.MEMORY_NODES, []);
}

export function saveMemoryNodes(nodes: MemoryNode[]): void {
    saveToCacheAndStore(STORAGE_KEYS.MEMORY_NODES, nodes);
}

export function getDueNodes(): MemoryNode[] {
    const today = new Date().toISOString().split('T')[0];
    const settings = getSettings();
    const skips = new Set(settings.skippedSurahs || []);
    const suspended = getSuspendedAnchors();

    return getMemoryNodes()
        .filter(n => n.scheduler.dueDate <= today)
        .filter(n => !n.surahId || !skips.has(n.surahId))
        .filter(n => !isNodeSuspended(n, suspended));
}

export function updateMemoryNode(node: MemoryNode): void {
    const nodes = getMemoryNodes();
    const index = nodes.findIndex(n => n.id === node.id);
    if (index >= 0) {
        nodes[index] = node;
    } else {
        nodes.push(node);
    }
    saveMemoryNodes(nodes);
}

function createNewScheduler(): SM2State {
    const today = new Date().toISOString().split('T')[0];
    return {
        interval: 0,
        repetition: 0,
        easeFactor: 2.5,
        dueDate: today,
        lastReview: '',
    };
}

// Sync memory nodes with learned verses - create nodes for learned verses
export function syncMemoryNodesWithLearned(forceFullReset: boolean = false): void {
    const settings = getSettings();
    const nodes = forceFullReset ? [] : getMemoryNodes();

    // Group verses into segments of 5
    Object.entries(settings.learnedVerses).forEach(([surahIdStr, verses]) => {
        const surahId = parseInt(surahIdStr);
        if (verses.length === 0) return;

        // Create segments of 5 verses
        const sortedVerses = [...verses].sort((a, b) => a - b);
        let segmentStart = sortedVerses[0];
        let segmentEnd = segmentStart;

        for (let i = 1; i <= sortedVerses.length; i++) {
            const isContiguous = i < sortedVerses.length && sortedVerses[i] === segmentEnd + 1;
            const segmentSize = segmentEnd - segmentStart + 1;

            if (!isContiguous || segmentSize >= 5 || i === sortedVerses.length) {
                // Create node for this segment if it doesn't exist
                const nodeId = `verse-${surahId}-${segmentStart}-${segmentEnd}`;
                const exists = nodes.some(n => n.id === nodeId);
                
                if (!exists || forceFullReset) {
                    const newNode: MemoryNode = {
                        id: nodeId,
                        type: 'verse',
                        surahId,
                        startVerse: segmentStart,
                        endVerse: segmentEnd,
                        scheduler: createNewScheduler(),
                    };

                    if (forceFullReset) {
                        nodes.push(newNode);
                    } else if (!exists) {
                        nodes.push(newNode);
                    }
                }

                if (i < sortedVerses.length) {
                    segmentStart = sortedVerses[i];
                    segmentEnd = segmentStart;
                }
            } else {
                segmentEnd = sortedVerses[i];
            }
        }
    });

    if (forceFullReset) {
        // Also sync mindmaps
        const mindmaps = getMindMaps();
        Object.values(mindmaps).forEach(mm => {
            if (mm.isComplete) {
                nodes.push({
                    id: `mindmap-${mm.surahId}`,
                    type: 'mindmap',
                    surahId: mm.surahId,
                    scheduler: createNewScheduler(),
                });
            }
        });

        // Also sync part mindmaps
        const partMindmaps = getPartMindMaps();
        Object.values(partMindmaps).forEach(pmm => {
            if (pmm.isComplete) {
                nodes.push({
                    id: `part-mindmap-${pmm.partId}`,
                    type: 'part_mindmap',
                    partId: pmm.partId,
                    scheduler: createNewScheduler(),
                });
            }
        });
    }

    saveMemoryNodes(nodes);
}

// SM-2 Algorithm
export function sm2(grade: number, state: SM2State): SM2State {
    let { interval, repetition, easeFactor } = state;

    if (grade < 3) {
        repetition = 0;
        interval = 1;
    } else {
        if (repetition === 0) interval = 1;
        else if (repetition === 1) interval = 6;
        else interval = Math.round(interval * easeFactor);
        repetition++;
    }

    easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + interval);

    return {
        interval,
        repetition,
        easeFactor: Math.round(easeFactor * 100) / 100,
        dueDate: dueDate.toISOString().split('T')[0],
        lastReview: new Date().toISOString().split('T')[0],
    };
}

export function postponeNode(node: MemoryNode): MemoryNode {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return {
        ...node,
        scheduler: {
            ...node.scheduler,
            dueDate: tomorrow.toISOString().split('T')[0],
            lastReview: new Date().toISOString().split('T')[0],
        }
    };
}

// ========================================
// Mindmaps (per surah)
// ========================================

export interface Anchor {
    id: string;
    startVerse: number;
    endVerse: number;
    label: string;
}

export interface MindMap {
    surahId: number;
    imageUrl: string | null;
    anchors: Anchor[];
    isComplete: boolean;
}

export function getMindMaps(): { [surahId: string]: MindMap } {
    return getFromCache(STORAGE_KEYS.MINDMAPS, {});
}

export function getMindMap(surahId: number): MindMap {
    const maps = getMindMaps();
    return maps[surahId] || { surahId, imageUrl: null, anchors: [], isComplete: false };
}

export function saveMindMap(mindmap: MindMap): void {
    const maps = getMindMaps();
    maps[mindmap.surahId] = mindmap;
    saveToCacheAndStore(STORAGE_KEYS.MINDMAPS, maps);

    // Create/update memory node for mindmap if complete
    if (mindmap.isComplete) {
        const nodes = getMemoryNodes();
        const nodeId = `mindmap-${mindmap.surahId}`;
        const exists = nodes.some(n => n.id === nodeId);
        if (!exists) {
            nodes.push({
                id: nodeId,
                type: 'mindmap',
                surahId: mindmap.surahId,
                scheduler: createNewScheduler(),
            });
            saveMemoryNodes(nodes);
        }
    }
}

// ========================================
// Part Mindmaps (inter-surah connections)
// ========================================

export interface PartMindMap {
    partId: QuranPart;
    imageUrl: string | null;
    description: string;
    isComplete: boolean;
}

export function getPartMindMaps(): { [partId: string]: PartMindMap } {
    return getFromCache(STORAGE_KEYS.PART_MINDMAPS, {});
}

export function getPartMindMap(partId: QuranPart): PartMindMap {
    const maps = getPartMindMaps();
    return maps[partId] || { partId, imageUrl: null, description: '', isComplete: false };
}

export function savePartMindMap(mindmap: PartMindMap): void {
    const maps = getPartMindMaps();
    maps[mindmap.partId] = mindmap;
    saveToCacheAndStore(STORAGE_KEYS.PART_MINDMAPS, maps);

    // Create memory node for part mindmap if complete
    if (mindmap.isComplete) {
        const nodes = getMemoryNodes();
        const nodeId = `part-mindmap-${mindmap.partId}`;
        const exists = nodes.some(n => n.id === nodeId);
        if (!exists) {
            nodes.push({
                id: nodeId,
                type: 'part_mindmap',
                partId: mindmap.partId,
                scheduler: createNewScheduler(),
            });
            saveMemoryNodes(nodes);
        }
    }
}

// ========================================
// Listening Stats
// ========================================

export interface ListeningStats {
    surahId: number;
    totalMinutes: number;
    lastListened: string;
}

export interface ListeningProgress {
    partId: QuranPart;
    currentVerseIndex: number;
}

export function getListeningProgress(partId: QuranPart): ListeningProgress {
    const map = getFromCache<Record<string, ListeningProgress>>(STORAGE_KEYS.LISTENING_PROGRESS, {});
    return map[partId] || { partId, currentVerseIndex: 0 };
}

export function saveListeningProgress(partId: QuranPart, currentVerseIndex: number): void {
    const map = getFromCache<Record<string, ListeningProgress>>(STORAGE_KEYS.LISTENING_PROGRESS, {});
    map[partId] = { partId, currentVerseIndex };
    saveToCacheAndStore(STORAGE_KEYS.LISTENING_PROGRESS, map);
}

export function getListeningStats(): { [surahId: string]: ListeningStats } {
    return getFromCache(STORAGE_KEYS.LISTENING_STATS, {});
}

export function getListeningStatsForSurah(surahId: number): ListeningStats {
    const stats = getListeningStats();
    return stats[surahId] || { surahId, totalMinutes: 0, lastListened: '' };
}

export function addListeningTime(surahId: number, minutes: number): void {
    const stats = getListeningStats();
    const current = stats[surahId] || { surahId, totalMinutes: 0, lastListened: '' };
    current.totalMinutes += minutes;
    current.lastListened = new Date().toISOString();
    stats[surahId] = current;
    saveToCacheAndStore(STORAGE_KEYS.LISTENING_STATS, stats);
}

// ========================================
// Listening Complete Tracking
// ========================================

export function getListeningCompletedToday(): boolean {
    const stored = getFromCache<string | null>(STORAGE_KEYS.LISTENING_COMPLETE, null);
    if (!stored) return false;
    const today = new Date().toISOString().split('T')[0];
    return stored === today;
}

export function markListeningComplete(): void {
    const today = new Date().toISOString().split('T')[0];
    saveToCacheAndStore(STORAGE_KEYS.LISTENING_COMPLETE, today);
    // Force a cycle update if needed
    getCycleStart();
}

// ========================================
// Review Errors Tracking
// ========================================

export interface ReviewError {
    id: string;
    timestamp: string;
    nodeId: string;
    nodeType: 'verse' | 'mindmap' | 'part_mindmap';
    surahId?: number;
    partId?: QuranPart;
    startVerse?: number;
    endVerse?: number;
    grade: number;
    anchorLabel?: string;
    anchorId?: string;
    absoluteAyah?: number;
}

export function getReviewErrors(): ReviewError[] {
    return getFromCache(STORAGE_KEYS.REVIEW_ERRORS, []);
}

export function saveReviewError(error: ReviewError): void {
    const errors = getReviewErrors();
    errors.push(error);
    // Keep only last 100 errors
    const trimmed = errors.slice(-100);
    saveToCacheAndStore(STORAGE_KEYS.REVIEW_ERRORS, trimmed);
}

export function removeReviewError(id: string): void {
    const errors = getReviewErrors();
    const remaining = errors.filter(e => e.id !== id);
    saveToCacheAndStore(STORAGE_KEYS.REVIEW_ERRORS, remaining);
}

export function getErrorsByAnchor(): { label: string; count: number; surahId?: number; anchorId?: string; startVerse?: number; endVerse?: number }[] {
    const errors = getReviewErrors();
    const mindmaps = getMindMaps();
    const anchorCounts: { [key: string]: { label: string; count: number; surahId?: number; anchorId?: string; startVerse?: number; endVerse?: number } } = {};

    errors.filter(e => e.grade < 3).forEach(error => {
        if (error.surahId && error.startVerse && error.endVerse) {
            const mindmap = mindmaps[error.surahId];
            if (mindmap) {
                const anchor = mindmap.anchors.find(a =>
                    a.startVerse <= error.startVerse! && a.endVerse >= error.endVerse!
                );
                if (anchor) {
                    const key = `${error.surahId}-${anchor.id}`;
                    if (!anchorCounts[key]) {
                        anchorCounts[key] = { label: anchor.label, count: 0, surahId: error.surahId, anchorId: anchor.id, startVerse: anchor.startVerse, endVerse: anchor.endVerse };
                    }
                    anchorCounts[key].count++;
                }
            }
        }
    });

    return Object.values(anchorCounts).sort((a, b) => b.count - a.count);
}

// ========================================
// Cycle Management
// ========================================

export function getCycleStart(): string {
    let stored = getFromCache<string | null>(STORAGE_KEYS.CYCLE_START, null);
    if (!stored) {
        stored = new Date().toISOString().split('T')[0];
        saveToCacheAndStore(STORAGE_KEYS.CYCLE_START, stored);
    }
    return stored;
}

export function setCycleStart(date: string): void {
    saveToCacheAndStore(STORAGE_KEYS.CYCLE_START, date);
}

export function getCurrentDayInCycle(): number {
    const start = new Date(getCycleStart());
    const today = new Date();
    const diff = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const settings = getSettings();
    return diff % settings.completionDays;
}

// ========================================
// Backup & Restore
// ========================================

// Maturity Levels
export type MaturityLevel = 'reset' | 'medium' | 'strong' | 'mastered';

export function setSurahMaturity(surahId: number, level: MaturityLevel): void {
    const nodes = getMemoryNodes();
    const now = new Date();

    const updatedNodes = nodes.map(node => {
        if (node.surahId !== surahId || (node.type !== 'verse' && node.type !== 'mindmap')) {
            return node;
        }

        let interval = 1;
        let efactor = 2.5;

        switch (level) {
            case 'reset':
                interval = 1;
                break;
            case 'medium':
                interval = 14;
                break;
            case 'strong':
                interval = 30;
                break;
            case 'mastered':
                interval = 90;
                break;
        }

        // Add jitter: +/- 20%
        if (level !== 'reset') {
            const jitter = interval * 0.2;
            interval = Math.round(interval + (Math.random() * jitter * 2 - jitter));
        }

        const dueDate = new Date(now);
        dueDate.setDate(dueDate.getDate() + interval);

        return {
            ...node,
            scheduler: {
                ...node.scheduler,
                interval,
                easeFactor: efactor, // Corrected property name from 'efactor' to 'easeFactor'
                dueDate: dueDate.toISOString(),
            }
        };
    });

    saveMemoryNodes(updatedNodes);
}

export function resetAllMaturity(): void {
    // 1. Clear all memory nodes
    saveToCacheAndStore(STORAGE_KEYS.MEMORY_NODES, []);
    
    // 2. Clear all review errors
    saveToCacheAndStore(STORAGE_KEYS.REVIEW_ERRORS, []);

    // 3. Regenerate nodes based on currently learned surahs and completed mindmaps
    syncMemoryNodesWithLearned(true);
}

export interface AnchorIssue {
    anchorId: string;
    label: string;
    surahId: number;
    count: number;
    startVerse?: number;
    endVerse?: number;
}

export function getSuspendedAnchors(threshold: number = 3): AnchorIssue[] {
    return getErrorsByAnchor()
        .filter(e => e.count >= threshold && e.surahId && e.anchorId)
        .map(e => ({
            anchorId: e.anchorId!,
            label: e.label,
            surahId: e.surahId!,
            count: e.count,
            startVerse: e.startVerse,
            endVerse: e.endVerse,
        }));
}

export function clearAnchorIssues(surahId: number, anchorId: string): void {
    const remaining = getReviewErrors().filter(err => !(err.surahId === surahId && err.anchorId === anchorId));
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.REVIEW_ERRORS, JSON.stringify(remaining));
}

export function findAnchorForRange(surahId: number, startVerse?: number, endVerse?: number): Anchor | undefined {
    const mindmap = getMindMap(surahId);
    if (!startVerse || !endVerse) return undefined;
    return mindmap.anchors.find(a => a.startVerse <= startVerse && a.endVerse >= endVerse);
}

export interface MutashabihatDecision {
    status: 'pending' | 'ignored' | 'solved_mindmap' | 'solved_note';
    note?: string;
    confirmedAt?: string;
}

export interface CustomMutashabih {
    id: string;
    verse1: { surahId: number; ayahId: number };
    verse2: { surahId: number; ayahId: number };
    status: 'pending' | 'ignored' | 'solved_mindmap' | 'solved_note';
    note?: string;
    createdAt: string;
    isCustom: true; // Distinction for development purposes
}

export function getCustomMutashabihat(): CustomMutashabih[] {
    return getFromCache(STORAGE_KEYS.CUSTOM_MUTASHABIHAT, []);
}

export function saveCustomMutashabih(mut: CustomMutashabih): void {
    const all = getCustomMutashabihat();
    const existingIdx = all.findIndex(m => m.id === mut.id);
    if (existingIdx >= 0) {
        all[existingIdx] = mut;
    } else {
        all.push(mut);
    }
    saveToCacheAndStore(STORAGE_KEYS.CUSTOM_MUTASHABIHAT, all);
}

export function deleteCustomMutashabih(id: string): void {
    const all = getCustomMutashabihat().filter(m => m.id !== id);
    saveToCacheAndStore(STORAGE_KEYS.CUSTOM_MUTASHABIHAT, all);
}

export function getMutashabihatDecisions(): Record<string, MutashabihatDecision> {
    return getFromCache(STORAGE_KEYS.MUTASHABIHAT_DECISIONS, {});
}

export function setMutashabihatDecision(absoluteAyah: number, decision: MutashabihatDecision, phraseId?: string): void {
    const decisions = getMutashabihatDecisions();
    const key = phraseId ? `${absoluteAyah}-${phraseId}` : absoluteAyah.toString();
    decisions[key] = decision;
    saveToCacheAndStore(STORAGE_KEYS.MUTASHABIHAT_DECISIONS, decisions);
}

export function resetMutashabihatDecisions(absoluteAyat: number[]): void {
    const decisions = getMutashabihatDecisions();
    const keysToDelete = Object.keys(decisions).filter(key => {
        const abs = parseInt(key.split('-')[0], 10);
        return absoluteAyat.includes(abs);
    });
    
    if (keysToDelete.length === 0) return;
    
    keysToDelete.forEach(key => delete decisions[key]);
    saveToCacheAndStore(STORAGE_KEYS.MUTASHABIHAT_DECISIONS, decisions);
}

export function bulkSetSurahStatus(surahIds: number[], status: 'learned' | 'new' | 'skipped'): void {
    const settings = getSettings();
    const allSurahs = SURAHS;

    surahIds.forEach(id => {
        const surah = allSurahs.find(s => s.id === id);
        if (!surah) return;

        const surahKey = id.toString();
        
        // Reset state for this surah first
        delete settings.learnedVerses[surahKey];
        settings.skippedSurahs = (settings.skippedSurahs || []).filter(sId => sId !== id);

        if (status === 'learned') {
            const verseIds = Array.from({ length: surah.verseCount }, (_, i) => i + 1);
            settings.learnedVerses[surahKey] = verseIds;
        } else if (status === 'skipped') {
            settings.skippedSurahs = [...(settings.skippedSurahs || []), id];
            pruneSurahArtifacts(id);
        }
        // 'new' status is already handled by the resets above
    });

    if (settings.skippedSurahs) {
        settings.skippedSurahs.sort((a, b) => a - b);
    }
    saveSettings(settings);
}

function pruneSurahArtifacts(surahId: number): void {
    // Remove memory nodes for this surah
    const nodes = getMemoryNodes().filter(n => n.surahId !== surahId);
    saveMemoryNodes(nodes);

    // Remove surah mindmap
    const maps = getMindMaps();
    if (maps[surahId]) {
        delete maps[surahId];
        saveToCacheAndStore(STORAGE_KEYS.MINDMAPS, maps);
    }

    // Remove review errors
    const remainingErrors = getReviewErrors().filter(err => err.surahId !== surahId);
    saveToCacheAndStore(STORAGE_KEYS.REVIEW_ERRORS, remainingErrors);
}

function isNodeSuspended(node: MemoryNode, issues: AnchorIssue[]): boolean {
    if (!node.surahId) return false;
    const relatedIssues = issues.filter(i => i.surahId === node.surahId);
    if (relatedIssues.length === 0) return false;

    if (node.type === 'mindmap') return true;
    if (node.type === 'verse') {
        const anchor = findAnchorForRange(node.surahId, node.startVerse, node.endVerse);
        return anchor ? relatedIssues.some(i => i.anchorId === anchor.id) : false;
    }
    return false;
}

export interface BackupData {
    settings?: AppSettings;
    memoryNodes?: MemoryNode[];
    mindmaps?: { [surahId: string]: MindMap };
    partMindmaps?: { [partId: string]: PartMindMap };
    listeningStats?: { [surahId: string]: ListeningStats };
    listeningProgress?: Record<string, ListeningProgress>;
    reviewErrors?: ReviewError[];
    mutashabihatDecisions?: Record<string, MutashabihatDecision>;
    customMutashabihat?: CustomMutashabih[];
    cycleStart?: string;
    listeningComplete?: string | null;
    exportedAt: string;
}

export function exportBackup(): BackupData {
    return {
        settings: getSettings(),
        memoryNodes: getMemoryNodes(),
        mindmaps: getMindMaps(),
        partMindmaps: getPartMindMaps(),
        listeningStats: getListeningStats(),
        listeningProgress: getFromCache(STORAGE_KEYS.LISTENING_PROGRESS, {}),
        reviewErrors: getReviewErrors(),
        mutashabihatDecisions: getMutashabihatDecisions(),
        customMutashabihat: getCustomMutashabihat(),
        cycleStart: getCycleStart(),
        listeningComplete: getFromCache(STORAGE_KEYS.LISTENING_COMPLETE, null),
        exportedAt: new Date().toISOString(),
    };
}

export function importBackup(data: BackupData): void {
    if (data.settings) saveSettings(data.settings);
    if (data.memoryNodes) saveMemoryNodes(data.memoryNodes);
    if (data.mindmaps) {
        saveToCacheAndStore(STORAGE_KEYS.MINDMAPS, data.mindmaps);
    }
    if (data.partMindmaps) {
        saveToCacheAndStore(STORAGE_KEYS.PART_MINDMAPS, data.partMindmaps);
    }
    if (data.listeningStats) {
        saveToCacheAndStore(STORAGE_KEYS.LISTENING_STATS, data.listeningStats);
    }
    if (data.listeningProgress) {
        saveToCacheAndStore(STORAGE_KEYS.LISTENING_PROGRESS, data.listeningProgress);
    }
    if (data.reviewErrors) {
        saveToCacheAndStore(STORAGE_KEYS.REVIEW_ERRORS, data.reviewErrors);
    }
    if (data.mutashabihatDecisions) {
        saveToCacheAndStore(STORAGE_KEYS.MUTASHABIHAT_DECISIONS, data.mutashabihatDecisions);
    }
    if (data.customMutashabihat) {
        saveToCacheAndStore(STORAGE_KEYS.CUSTOM_MUTASHABIHAT, data.customMutashabihat);
    }
    if (data.cycleStart) setCycleStart(data.cycleStart);
    if (data.listeningComplete) saveToCacheAndStore(STORAGE_KEYS.LISTENING_COMPLETE, data.listeningComplete);
}
