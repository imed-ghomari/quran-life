'use client';

// ========================================
// Sync Engine - Legend-State Manual Sync
// ========================================
// Local-first sync with task-finish triggers.
// All data persists to IndexedDB locally and syncs
// to Supabase only when commitTask() is called.

import { observable, observe } from '@legendapp/state';
import { configureObservablePersistence, persistObservable } from '@legendapp/state/persist';
import { ObservablePersistLocalStorage } from '@legendapp/state/persist-plugins/local-storage';
import { appLogger } from './logger';

// ========================================
// Types
// ========================================

export type SyncStatus =
    | 'idle'
    | 'syncing'
    | 'synced'
    | 'offline'
    | 'error'
    | 'needs_push'
    | 'needs_pull'
    | 'conflict'; // Kept for type compatibility but not used (LWW strategy)

export interface SyncEngineState {
    status: SyncStatus;
    lastSyncedAt: string | null;
    pendingChangesCount: number;
    errorMessage: string | null;
    isAuthenticated: boolean;
}

// ========================================
// Offline Queue
// ========================================

interface QueuedCommit {
    id: string;
    timestamp: string;
    retryCount: number;
}

// ========================================
// Sync Engine Store
// ========================================

// Main sync state observable
export const syncState$ = observable<SyncEngineState>({
    status: 'idle',
    lastSyncedAt: null,
    pendingChangesCount: 0,
    errorMessage: null,
    isAuthenticated: false,
});

// Queue for offline commits
const offlineQueue$ = observable<QueuedCommit[]>([]);

// Track if we're currently online (set by provider)
let isOnline = true;

// Track if there are pending local changes since last sync
let hasPendingChanges = false;

// ========================================
// Configure Persistence
// ========================================

// Configure default persistence to use localStorage for sync state
// The actual app data still uses existing IndexedDB via idb-keyval
if (typeof window !== 'undefined') {
    configureObservablePersistence({
        pluginLocal: ObservablePersistLocalStorage,
    });

    // Persist sync state across sessions
    persistObservable(syncState$, {
        local: 'quran-sync-engine-state',
    });

    // Persist offline queue
    persistObservable(offlineQueue$, {
        local: 'quran-sync-offline-queue',
    });
}

// ========================================
// Connectivity Management
// ========================================

export function setOnlineStatus(online: boolean): void {
    const wasOffline = !isOnline;
    isOnline = online;

    if (online && wasOffline) {
        appLogger.addLog('Back online. Processing queued syncs...', 'info');
        syncState$.status.set('idle');
        // Process any queued commits
        processOfflineQueue();
    } else if (!online) {
        syncState$.status.set('offline');
        appLogger.addLog('Offline. Changes will be queued.', 'warning');
    }
}

export function getOnlineStatus(): boolean {
    return isOnline;
}

// ========================================
// Pending Changes Tracking
// ========================================

export function markPendingChanges(): void {
    hasPendingChanges = true;
    const currentCount = syncState$.pendingChangesCount.get();
    syncState$.pendingChangesCount.set(currentCount + 1);

    // Update status if we're not currently syncing
    const currentStatus = syncState$.status.get();
    if (currentStatus === 'synced' || currentStatus === 'idle') {
        syncState$.status.set('needs_push');
    }
}

export function clearPendingChanges(): void {
    hasPendingChanges = false;
    syncState$.pendingChangesCount.set(0);
    localStorage.setItem('quran-app-pending-count', '0');
}

export function hasPending(): boolean {
    return hasPendingChanges || syncState$.pendingChangesCount.get() > 0;
}

// ========================================
// Core Commit Function
// ========================================

/**
 * Commit all pending local changes to Supabase.
 * This is the main entry point for task-finish sync triggers.
 * 
 * @param taskName Optional name for logging purposes
 * @returns Promise that resolves when sync completes
 */
export async function commitTask(taskName?: string): Promise<{ success: boolean; error?: string }> {
    const label = taskName || 'manual';
    appLogger.addLog(`Commit triggered: ${label}`, 'info');

    // If offline, queue the commit for later
    if (!isOnline) {
        appLogger.addLog('Offline - queueing commit for later', 'warning');
        queueCommit(label);
        return { success: true }; // Success from local perspective
    }

    // If no pending changes, skip
    if (!hasPending()) {
        appLogger.addLog('No pending changes to sync', 'info');
        return { success: true };
    }

    // Set syncing state
    syncState$.status.set('syncing');
    syncState$.errorMessage.set(null);

    try {
        // Use existing sync infrastructure
        const { syncWithCloud } = await import('./sync');
        const result = await syncWithCloud();

        if (result.status === 'error') {
            syncState$.status.set('error');
            syncState$.errorMessage.set(result.message || 'Sync failed');
            appLogger.addLog(`Commit failed: ${result.message}`, 'error');
            return { success: false, error: result.message };
        }

        if (result.status === 'conflict') {
            // Per user request: skip conflict modal, use LWW (last-write-wins)
            // The sync.ts already uses LWW for merging, so we just proceed
            appLogger.addLog('Conflict detected - using last-write-wins resolution', 'warning');

            // Force local data to cloud (local wins for task-finish)
            const { resolveConflict } = await import('./sync');
            await resolveConflict('local');
        }

        // Success
        syncState$.status.set('synced');
        syncState$.lastSyncedAt.set(new Date().toISOString());
        clearPendingChanges();
        appLogger.addLog(`Commit successful: ${label}`, 'success');

        return { success: true };
    } catch (error: any) {
        syncState$.status.set('error');
        syncState$.errorMessage.set(error.message || 'Unknown error');
        appLogger.addLog(`Commit error: ${error.message}`, 'error');
        return { success: false, error: error.message };
    }
}

// ========================================
// Offline Queue Management
// ========================================

function queueCommit(taskName: string): void {
    const queue = offlineQueue$.get();
    queue.push({
        id: `commit-${Date.now()}`,
        timestamp: new Date().toISOString(),
        retryCount: 0,
    });
    offlineQueue$.set([...queue]);
    appLogger.addLog(`Commit queued (${queue.length} in queue)`, 'info');
}

async function processOfflineQueue(): Promise<void> {
    const queue = offlineQueue$.get();
    if (queue.length === 0) return;

    appLogger.addLog(`Processing ${queue.length} queued commits...`, 'info');

    // Clear queue first to prevent duplicate processing
    offlineQueue$.set([]);

    // Single sync handles all accumulated changes
    const result = await commitTask('offline-queue');

    if (!result.success) {
        // Re-queue if failed
        appLogger.addLog('Queued sync failed, will retry on next online', 'warning');
        offlineQueue$.set(queue.map(q => ({
            ...q,
            retryCount: q.retryCount + 1,
        })));
    }
}

// ========================================
// Auth State Management
// ========================================

export function setAuthStatus(authenticated: boolean): void {
    syncState$.isAuthenticated.set(authenticated);
}

// ========================================
// Initialization
// ========================================

let initialized = false;

export async function initializeSyncEngine(): Promise<void> {
    if (initialized || typeof window === 'undefined') return;
    initialized = true;

    appLogger.addLog('Sync engine initializing...', 'info');

    // Set initial online status
    isOnline = navigator.onLine;
    if (!isOnline) {
        syncState$.status.set('offline');
    }

    // Listen for online/offline events
    window.addEventListener('online', () => setOnlineStatus(true));
    window.addEventListener('offline', () => setOnlineStatus(false));

    // Check for pending changes from previous session
    const pendingCount = parseInt(localStorage.getItem('quran-app-pending-count') || '0');
    if (pendingCount > 0) {
        syncState$.pendingChangesCount.set(pendingCount);
        syncState$.status.set('needs_push');
        hasPendingChanges = true;
    }

    // Check auth and sync if authenticated
    try {
        const { createClient } = await import('@/utils/supabase/client');
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        setAuthStatus(!!session?.user);

        if (session?.user && isOnline) {
            // Initial sync on load
            await commitTask('initial-load');
        }
    } catch (e: any) {
        appLogger.addLog(`Auth check failed: ${e.message}`, 'error');
    }

    appLogger.addLog('Sync engine initialized', 'success');
}

// ========================================
// React Integration Helpers
// ========================================

/**
 * Get current sync status (for non-reactive reads)
 */
export function getSyncStatus(): SyncStatus {
    return syncState$.status.get();
}

/**
 * Get last synced timestamp
 */
export function getLastSyncedAt(): string | null {
    return syncState$.lastSyncedAt.get();
}

/**
 * Get pending changes count
 */
export function getPendingChangesCount(): number {
    return syncState$.pendingChangesCount.get();
}

/**
 * Check if currently syncing
 */
export function isSyncing(): boolean {
    return syncState$.status.get() === 'syncing';
}

/**
 * Dismiss error state
 */
export function dismissError(): void {
    syncState$.errorMessage.set(null);
    syncState$.status.set('idle');
}

// ========================================
// Debug / Development
// ========================================

if (typeof window !== 'undefined') {
    // Expose for debugging
    (window as any).__syncEngine = {
        syncState$,
        offlineQueue$,
        commitTask,
        getSyncStatus,
        getPendingChangesCount,
        markPendingChanges,
        clearPendingChanges,
    };
}
