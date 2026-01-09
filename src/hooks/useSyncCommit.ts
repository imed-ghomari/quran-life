'use client';

// ========================================
// useSyncCommit - Convenient hook for component integration
// ========================================
// Use this hook to trigger sync when a task is completed.
// Example: <Tldraw onSave={() => commit('mindmap-save')} />

import { useState, useCallback } from 'react';
import { commitTask, isSyncing } from '@/lib/syncEngine';

/**
 * Hook for components to trigger sync with status tracking
 * @returns Object with commit function and isSyncing state
 */
export function useSyncCommit() {
    const [syncing, setSyncing] = useState(false);

    /**
     * Commit all pending changes to Supabase
     * @param taskName Optional name for logging purposes
     */
    const commit = useCallback(async (taskName?: string) => {
        setSyncing(true);
        try {
            await commitTask(taskName);
        } finally {
            setSyncing(false);
        }
    }, []);

    return {
        commit,
        isSyncing: syncing,
    };
}

/**
 * Simpler version that just returns the commit function
 * For use in event handlers without needing syncing state
 */
export function useCommit() {
    return useCallback(async (taskName?: string) => {
        await commitTask(taskName);
    }, []);
}

export default useSyncCommit;
