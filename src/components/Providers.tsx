"use client";

import { createContext, useEffect, useRef, useState } from "react";
import { CloudOff } from "lucide-react";
import { appLogger } from "@/lib/logger";

export const OnlineStatusContext = createContext(true);

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
      performSync();
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
          if (session?.user) {
            performSync();
          }
        }
      });
      authSubscription = subscription;
    };
    setupAuth();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        performSync();
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
        {children}
      </OnlineStatusContext.Provider>
      {!isOnline && (
        <div style={{
          position: 'fixed',
          bottom: '5.25rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--background-secondary)',
          color: 'var(--foreground)',
          padding: '0.65rem 0.9rem',
          borderRadius: '14px',
          border: '1px solid var(--border)',
          boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
          zIndex: 9999,
          fontSize: '0.8rem',
          fontWeight: 600,
          pointerEvents: 'none',
          maxWidth: '92vw',
        }}>
          <CloudOff size={16} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span>Offline mode</span>
            <span style={{ fontWeight: 500, fontSize: '0.72rem', color: 'var(--foreground-secondary)' }}>
              Cloud sync and sign-in are unavailable. Changes will sync when you’re back online.
            </span>
          </div>
        </div>
      )}
    </>
  );
}
