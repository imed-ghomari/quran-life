// ========================================
// Storage Service - Dexie Backed
// ========================================

import { SURAHS } from './quranData';
import { QuranPart, MindMap, PartMindMap, MemoryNode, AppSettings, Anchor, MemoryNodeType } from './types';
import { db } from './db';
import { appLogger } from './logger';
import { audioSettings$, AudioSettings } from './audioStore';
import { FSRSState } from './fsrs';

// ========================================
// Constants & Keys
// ========================================

export const STORAGE_KEYS = {
    SETTINGS: 'quran-app-settings',
    MEMORY_NODES: 'quran-app-memory-nodes',
    MINDMAPS: 'quran-app-mindmaps',
    PART_MINDMAPS: 'quran-app-part-mindmaps',
    // Generic Keys
    LISTENING_PROGRESS: 'quran-app-listening-progress',
    LISTENING_STATS: 'quran-app-listening-stats',
    CYCLE_START: 'quran-app-cycle-start',
    LISTENING_COMPLETE: 'quran-app-listening-complete',
    LISTENING_CYCLES: 'quran-app-listening-cycles',
    REVIEW_ERRORS: 'quran-app-review-errors',
    MUTASHABIHAT_DECISIONS: 'quran-app-mutashabihat-decisions',
    CUSTOM_MUTASHABIHAT: 'quran-app-custom-mutashabihat',
    LAST_MODIFIED: 'quran-app-last-modified',
    PORTION_POINTERS: 'quran-app-portion-pointers',
    LAST_RESOLVED_FOR: 'quran-app-last-resolved-for',
    FSRS_REVIEW_LOGS: 'quran-app-fsrs-review-logs',
    FSRS_OPTIMIZATION_META: 'quran-app-fsrs-optimization-meta',
    AUDIO_SETTINGS: 'quran-app-audio-settings',
};

// ========================================
// Types
// ========================================

export type { AppSettings, MemoryNode }; // Re-export from types

export const DEFAULT_SETTINGS: AppSettings = {
    completionDays: 30,
    activePart: 4,
    learnedVerses: {},
    skippedSurahs: [],
    updatedAt: "1970-01-01T00:00:00.000Z",
    isOnboardingComplete: false,
    kanbanColumns: {
        'backlog': [],
        'in-progress': [],
        'complete': []
    }
};

// ========================================
// Cache Layer
// ========================================

const storageCache: { [key: string]: any } = {};

let cacheLoadingPromise: Promise<void> | null = null;

export async function ensureCacheLoaded() {
    if (typeof window === 'undefined') return;
    if (cacheLoadingPromise) return cacheLoadingPromise;
    cacheLoadingPromise = loadIntoCache();
    await cacheLoadingPromise;
}

async function loadIntoCache() {
    try {
        // 1. Settings
        const settingsDoc = await db.settings.get('main');
        if (settingsDoc) {
            storageCache[STORAGE_KEYS.SETTINGS] = settingsDoc.data;
        }

        // 2. Memory Nodes
        const nodes = await db.memoryNodes.toArray();
        if (nodes.length > 0) {
            storageCache[STORAGE_KEYS.MEMORY_NODES] = nodes.map(n => n.data);
        }

        // 3. Mindmaps
        const mindmaps = await db.mindmaps.toArray();
        const mindmapMap: Record<string, MindMap> = {};
        mindmaps.forEach(m => mindmapMap[m.surahId] = m.data);
        storageCache[STORAGE_KEYS.MINDMAPS] = mindmapMap;

        // 4. Part Mindmaps
        const partMindmaps = await db.partMindmaps.toArray();
        const partMindmapMap: Record<string, PartMindMap> = {};
        partMindmaps.forEach(m => partMindmapMap[m.partId] = m.data);
        storageCache[STORAGE_KEYS.PART_MINDMAPS] = partMindmapMap;

        // 5. Generic Key-Values
        const keyvals = await db.keyval.toArray();
        keyvals.forEach(kv => {
            storageCache[kv.key] = kv.value;
        });

    } catch (err) {
        console.error('Failed to load cache from Dexie:', err);
        appLogger.addLog('Failed to load cache from DB', 'error');
    }
}

function getFromCache<T>(key: string, defaultValue: T): T {
    if (typeof window === 'undefined') return defaultValue;
    const cached = storageCache[key];
    return cached !== undefined ? cached : defaultValue;
}

// ========================================
// Persistence Helpers
// ========================================

async function persistGeneric(key: string, value: any) {
    storageCache[key] = value;
    await db.keyval.put({ key, value });
    dispatchStorageEvent(key, value);
}

function dispatchStorageEvent(key: string, value: any) {
    if (typeof window === 'undefined') return;
    try {
        window.dispatchEvent(new StorageEvent('storage', {
            key,
            newValue: JSON.stringify(value)
        }));
    } catch (e) {
        console.warn('Failed to dispatch storage event', e);
    }
}

export function updateSettingsCache(newSettings: AppSettings) {
    storageCache[STORAGE_KEYS.SETTINGS] = newSettings;
    dispatchStorageEvent(STORAGE_KEYS.SETTINGS, newSettings);
}

export function updateMemoryNodesCache(newNodes: MemoryNode[]) {
    storageCache[STORAGE_KEYS.MEMORY_NODES] = newNodes;
    dispatchStorageEvent(STORAGE_KEYS.MEMORY_NODES, newNodes);
}

// ========================================
// Settings
// ========================================

export function getSettings(): AppSettings {
    return getFromCache(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
}

export async function saveSettings(settings: AppSettings) {
    const updated = { ...settings, updatedAt: new Date().toISOString() };
    storageCache[STORAGE_KEYS.SETTINGS] = updated;
    
    await db.settings.put({
        key: 'main',
        data: updated,
        updatedAt: updated.updatedAt
    });
    
    dispatchStorageEvent(STORAGE_KEYS.SETTINGS, updated);
}

export function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    const settings = getSettings();
    const newSettings = { ...settings, [key]: value };
    saveSettings(newSettings);
}

export function toggleSurahSkipped(surahId: number) {
    const settings = getSettings();
    const skipped = new Set(settings.skippedSurahs || []);
    if (skipped.has(surahId)) {
        skipped.delete(surahId);
    } else {
        skipped.add(surahId);
    }
    updateSetting('skippedSurahs', Array.from(skipped));
}

// ========================================
// Memory Nodes
// ========================================

export function getMemoryNodes(): MemoryNode[] {
    return getFromCache(STORAGE_KEYS.MEMORY_NODES, []);
}

export async function saveMemoryNodes(nodes: MemoryNode[]) {
    storageCache[STORAGE_KEYS.MEMORY_NODES] = nodes;
    
    // Bulk put to Dexie
    const docs = nodes.map(n => ({
        id: n.id,
        data: n,
        updatedAt: new Date().toISOString()
    }));
    await db.memoryNodes.bulkPut(docs);
    
    dispatchStorageEvent(STORAGE_KEYS.MEMORY_NODES, nodes);
}

// Helper for Maturity Updates
function getMaturityState(level: 'reset' | 'medium' | 'strong' | 'mastered'): Partial<FSRSState> {
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

export async function setGroupMaturity(type: MemoryNodeType | 'verse' | 'mindmap', level: 'reset' | 'medium' | 'strong' | 'mastered', surahId?: number) {
    const nodes = getMemoryNodes();
    // 'verse' maps to 'verse_segment' in MemoryNodeType usually, but let's handle 'verse' string from UI
    const targetType = type === 'verse' ? 'verse_segment' : type;

    const updatedNodes = nodes.map(node => {
        if (node.type === targetType) {
            if (surahId && node.surahId !== surahId) return node;
            const newState = getMaturityState(level);
            return { ...node, scheduler: { ...node.scheduler, ...newState } as any };
        }
        return node;
    });
    await saveMemoryNodes(updatedNodes);
}

export async function setSurahMaturity(surahId: number, level: 'reset' | 'medium' | 'strong' | 'mastered') {
    // Affects all nodes for this surah
    const nodes = getMemoryNodes();
    const updatedNodes = nodes.map(node => {
        if (node.surahId === surahId) {
            const newState = getMaturityState(level);
            return { ...node, scheduler: { ...node.scheduler, ...newState } as any };
        }
        return node;
    });
    await saveMemoryNodes(updatedNodes);
}

export async function setNodeMaturity(nodeId: string, level: 'reset' | 'medium' | 'strong' | 'mastered') {
    const nodes = getMemoryNodes();
    const updatedNodes = nodes.map(node => {
        if (node.id === nodeId) {
            const newState = getMaturityState(level);
            return { ...node, scheduler: { ...node.scheduler, ...newState } as any };
        }
        return node;
    });
    await saveMemoryNodes(updatedNodes);
}

export async function postponeNode(nodeId: string, days: number = 1) {
    const nodes = getMemoryNodes();
    const updatedNodes = nodes.map(node => {
        if (node.id === nodeId) {
             const now = new Date();
             const newDue = new Date(now.getTime() + days * 86400000).toISOString();
             return { 
                 ...node, 
                 scheduler: { 
                     ...node.scheduler, 
                     due: newDue,
                     scheduled_days: (node.scheduler as any).scheduled_days ? (node.scheduler as any).scheduled_days + days : days 
                 } 
             };
        }
        return node;
    });
    await saveMemoryNodes(updatedNodes);
}

// ========================================
// Mindmaps (Legacy / Helper Access)
// ========================================

export function getMindMaps(): Record<string, MindMap> {
    return getFromCache(STORAGE_KEYS.MINDMAPS, {});
}

export function getMindMap(surahId: number): MindMap | null {
    const maps = getMindMaps();
    return maps[surahId] || null;
}

export async function saveMindMap(surahId: number, mindmap: MindMap) {
    const maps = getMindMaps();
    maps[surahId] = mindmap;
    storageCache[STORAGE_KEYS.MINDMAPS] = maps;

    await db.mindmaps.put({
        surahId,
        data: mindmap,
        updatedAt: new Date().toISOString()
    });
    
    dispatchStorageEvent(STORAGE_KEYS.MINDMAPS, maps);
}

export async function deleteMindMap(surahId: number) {
    const maps = getMindMaps();
    delete maps[surahId];
    storageCache[STORAGE_KEYS.MINDMAPS] = maps;

    await db.mindmaps.delete(surahId);
    
    dispatchStorageEvent(STORAGE_KEYS.MINDMAPS, maps);
}

// ========================================
// Part Mindmaps
// ========================================

export function getPartMindMaps(): Record<string, PartMindMap> {
    return getFromCache(STORAGE_KEYS.PART_MINDMAPS, {});
}

export async function savePartMindMap(partId: QuranPart, mindmap: PartMindMap) {
    const maps = getPartMindMaps();
    maps[partId] = mindmap;
    storageCache[STORAGE_KEYS.PART_MINDMAPS] = maps;

    await db.partMindmaps.put({
        partId,
        data: mindmap,
        updatedAt: new Date().toISOString()
    });

    dispatchStorageEvent(STORAGE_KEYS.PART_MINDMAPS, maps);
}

// ========================================
// Generic / Specific Helpers
// ========================================

// Review Errors
export interface ReviewError {
    verseId: string;
    timestamp: string;
    count: number;
    surahId?: number;
    ayahId?: number;
    absoluteAyah?: number;
}

export function getReviewErrors(): ReviewError[] {
    return getFromCache(STORAGE_KEYS.REVIEW_ERRORS, []);
}

export async function saveReviewErrors(errors: ReviewError[]) {
    await persistGeneric(STORAGE_KEYS.REVIEW_ERRORS, errors);
}

export async function addReviewError(error: ReviewError) {
    const errors = getReviewErrors();
    // Check if exists
    const existing = errors.find(e => e.verseId === error.verseId);
    if (existing) {
        existing.count++;
        existing.timestamp = new Date().toISOString();
    } else {
        errors.push(error);
    }
    await saveReviewErrors(errors);
}

export async function removeReviewError(verseId: string) {
    const errors = getReviewErrors();
    const filtered = errors.filter(e => e.verseId !== verseId);
    await saveReviewErrors(filtered);
}

// Mutashabihat
export interface MutashabihatDecision {
    id: string; // absoluteAyah or absoluteAyah-phraseId
    status: 'confirmed' | 'ignored' | 'pending' | 'solved_mindmap' | 'solved_note';
    confirmedAt?: string;
    notes?: string;
}

export function getMutashabihatDecisions(): Record<string, MutashabihatDecision> {
    return getFromCache(STORAGE_KEYS.MUTASHABIHAT_DECISIONS, {});
}

export async function setMutashabihatDecision(decision: MutashabihatDecision) {
    const decisions = { ...getMutashabihatDecisions() };
    decisions[decision.id] = decision;
    await persistGeneric(STORAGE_KEYS.MUTASHABIHAT_DECISIONS, decisions);
}

export async function resetMutashabihatDecisions(absoluteAyahs?: number[]) {
    if (!absoluteAyahs) {
        await persistGeneric(STORAGE_KEYS.MUTASHABIHAT_DECISIONS, {});
        return;
    }

    const decisions = { ...getMutashabihatDecisions() };
    const ayahSet = new Set(absoluteAyahs.map(String));

    Object.keys(decisions).forEach(key => {
        const absoluteAyah = key.split('-')[0];
        if (ayahSet.has(absoluteAyah)) {
            delete decisions[key];
        }
    });

    await persistGeneric(STORAGE_KEYS.MUTASHABIHAT_DECISIONS, decisions);
}

export interface CustomMutashabih {
    id: string;
    verseId: string; // surah:ayah
    phrase: string;
    targetVerseId: string;
    notes?: string;
    createdAt: string;
    status?: 'confirmed' | 'ignored' | 'pending' | 'solved_mindmap' | 'solved_note';
}

export function getCustomMutashabihat(): CustomMutashabih[] {
    return getFromCache(STORAGE_KEYS.CUSTOM_MUTASHABIHAT, []);
}

export async function saveCustomMutashabih(item: CustomMutashabih) {
    const items = getCustomMutashabihat();
    const existingIdx = items.findIndex(i => i.id === item.id);
    if (existingIdx >= 0) {
        items[existingIdx] = item;
    } else {
        items.push(item);
    }
    await persistGeneric(STORAGE_KEYS.CUSTOM_MUTASHABIHAT, items);
}

// Anchors (Suspended)
export function getSuspendedAnchors(): string[] {
    return [];
}

export async function clearAnchorIssues(surahId: number, anchorId?: string) {
    // No-op
}

export function findAnchorForRange(surahId: number, start: number, end: number): MemoryNode | undefined {
    const nodes = getMemoryNodes();
    return nodes.find(n => 
        n.type === 'verse_segment' && 
        n.surahId === surahId && 
        n.startVerse === start && 
        n.endVerse === end
    );
}

// Listening Progress
export function getListeningProgress(): Record<string, number> {
    return getFromCache(STORAGE_KEYS.LISTENING_PROGRESS, {});
}

export async function saveListeningProgress(progress: Record<string, number>) {
    await persistGeneric(STORAGE_KEYS.LISTENING_PROGRESS, progress);
}

export function getPortionPointer(partId: number): string | null {
    const pointers = getFromCache<Record<string, string>>(STORAGE_KEYS.PORTION_POINTERS, {});
    return pointers[partId] || null;
}

// Scheduler Helpers
export function hasNodeBeenReviewed(scheduler: any): boolean {
    if (!scheduler) return false;
    if ('reps' in scheduler) return scheduler.reps > 0;
    if ('repetition' in scheduler) return scheduler.repetition > 0;
    return false;
}

export function getNodeStability(node: MemoryNode): number {
    return (node.scheduler as any).stability || 0;
}

export function getNodeDifficulty(node: MemoryNode): number {
    return (node.scheduler as any).difficulty || 0;
}

export function getNodeReps(node: MemoryNode): number {
    return (node.scheduler as any).reps || (node.scheduler as any).repetition || 0;
}

export function getNodeDueDate(node: MemoryNode): string | null {
    return (node.scheduler as any).due || (node.scheduler as any).dueDate || null;
}

export function isSurahSkipped(surahId: number, settings: AppSettings): boolean {
    return (settings.skippedSurahs || []).includes(surahId);
}

export async function clearSecondaryStorage() {
    // Clear Dexie tables except Settings
    await db.mindmaps.clear();
    await db.partMindmaps.clear();
    await db.memoryNodes.clear();
    // Clear generic keys except Settings (which is in db.settings)
    await db.keyval.clear();
    
    // Clear cache
    Object.keys(storageCache).forEach(key => {
        if (key !== STORAGE_KEYS.SETTINGS) {
            delete storageCache[key];
        }
    });
}

export async function clearAllData() {
    await db.delete();
    await db.open();
    // Clear cache
    Object.keys(storageCache).forEach(key => delete storageCache[key]);
    window.location.reload();
}

// Backup / Restore
export async function exportBackup(): Promise<any> {
    await ensureCacheLoaded();
    return {
        version: 1,
        timestamp: new Date().toISOString(),
        settings: getSettings(),
        memoryNodes: getMemoryNodes(),
        mindmaps: getMindMaps(),
        partMindmaps: getPartMindMaps(),
        customMutashabihat: getCustomMutashabihat(),
        decisions: getMutashabihatDecisions(),
        listeningProgress: getListeningProgress(),
        reviewErrors: getReviewErrors()
    };
}

export async function importBackup(data: any) {
    if (!data || !data.version) throw new Error('Invalid backup file');
    
    if (data.settings) await saveSettings(data.settings);
    if (data.memoryNodes) await saveMemoryNodes(data.memoryNodes);
    
    if (data.mindmaps) {
        for (const [surahId, map] of Object.entries(data.mindmaps)) {
            await saveMindMap(Number(surahId), map as MindMap);
        }
    }
    
    if (data.partMindmaps) {
        for (const [partId, map] of Object.entries(data.partMindmaps)) {
            await savePartMindMap(Number(partId) as QuranPart, map as PartMindMap);
        }
    }
    
    if (data.customMutashabihat) {
        for (const item of data.customMutashabihat) {
            await saveCustomMutashabih(item as CustomMutashabih);
        }
    }
    
    if (data.decisions) {
        for (const [id, dec] of Object.entries(data.decisions)) {
            await setMutashabihatDecision(dec as MutashabihatDecision);
        }
    }
    
    if (data.listeningProgress) {
        await saveListeningProgress(data.listeningProgress);
    }
    
    if (data.reviewErrors) {
        await saveReviewErrors(data.reviewErrors);
    }
}
