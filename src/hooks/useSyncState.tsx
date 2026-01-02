'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { getSettings, exportBackup, BackupData } from '@/lib/storage';

// ========================================
// Types
// ========================================

export type SyncStatus =
    | 'idle'           // Ready to sync, no pending changes
    | 'syncing'        // Currently syncing
    | 'synced'         // Successfully synced
    | 'offline'        // No network connection
    | 'conflict'       // Conflict detected, needs resolution
    | 'needs_push'     // Local changes need to be pushed
    | 'needs_pull'     // Remote has newer changes
    | 'error';         // Sync failed

export interface ChangeDetail {
    category: string;           // e.g., "Mindmaps", "Memory Nodes", "Settings"
    description: string;        // Human-readable description
    count: number;              // Number of items changed
    items?: string[];           // Optional: specific item names for collapsible details
}

export interface ConflictInfo {
    localChanges: ChangeDetail[];
    remoteChanges: ChangeDetail[];
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
    resolveConflict: (choice: 'local' | 'remote') => Promise<void>;
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

// ========================================
// Provider
// ========================================

export function SyncProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<SyncState>({
        status: 'idle',
        pendingChangesCount: 0,
        lastSyncedAt: null,
        conflict: null,
        errorMessage: null,
        isAuthenticated: false,
    });

    // Track if we're online
    const [isOnline, setIsOnline] = useState(true);

    // Initialize state
    useEffect(() => {
        const settings = getSettings();
        setState(prev => ({
            ...prev,
            lastSyncedAt: settings.lastSyncedAt || null,
            status: navigator.onLine ? 'idle' : 'offline',
        }));
        setIsOnline(navigator.onLine);

        // Check auth status
        const checkAuth = async () => {
            try {
                const { createClient } = await import('@/utils/supabase/client');
                const supabase = createClient();
                const { data: { session } } = await supabase.auth.getSession();
                setState(prev => ({ ...prev, isAuthenticated: !!session?.user }));
            } catch {
                setState(prev => ({ ...prev, isAuthenticated: false }));
            }
        };
        checkAuth();
    }, []);

    // Listen for online/offline changes
    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            setState(prev => ({
                ...prev,
                status: prev.status === 'offline' ? 'idle' : prev.status,
            }));
        };

        const handleOffline = () => {
            setIsOnline(false);
            setState(prev => ({ ...prev, status: 'offline' }));
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Listen for storage changes to detect pending changes
    useEffect(() => {
        const handleStorageChange = () => {
            const settings = getSettings();
            const lastSync = settings.lastSyncedAt;
            const lastModified = settings.updatedAt;

            // If local data is newer than last sync, we have pending changes
            if (lastSync && lastModified && new Date(lastModified) > new Date(lastSync)) {
                setState(prev => ({
                    ...prev,
                    pendingChangesCount: prev.pendingChangesCount + 1,
                    status: prev.status === 'synced' || prev.status === 'idle' ? 'needs_push' : prev.status,
                }));
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    // Listen for auth changes
    useEffect(() => {
        let subscription: { unsubscribe: () => void } | null = null;

        const setupAuthListener = async () => {
            const { createClient } = await import('@/utils/supabase/client');
            const supabase = createClient();
            const { data } = supabase.auth.onAuthStateChange((event, session) => {
                setState(prev => ({ ...prev, isAuthenticated: !!session?.user }));
            });
            subscription = data.subscription;
        };

        setupAuthListener();

        return () => {
            subscription?.unsubscribe();
        };
    }, []);

    const triggerSync = useCallback(async () => {
        if (!isOnline) {
            setState(prev => ({ ...prev, status: 'offline' }));
            return;
        }

        setState(prev => ({ ...prev, status: 'syncing', errorMessage: null }));

        try {
            const { syncWithCloud } = await import('@/lib/sync');
            const result = await syncWithCloud();

            if (result.status === 'conflict' && result.conflict) {
                setState(prev => ({
                    ...prev,
                    status: 'conflict',
                    conflict: result.conflict ?? null,
                }));
            } else if (result.status === 'error') {
                setState(prev => ({
                    ...prev,
                    status: 'error',
                    errorMessage: result.message || 'Sync failed',
                }));
            } else {
                const settings = getSettings();
                setState(prev => ({
                    ...prev,
                    status: 'synced',
                    lastSyncedAt: settings.lastSyncedAt || new Date().toISOString(),
                    pendingChangesCount: 0,
                    conflict: null,
                }));
            }
        } catch (error: any) {
            setState(prev => ({
                ...prev,
                status: 'error',
                errorMessage: error.message || 'Sync failed',
            }));
        }
    }, [isOnline]);

    const resolveConflict = useCallback(async (choice: 'local' | 'remote') => {
        setState(prev => ({ ...prev, status: 'syncing' }));

        try {
            const { resolveConflict: resolveSync } = await import('@/lib/sync');
            await resolveSync(choice);

            const settings = getSettings();
            setState(prev => ({
                ...prev,
                status: 'synced',
                lastSyncedAt: settings.lastSyncedAt || new Date().toISOString(),
                pendingChangesCount: 0,
                conflict: null,
            }));
        } catch (error: any) {
            setState(prev => ({
                ...prev,
                status: 'error',
                errorMessage: error.message || 'Failed to resolve conflict',
            }));
        }
    }, []);

    const dismissError = useCallback(() => {
        setState(prev => ({ ...prev, status: 'idle', errorMessage: null }));
    }, []);

    return (
        <SyncContext.Provider value={{ ...state, triggerSync, resolveConflict, dismissError }}>
            {children}
        </SyncContext.Provider>
    );
}
