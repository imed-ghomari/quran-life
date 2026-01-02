"use client";

import { createContext, useEffect, useRef, useState } from "react";
import { CloudOff } from "lucide-react";
import { appLogger } from "@/lib/logger";
import { SyncProvider, useSyncState } from "@/hooks/useSyncState";
import SyncConflictModal from "./SyncConflictModal";

export const OnlineStatusContext = createContext(true);

// Inner component that can use the sync context
function SyncConflictHandler() {
  const { status, conflict, resolveConflict, dismissError } = useSyncState();

  if (status !== 'conflict' || !conflict) return null;

  return (
    <SyncConflictModal
      conflict={conflict}
      onResolve={resolveConflict}
      onCancel={dismissError}
    />
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const syncInProgress = useRef(false);

  const performSync = async () => {
    if (syncInProgress.current || !navigator.onLine) return;

    // Cross-tab lock using localStorage
    const now = Date.now();
    const lastSyncTime = parseInt(localStorage.getItem('quran-app-sync-lock') || '0');
    // If a sync was started in another tab less than 10 seconds ago, skip this one
    if (now - lastSyncTime < 10000) return;

    try {
      syncInProgress.current = true;
      localStorage.setItem('quran-app-sync-lock', now.toString());

      appLogger.addLog('Sync trigger: Initiating sync check...', 'info');
      const { createClient } = await import('@/utils/supabase/client');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        appLogger.addLog(`User authenticated: ${session.user.email}`, 'info');
        // Ensure local cache is loaded from IndexedDB before syncing with cloud
        // to prevent empty default settings from winning over remote data
        const { ensureCacheLoaded } = await import('@/lib/storage');
        await ensureCacheLoaded();

        const { syncWithCloud } = await import('@/lib/sync');
        await syncWithCloud();
      } else {
        appLogger.addLog('No active session, skipping cloud sync', 'warning');
      }
    } catch (e: any) {
      appLogger.addLog(`Global sync failed: ${e.message}`, 'error');
      console.error('Global sync failed:', e);
    } finally {
      syncInProgress.current = false;
    }
  };

  useEffect(() => {
    // Initial online status
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      appLogger.addLog('App is online', 'success');
      setIsOnline(true);
    };
    const handleOffline = () => {
      appLogger.addLog('App is offline', 'warning');
      setIsOnline(false);
    };

    // Setup Auth Listener for sync (covers app load and sign-in)
    let authSubscription: any = null;
    const setupAuth = async () => {
      const { createClient } = await import('@/utils/supabase/client');
      const supabase = createClient();

      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          // Automatic sync removed - user must sync manually from settings
        }
      });
      authSubscription = subscription;
    };
    setupAuth();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Dispatch storage event to trigger refresh across components
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'quran-app-visibility-refresh',
          newValue: Date.now().toString(),
        }));
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (authSubscription) authSubscription.unsubscribe();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return (
    <>
      <OnlineStatusContext.Provider value={isOnline}>
        <SyncProvider>
          {children}
          <SyncConflictHandler />
        </SyncProvider>
      </OnlineStatusContext.Provider>
      {!isOnline && (
        <div
          className="offline-indicator-minimal"
          style={{
            position: 'fixed',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--background-secondary)',
            color: 'var(--foreground)',
            padding: '0.4rem 0.6rem',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            zIndex: 9999,
            fontSize: '0.75rem',
            fontWeight: 600,
            pointerEvents: 'none',
          }}
        >
          <CloudOff size={14} />
          <span>Offline</span>
        </div>
      )}
      <style jsx>{`
        .offline-indicator-minimal {
          bottom: 1rem;
        }
        @media (max-width: 768px) {
          .offline-indicator-minimal {
            bottom: auto;
            top: 1rem;
          }
        }
      `}</style>
    </>
  );
}
