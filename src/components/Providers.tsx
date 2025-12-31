"use client";

import { createContext, useEffect, useRef, useState } from "react";
import { CloudOff } from "lucide-react";

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

      const { createClient } = await import('@/utils/supabase/client');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        // Ensure local cache is loaded from IndexedDB before syncing with cloud
        // to prevent empty default settings from winning over remote data
        const { ensureCacheLoaded } = await import('@/lib/storage');
        await ensureCacheLoaded();

        const { syncWithCloud } = await import('@/lib/sync');
        await syncWithCloud();
      }
    } catch (e) {
      console.error('Global sync failed:', e);
    } finally {
      syncInProgress.current = false;
    }
  };

  useEffect(() => {
    // Initial online status
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      performSync();
    };
    const handleOffline = () => setIsOnline(false);

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
        <div className="offline-indicator">
          <CloudOff size={14} />
          <span>Offline mode</span>
        </div>
      )}
    </>
  );
}
