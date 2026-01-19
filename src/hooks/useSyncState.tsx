'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { getSettings } from '@/lib/storage';
import {
    syncState$,
    commitTask,
    dismissError as dismissSyncError,
    SyncStatus
} from '@/lib/syncEngine';

// ========================================
// Types
// ========================================

export type { SyncStatus } from '@/lib/syncEngine';

export interface ChangeDetail {
    category: string;           // e.g., "Mindmaps", "Memory Nodes", "Settings"
    description: string;        // Human-readable description
    count: number;              // Number of items changed
    items?: string[];           // Optional: specific item names for collapsible details
    itemIds: string[];          // UNIQUE IDs for granular merging
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
// Provider - Now uses syncEngine observables
// ========================================

export function SyncProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<SyncState>({
        status: 'idle',
        pendingChangesCount: 0,
        lastSyncedAt: null,
        conflict: null, // Conflict modal disabled - using LWW
        errorMessage: null,
        isAuthenticated: false,
    });

    // Subscribe to sync engine state changes
    useEffect(() => {
        // Initial state from sync engine
        const updateFromEngine = () => {
            const engineState = syncState$.get();
            setState(prev => ({
                ...prev,
                status: engineState.status,
                pendingChangesCount: engineState.pendingChangesCount,
                lastSyncedAt: engineState.lastSyncedAt,
                errorMessage: engineState.errorMessage,
                isAuthenticated: engineState.isAuthenticated,
                conflict: null, // Conflict modal disabled
            }));
        };

        // Subscribe to changes
        const unsubscribe = syncState$.onChange(updateFromEngine);

        // Initial load
        updateFromEngine();

        // Also load from settings for lastSyncedAt if not in engine
        const settings = getSettings();
        if (settings.lastSyncedAt) {
            setState(prev => ({
                ...prev,
                lastSyncedAt: prev.lastSyncedAt || settings.lastSyncedAt || null,
            }));
        }

        return () => {
            unsubscribe();
        };
    }, []);

    // Listen for storage changes to stay in sync with storage.ts
    useEffect(() => {
        const handleStorageChange = (e?: StorageEvent) => {
            if (e && e.key && !e.key.startsWith('quran-app')) return;

            // Get actual count from localStorage if available
            const pendingCountStr = localStorage.getItem('quran-app-pending-count');
            const actualCount = pendingCountStr ? parseInt(pendingCountStr) : 0;

            setState(prev => ({
                ...prev,
                pendingChangesCount: actualCount,
            }));
        };

        window.addEventListener('storage', handleStorageChange);
        handleStorageChange();

        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    const triggerSync = useCallback(async () => {
        // Use new sync engine's commitTask
        await commitTask('manual');
    }, []);

    // Conflict resolution simplified - always use LWW (local wins)
    const resolveConflict = useCallback(async (
        choice: 'local' | 'remote' | 'manual',
        manualChoices?: Record<string, 'local' | 'remote'>
    ) => {
        // Since we disabled conflict modal, this will just sync local
        await commitTask('conflict-resolve');
    }, []);

    const dismissError = useCallback(() => {
        dismissSyncError();
    }, []);

    return (
        <SyncContext.Provider value={{ ...state, triggerSync, resolveConflict, dismissError }}>
            {children}
        </SyncContext.Provider>
    );
}

