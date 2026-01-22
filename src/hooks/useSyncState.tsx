
'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { db } from '@/lib/instant';
import { useInstantSettings } from './useInstantData';

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
// Provider - Uses InstantDB
// ========================================

export function SyncProvider({ children }: { children: React.ReactNode }) {
    const { settings, isLoading, error, user } = useInstantSettings();
    const [isOnline, setIsOnline] = useState(true);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const status: SyncStatus = !isOnline ? 'offline' : isLoading ? 'syncing' : error ? 'error' : 'synced';

    const triggerSync = useCallback(async () => {
        // InstantDB handles sync automatically
    }, []);

    const resolveConflict = useCallback(async () => {
        // InstantDB handles conflicts (LWW)
    }, []);

    const dismissError = useCallback(() => {
        // Errors from InstantDB usually resolve themselves or on retry
    }, []);

    const value: SyncContextValue = {
        status,
        pendingChangesCount: 0, 
        lastSyncedAt: settings?.lastSyncedAt || null,
        conflict: null,
        errorMessage: error?.message || null,
        isAuthenticated: !!user,
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
