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
        const handleStorageChange = (e?: StorageEvent) => {
            // Only care about our own storage keys
            if (e && e.key && !e.key.startsWith('quran-app')) return;

            const settings = getSettings();
            const lastSync = settings.lastSyncedAt;

            // Get the global last modified timestamp from localStorage
            // This is updated on every save in storage.ts
            const lastModifiedStr = localStorage.getItem('quran-app-last-modified');
            const lastModified = lastModifiedStr ? JSON.parse(lastModifiedStr) : null;

            // Get actual count from localStorage if available
            const pendingCountStr = localStorage.getItem('quran-app-pending-count');
            const actualCount = pendingCountStr ? parseInt(pendingCountStr) : 0;

            if (lastSync && lastModified && new Date(lastModified) > new Date(lastSync)) {
                setState(prev => ({
                    ...prev,
                    pendingChangesCount: Math.max(actualCount, 1),
                    status: prev.status === 'synced' || prev.status === 'idle' ? 'needs_push' : prev.status,
                }));
            } else if (lastSync && lastModified && new Date(lastModified) <= new Date(lastSync)) {
                // If sync caught up, clear pending count
                localStorage.setItem('quran-app-pending-count', '0');
                setState(prev => ({
                    ...prev,
                    pendingChangesCount: 0,
                    status: prev.status === 'needs_push' ? 'synced' : prev.status
                }));
            }
        };

        // Listen for both window storage event (cross-tab) and custom events (same-tab)
        window.addEventListener('storage', handleStorageChange);

        // Initial check
        handleStorageChange();

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
                localStorage.setItem('quran-app-pending-count', '0');
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

    const resolveConflict = useCallback(async (choice: 'local' | 'remote' | 'manual', manualChoices?: Record<string, 'local' | 'remote'>) => {
        setState(prev => ({ ...prev, status: 'syncing' }));

        try {
            const { resolveConflict: resolveSync } = await import('@/lib/sync');
            await resolveSync(choice, manualChoices);

            const settings = getSettings();
            localStorage.setItem('quran-app-pending-count', '0');
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
