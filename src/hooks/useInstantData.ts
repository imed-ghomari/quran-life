import { useCallback, useEffect, useMemo, useState } from 'react';
import { id } from '@instantdb/react';
import { db } from '@/lib/instant';
import { isUuid, resolveEntityId, stableEntityId } from '@/lib/instantIds';
import { transactWithRetry } from '@/lib/instantTransact';
import { getSurahsByPart } from '@/lib/quranData';
import {
    ALL_QURAN_PART,
    AppSettings,
    LEGACY_ALL_QURAN_PART,
    ListeningProgressEntry,
    MemoryNode,
    MindMap,
    QuranPart,
    ReviewError,
} from '@/lib/types';
import { sanitizeMindmapSnapshot } from '@/lib/mindmapSnapshot';
import { normalizeReviewSortOrder } from '@/lib/reviewSortOrder';
import {
    clampDailyTargetMinutes,
    DEFAULT_DAILY_TARGET_MINUTES,
    estimateSurahDurationMinutes,
} from '@/lib/dailyPortionUtils';

const LOCKED_SKIPPED_SURAH_ID = 1;
const MAX_FSRS_REVIEW_LOGS = 3000;

const normalizeSkippedSurahs = (value: unknown): number[] => {
    const normalized = new Set<number>([LOCKED_SKIPPED_SURAH_ID]);
    if (Array.isArray(value)) {
        value.forEach((surahId) => {
            const parsed = Number(surahId);
            if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 114) {
                normalized.add(parsed);
            }
        });
    }
    return Array.from(normalized).sort((a, b) => a - b);
};

const hasPositiveNumber = (value: unknown): value is number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0;
};

const deriveLegacyDailyTargetMinutes = (settingsLike: Partial<AppSettings>): number => {
    const completionDays = hasPositiveNumber(settingsLike.completionDays)
        ? Number(settingsLike.completionDays)
        : 30;
    const activePart = isValidQuranPart(settingsLike.activePart) ? settingsLike.activePart : ALL_QURAN_PART;
    const mode = settingsLike.dailyPortionMode === 'reading' ? 'reading' : 'audio';
    const skippedSurahs = new Set(normalizeSkippedSurahs(settingsLike.skippedSurahs));
    const includedSurahs = getSurahsByPart(activePart).filter((surah) => !skippedSurahs.has(surah.id));

    const totalMinutes = includedSurahs.reduce((total, surah) => (
        total + estimateSurahDurationMinutes(surah.id, mode)
    ), 0);

    if (!hasPositiveNumber(totalMinutes)) {
        return DEFAULT_DAILY_TARGET_MINUTES;
    }

    return clampDailyTargetMinutes(Math.ceil(totalMinutes / completionDays));
};

// Static defaults to ensure reference stability
const DEFAULT_SETTINGS_BASE: Omit<AppSettings, 'userId' | 'lastSyncedAt'> = {
    completionDays: 30,
    dailyTargetMinutes: DEFAULT_DAILY_TARGET_MINUTES,
    activePart: ALL_QURAN_PART,
    partSystemVersion: 2,
    learnedVerses: {},
    skippedSurahs: normalizeSkippedSurahs([]),
    todoDefaultFilter: 'all',
    reviewSortOrder: 'due_date',
    completeExitBehavior: 'mindmap_and_verses',
    kanbanSortOrder: 'type_then_number',
    dailyPortionMode: 'audio',
    dailyReadingStyle: 'paragraph',
    todayDefaultMode: 'daily',
    theme: 'system',
    accentTheme: 'default',
    isOnboardingComplete: false,
    kanbanColumns: {},
    suspendedVerseGroupsAcknowledged: {},
};

const parseMindmapSurahFromTarget = (targetId?: string) => {
    if (!targetId) return undefined;
    const m = targetId.match(/^mindmap-(\d+)$/);
    if (!m) return undefined;
    const parsed = Number.parseInt(m[1], 10);
    return Number.isFinite(parsed) ? parsed : undefined;
};

const parsePartFromTarget = (targetId?: string) => {
    if (!targetId) return undefined;
    const m = targetId.match(/^part-mindmap-(\d+)$/);
    if (!m) return undefined;
    const parsed = Number.parseInt(m[1], 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

const parseAnchorRangeFromTarget = (targetId?: string) => {
    if (!targetId) return undefined;
    const m = targetId.match(/^anchor-(\d+)-(\d+)-(\d+)$/);
    if (!m) return undefined;
    const surahId = Number.parseInt(m[1], 10);
    const startVerse = Number.parseInt(m[2], 10);
    const endVerse = Number.parseInt(m[3], 10);
    if (!Number.isFinite(surahId) || !Number.isFinite(startVerse) || !Number.isFinite(endVerse)) return undefined;
    return { surahId, startVerse, endVerse };
};

const isValidQuranPart = (value: unknown): value is QuranPart => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= ALL_QURAN_PART;
};

const getLocalDayKeyFromMs = (ms: number) => {
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const isInstantMissingEntityUpdateError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error || '');
    return message.includes("Updating entities that don't exist");
};

const isInstantAlreadyExistingCreateError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error || '');
    return message.includes('Creating entities that already exist');
};

const memoryNodeLogicalKey = (node: MemoryNode) => {
    if (node.type === 'mindmap') {
        const surahId = node.surahId ?? parseMindmapSurahFromTarget(node.targetId);
        return stableEntityId('memory_node', 'mindmap', surahId ?? 'na');
    }
    if (node.type === 'part_mindmap') {
        const partId = node.partId ?? parsePartFromTarget(node.targetId);
        return stableEntityId('memory_node', 'part_mindmap', partId ?? 'na');
    }
    if (node.type === 'verse_segment') {
        const anchorTarget = parseAnchorRangeFromTarget(node.targetId);
        const surahId = node.surahId ?? anchorTarget?.surahId;
        const startVerse = node.startVerse ?? anchorTarget?.startVerse;
        const endVerse = node.endVerse ?? anchorTarget?.endVerse;
        return stableEntityId('memory_node', 'verse_segment', surahId ?? 'na', startVerse ?? 'na', endVerse ?? 'na');
    }
    return stableEntityId('memory_node', 'id', node.id);
};

const getNodeFreshnessScore = (node: MemoryNode) => {
    const scheduler = (node.scheduler as any) || {};
    const lastReview = scheduler.last_review ? Date.parse(String(scheduler.last_review)) : NaN;
    if (Number.isFinite(lastReview)) return lastReview;
    const due = scheduler.due || scheduler.dueDate;
    const dueMs = due ? Date.parse(String(due)) : NaN;
    if (Number.isFinite(dueMs)) return dueMs;
    const createdAt = node.createdAt ? Date.parse(String(node.createdAt)) : NaN;
    if (Number.isFinite(createdAt)) return createdAt;
    return 0;
};

// ==========================================
// Settings Hook
// ==========================================
export function useInstantSettings() {
    const { user, isLoading: isAuthLoading } = db.useAuth();
    const { data, isLoading: isDataLoading, error } = db.useQuery({
        settings: {
            $: {
                where: { userId: user?.id || '' },
            },
        },
    });
    const isLoading = isAuthLoading || isDataLoading;

    const settingsEntry = useMemo(() => {
        const entries = (data?.settings || []) as any[];
        if (entries.length === 0) return undefined;
        if (entries.length === 1) return entries[0];
        return [...entries].sort((a, b) => {
            const aTs = Date.parse(a?.lastSyncedAt || a?.updatedAt || '');
            const bTs = Date.parse(b?.lastSyncedAt || b?.updatedAt || '');
            return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
        })[0];
    }, [data?.settings]);

    const currentSettings = useMemo(() => {
        const base = {
            ...DEFAULT_SETTINGS_BASE,
            userId: user?.id || '',
            lastSyncedAt: new Date().toISOString(),
        };
        if (!settingsEntry) return base;
        const merged = { ...base, ...settingsEntry } as AppSettings;
        const rawVersion = Number((settingsEntry as any).partSystemVersion ?? 1);
        const normalizedActivePart = isValidQuranPart(merged.activePart) ? merged.activePart : ALL_QURAN_PART;
        const normalizedDailyTargetMinutes = hasPositiveNumber((settingsEntry as any).dailyTargetMinutes)
            ? clampDailyTargetMinutes(Number((settingsEntry as any).dailyTargetMinutes))
            : deriveLegacyDailyTargetMinutes(merged);
        return {
            ...merged,
            partSystemVersion: rawVersion,
            activePart: rawVersion < 2 && normalizedActivePart === LEGACY_ALL_QURAN_PART
                ? ALL_QURAN_PART
                : normalizedActivePart,
            dailyTargetMinutes: normalizedDailyTargetMinutes,
            skippedSurahs: normalizeSkippedSurahs((merged as any).skippedSurahs),
            reviewSortOrder: normalizeReviewSortOrder((merged as any).reviewSortOrder),
        };
    }, [settingsEntry, user?.id]);

    useEffect(() => {
        if (!user || !settingsEntry) return;

        const rawVersion = Number((settingsEntry as any).partSystemVersion ?? 1);
        if (rawVersion >= 2) return;

        const rawActivePart = Number((settingsEntry as any).activePart);
        const migratedActivePart: QuranPart =
            rawActivePart === LEGACY_ALL_QURAN_PART
                ? ALL_QURAN_PART
                : (isValidQuranPart(rawActivePart) ? rawActivePart : ALL_QURAN_PART);

        const settingsId = resolveEntityId(settingsEntry.id, 'settings', user.id);
        void transactWithRetry(db.tx.settings[settingsId].update({
            activePart: migratedActivePart,
            partSystemVersion: 2,
            lastSyncedAt: new Date().toISOString(),
        }));
    }, [settingsEntry, user]);

    useEffect(() => {
        if (!user || !settingsEntry) return;

        const normalizedSkippedSurahs = normalizeSkippedSurahs((settingsEntry as any).skippedSurahs);
        const rawSkippedSurahs = Array.isArray((settingsEntry as any).skippedSurahs)
            ? (settingsEntry as any).skippedSurahs
                .map((surahId: unknown) => Number(surahId))
                .filter((surahId: number) => Number.isInteger(surahId) && surahId >= 1 && surahId <= 114)
                .sort((a: number, b: number) => a - b)
            : [];

        const hasDiff =
            normalizedSkippedSurahs.length !== rawSkippedSurahs.length ||
            normalizedSkippedSurahs.some((surahId, index) => rawSkippedSurahs[index] !== surahId);

        if (!hasDiff) return;

        const settingsId = resolveEntityId(settingsEntry.id, 'settings', user.id);
        void transactWithRetry(db.tx.settings[settingsId].update({
            skippedSurahs: normalizedSkippedSurahs,
            lastSyncedAt: new Date().toISOString(),
        }));
    }, [settingsEntry, user]);

    useEffect(() => {
        if (!user || !settingsEntry) return;

        const normalizedReviewSortOrder = normalizeReviewSortOrder((settingsEntry as any).reviewSortOrder);
        if ((settingsEntry as any).reviewSortOrder === normalizedReviewSortOrder) return;

        const settingsId = resolveEntityId(settingsEntry.id, 'settings', user.id);
        void transactWithRetry(db.tx.settings[settingsId].update({
            reviewSortOrder: normalizedReviewSortOrder,
            lastSyncedAt: new Date().toISOString(),
        }));
    }, [settingsEntry, user]);

    useEffect(() => {
        if (!user || !settingsEntry) return;
        if (hasPositiveNumber((settingsEntry as any).dailyTargetMinutes)) return;

        const settingsId = resolveEntityId(settingsEntry.id, 'settings', user.id);
        void transactWithRetry(db.tx.settings[settingsId].update({
            dailyTargetMinutes: deriveLegacyDailyTargetMinutes(settingsEntry as AppSettings),
            lastSyncedAt: new Date().toISOString(),
        }));
    }, [settingsEntry, user]);

    const saveSettings = useCallback(async (newSettings: Partial<AppSettings>) => {
        if (!user) return;

        const normalizedSettings: Partial<AppSettings> = { ...newSettings };
        if (Object.prototype.hasOwnProperty.call(newSettings, 'skippedSurahs')) {
            normalizedSettings.skippedSurahs = normalizeSkippedSurahs(newSettings.skippedSurahs);
        }
        if (Object.prototype.hasOwnProperty.call(newSettings, 'reviewSortOrder')) {
            normalizedSettings.reviewSortOrder = normalizeReviewSortOrder(newSettings.reviewSortOrder);
        }
        if (Object.prototype.hasOwnProperty.call(newSettings, 'dailyTargetMinutes')) {
            normalizedSettings.dailyTargetMinutes = clampDailyTargetMinutes(Number(newSettings.dailyTargetMinutes));
        }

        const syncedAt = new Date().toISOString();
        const settingsId = settingsEntry
            ? resolveEntityId(settingsEntry.id, 'settings', user.id)
            : stableEntityId('settings', user.id);
        const basePayload = {
            ...DEFAULT_SETTINGS_BASE,
            ...normalizedSettings,
            userId: user.id,
            partSystemVersion: 2,
            lastSyncedAt: syncedAt,
        };
        const updatePayload = settingsEntry
            ? {
                ...normalizedSettings,
                partSystemVersion: 2,
                lastSyncedAt: syncedAt,
            }
            : basePayload;
        const updateTx = db.tx.settings[settingsId].update(updatePayload);
        const createTx = db.tx.settings[settingsId].create(basePayload);

        await transactWithRetry(updateTx).catch(async (updateError) => {
            if (!isInstantMissingEntityUpdateError(updateError)) {
                throw updateError;
            }
            try {
                return await transactWithRetry(createTx);
            } catch (createError) {
                if (!isInstantAlreadyExistingCreateError(createError)) {
                    throw createError;
                }
                return transactWithRetry(updateTx);
            }
        });
    }, [settingsEntry, user]);

    const results = useMemo(() => ({
        settings: { ...currentSettings, id: settingsEntry?.id },
        saveSettings,
        isLoading,
        error,
        user
    }), [currentSettings, settingsEntry?.id, saveSettings, isLoading, error, user]);

    return results;
}

// ==========================================
// Memory Nodes Hook
// ==========================================
export function useInstantNodes() {
    const { user } = db.useAuth();
    const [dueNowMs, setDueNowMs] = useState(() => Date.now());
    const { isLoading, error, data } = db.useQuery({
        memoryNodes: {
            $: {
                where: { userId: user?.id || '' }
            }
        }
    });

    const nodes = useMemo(() => {
        const raw = (data?.memoryNodes || []) as unknown as MemoryNode[];
        return raw.filter(node => {
            if ((node as any).type === 'transition') return false;
            if (!user?.id) return false;
            return String((node as any).userId || '') === user.id;
        });
    }, [data?.memoryNodes, user?.id]);

    const canonicalNodes = useMemo(() => {
        const byKey = new Map<string, MemoryNode>();
        for (const node of nodes) {
            const key = memoryNodeLogicalKey(node);
            const existing = byKey.get(key);
            if (!existing) {
                byKey.set(key, node);
                continue;
            }

            const nodeScore = getNodeFreshnessScore(node);
            const existingScore = getNodeFreshnessScore(existing);
            if (nodeScore > existingScore) {
                byKey.set(key, node);
                continue;
            }
            if (nodeScore === existingScore && node.id > existing.id) {
                byKey.set(key, node);
            }
        }
        return Array.from(byKey.values());
    }, [nodes]);

    const transitionIds = useMemo(() => {
        const raw = (data?.memoryNodes || []) as unknown as MemoryNode[];
        return raw.filter(node => (node as any).type === 'transition').map(node => node.id);
    }, [data?.memoryNodes]);

    useEffect(() => {
        if (!user || transitionIds.length === 0) return;
        const tx = transitionIds
            .filter(nodeId => isUuid(nodeId))
            .map(nodeId => db.tx.memoryNodes[nodeId].delete());
        if (tx.length === 0) return;
        void transactWithRetry(tx);
    }, [user, transitionIds]);

    useEffect(() => {
        let timeoutId: number | null = null;

        const scheduleAdaptiveRefresh = () => {
            const now = Date.now();
            let nextWakeMs = Number.POSITIVE_INFINITY;

            // Find the nearest future due with time precision.
            for (const node of nodes) {
                const dueString = (node.scheduler as any)?.due || (node.scheduler as any)?.dueDate;
                if (!dueString || !dueString.includes('T')) continue;
                const dueMs = new Date(dueString).getTime();
                if (!Number.isFinite(dueMs) || dueMs <= now) continue;
                if (dueMs < nextWakeMs) nextWakeMs = dueMs;
            }

            // Always wake at local day rollover for date-based due cards.
            const nextMidnight = new Date();
            nextMidnight.setHours(24, 0, 0, 0);
            nextWakeMs = Math.min(nextWakeMs, nextMidnight.getTime());

            const delay = Math.max(1000, nextWakeMs - now + 250);
            timeoutId = window.setTimeout(() => {
                setDueNowMs(Date.now());
            }, delay);
        };

        const refreshDueClock = () => setDueNowMs(Date.now());
        window.addEventListener('focus', refreshDueClock);
        document.addEventListener('visibilitychange', refreshDueClock);
        scheduleAdaptiveRefresh();

        return () => {
            if (timeoutId !== null) window.clearTimeout(timeoutId);
            window.removeEventListener('focus', refreshDueClock);
            document.removeEventListener('visibilitychange', refreshDueClock);
        };
    }, [nodes, dueNowMs]);

    // Force an immediate due-clock refresh when node snapshots change.
    // Without this, newly created "due now" cards can wait for the adaptive timer tick.
    useEffect(() => {
        setDueNowMs(Date.now());
    }, [canonicalNodes]);

    const dueNodes = useMemo(() => canonicalNodes.filter(node => {
        if (!node.scheduler) return false;
        const dueString = (node.scheduler as any).due || (node.scheduler as any).dueDate;
        if (!dueString) return true;
        if (typeof dueString === 'string' && !dueString.includes('T')) {
            const dueKeyMatch = dueString.match(/\d{4}-\d{2}-\d{2}/);
            if (!dueKeyMatch) return false;
            const todayKey = getLocalDayKeyFromMs(dueNowMs);
            return dueKeyMatch[0] <= todayKey;
        }

        const due = new Date(dueString);
        if (Number.isNaN(due.getTime())) return false;
        return due.getTime() <= dueNowMs;
    }), [canonicalNodes, dueNowMs]);

    const saveNode = useCallback((node: MemoryNode) => {
        if (!user) return Promise.resolve();
        const canReuseCandidateId = isUuid(node.id) && canonicalNodes.some(existingNode => existingNode.id === node.id);
        const nodeId = canReuseCandidateId
            ? (node.id as string)
            : resolveEntityId(undefined, 'memory_node', user.id, memoryNodeLogicalKey(node));
        const payload = {
            ...node,
            userId: user.id
        };

        const updateTx = db.tx.memoryNodes[nodeId].update(payload);
        const createTx = db.tx.memoryNodes[nodeId].create(payload);

        return transactWithRetry(updateTx)
            .catch(async (updateError) => {
                if (!isInstantMissingEntityUpdateError(updateError)) {
                    throw updateError;
                }
                try {
                    return await transactWithRetry(createTx);
                } catch (createError) {
                    if (!isInstantAlreadyExistingCreateError(createError)) {
                        throw createError;
                    }
                    // Another client created it between update/create attempts.
                    return transactWithRetry(updateTx);
                }
            })
            .finally(() => {
                setDueNowMs(Date.now());
            });
    }, [user, canonicalNodes]);

    const deleteNode = useCallback(async (nodeId: string) => {
        if (!user) return Promise.resolve();
        if (!isUuid(nodeId)) return Promise.resolve();
        try {
            return await transactWithRetry(db.tx.memoryNodes[nodeId].delete());
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error || '');
            if (message.includes('not perms-pass')) {
                console.warn('Skipping memory node delete due to permission mismatch', { nodeId, userId: user.id });
                return;
            }
            throw error;
        } finally {
            setDueNowMs(Date.now());
        }
    }, [user]);

    return useMemo(() => ({
        nodes: canonicalNodes,
        dueNodes,
        saveNode,
        deleteNode,
        isLoading,
        error
    }), [canonicalNodes, dueNodes, saveNode, deleteNode, isLoading, error]);
}

// ==========================================
// MindMaps Hook
// ==========================================
export function useInstantMindMaps() {
    const { user } = db.useAuth();
    const { isLoading, error, data } = db.useQuery({
        mindMaps: {
            $: {
                where: { userId: user?.id || '' }
            }
        },
        partMindMaps: {
            $: {
                where: { userId: user?.id || '' }
            }
        }
    });

    const mindmaps = useMemo(() => (data?.mindMaps || []) as unknown as MindMap[], [data?.mindMaps]);
    const partMindMaps = useMemo(() => (data?.partMindMaps || []) as unknown as any[], [data?.partMindMaps]);

    const saveMindMap = useCallback((surahId: number, mapData: Partial<MindMap>, options?: { mergeExisting?: boolean }) => {
        if (!user) return Promise.resolve();
        const existing = mindmaps.find(m => Number((m as any).surahId) === surahId);
        const mapId = resolveEntityId((existing as any)?.id, 'mindmap', user.id, surahId);
        const mergeExisting = options?.mergeExisting !== false;

        // Merge existing data with new data to preserve fields like anchors
        const mergedData = mergeExisting && existing ? { ...existing, ...mapData } : mapData;
        
        const sanitizedData: any = { ...mergedData };
        delete sanitizedData.imageUrl;
        delete sanitizedData.imageUrlDark;
        if (sanitizedData.tldrawSnapshot) {
            sanitizedData.tldrawSnapshot = sanitizeMindmapSnapshot(sanitizedData.tldrawSnapshot);
        }

        return transactWithRetry(db.tx.mindMaps[mapId].update({
            ...sanitizedData,
            surahId,
            userId: user.id,
            updatedAt: new Date().toISOString()
        }));
    }, [user, mindmaps]);

    const savePartMindMap = useCallback((partId: number, mapData: any, options?: { mergeExisting?: boolean }) => {
        if (!user) return Promise.resolve();
        const existing = partMindMaps.find(m => Number((m as any).partId) === partId);
        const mapId = resolveEntityId(existing?.id, 'part_mindmap', user.id, partId);
        const mergeExisting = options?.mergeExisting !== false;

        // Merge existing data with new data to preserve all fields
        const mergedData = mergeExisting && existing ? { ...existing, ...mapData } : mapData;
        const sanitizedData: any = { ...mergedData };
        delete sanitizedData.imageUrl;
        delete sanitizedData.imageUrlDark;
        if (sanitizedData.tldrawSnapshot) {
            sanitizedData.tldrawSnapshot = sanitizeMindmapSnapshot(sanitizedData.tldrawSnapshot);
        }

        return transactWithRetry(db.tx.partMindMaps[mapId].update({
            ...sanitizedData,
            partId,
            userId: user.id,
            updatedAt: new Date().toISOString()
        }));
    }, [user, partMindMaps]);

    const deleteMindMap = useCallback((mindMapId: string) => {
        if (!user) return Promise.resolve();
        if (!isUuid(mindMapId)) return Promise.resolve();
        return transactWithRetry(db.tx.mindMaps[mindMapId].delete());
    }, [user]);

    const deletePartMindMap = useCallback((partMindMapId: string) => {
        if (!user) return Promise.resolve();
        if (!isUuid(partMindMapId)) return Promise.resolve();
        return transactWithRetry(db.tx.partMindMaps[partMindMapId].delete());
    }, [user]);

    return useMemo(() => ({
        mindmaps,
        partMindMaps,
        saveMindMap,
        savePartMindMap,
        deleteMindMap,
        deletePartMindMap,
        isLoading,
        error
    }), [mindmaps, partMindMaps, saveMindMap, savePartMindMap, deleteMindMap, deletePartMindMap, isLoading, error]);
}

// ==========================================
// MindMap Snapshot Hook (On-demand fetching of large snapshots)
// ==========================================
export function useMindMapSnapshot(options: { surahId?: number; partId?: number }) {
    const { user, isLoading: isAuthLoading } = db.useAuth();
    const userId = user?.id || '';
    const { surahId, partId } = options;
    const shouldQuery = !isAuthLoading && !!userId && (surahId !== undefined || partId !== undefined);

    const query = useMemo(() => {
        if (!shouldQuery) return null;
        if (surahId !== undefined) {
            return {
                mindMaps: {
                    $: { where: { userId, surahId } }
                }
            } as any;
        }
        if (partId !== undefined) {
            return {
                partMindMaps: {
                    $: { where: { userId, partId } }
                }
            } as any;
        }
        return null;
    }, [shouldQuery, userId, surahId, partId]);

    const { isLoading: isQueryLoading, error, data } = db.useQuery(query);

    const snapshot = useMemo(() => {
        const d = data as any;
        if (surahId !== undefined) {
            return d?.mindMaps?.[0]?.tldrawSnapshot;
        }
        if (partId !== undefined) {
            return d?.partMindMaps?.[0]?.tldrawSnapshot;
        }
        return undefined;
    }, [data, surahId, partId]);

    return {
        snapshot,
        isLoading: shouldQuery ? isQueryLoading : isAuthLoading,
        error,
    };
}

// ==========================================
// Listening Stats Hook
// ==========================================
export function useInstantListeningStats() {
    const { user } = db.useAuth();
    const { isLoading, error, data } = db.useQuery({
        listeningStats: {
            $: { where: { userId: user?.id || '' } }
        }
    });

    const stats = useMemo(() => (data?.listeningStats || []) as unknown as any[], [data?.listeningStats]);

    const saveStats = useCallback((surahId: number, newStats: any) => {
        if (!user) return Promise.resolve();
        const existing = stats.find(s => s.surahId === surahId);
        const statsId = resolveEntityId(existing?.id, 'listening_stats', user.id, surahId);

        return transactWithRetry(db.tx.listeningStats[statsId].update({
            ...newStats,
            surahId,
            userId: user.id
        }));
    }, [user, stats]);

    const deleteStats = useCallback((surahId: number) => {
        if (!user) return Promise.resolve();
        const existing = stats.find(s => s.surahId === surahId);
        if (!isUuid(existing?.id)) return Promise.resolve();
        return transactWithRetry(db.tx.listeningStats[existing.id].delete());
    }, [user, stats]);

    return useMemo(() => ({ stats, saveStats, deleteStats, isLoading, error }), [stats, saveStats, deleteStats, isLoading, error]);
}

// ==========================================
// Listening Progress Hook (Per Part)
// ==========================================
export function useInstantListeningProgress() {
    const { user } = db.useAuth();
    const { isLoading, error, data } = db.useQuery({
        listeningProgress: {
            $: { where: { userId: user?.id || '' } }
        }
    });

    const progress = useMemo(
        () => (data?.listeningProgress || []) as unknown as ListeningProgressEntry[],
        [data?.listeningProgress],
    );

    const saveProgress = useCallback((entry: ListeningProgressEntry) => {
        if (!user) return Promise.resolve();
        const existing = progress.find(p => p.partId === entry.partId);
        const progressId = resolveEntityId(existing?.id, 'listening_progress', user.id, entry.partId);
        const normalizedLastVerseIndex = Number.isFinite(Number(entry.lastVerseIndex))
            ? Math.max(0, Math.trunc(Number(entry.lastVerseIndex)))
            : (existing?.lastVerseIndex ?? 0);

        return transactWithRetry(db.tx.listeningProgress[progressId].update({
            partId: entry.partId,
            lastVerseIndex: normalizedLastVerseIndex,
            nextStartVerseKey: entry.nextStartVerseKey,
            cycles: entry.cycles !== undefined ? entry.cycles : (existing?.cycles || 0),
            updatedAt: entry.updatedAt || new Date().toISOString(),
            userId: user.id
        }));
    }, [user, progress]);

    const deleteProgress = useCallback((partId: number) => {
        if (!user) return Promise.resolve();
        const existing = progress.find(p => p.partId === partId);
        if (!isUuid(existing?.id)) return Promise.resolve();
        return transactWithRetry(db.tx.listeningProgress[existing.id].delete());
    }, [user, progress]);

    return useMemo(() => ({ progress, saveProgress, deleteProgress, isLoading, error }), [progress, saveProgress, deleteProgress, isLoading, error]);
}

// ==========================================
// Mutashabihat Hook (Decisions & Custom)
// ==========================================
export function useInstantMutashabihat() {
    const { user } = db.useAuth();
    const { isLoading, error, data } = db.useQuery({
        mutashabihatDecisions: { $: { where: { userId: user?.id || '' } } },
        customMutashabihat: { $: { where: { userId: user?.id || '' } } }
    });

    const decisions = useMemo(() => (data?.mutashabihatDecisions || []) as unknown as any[], [data?.mutashabihatDecisions]);
    const custom = useMemo(() => (data?.customMutashabihat || []) as unknown as any[], [data?.customMutashabihat]);

    const saveDecision = useCallback((phraseId: string, update: any) => {
        if (!user) return Promise.resolve();
        const existing = decisions.find(d => d.phraseId === phraseId);
        const decisionId = resolveEntityId(existing?.id, 'mut_decision', user.id, phraseId);

        return transactWithRetry(db.tx.mutashabihatDecisions[decisionId].update({
            ...update,
            phraseId,
            timestamp: new Date().toISOString(),
            userId: user.id
        }));
    }, [user, decisions]);

    const saveCustom = useCallback((item: any) => {
        if (!user) return Promise.resolve();
        const customId = isUuid(item.id) ? item.id : id();
        return transactWithRetry(db.tx.customMutashabihat[customId].update({
            ...item,
            userId: user.id
        }));
    }, [user]);

    const deleteCustom = useCallback((customId: string) => {
        if (!user) return Promise.resolve();
        if (!isUuid(customId)) return Promise.resolve();
        return transactWithRetry(db.tx.customMutashabihat[customId].delete());
    }, [user]);

    return useMemo(() => ({
        decisions,
        custom,
        saveDecision,
        saveCustom,
        deleteCustom,
        isLoading,
        error
    }), [decisions, custom, saveDecision, saveCustom, deleteCustom, isLoading, error]);
}

// ==========================================
// Review Logs Hook
// ==========================================
export function useInstantReviewLogs() {
    const { user } = db.useAuth();
    const { isLoading, error, data } = db.useQuery({
        fsrsReviewLogs: { $: { where: { userId: user?.id || '' } } }
    });

    const logs = useMemo(() => (
        ((data?.fsrsReviewLogs || []) as unknown as any[]).map((entry) => {
            const reviewTime = typeof entry?.review_time === 'string' && entry.review_time.trim()
                ? entry.review_time
                : (typeof entry?.timestamp === 'string' ? entry.timestamp : undefined);
            const elapsedDays = Number(entry?.elapsed_days);
            const scheduledDays = Number(entry?.scheduled_days);
            const difficulty = Number(entry?.difficulty);
            const stability = Number(entry?.stability);
            const rating = typeof entry?.rating === 'string'
                ? entry.rating
                : (Number.isFinite(Number(entry?.rating)) ? Number(entry.rating) : entry?.rating);

            return {
                ...entry,
                nodeId: String(entry?.nodeId || '').trim(),
                review_time: reviewTime,
                elapsed_days: Number.isFinite(elapsedDays) ? elapsedDays : entry?.elapsed_days,
                scheduled_days: Number.isFinite(scheduledDays) ? scheduledDays : entry?.scheduled_days,
                difficulty: Number.isFinite(difficulty) ? difficulty : entry?.difficulty,
                stability: Number.isFinite(stability) ? stability : entry?.stability,
                rating,
            };
        })
    ), [data?.fsrsReviewLogs]);

    const saveLog = useCallback(async (log: any) => {
        if (!user) return Promise.resolve();
        const logId = id();
        const writes: any[] = [db.tx.fsrsReviewLogs[logId].update({
            ...log,
            userId: user.id
        })];

        const overflow = logs.length + 1 - MAX_FSRS_REVIEW_LOGS;
        if (overflow > 0) {
            const staleLogIds = logs
                .map((entry) => ({
                    id: String(entry?.id || ''),
                    reviewedAtMs: Date.parse(String(entry?.review_time || entry?.timestamp || '')),
                }))
                .filter((entry) => isUuid(entry.id))
                .sort((a, b) => (Number.isFinite(a.reviewedAtMs) ? a.reviewedAtMs : 0) - (Number.isFinite(b.reviewedAtMs) ? b.reviewedAtMs : 0))
                .slice(0, overflow)
                .map((entry) => entry.id);

            staleLogIds.forEach((staleId) => {
                writes.push(db.tx.fsrsReviewLogs[staleId].delete());
            });
        }

        return transactWithRetry(writes.length === 1 ? writes[0] : writes);
    }, [user, logs]);

    return useMemo(() => ({ logs, saveLog, isLoading, error }), [logs, saveLog, isLoading, error]);
}

// ==========================================
// Review Errors Hook
// ==========================================
export function useInstantReviewErrors() {
    const { user } = db.useAuth();
    const { isLoading, error, data } = db.useQuery({
        reviewErrors: { $: { where: { userId: user?.id || '' } } }
    });

    const errors = useMemo(() => (data?.reviewErrors || []) as unknown as ReviewError[], [data?.reviewErrors]);

    const saveError = useCallback((errorItem: ReviewError) => {
        if (!user) return Promise.resolve();
        const errorId = isUuid(errorItem.id) ? errorItem.id : id();
        return transactWithRetry(db.tx.reviewErrors[errorId].update({
            ...errorItem,
            userId: user.id
        }));
    }, [user]);

    const deleteError = useCallback((errorId: string) => {
        if (!user) return Promise.resolve();
        if (!isUuid(errorId)) return Promise.resolve();
        return transactWithRetry(db.tx.reviewErrors[errorId].delete());
    }, [user]);

    return useMemo(() => ({ errors, saveError, deleteError, isLoading, error }), [errors, saveError, deleteError, isLoading, error]);
}

// ==========================================
// FSRS Optimization Hook
// ==========================================
export function useInstantOptimization() {
    const { user } = db.useAuth();
    const { isLoading, error, data } = db.useQuery({
        optimizationMeta: { $: { where: { userId: user?.id || '' } } },
        customWeights: { $: { where: { userId: user?.id || '' } } }
    });

    const meta = useMemo(() => data?.optimizationMeta?.[0] || {
        logCountAtLastOptimization: 0,
        lastOptimizedAt: new Date().toISOString()
    }, [data?.optimizationMeta]);

    const weights = useMemo(() => data?.customWeights?.[0]?.weights || [], [data?.customWeights]);

    const saveMeta = useCallback((newMeta: any) => {
        if (!user) return Promise.resolve();
        const metaId = isUuid(data?.optimizationMeta?.[0]?.id) ? data?.optimizationMeta?.[0]?.id : id();
        return transactWithRetry(db.tx.optimizationMeta[metaId].update({
            ...newMeta,
            userId: user.id
        }));
    }, [user, data?.optimizationMeta]);

    const saveWeights = useCallback((newWeights: any[]) => {
        if (!user) return Promise.resolve();
        const weightsId = isUuid(data?.customWeights?.[0]?.id) ? data?.customWeights?.[0]?.id : id();
        return transactWithRetry(db.tx.customWeights[weightsId].update({
            weights: newWeights,
            userId: user.id
        }));
    }, [user, data?.customWeights]);

    return useMemo(() => ({ meta, weights, saveMeta, saveWeights, isLoading, error }), [meta, weights, saveMeta, saveWeights, isLoading, error]);
}
