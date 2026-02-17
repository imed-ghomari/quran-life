import { useEffect, useMemo, useState } from 'react';
import { id } from '@instantdb/react';
import { db } from '@/lib/instant';
import { AppSettings, MemoryNode, MindMap } from '@/lib/types';

// Static defaults to ensure reference stability
const DEFAULT_SETTINGS_BASE: Omit<AppSettings, 'userId' | 'lastSyncedAt'> = {
    completionDays: 30,
    activePart: 5,
    learnedVerses: {},
    skippedSurahs: [],
    todoDefaultFilter: 'all',
    reviewSortOrder: 'surah_grouped',
    completeExitBehavior: 'mindmap_only',
    kanbanSortOrder: 'type_then_number',
    dailyPortionMode: 'audio',
    todayDefaultMode: 'daily',
    theme: 'system',
    isOnboardingComplete: false,
    kanbanColumns: {},
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: string | undefined | null): value is string =>
    !!value && UUID_RE.test(value);

const hash32 = (value: string, seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < value.length; i += 1) {
        h ^= value.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
};

const stableEntityId = (...parts: Array<string | number>) => {
    const input = parts.map(part => String(part).trim()).join('|');
    const hex =
        hash32(input, 0x811c9dc5).toString(16).padStart(8, '0') +
        hash32(input, 0x12345678).toString(16).padStart(8, '0') +
        hash32(input, 0x9abcdef0).toString(16).padStart(8, '0') +
        hash32(input, 0x0fedcba9).toString(16).padStart(8, '0');
    const chars = hex.slice(0, 32).split('');
    chars[12] = '4';
    chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
    return `${chars.slice(0, 8).join('')}-${chars.slice(8, 12).join('')}-${chars.slice(12, 16).join('')}-${chars.slice(16, 20).join('')}-${chars.slice(20, 32).join('')}`;
};

const resolveEntityId = (candidateId: string | undefined, ...fallbackParts: Array<string | number>) => {
    if (isUuid(candidateId)) return candidateId;
    return stableEntityId(...fallbackParts);
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
    return Number.isFinite(parsed) ? parsed : undefined;
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

const getLocalDayKeyFromMs = (ms: number) => {
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const waitMs = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isInstantTransactionTimeoutError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error || '');
    return message.toLowerCase().includes('transaction timed out');
};

const transactWithRetry = async (tx: any, maxAttempts: number = 3) => {
    let attempt = 0;
    while (attempt < maxAttempts) {
        try {
            return await db.transact(tx);
        } catch (error) {
            attempt += 1;
            if (!isInstantTransactionTimeoutError(error) || attempt >= maxAttempts) {
                throw error;
            }
            await waitMs(100 * attempt);
        }
    }
    throw new Error('Instant transact retry exhausted');
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

    // Query for the user's settings
    const { data, isLoading: isDataLoading, error } = db.useQuery({
        settings: {
            $: {
                where: { userId: user?.id || '' },
            },
        },
    });

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
        return { ...base, ...settingsEntry } as AppSettings;
    }, [settingsEntry, user?.id]);

    const saveSettings = async (newSettings: Partial<AppSettings>) => {
        if (!user) return;

        const syncedAt = new Date().toISOString();
        if (settingsEntry) {
            const settingsId = resolveEntityId(settingsEntry.id, 'settings', user.id);
            await db.transact(db.tx.settings[settingsId].update({
                ...newSettings,
                lastSyncedAt: syncedAt
            }));
        } else {
            const settingsId = stableEntityId('settings', user.id);
            await db.transact(db.tx.settings[settingsId].update({
                ...DEFAULT_SETTINGS_BASE,
                ...newSettings,
                userId: user.id,
                lastSyncedAt: syncedAt,
            }));
        }
    };

    const results = useMemo(() => ({
        settings: { ...currentSettings, id: settingsEntry?.id },
        saveSettings,
        isLoading: isAuthLoading || isDataLoading,
        error,
        user
    }), [currentSettings, settingsEntry?.id, isAuthLoading, isDataLoading, error, user]);

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
        void db.transact(tx);
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

    const saveNode = (node: MemoryNode) => {
        if (!user) return Promise.resolve();
        const canReuseCandidateId =
            isUuid(node.id) &&
            canonicalNodes.some(existingNode => existingNode.id === node.id);
        const nodeId = canReuseCandidateId
            ? (node.id as string)
            : resolveEntityId(undefined, 'memory_node', user.id, memoryNodeLogicalKey(node));
        return transactWithRetry(db.tx.memoryNodes[nodeId].update({
            ...node,
            userId: user.id
        })).finally(() => {
            setDueNowMs(Date.now());
        });
    };

    const deleteNode = async (nodeId: string) => {
        if (!user) return Promise.resolve();
        if (!isUuid(nodeId)) return Promise.resolve();
        try {
            return await db.transact(db.tx.memoryNodes[nodeId].delete());
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
    };

    return useMemo(() => ({
        nodes: canonicalNodes,
        dueNodes,
        saveNode,
        deleteNode,
        isLoading,
        error
    }), [canonicalNodes, dueNodes, isLoading, error]);
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

    const saveMindMap = (surahId: number, mapData: Partial<MindMap>) => {
        if (!user) return Promise.resolve();
        const existing = mindmaps.find(m => Number((m as any).surahId) === surahId);
        const mapId = resolveEntityId((existing as any)?.id, 'mindmap', user.id, surahId);

        // Merge existing data with new data to preserve fields like anchors
        const mergedData = existing ? { ...existing, ...mapData } : mapData;
        
        const sanitizedData: any = { ...mergedData };
        if (sanitizedData.imageUrl === null) delete sanitizedData.imageUrl;
        if (sanitizedData.imageUrlDark === null) delete sanitizedData.imageUrlDark;
        if (sanitizedData.tldrawSnapshot) {
            delete sanitizedData.imageUrl;
            delete sanitizedData.imageUrlDark;
        }

        return db.transact(db.tx.mindMaps[mapId].update({
            ...sanitizedData,
            surahId,
            userId: user.id,
            updatedAt: new Date().toISOString()
        }));
    };

    const savePartMindMap = (partId: number, mapData: any) => {
        if (!user) return Promise.resolve();
        const existing = partMindMaps.find(m => Number((m as any).partId) === partId);
        const mapId = resolveEntityId(existing?.id, 'part_mindmap', user.id, partId);

        // Merge existing data with new data to preserve all fields
        const mergedData = existing ? { ...existing, ...mapData } : mapData;
        const sanitizedData: any = { ...mergedData };
        if (sanitizedData.tldrawSnapshot) {
            delete sanitizedData.imageUrl;
            delete sanitizedData.imageUrlDark;
        }

        return db.transact(db.tx.partMindMaps[mapId].update({
            ...sanitizedData,
            partId,
            userId: user.id,
            updatedAt: new Date().toISOString()
        }));
    };

    const deleteMindMap = (mindMapId: string) => {
        if (!user) return Promise.resolve();
        if (!isUuid(mindMapId)) return Promise.resolve();
        return db.transact(db.tx.mindMaps[mindMapId].delete());
    };

    const deletePartMindMap = (partMindMapId: string) => {
        if (!user) return Promise.resolve();
        if (!isUuid(partMindMapId)) return Promise.resolve();
        return db.transact(db.tx.partMindMaps[partMindMapId].delete());
    };

    return useMemo(() => ({
        mindmaps,
        partMindMaps,
        saveMindMap,
        savePartMindMap,
        deleteMindMap,
        deletePartMindMap,
        isLoading,
        error
    }), [mindmaps, partMindMaps, saveMindMap, savePartMindMap, isLoading, error]);
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

    const saveStats = (surahId: number, newStats: any) => {
        if (!user) return Promise.resolve();
        const existing = stats.find(s => s.surahId === surahId);
        const statsId = resolveEntityId(existing?.id, 'listening_stats', user.id, surahId);

        return db.transact(db.tx.listeningStats[statsId].update({
            ...newStats,
            surahId,
            userId: user.id
        }));
    };

    const deleteStats = (surahId: number) => {
        if (!user) return Promise.resolve();
        const existing = stats.find(s => s.surahId === surahId);
        if (!isUuid(existing?.id)) return Promise.resolve();
        return db.transact(db.tx.listeningStats[existing.id].delete());
    };

    return useMemo(() => ({ stats, saveStats, deleteStats, isLoading, error }), [stats, isLoading, error]);
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

    const progress = useMemo(() => (data?.listeningProgress || []) as unknown as any[], [data?.listeningProgress]);

    const saveProgress = (partId: number, lastVerseIndex: number, cycles?: number, updatedAt?: string) => {
        if (!user) return Promise.resolve();
        const existing = progress.find(p => p.partId === partId);
        const progressId = resolveEntityId(existing?.id, 'listening_progress', user.id, partId);

        return db.transact(db.tx.listeningProgress[progressId].update({
            partId,
            lastVerseIndex,
            cycles: cycles !== undefined ? cycles : (existing?.cycles || 0),
            updatedAt: updatedAt || new Date().toISOString(),
            userId: user.id
        }));
    };

    const deleteProgress = (partId: number) => {
        if (!user) return Promise.resolve();
        const existing = progress.find(p => p.partId === partId);
        if (!isUuid(existing?.id)) return Promise.resolve();
        return db.transact(db.tx.listeningProgress[existing.id].delete());
    };

    return useMemo(() => ({ progress, saveProgress, deleteProgress, isLoading, error }), [progress, isLoading, error]);
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

    const saveDecision = (phraseId: string, update: any) => {
        if (!user) return Promise.resolve();
        const existing = decisions.find(d => d.phraseId === phraseId);
        const decisionId = resolveEntityId(existing?.id, 'mut_decision', user.id, phraseId);

        return db.transact(db.tx.mutashabihatDecisions[decisionId].update({
            ...update,
            phraseId,
            timestamp: new Date().toISOString(),
            userId: user.id
        }));
    };

    const saveCustom = (item: any) => {
        if (!user) return Promise.resolve();
        const customId = isUuid(item.id) ? item.id : id();
        return db.transact(db.tx.customMutashabihat[customId].update({
            ...item,
            userId: user.id
        }));
    };

    const deleteCustom = (customId: string) => {
        if (!user) return Promise.resolve();
        if (!isUuid(customId)) return Promise.resolve();
        return db.transact(db.tx.customMutashabihat[customId].delete());
    };

    return useMemo(() => ({
        decisions,
        custom,
        saveDecision,
        saveCustom,
        deleteCustom,
        isLoading,
        error
    }), [decisions, custom, isLoading, error]);
}

// ==========================================
// Review Logs Hook
// ==========================================
export function useInstantReviewLogs() {
    const { user } = db.useAuth();
    const { isLoading, error, data } = db.useQuery({
        fsrsReviewLogs: { $: { where: { userId: user?.id || '' } } }
    });

    const logs = useMemo(() => (data?.fsrsReviewLogs || []) as unknown as any[], [data?.fsrsReviewLogs]);

    const saveLog = (log: any) => {
        if (!user) return Promise.resolve();
        const logId = id();
        return transactWithRetry(db.tx.fsrsReviewLogs[logId].update({
            ...log,
            userId: user.id
        }));
    };

    return useMemo(() => ({ logs, saveLog, isLoading, error }), [logs, isLoading, error]);
}

// ==========================================
// Review Errors Hook
// ==========================================
export function useInstantReviewErrors() {
    const { user } = db.useAuth();
    const { isLoading, error, data } = db.useQuery({
        reviewErrors: { $: { where: { userId: user?.id || '' } } }
    });

    const errors = useMemo(() => (data?.reviewErrors || []) as unknown as any[], [data?.reviewErrors]);

    const saveError = (errorItem: any) => {
        if (!user) return Promise.resolve();
        const errorId = isUuid(errorItem.id) ? errorItem.id : id();
        return transactWithRetry(db.tx.reviewErrors[errorId].update({
            ...errorItem,
            userId: user.id
        }));
    };

    const deleteError = (errorId: string) => {
        if (!user) return Promise.resolve();
        if (!isUuid(errorId)) return Promise.resolve();
        return transactWithRetry(db.tx.reviewErrors[errorId].delete());
    };

    return useMemo(() => ({ errors, saveError, deleteError, isLoading, error }), [errors, isLoading, error]);
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

    const saveMeta = (newMeta: any) => {
        if (!user) return Promise.resolve();
        const metaId = isUuid(data?.optimizationMeta?.[0]?.id) ? data?.optimizationMeta?.[0]?.id : id();
        return db.transact(db.tx.optimizationMeta[metaId].update({
            ...newMeta,
            userId: user.id
        }));
    };

    const saveWeights = (newWeights: any[]) => {
        if (!user) return Promise.resolve();
        const weightsId = isUuid(data?.customWeights?.[0]?.id) ? data?.customWeights?.[0]?.id : id();
        return db.transact(db.tx.customWeights[weightsId].update({
            weights: newWeights,
            userId: user.id
        }));
    };

    return useMemo(() => ({ meta, weights, saveMeta, saveWeights, isLoading, error }), [meta, weights, isLoading, error]);
}
