// ========================================
// Storage Service - With Part Mindmaps & Review Errors
// ========================================

import { SURAHS } from './quranData';
import { QuranPart } from './types';
import { get, set, createStore, clear } from 'idb-keyval';
import { appLogger } from './logger';
import { audioSettings$, AudioSettings } from './audioStore';

// ========================================
// Storage Engine Migration & Helpers
// ========================================

const STORAGE_KEYS = {
    SETTINGS: 'quran-app-settings',
    MEMORY_NODES: 'quran-app-memory-nodes',
    MINDMAPS: 'quran-app-mindmaps',
    PART_MINDMAPS: 'quran-app-part-mindmaps',
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
    // FSRS v6 keys
    FSRS_REVIEW_LOGS: 'quran-app-fsrs-review-logs',
    FSRS_OPTIMIZATION_META: 'quran-app-fsrs-optimization-meta',
    AUDIO_SETTINGS: 'quran-app-audio-settings',
};

const STORAGE_KEYS_VALUES = Object.values(STORAGE_KEYS);



const customStore = typeof window !== 'undefined' ? createStore('quran-app-db', 'quran-app-store') : undefined;

/**
 * Migration helper to move data from localStorage to IndexedDB once.
 */
async function migrateFromLocalStorage() {
    if (typeof window === 'undefined' || !customStore) return;

    const migrationFlag = 'quran-app-migrated-to-idb';
    if (localStorage.getItem(migrationFlag)) return;

    appLogger.addLog('Migrating data from localStorage to IndexedDB...', 'info');
    for (const key of Object.values(STORAGE_KEYS)) {
        const value = localStorage.getItem(key);
        if (value) {
            try {
                await set(key, JSON.parse(value), customStore);
            } catch (e) {
                appLogger.addLog(`Migration failed for key ${key}`, 'error');
                console.error(`Migration failed for key ${key}:`, e);
            }
        }
    }

    localStorage.setItem(migrationFlag, 'true');
    appLogger.addLog('Successfully migrated data to IndexedDB', 'success');
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
        const val = await get(key, customStore);
        // ONLY update cache if it hasn't been written to already during startup
        // This prevents overwriting a fast user action with slow DB load
        if (val !== undefined && storageCache[key] === undefined) {
            storageCache[key] = val;
        }
    }
}

// Start loading cache
let cacheLoadingPromise: Promise<void> | null = null;
export async function ensureCacheLoaded() {
    if (typeof window === 'undefined' || !customStore) return;
    if (cacheLoadingPromise) return cacheLoadingPromise;
    cacheLoadingPromise = loadIntoCache();
    await cacheLoadingPromise;
    return;
}

if (typeof window !== 'undefined') {
    ensureCacheLoaded().then(() => {
        // Dispatch event to notify listeners that initial load is complete
        window.dispatchEvent(new StorageEvent('storage', {
            key: 'quran-app-settings', // generic key to trigger updates
            newValue: JSON.stringify(storageCache[STORAGE_KEYS.SETTINGS])
        }));
    });
}

function getFromCache<T>(key: string, defaultValue: T): T {
    if (typeof window === 'undefined') return defaultValue;
    const cached = storageCache[key];
    return cached !== undefined ? cached : defaultValue;
}

// (Moved to top)

// ========================================
// Cross-tab Synchronization
// ========================================

const storageChannel = typeof window !== 'undefined' ? new BroadcastChannel('quran_app_storage_sync') : null;

if (storageChannel) {
    storageChannel.onmessage = (event) => {
        const { key, value } = event.data;
        if (STORAGE_KEYS_VALUES.includes(key)) {
            storageCache[key] = value;
            // PERSIST TO IndexedDB immediately so reload doesn't lose it
            if (customStore) {
                set(key, value, customStore).catch(err => console.error(`Sync persistence failed for ${key}:`, err));
            }
            // Dispatch a storage event manually so the page.tsx useEffect catches it
            window.dispatchEvent(new StorageEvent('storage', {
                key: key,
                newValue: JSON.stringify(value),
            }));
        }
    };
}

// (Moved to top)

function saveToCacheAndStore(key: string, value: any): Promise<void> {
    storageCache[key] = value;

    // Human readable key name
    const keyName = key.replace('quran-app-', '').replace(/-/g, ' ');
    appLogger.addLog(`Saving ${keyName}...`, 'info');

    // Update last modified timestamp (except for the timestamp itself)
    if (key !== STORAGE_KEYS.LAST_MODIFIED) {
        const now = new Date().toISOString();
        storageCache[STORAGE_KEYS.LAST_MODIFIED] = now;
        if (typeof window !== 'undefined' && customStore) {
            set(STORAGE_KEYS.LAST_MODIFIED, now, customStore).catch(() => { });
            localStorage.setItem(STORAGE_KEYS.LAST_MODIFIED, JSON.stringify(now));

            // Increment pending changes count
            const currentCount = parseInt(localStorage.getItem('quran-app-pending-count') || '0');
            localStorage.setItem('quran-app-pending-count', (currentCount + 1).toString());

            // Notify sync engine of pending changes
            import('./syncEngine').then(({ markPendingChanges }) => {
                markPendingChanges();
            }).catch(() => {
                // Sync engine not yet loaded, changes tracked via localStorage count
            });
        }
    }

    if (typeof window !== 'undefined' && customStore) {
        // Notify other tabs via BroadcastChannel
        try {
            storageChannel?.postMessage({ key, value });
        } catch (e) {
            // Ignore DataCloneError or other messaging errors for large payloads
            console.warn(`[Storage] Failed to broadcast ${key} (likely too large)`, e);
        }

        // Also update localStorage for fallback sync awareness across tabs
        let stringified = '';
        try {
            stringified = JSON.stringify(value);
            if (stringified.length < 500000) {
                localStorage.setItem(key, stringified);
            } else {
                localStorage.setItem(key, JSON.stringify({ _isLargeData: true, timestamp: new Date().toISOString() }));
                console.log(`Key ${key} is large (${(stringified.length / 1024).toFixed(1)} KB), skipping localStorage.`);
            }
        } catch (e) {
            console.warn(`Failed to save ${key} to localStorage (likely size limit):`, e);
        }

        return set(key, value, customStore)
            .then(() => {
                appLogger.addLog(`${keyName} saved successfully`, 'success');
                // Dispatch a storage event manually so the page.tsx useEffect catches it
                // We reuse the stringified value if available to avoid double serialization
                try {
                    const payload = stringified || JSON.stringify(value);
                    // Avoid dispatching huge events that might freeze listeners
                    if (payload.length < 2000000) { // 2MB safety limit for events
                        window.dispatchEvent(new StorageEvent('storage', {
                            key: key,
                            newValue: payload,
                        }));
                    }
                } catch (e) {
                    console.warn(`[Storage] Skipped dispatching event for ${key}`, e);
                }
            })
            .catch(err => {
                appLogger.addLog(`Failed to save ${keyName}`, 'error');
                console.error(`Failed to persist ${key}:`, err);
                throw err;
            });
    }
    return Promise.resolve();
}

// ========================================
// Settings
// ========================================

export interface AppSettings {
    completionDays: number;
    activePart: QuranPart;
    learnedVerses: { [surahId: string]: number[] };
    skippedSurahs?: number[];
    lastSyncedAt?: string;
    updatedAt?: string;
    isOnboardingComplete?: boolean;
    kanbanColumns: Record<string, string[]>; // colId -> listOfItemIds
    userId?: string; // Owner of these settings
}

export const DEFAULT_SETTINGS: AppSettings = {
    completionDays: 30,
    activePart: 4,
    learnedVerses: {},
    skippedSurahs: [],
    updatedAt: "1970-01-01T00:00:00.000Z", // Use EPOCH to ensure cloud always wins over uninitialized local
    isOnboardingComplete: false,
    kanbanColumns: {
        'backlog': [],
        'in-progress': [],
        'complete': []
    }
};

export async function clearSecondaryStorage(): Promise<void> {
    // Clears everything EXCEPT settings
    if (typeof window !== 'undefined') {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('quran-app-') && key !== STORAGE_KEYS.SETTINGS) {
                localStorage.removeItem(key);
            }
        });
    }

    if (customStore) {
        // We want to clear specific keys from IDB, but clear() wipes everything.
        // So we iterate keys and delete ones that are NOT settings.
        // Actually, for IDB, we store large objects.
        const keys = await import('idb-keyval').then(m => m.keys(customStore));
        for (const key of keys) {
            if (key !== STORAGE_KEYS.SETTINGS) {
                await import('idb-keyval').then(m => m.del(key, customStore));
            }
        }
    }
    
    // Clear Memory Cache (except settings)
    Object.keys(storageCache).forEach(key => {
        if (key !== STORAGE_KEYS.SETTINGS) {
            delete storageCache[key];
        }
    });
}

export async function clearAllData(): Promise<void> {
    // 1. Clear LocalStorage
    if (typeof window !== 'undefined') {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('quran-app-')) {
                localStorage.removeItem(key);
            }
        });
    }

    // 2. Clear IndexedDB
    if (customStore) {
        await clear(customStore);
    }
    
    // 3. Clear Memory Cache
    Object.keys(storageCache).forEach(key => delete storageCache[key]);
}

export function getSettings(): AppSettings {
    const cached = storageCache[STORAGE_KEYS.SETTINGS];
    if (cached) return cached;
    return getFromCache(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
}

export async function saveSettings(settings: AppSettings): Promise<void> {
    settings.updatedAt = new Date().toISOString();
    await saveToCacheAndStore(STORAGE_KEYS.SETTINGS, settings);
}

export async function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
    const settings = getSettings();
    settings[key] = value;
    await saveSettings(settings);
}

export function isSurahSkipped(surahId: number, settingsOverride?: AppSettings): boolean {
    const settings = settingsOverride || getSettings();
    return settings.skippedSurahs?.includes(surahId) || false;
}

export function toggleSurahSkipped(surahId: number): void {
    const settings = getSettings();
    const current = new Set(settings.skippedSurahs || []);
    if (current.has(surahId)) {
        current.delete(surahId);
        appLogger.addLog(`Surah ${surahId} restored (unskipped)`, 'success');
    } else {
        current.add(surahId);
        appLogger.addLog(`Surah ${surahId} skipped`, 'warning');
        // Note: We no longer remove learned data or prune artifacts here.
        // Artifacts are preserved but hidden by UI filters.
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
        appLogger.addLog(`Surah ${surahId} marked as NOT learned`, 'warning');
    } else {
        settings.learnedVerses[surahKey] = Array.from({ length: surah.verseCount }, (_, i) => i + 1);
        appLogger.addLog(`Surah ${surahId} marked as learned`, 'success');
    }

    saveSettings(settings);
    syncMemoryNodesWithLearned();
}

export function getSurahLearnedStatus(surahId: number): { learned: number; total: number } {
    const settings = getSettings();
    const surah = SURAHS.find(s => s.id === surahId);
    if (!surah) return { learned: 0, total: 0 };

    // Use string key for consistent lookup as JSON keys are always strings
    const learned = settings.learnedVerses[surahId.toString()]?.length || 0;
    return { learned, total: surah.verseCount };
}

export function getTotalLearnedVerses(): number {
    const settings = getSettings();
    return Object.values(settings.learnedVerses).reduce((sum, verses) => sum + verses.length, 0);
}

export function getLearnedVersesInPart(part: QuranPart): { surahId: number; ayahId: number }[] {
    const settings = getSettings();
    const result: { surahId: number; ayahId: number }[] = [];

    SURAHS.filter(s => part === 5 || s.part === part).forEach(surah => {
        const verses = settings.learnedVerses[surah.id] || [];
        verses.forEach(ayahId => {
            result.push({ surahId: surah.id, ayahId });
        });
    });

    return result;
}

// ========================================
// Memory Nodes (SM-2 / FSRS)
// ========================================

import {
    type ReviewLogEntry,
    type OptimizationMeta,
    createPresetState,
    unsuspendCard,
    migrateSM2ToFSRS,
    isSM2State,
    FSRSCardState,
    createNewFSRSState,
    FSRSState
} from './fsrs';

// Legacy SM-2 state (for migration)
export interface SM2State {
    interval: number;
    repetition: number;
    easeFactor: number;
    dueDate: string;
    lastReview: string;
    relearningStep?: number;
    preSuspensionInterval?: number;
}

// Unified scheduler type - supports both formats during migration
export type SchedulerState = SM2State | FSRSState;

export interface MemoryNode {
    id: string;
    type: 'verse' | 'mindmap' | 'part_mindmap';
    surahId?: number;
    partId?: QuranPart;
    startVerse?: number;
    endVerse?: number;
    scheduler: SchedulerState;
}


// Helper to get due date from either scheduler type
export function getNodeDueDate(scheduler: SchedulerState): string {
    if ('due' in scheduler) {
        return scheduler.due; // FSRS
    }
    return scheduler.dueDate; // SM-2
}

// Helper to set due date for either scheduler type
export function setNodeDueDate(scheduler: SchedulerState, dueDate: string): SchedulerState {
    if ('due' in scheduler) {
        return { ...scheduler, due: dueDate }; // FSRS
    }
    return { ...scheduler, dueDate }; // SM-2
}

// Helper to get last review from either scheduler type
export function getNodeLastReview(scheduler: SchedulerState): string {
    if ('last_review' in scheduler) {
        return scheduler.last_review; // FSRS
    }
    return scheduler.lastReview; // SM-2
}

// Helper to get stability/interval for maturity calculations
export function getNodeStability(scheduler: SchedulerState): number {
    if ('stability' in scheduler) {
        return scheduler.stability; // FSRS
    }
    return scheduler.interval; // SM-2
}

// Helper to get repetition count
export function getNodeReps(scheduler: SchedulerState): number {
    if ('reps' in scheduler) {
        return scheduler.reps; // FSRS
    }
    return scheduler.repetition; // SM-2
}

// Helper to get difficulty/ease (formatted as string)
export function getNodeDifficulty(scheduler: SchedulerState): string {
    if ('difficulty' in scheduler) {
        return `D: ${scheduler.difficulty}`; // FSRS (1-10)
    }
    return `E: ${scheduler.easeFactor}`; // SM-2 (1.3-2.5)
}

// Helper to check if node has been reviewed
export function hasNodeBeenReviewed(scheduler: SchedulerState): boolean {
    if ('reps' in scheduler) {
        return scheduler.reps > 0 || !!scheduler.last_review; // FSRS
    }
    return scheduler.repetition > 0 || !!scheduler.lastReview; // SM-2
}

// Helper to create a suspended state (for mindmap incomplete)
function createSuspendedScheduler(scheduler: SchedulerState): SchedulerState {
    if ('stability' in scheduler) {
        // FSRS: reduce stability by 40%, clear due date
        const newStability = Math.max(1, Math.round(scheduler.stability * 0.6));
        return {
            ...scheduler,
            stability: newStability,
            due: '', // Suspended
        };
    }
    // SM-2: reduce interval by 40%, reduce ease factor
    const sm2 = scheduler as SM2State;
    const newInterval = Math.max(1, Math.round(sm2.interval * 0.6));
    const newEase = Math.max(1.3, Math.round((sm2.easeFactor - 0.15) * 100) / 100);
    return {
        ...sm2,
        interval: newInterval,
        easeFactor: newEase,
        dueDate: '', // Suspended
    };
}

export function getMemoryNodes(): MemoryNode[] {
    return getFromCache(STORAGE_KEYS.MEMORY_NODES, []);
}

export function saveMemoryNodes(nodes: MemoryNode[]): void {
    // Deduplicate by ID before saving to prevent high counter issues
    const uniqueMap = new Map();
    nodes.forEach(n => {
        if (!uniqueMap.has(n.id)) {
            uniqueMap.set(n.id, n);
        } else {
            // If duplicate found, keep the one with more progress (lastReview)
            const existing = uniqueMap.get(n.id);
            if ((getNodeLastReview(n.scheduler) || '') > (getNodeLastReview(existing.scheduler) || '')) {
                uniqueMap.set(n.id, n);
            }
        }
    });
    saveToCacheAndStore(STORAGE_KEYS.MEMORY_NODES, Array.from(uniqueMap.values()));
}

export function getDueNodes(): MemoryNode[] {
    const today = new Date().toISOString().split('T')[0];
    const settings = getSettings();
    const skips = new Set(settings.skippedSurahs || []);
    const learnedSurahIds = new Set(Object.keys(settings.learnedVerses).map(id => parseInt(id)));
    const suspended = getSuspendedAnchors();
    const mindmaps = getMindMaps();
    const partMindmaps = getPartMindMaps();

    return getMemoryNodes()
        .filter(n => getNodeDueDate(n.scheduler) <= today)
        // Filter out skipped surahs
        .filter(n => !n.surahId || !skips.has(n.surahId))
        // Filter out nodes for surahs that are not marked as learned
        .filter(n => {
            if (n.surahId && !learnedSurahIds.has(n.surahId)) return false;
            return true;
        })
        .filter(n => !isNodeSuspended(n, suspended))
        // Issue #2: Filter out incomplete mindmaps (allow missing images, UI handles it)
        .filter(n => {
            if (n.type === 'mindmap' && n.surahId) {
                const mm = mindmaps[n.surahId];
                return mm?.isComplete;
            }
            if (n.type === 'part_mindmap' && n.partId) {
                const pmm = partMindmaps[n.partId];
                return pmm?.isComplete;
            }
            return true;
        })
        // Filter verse nodes: only include if surah is fully learned AND has a completed mindmap
        .filter(n => {
            if (n.type === 'verse' && n.surahId) {
                const { learned, total } = getSurahLearnedStatus(n.surahId);
                const isLearned = learned === total;

                // Mindmap must be complete
                const mm = mindmaps[n.surahId];
                const isMindmapComplete = mm?.isComplete;

                return isLearned && isMindmapComplete;
            }
            return true;
        })
        .sort((a, b) => {
            const priority: Record<string, number> = { 'part_mindmap': 0, 'mindmap': 1, 'verse': 2 };
            const pA = priority[a.type] ?? 99;
            const pB = priority[b.type] ?? 99;
            return pA - pB;
        });
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

function createNewScheduler(staggerDays: number = 0): FSRSState {
    const state = createNewFSRSState();
    if (staggerDays > 0) {
        // Simple stagger: just push due date
        const due = new Date(state.due);
        due.setDate(due.getDate() + staggerDays);
        state.due = due.toISOString().split('T')[0];
    }
    return state;
}

// Sync memory nodes with learned verses - create nodes for learned verses
export function syncMemoryNodesWithLearned(forceFullReset: boolean = false): void {
    const settings = getSettings();
    const currentNodes = getMemoryNodes();

    // Safety check: if storage cache is empty and we aren't forcing a full reset,
    // we should NOT proceed, as we might accidentally wipe all progress.
    if (!forceFullReset && currentNodes.length === 0 && Object.keys(settings.learnedVerses).length > 0) {
        console.warn('Sync cancelled: Memory nodes cache is empty but learned verses exist. Potential race condition.');
        return;
    }

    const newNodes: MemoryNode[] = [];
    const mindmaps = getMindMaps();
    const partMindmaps = getPartMindMaps();
    const skips = new Set(settings.skippedSurahs || []);

    // Track which nodes from currentNodes we have already "accounted for"
    // to ensure we don't duplicate them and can preserve inactive ones.
    const accountedForIds = new Set<string>();

    // 1. Sync / Preserve Mindmap Nodes
    Object.values(mindmaps).forEach(mm => {
        if (mm.isComplete && !skips.has(mm.surahId)) {
            const nodeId = `mindmap-${mm.surahId}`;
            const existing = currentNodes.find(n => n.id === nodeId);
            newNodes.push({
                id: nodeId,
                type: 'mindmap',
                surahId: mm.surahId,
                scheduler: (existing && !forceFullReset) ? existing.scheduler : createNewScheduler(),
            });
            accountedForIds.add(nodeId);
        }
    });

    // 2. Sync / Preserve Part Mindmap Nodes
    Object.values(partMindmaps).forEach(pmm => {
        if (pmm.isComplete) {
            const nodeId = `part-mindmap-${pmm.partId}`;
            const existing = currentNodes.find(n => n.id === nodeId);
            newNodes.push({
                id: nodeId,
                type: 'part_mindmap',
                partId: pmm.partId,
                scheduler: (existing && !forceFullReset) ? existing.scheduler : createNewScheduler(),
            });
            accountedForIds.add(nodeId);
        }
    });

    // 3. Group verses into segments and Sync
    Object.entries(settings.learnedVerses).forEach(([surahIdStr, verses]) => {
        const surahId = parseInt(surahIdStr);
        if (verses.length === 0 || skips.has(surahId)) return;

        // Check for Mindmap Anchors
        const mindmap = mindmaps[surahId];
        const hasAnchors = mindmap?.anchors && mindmap.anchors.length > 0;

        if (hasAnchors) {
            // Use Anchors for segmentation
            mindmap.anchors.forEach(anchor => {
                // Check if any learned verse falls within this anchor
                const hasLearnedVerses = verses.some(v => v >= anchor.startVerse && v <= anchor.endVerse);

                if (hasLearnedVerses) {
                    const nodeId = `verse-${surahId}-${anchor.startVerse}-${anchor.endVerse}`;
                    const existing = currentNodes.find(n => n.id === nodeId);

                    const scheduler = (existing && !forceFullReset)
                        ? existing.scheduler
                        : createNewScheduler();

                    newNodes.push({
                        id: nodeId,
                        type: 'verse',
                        surahId,
                        startVerse: anchor.startVerse,
                        endVerse: anchor.endVerse,
                        scheduler,
                    });
                    accountedForIds.add(nodeId);
                }
            });
        } else {
            // Default: Create segments of 5 verses
            const sortedVerses = [...verses].sort((a, b) => a - b);
            let segmentStart = sortedVerses[0];
            let segmentEnd = segmentStart;

            let newSegmentsForThisSurah = 0;

            for (let i = 1; i <= sortedVerses.length; i++) {
                const isContiguous = i < sortedVerses.length && sortedVerses[i] === segmentEnd + 1;
                const segmentSize = segmentEnd - segmentStart + 1;

                if (!isContiguous || segmentSize >= 5 || i === sortedVerses.length) {
                    // Create node for this segment if it doesn't exist
                    const nodeId = `verse-${surahId}-${segmentStart}-${segmentEnd}`;
                    const existing = currentNodes.find(n => n.id === nodeId);

                    // Use Staggered Genesis: Spreads new reviews over a 7-day period to avoid avalanches
                    const scheduler = (existing && !forceFullReset)
                        ? existing.scheduler
                        : createNewScheduler(Math.floor(newSegmentsForThisSurah / 10)); // ~10 clusters per day

                    newNodes.push({
                        id: nodeId,
                        type: 'verse',
                        surahId,
                        startVerse: segmentStart,
                        endVerse: segmentEnd,
                        scheduler,
                    });
                    accountedForIds.add(nodeId);

                    if (!existing) newSegmentsForThisSurah++;

                    if (i < sortedVerses.length) {
                        segmentStart = sortedVerses[i];
                        segmentEnd = segmentStart;
                    }
                } else {
                    segmentEnd = sortedVerses[i];
                }
            }
        }
    });

    // 4. PRESERVATION: Add all nodes from currentNodes that were NOT accounted for
    // This ensures that when a surah is unlearned or skipped, its memory progress is preserved in storage.
    currentNodes.forEach(node => {
        if (!accountedForIds.has(node.id)) {
            newNodes.push(node);
        }
    });

    // Orphan Pruning is now explicit: we only prune if we want to.
    // For now, we prefer preservation over pruning to avoid data loss.
    const addedCount = newNodes.length - currentNodes.length;
    if (addedCount !== 0) {
        appLogger.addLog(`Memory nodes updated: ${newNodes.length} total (${addedCount > 0 ? '+' : ''}${addedCount})`, 'info');
    }
    saveMemoryNodes(newNodes);
}

// SM-2 Algorithm
// SM-2 function removed (replaced by FSRS)

import { buryCard } from './fsrs';

export function postponeNode(node: MemoryNode): MemoryNode {
    // Check if FSRS or SM-2
    if (!isSM2State(node.scheduler)) {
        // FSRS
        return {
            ...node,
            scheduler: buryCard(node.scheduler as any)
        };
    }

    // Legacy SM-2 fallback (just increment due date)
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
    imageUrlDark?: string | null;
    anchors: Anchor[];
    isComplete: boolean;
    tldrawSnapshot?: any;
    updatedAt?: string;
    deletedAt?: string;
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
    mindmap.updatedAt = new Date().toISOString();
    maps[mindmap.surahId] = mindmap;
    saveToCacheAndStore(STORAGE_KEYS.MINDMAPS, maps);

    // Create/update memory node for mindmap if complete, otherwise handle "Lapse" or removal
    const nodes = getMemoryNodes();
    const nodeId = `mindmap-${mindmap.surahId}`;
    const nodeIdx = nodes.findIndex(n => n.id === nodeId);

    if (mindmap.deletedAt) {
        // Explicit deletion: remove the review node entirely
        if (nodeIdx !== -1) {
            appLogger.addLog(`Surah ${mindmap.surahId} mindmap deleted. Review node removed.`, 'info');
            saveMemoryNodes(nodes.filter(n => n.id !== nodeId));
        }
        return;
    }

    if (mindmap.isComplete) {
        if (nodeIdx === -1) {
            nodes.push({
                id: nodeId,
                type: 'mindmap',
                surahId: mindmap.surahId,
                scheduler: createNewScheduler(),
            });
            appLogger.addLog(`Review node created for Surah ${mindmap.surahId} mindmap`, 'info');
            saveMemoryNodes(nodes);
        } else {
            // Reactivation: If node exists but was suspended (e.g. cleared due date), set to today
            const node = nodes[nodeIdx];
            const dueDate = getNodeDueDate(node.scheduler);
            if (!dueDate || dueDate === '') {
                node.scheduler = setNodeDueDate(node.scheduler, new Date().toISOString().split('T')[0]);
                appLogger.addLog(`Surah ${mindmap.surahId} mindmap reactivated. Due date set to today.`, 'info');
                saveMemoryNodes(nodes);
            }
        }
    } else if (nodeIdx !== -1) {
        const node = nodes[nodeIdx];
        // Distinguish between a node that has been reviewed and one that is new
        const hasBeenReviewed = hasNodeBeenReviewed(node.scheduler);

        if (hasBeenReviewed) {
            // "Lapse" approach: reduce strength but don't reset to zero
            const oldStability = getNodeStability(node.scheduler);
            node.scheduler = createSuspendedScheduler(node.scheduler);
            const newStability = getNodeStability(node.scheduler);
            appLogger.addLog(`Surah ${mindmap.surahId} mindmap marked incomplete. Lapse applied: stability ${oldStability}d -> ${newStability}d, suspended.`, 'warning');
            saveMemoryNodes(nodes);
        } else {
            // Never reviewed: just remove it until it's complete again
            appLogger.addLog(`Surah ${mindmap.surahId} mindmap removed (never reviewed)`, 'info');
            saveMemoryNodes(nodes.filter(n => n.id !== nodeId));
        }
    }
}

// ========================================
// Part Mindmaps (inter-surah connections)
// ========================================

export interface PartMindMap {
    partId: QuranPart;
    imageUrl: string | null;
    imageUrlDark?: string | null;
    description: string;
    isComplete: boolean;
    tldrawSnapshot?: any;
    updatedAt?: string;
    deletedAt?: string;
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
    mindmap.updatedAt = new Date().toISOString();
    maps[mindmap.partId] = mindmap;
    saveToCacheAndStore(STORAGE_KEYS.PART_MINDMAPS, maps);

    // Create/update memory node for part mindmap if complete, otherwise handle "Lapse" or removal
    const nodes = getMemoryNodes();
    const nodeId = `part-mindmap-${mindmap.partId}`;
    const nodeIdx = nodes.findIndex(n => n.id === nodeId);

    if (mindmap.deletedAt) {
        // Explicit deletion: remove the review node entirely
        if (nodeIdx !== -1) {
            appLogger.addLog(`Part ${mindmap.partId} mindmap deleted. Review node removed.`, 'info');
            saveMemoryNodes(nodes.filter(n => n.id !== nodeId));
        }
        return;
    }

    if (mindmap.isComplete) {
        if (nodeIdx === -1) {
            nodes.push({
                id: nodeId,
                type: 'part_mindmap',
                partId: mindmap.partId,
                scheduler: createNewScheduler(),
            });
            appLogger.addLog(`Review node created for Part ${mindmap.partId} mindmap`, 'info');
            saveMemoryNodes(nodes);
        } else {
            // Reactivation
            const node = nodes[nodeIdx];
            const dueDate = getNodeDueDate(node.scheduler);
            if (!dueDate || dueDate === '') {
                node.scheduler = setNodeDueDate(node.scheduler, new Date().toISOString().split('T')[0]);
                appLogger.addLog(`Part ${mindmap.partId} mindmap reactivated. Due date set to today.`, 'info');
                saveMemoryNodes(nodes);
            }
        }
    } else if (nodeIdx !== -1) {
        const node = nodes[nodeIdx];
        // Distinguish between a node that has been reviewed and one that is new
        const hasBeenReviewed = hasNodeBeenReviewed(node.scheduler);

        if (hasBeenReviewed) {
            // "Lapse" approach: reduce strength but don't reset to zero
            const oldStability = getNodeStability(node.scheduler);
            node.scheduler = createSuspendedScheduler(node.scheduler);
            const newStability = getNodeStability(node.scheduler);
            appLogger.addLog(`Part ${mindmap.partId} mindmap marked incomplete. Lapse applied: stability ${oldStability}d -> ${newStability}d, suspended.`, 'warning');
            saveMemoryNodes(nodes);
        } else {
            // Never reviewed: just remove it until it's complete again
            appLogger.addLog(`Part ${mindmap.partId} mindmap removed (never reviewed)`, 'info');
            saveMemoryNodes(nodes.filter(n => n.id !== nodeId));
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
    portionPointer: number;
    cycles: number;
    updatedAt: string;
}

export function getListeningProgress(partId: QuranPart): ListeningProgress {
    const map = getFromCache<Record<string, ListeningProgress>>(STORAGE_KEYS.LISTENING_PROGRESS, {});
    const existing = map[partId];
    if (existing) return existing;

    // Fallback/Migration: check old separate keys
    const pointers = getFromCache<Record<string, number>>(STORAGE_KEYS.PORTION_POINTERS, {});
    const cyclesMap = getFromCache<Record<string, number>>(STORAGE_KEYS.LISTENING_CYCLES, {});

    return {
        partId,
        currentVerseIndex: 0,
        portionPointer: pointers[partId] || 0,
        cycles: cyclesMap[partId] || 0,
        updatedAt: new Date().toISOString()
    };
}

export function saveListeningProgress(partId: QuranPart, currentVerseIndex: number): void {
    const map = getFromCache<Record<string, ListeningProgress>>(STORAGE_KEYS.LISTENING_PROGRESS, {});
    const existing = getListeningProgress(partId);

    map[partId] = {
        ...existing,
        currentVerseIndex,
        updatedAt: new Date().toISOString()
    };
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

export function getPortionPointer(partId: QuranPart): number {
    return getListeningProgress(partId).portionPointer;
}

export function savePortionPointer(partId: QuranPart, index: number): void {
    const map = getFromCache<Record<string, ListeningProgress>>(STORAGE_KEYS.LISTENING_PROGRESS, {});
    const existing = getListeningProgress(partId);

    map[partId] = {
        ...existing,
        portionPointer: index,
        updatedAt: new Date().toISOString()
    };
    saveToCacheAndStore(STORAGE_KEYS.LISTENING_PROGRESS, map);
}

export function getListeningCycles(partId: QuranPart): number {
    return getListeningProgress(partId).cycles;
}

export function saveListeningCycles(partId: QuranPart, count: number): void {
    const map = getFromCache<Record<string, ListeningProgress>>(STORAGE_KEYS.LISTENING_PROGRESS, {});
    const existing = getListeningProgress(partId);

    map[partId] = {
        ...existing,
        cycles: count,
        updatedAt: new Date().toISOString()
    };
    saveToCacheAndStore(STORAGE_KEYS.LISTENING_PROGRESS, map);
}

export function markListeningComplete(partId: QuranPart, versesPerDay: number, totalVerses: number): void {
    const today = new Date().toISOString().split('T')[0];
    saveToCacheAndStore(STORAGE_KEYS.LISTENING_COMPLETE, today);

    const map = getFromCache<Record<string, ListeningProgress>>(STORAGE_KEYS.LISTENING_PROGRESS, {});
    const existing = getListeningProgress(partId);

    let nextPointer = existing.portionPointer + versesPerDay;
    let nextCycles = existing.cycles;

    if (nextPointer >= totalVerses) {
        nextPointer = nextPointer % totalVerses;
        nextCycles += 1;
    }

    map[partId] = {
        ...existing,
        currentVerseIndex: 0,
        portionPointer: nextPointer,
        cycles: nextCycles,
        updatedAt: new Date().toISOString()
    };

    saveToCacheAndStore(STORAGE_KEYS.LISTENING_PROGRESS, map);
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
// FSRS Review Logs (for optimization)
// ========================================



export function getReviewLogs(): ReviewLogEntry[] {
    return getFromCache(STORAGE_KEYS.FSRS_REVIEW_LOGS, []);
}

export function saveReviewLog(log: ReviewLogEntry): void {
    const logs = getReviewLogs();
    logs.push(log);
    // Keep last 2000 logs for optimization (allows multiple optimization cycles)
    const trimmed = logs.slice(-2000);
    saveToCacheAndStore(STORAGE_KEYS.FSRS_REVIEW_LOGS, trimmed);
}

export function getReviewLogCount(): number {
    return getReviewLogs().length;
}

export function clearReviewLogs(): void {
    saveToCacheAndStore(STORAGE_KEYS.FSRS_REVIEW_LOGS, []);
}

// ========================================
// FSRS Optimization Metadata
// ========================================

const DEFAULT_OPTIMIZATION_META: OptimizationMeta = {
    lastOptimizedAt: null,
    logCountAtLastOptimization: 0,
    customWeights: null,
};

export function getOptimizationMeta(): OptimizationMeta {
    return getFromCache(STORAGE_KEYS.FSRS_OPTIMIZATION_META, DEFAULT_OPTIMIZATION_META);
}

export function saveOptimizationMeta(meta: OptimizationMeta): void {
    saveToCacheAndStore(STORAGE_KEYS.FSRS_OPTIMIZATION_META, meta);
}

export function getCustomWeights(): number[] | undefined {
    return getOptimizationMeta().customWeights || undefined;
}

export function saveCustomWeights(weights: number[]): void {
    const meta = getOptimizationMeta();
    meta.customWeights = weights;
    saveOptimizationMeta(meta);
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

export function getMaturityLevel(interval: number): MaturityLevel {
    if (interval <= 3) return 'reset';
    if (interval <= 14) return 'medium';
    if (interval <= 45) return 'strong';
    return 'mastered';
}

export function setNodeMaturity(nodeId: string, level: MaturityLevel): void {
    const nodes = getMemoryNodes();
    const index = nodes.findIndex(n => n.id === nodeId);
    if (index === -1) return;

    const node = nodes[index];

    // Use FSRS preset logic
    node.scheduler = createPresetState(level);

    // If existing node had ID or other props, scheduler is just the state
    // FSRSState has: due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review
    // MemoryNode.scheduler is union. createPresetState returns FSRSState.
    // So this assignment is valid.

    saveMemoryNodes(nodes);
}

export function setSurahMaturity(surahId: number, level: MaturityLevel): void {
    const nodes = getMemoryNodes();
    const now = new Date();

    const updatedNodes = nodes.map(node => {
        if (node.surahId !== surahId || (node.type !== 'verse' && node.type !== 'mindmap')) {
            return node;
        }

        // Use FSRS preset
        return {
            ...node,
            scheduler: createPresetState(level)
        };
    });

    saveMemoryNodes(updatedNodes);
}

export function setGroupMaturity(type: 'verse' | 'mindmap' | 'part_mindmap', level: MaturityLevel, surahId?: number): void {
    const nodes = getMemoryNodes();
    const now = new Date();

    const updatedNodes = nodes.map(node => {
        if (node.type !== type) {
            return node;
        }

        // Filter by surahId if provided
        if (surahId !== undefined && node.surahId !== surahId) {
            return node;
        }

        // Use FSRS preset
        return {
            ...node,
            scheduler: createPresetState(level)
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
    const errors = getReviewErrors();
    const issueErrors = errors.filter(err => err.surahId === surahId && err.anchorId === anchorId);

    // 1. Clear the errors to unsuspend
    const remaining = errors.filter(err => !(err.surahId === surahId && err.anchorId === anchorId));
    saveToCacheAndStore(STORAGE_KEYS.REVIEW_ERRORS, remaining);

    // 2. Identify and trigger re-learning for the associated MemoryNode
    if (issueErrors.length > 0) {
        const nodeId = issueErrors[0].nodeId;
        const nodes = getMemoryNodes();
        const nodeIdx = nodes.findIndex(n => n.id === nodeId);

        if (nodeIdx !== -1) {
            const node = nodes[nodeIdx];
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);

            // Check if FSRS or SM-2 and handle accordingly
            // Check if FSRS or SM-2
            if (!isSM2State(node.scheduler)) {
                // Already FSRS: just unsuspend
                node.scheduler = unsuspendCard(node.scheduler as any);
            } else {
                // SM-2: Migrate first, then unsuspend
                const fsrsState = migrateSM2ToFSRS(node.scheduler as any);
                node.scheduler = unsuspendCard(fsrsState);
            }

            saveMemoryNodes(nodes);
        }
    }
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
    updatedAt?: string;
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
    // Add updatedAt for proper sync merge ordering
    decisions[key] = {
        ...decision,
        updatedAt: new Date().toISOString()
    };
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

        // Update settings but preserve artifacts
        if (status === 'learned') {
            settings.skippedSurahs = (settings.skippedSurahs || []).filter(sId => sId !== id);
            const verseIds = Array.from({ length: surah.verseCount }, (_, i) => i + 1);
            settings.learnedVerses[surahKey] = verseIds;
        } else if (status === 'skipped') {
            settings.skippedSurahs = Array.from(new Set([...(settings.skippedSurahs || []), id]));
        } else if (status === 'new') {
            settings.skippedSurahs = (settings.skippedSurahs || []).filter(sId => sId !== id);
            delete settings.learnedVerses[surahKey];
        }
    });

    if (settings.skippedSurahs) {
        settings.skippedSurahs.sort((a, b) => a - b);
    }

    saveSettings(settings);
    // Sync memory nodes to ensure UI reflects current status visibility
    syncMemoryNodesWithLearned();
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

export function getAudioSettings(): AudioSettings | undefined {
    return audioSettings$.get();
}

export function saveAudioSettings(settings: AudioSettings): void {
    settings.updatedAt = new Date().toISOString();
    audioSettings$.set(settings);
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
    audioSettings?: AudioSettings;
    cycleStart?: string;
    listeningComplete?: string | null;
    lastResolvedFor?: string;
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
        audioSettings: getAudioSettings(),
        cycleStart: getCycleStart(),
        listeningComplete: getFromCache(STORAGE_KEYS.LISTENING_COMPLETE, null),
        lastResolvedFor: getFromCache(STORAGE_KEYS.LAST_RESOLVED_FOR, undefined),
        exportedAt: getFromCache(STORAGE_KEYS.LAST_MODIFIED, new Date().toISOString()),
    };
}

export function importBackup(data: BackupData): void {
    if (data.settings) saveSettings(data.settings);
    if (data.memoryNodes) saveMemoryNodes(data.memoryNodes);
    if (data.mindmaps) {
        const current = getMindMaps();
        const incoming = data.mindmaps;
        Object.keys(incoming).forEach(id => {
            // Protect against malformed boolean values in map
            if (incoming[id] && typeof incoming[id] === 'object') {
                if (!incoming[id].imageUrl && current[id]?.imageUrl) {
                    incoming[id].imageUrl = current[id].imageUrl;
                    incoming[id].imageUrlDark = current[id].imageUrlDark;
                }
            }
        });
        saveToCacheAndStore(STORAGE_KEYS.MINDMAPS, incoming);
    }
    if (data.partMindmaps) {
        const current = getPartMindMaps();
        const incoming = data.partMindmaps;
        Object.keys(incoming).forEach(id => {
            const pId = id as any;
            // Protect against malformed boolean values in map
            if (incoming[pId] && typeof incoming[pId] === 'object') {
                if (!incoming[pId].imageUrl && current[pId]?.imageUrl) {
                    incoming[pId].imageUrl = current[pId].imageUrl;
                    incoming[pId].imageUrlDark = current[pId].imageUrlDark;
                }
            }
        });
        saveToCacheAndStore(STORAGE_KEYS.PART_MINDMAPS, incoming);
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
    if (data.audioSettings) {
        audioSettings$.set(data.audioSettings);
    }
    if (data.cycleStart) setCycleStart(data.cycleStart);
    if (data.listeningComplete) saveToCacheAndStore(STORAGE_KEYS.LISTENING_COMPLETE, data.listeningComplete);
    if (data.lastResolvedFor) saveToCacheAndStore(STORAGE_KEYS.LAST_RESOLVED_FOR, data.lastResolvedFor);

    // Finally, update the last modified timestamp to match the imported backup's time
    if (data.exportedAt) {
        saveToCacheAndStore(STORAGE_KEYS.LAST_MODIFIED, data.exportedAt);
    }
}
