import { db } from '@/lib/instant';
import { AppSettings, MemoryNode, MindMap } from '@/lib/types';

// ==========================================
// Settings Hook
// ==========================================
export function useInstantSettings() {
    const { user, isLoading: isAuthLoading } = db.useAuth();
    
    // Query for the user's settings
    const { data, isLoading: isDataLoading, error } = db.useQuery({
        settings: {
            $: {
                where: { userId: user?.id },
            },
        },
    });

    const settingsEntry = data?.settings?.[0];

    // Default settings matching initial state
    const defaultSettings: AppSettings = {
        completionDays: 365,
        activePart: 5,
        learnedVerses: {},
        skippedSurahs: [],
        theme: 'system',
        isOnboardingComplete: false,
        kanbanColumns: {},
        userId: user?.id || '',
        lastSyncedAt: new Date().toISOString(),
    };

    const currentSettings: AppSettings = settingsEntry 
        ? { ...defaultSettings, ...settingsEntry } as AppSettings
        : defaultSettings;

    const saveSettings = async (newSettings: Partial<AppSettings>) => {
        if (!user) return;

        if (settingsEntry) {
            await db.transact(db.tx.settings[settingsEntry.id].update(newSettings));
        } else {
            const id = crypto.randomUUID();
            await db.transact(db.tx.settings[id].update({
                ...defaultSettings,
                ...newSettings,
                userId: user.id
            }));
        }
    };

    return { 
        settings: { ...currentSettings, id: settingsEntry?.id }, 
        saveSettings, 
        isLoading: isAuthLoading || isDataLoading, 
        error,
        user
    };
}

// ==========================================
// Memory Nodes Hook
// ==========================================
export function useInstantNodes() {
    const { user } = db.useAuth();
    
    const { isLoading, error, data } = db.useQuery({ 
        memoryNodes: {
            $: {
                where: { userId: user?.id }
            }
        } 
    });
    
    const nodes = (data?.memoryNodes || []) as unknown as MemoryNode[];

    const dueNodes = nodes.filter(node => {
        if (!node.scheduler) return false;
        const dueString = (node.scheduler as any).due || (node.scheduler as any).dueDate;
        if (!dueString) return true; 
        const due = new Date(dueString);
        return due <= new Date();
    });

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

    return { nodes, dueNodes, saveNode, deleteNode, isLoading, error };
}

// ==========================================
// MindMaps Hook
// ==========================================
export function useInstantMindMaps() {
    const { user } = db.useAuth();
    const { isLoading, error, data } = db.useQuery({ 
        mindMaps: {
            $: {
                where: { userId: user?.id }
            }
        },
        partMindMaps: {
            $: {
                where: { userId: user?.id }
            }
        }
    });
    
    const mindmaps = (data?.mindMaps || []) as unknown as MindMap[];
    const partMindMaps = (data?.partMindMaps || []) as unknown as any[];

    const saveMindMap = (surahId: number, mapData: Partial<MindMap>) => {
        if (!user) return Promise.resolve();
        const existing = mindmaps.find(m => m.surahId === surahId);
        const id = existing ? (existing as any).id : crypto.randomUUID();
        
        // Sanitize data to remove nulls which InstantDB doesn't like for some types
        const sanitizedData: any = { ...mapData };
        if (sanitizedData.imageUrl === null) delete sanitizedData.imageUrl;
        if (sanitizedData.imageUrlDark === null) delete sanitizedData.imageUrlDark;
        
        return db.transact(db.tx.mindMaps[id].update({ 
            ...sanitizedData, 
            surahId,
            userId: user.id,
            updatedAt: new Date().toISOString()
        }));
    };

    const savePartMindMap = (partId: number, mapData: any) => {
        if (!user) return Promise.resolve();
        const existing = partMindMaps.find(m => m.partId === partId);
        const id = existing ? existing.id : crypto.randomUUID();
        
        return db.transact(db.tx.partMindMaps[id].update({ 
            ...mapData, 
            partId,
            userId: user.id,
            updatedAt: new Date().toISOString()
        }));
    };

    return { mindmaps, partMindMaps, saveMindMap, savePartMindMap, isLoading, error };
}

// ==========================================
// Listening Stats Hook
// ==========================================
export function useInstantListeningStats() {
    const { user } = db.useAuth();
    const { isLoading, error, data } = db.useQuery({ 
        listeningStats: {
            $: { where: { userId: user?.id } }
        } 
    });
    
    const stats = (data?.listeningStats || []) as unknown as any[];

    const saveStats = (surahId: number, newStats: any) => {
        if (!user) return Promise.resolve();
        const existing = stats.find(s => s.surahId === surahId);
        const id = existing ? existing.id : crypto.randomUUID();
        
        return db.transact(db.tx.listeningStats[id].update({
            ...newStats,
            surahId,
            userId: user.id
        }));
    };

    return { stats, saveStats, isLoading, error };
}

// ==========================================
// Listening Progress Hook (Per Part)
// ==========================================
export function useInstantListeningProgress() {
    const { user } = db.useAuth();
    const { isLoading, error, data } = db.useQuery({ 
        listeningProgress: {
            $: { where: { userId: user?.id } }
        } 
    });
    
    const progress = (data?.listeningProgress || []) as unknown as any[];

    const saveProgress = (partId: number, lastVerseIndex: number, cycles?: number) => {
        if (!user) return Promise.resolve();
        const existing = progress.find(p => p.partId === partId);
        const id = existing ? existing.id : crypto.randomUUID();
        
        return db.transact(db.tx.listeningProgress[id].update({
            partId,
            lastVerseIndex,
            cycles: cycles !== undefined ? cycles : (existing?.cycles || 0),
            updatedAt: new Date().toISOString(),
            userId: user.id
        }));
    };

    return { progress, saveProgress, isLoading, error };
}

// ==========================================
// Mutashabihat Hook (Decisions & Custom)
// ==========================================
export function useInstantMutashabihat() {
    const { user } = db.useAuth();
    const { isLoading, error, data } = db.useQuery({ 
        mutashabihatDecisions: { $: { where: { userId: user?.id } } },
        customMutashabihat: { $: { where: { userId: user?.id } } }
    });
    
    const decisions = (data?.mutashabihatDecisions || []) as unknown as any[];
    const custom = (data?.customMutashabihat || []) as unknown as any[];

    const saveDecision = (phraseId: string, update: any) => {
        if (!user) return Promise.resolve();
        const existing = decisions.find(d => d.phraseId === phraseId);
        const id = existing ? existing.id : crypto.randomUUID();

        return db.transact(db.tx.mutashabihatDecisions[id].update({
            ...update,
            phraseId,
            timestamp: new Date().toISOString(),
            userId: user.id
        }));
    };

    const saveCustom = (item: any) => {
        if (!user) return Promise.resolve();
        const id = item.id || crypto.randomUUID();
        return db.transact(db.tx.customMutashabihat[id].update({
            ...item,
            userId: user.id
        }));
    };

    return { decisions, custom, saveDecision, saveCustom, isLoading, error };
}

// ==========================================
// Review Logs Hook
// ==========================================
export function useInstantReviewLogs() {
    const { user } = db.useAuth();
    const { isLoading, error, data } = db.useQuery({
        fsrsReviewLogs: { $: { where: { userId: user?.id } } }
    });

    const logs = (data?.fsrsReviewLogs || []) as unknown as any[];

    const saveLog = (log: any) => {
        if (!user) return Promise.resolve();
        const id = crypto.randomUUID();
        return db.transact(db.tx.fsrsReviewLogs[id].update({
            ...log,
            userId: user.id
        }));
    };

    return { logs, saveLog, isLoading, error };
}

// ==========================================
// Review Errors Hook
// ==========================================
export function useInstantReviewErrors() {
    const { user } = db.useAuth();
    const { isLoading, error, data } = db.useQuery({
        reviewErrors: { $: { where: { userId: user?.id } } }
    });

    const errors = (data?.reviewErrors || []) as unknown as any[];

    const saveError = (error: any) => {
        if (!user) return Promise.resolve();
        const id = error.id || crypto.randomUUID();
        return db.transact(db.tx.reviewErrors[id].update({
            ...error,
            userId: user.id
        }));
    };

    const deleteError = (id: string) => {
        if (!user) return Promise.resolve();
        return db.transact(db.tx.reviewErrors[id].delete());
    };

    return { errors, saveError, deleteError, isLoading, error };
}

// ==========================================
// FSRS Optimization Hook
// ==========================================
export function useInstantOptimization() {
    const { user } = db.useAuth();
    const { isLoading, error, data } = db.useQuery({
        optimizationMeta: { $: { where: { userId: user?.id } } },
        customWeights: { $: { where: { userId: user?.id } } }
    });

    const meta = data?.optimizationMeta?.[0] || {
        logCountAtLastOptimization: 0,
        lastOptimizedAt: new Date().toISOString()
    };
    const weights = data?.customWeights?.[0]?.weights || [];

    const saveMeta = (newMeta: any) => {
        if (!user) return Promise.resolve();
        const id = data?.optimizationMeta?.[0]?.id || crypto.randomUUID();
        return db.transact(db.tx.optimizationMeta[id].update({
            ...newMeta,
            userId: user.id
        }));
    };

    const saveWeights = (newWeights: any[]) => {
        if (!user) return Promise.resolve();
        const id = data?.customWeights?.[0]?.id || crypto.randomUUID();
        return db.transact(db.tx.customWeights[id].update({
            weights: newWeights,
            userId: user.id
        }));
    };

    return { meta, weights, saveMeta, saveWeights, isLoading, error };
}
