
'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { useDexieSync } from './useDexieSync';
import { createClient } from '@/utils/supabase/client';

// ========================================
// Types
// ========================================

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline' | 'conflict' | 'needs_push' | 'needs_pull';

export interface ChangeDetail {
    category: string;
    description: string;
    count: number;
    items?: string[];
    itemIds: string[];
}

export interface ConflictInfo {
    localChanges: ChangeDetail[];
    remoteChanges: ChangeDetail[];
    conflictingItemIds: string[];
    localTimestamp: string;
    remoteTimestamp: string;
}

export interface SyncState {
    status: SyncStatus;
    pendingChangesCount: number;
    lastSyncedAt: string | null;
    conflict: ConflictInfo | null;
    errorMessage: string | null;
    isAuthenticated: boolean;
}

// ========================================
// Context
// ========================================

interface SyncContextValue extends SyncState {
    triggerSync: () => Promise<void>;
    resolveConflict: (choice: 'local' | 'remote' | 'manual', manualChoices?: Record<string, 'local' | 'remote'>) => Promise<void>;
    dismissError: () => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function useSyncState(): SyncContextValue {
    const context = useContext(SyncContext);
    if (!context) {
        throw new Error('useSyncState must be used within a SyncProvider');
    }
    return context;
}

export function getSyncStatusText(status: SyncStatus, pendingChangesCount: number, isAuthenticated: boolean, isOnline: boolean): string {
    const displayStatus: SyncStatus = !isOnline ? 'offline' : status;
    
    switch (displayStatus) {
        case 'offline':
            return pendingChangesCount > 0
                ? 'Offline • Pending changes'
                : 'Offline';
        case 'syncing':
            return 'Syncing...';
        case 'synced':
            return pendingChangesCount > 0
                ? 'Unsynced changes'
                : 'Up to date';
        case 'conflict':
            return 'Conflict detected';
        case 'needs_push':
            return 'Unsynced changes';
        case 'needs_pull':
            return 'Update available';
        case 'error':
            return 'Sync failed';
        default:
            return isAuthenticated ? 'Up to date' : 'Sign in to sync';
    }
}

// ========================================
// Provider - Uses Dexie Sync
// ========================================

export function SyncProvider({ children }: { children: React.ReactNode }) {
    const { isSyncing, lastSyncedAt, error, syncNow } = useDexieSync();
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // Check auth status
    useEffect(() => {
        const checkAuth = async () => {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            setIsAuthenticated(!!session);
            
            const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
                setIsAuthenticated(!!session);
            });
            return () => subscription.unsubscribe();
        };
        checkAuth();
    }, []);

    const status: SyncStatus = isSyncing ? 'syncing' : error ? 'error' : 'synced';

    const triggerSync = useCallback(async () => {
        await syncNow();
    }, [syncNow]);

    const resolveConflict = useCallback(async () => {
        // LWW is automatic
        await syncNow();
    }, [syncNow]);

    const dismissError = useCallback(() => {
        // Error state is managed by useDexieSync, clearing it requires a re-sync or just ignoring it
        // For now, re-trigger sync might clear error if successful
        syncNow();
    }, [syncNow]);

    const value: SyncContextValue = {
        status,
        pendingChangesCount: 0, // TODO: Implement pending count if needed
        lastSyncedAt: lastSyncedAt ? lastSyncedAt.toISOString() : null,
        conflict: null,
        errorMessage: error,
        isAuthenticated,
        triggerSync,
        resolveConflict,
        dismissError
    };

    return (
        <SyncContext.Provider value={value}>
            {children}
        </SyncContext.Provider>
    );
}
