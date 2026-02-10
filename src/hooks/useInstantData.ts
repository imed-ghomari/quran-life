import { useEffect, useMemo } from 'react';
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
    theme: 'system',
    isOnboardingComplete: false,
    kanbanColumns: {},
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

    const settingsEntry = data?.settings?.[0];

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
            await db.transact(db.tx.settings[settingsEntry.id].update({
                ...newSettings,
                lastSyncedAt: syncedAt
            }));
        } else {
            const settingsId = id();
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

    const { isLoading, error, data } = db.useQuery({
        memoryNodes: {
            $: {
                where: { userId: user?.id || '' }
            }
        }
    });

    const nodes = useMemo(() => {
        const raw = (data?.memoryNodes || []) as unknown as MemoryNode[];
        return raw.filter(node => (node as any).type !== 'transition');
    }, [data?.memoryNodes]);

    const transitionIds = useMemo(() => {
        const raw = (data?.memoryNodes || []) as unknown as MemoryNode[];
        return raw.filter(node => (node as any).type === 'transition').map(node => node.id);
    }, [data?.memoryNodes]);

    useEffect(() => {
        if (!user || transitionIds.length === 0) return;
        const tx = transitionIds.map(id => db.tx.memoryNodes[id].delete());
        void db.transact(tx);
    }, [user, transitionIds]);

    const dueNodes = useMemo(() => nodes.filter(node => {
        if (!node.scheduler) return false;
        const dueString = (node.scheduler as any).due || (node.scheduler as any).dueDate;
        if (!dueString) return true;
        const due = new Date(dueString);
        return due <= new Date();
    }), [nodes]);

    const saveNode = (node: MemoryNode) => {
        if (!user) return Promise.resolve();
        return db.transact(db.tx.memoryNodes[node.id].update({
            ...node,
            userId: user.id
        }));
    };

    const deleteNode = (id: string) => {
        if (!user) return Promise.resolve();
        return db.transact(db.tx.memoryNodes[id].delete());
    };

    return useMemo(() => ({
        nodes,
        dueNodes,
        saveNode,
        deleteNode,
        isLoading,
        error
    }), [nodes, dueNodes, isLoading, error]);
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
        const mapId = existing ? (existing as any).id : id();

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
        const mapId = existing ? existing.id : id();

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

    const deleteMindMap = (id: string) => {
        if (!user) return Promise.resolve();
        return db.transact(db.tx.mindMaps[id].delete());
    };

    const deletePartMindMap = (id: string) => {
        if (!user) return Promise.resolve();
        return db.transact(db.tx.partMindMaps[id].delete());
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
        const statsId = existing ? existing.id : id();

        return db.transact(db.tx.listeningStats[statsId].update({
            ...newStats,
            surahId,
            userId: user.id
        }));
    };

    const deleteStats = (surahId: number) => {
        if (!user) return Promise.resolve();
        const existing = stats.find(s => s.surahId === surahId);
        if (!existing?.id) return Promise.resolve();
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
        const progressId = existing ? existing.id : id();

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
        if (!existing?.id) return Promise.resolve();
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
        const decisionId = existing ? existing.id : id();

        return db.transact(db.tx.mutashabihatDecisions[decisionId].update({
            ...update,
            phraseId,
            timestamp: new Date().toISOString(),
            userId: user.id
        }));
    };

    const saveCustom = (item: any) => {
        if (!user) return Promise.resolve();
        const customId = item.id || id();
        return db.transact(db.tx.customMutashabihat[customId].update({
            ...item,
            userId: user.id
        }));
    };

    const deleteCustom = (id: string) => {
        if (!user) return Promise.resolve();
        return db.transact(db.tx.customMutashabihat[id].delete());
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
        return db.transact(db.tx.fsrsReviewLogs[logId].update({
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
        const errorId = errorItem.id || id();
        return db.transact(db.tx.reviewErrors[errorId].update({
            ...errorItem,
            userId: user.id
        }));
    };

    const deleteError = (id: string) => {
        if (!user) return Promise.resolve();
        return db.transact(db.tx.reviewErrors[id].delete());
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
        const metaId = data?.optimizationMeta?.[0]?.id || id();
        return db.transact(db.tx.optimizationMeta[metaId].update({
            ...newMeta,
            userId: user.id
        }));
    };

    const saveWeights = (newWeights: any[]) => {
        if (!user) return Promise.resolve();
        const weightsId = data?.customWeights?.[0]?.id || id();
        return db.transact(db.tx.customWeights[weightsId].update({
            weights: newWeights,
            userId: user.id
        }));
    };

    return useMemo(() => ({ meta, weights, saveMeta, saveWeights, isLoading, error }), [meta, weights, isLoading, error]);
}
