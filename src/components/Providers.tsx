"use client";

<<<<<<< HEAD
import { useEffect, useState } from "react";
=======
import { useEffect, useState, useRef } from "react";
>>>>>>> 808af3561afb02764c6979aacc65af686b0c8874
import { CloudOff } from "lucide-react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
<<<<<<< HEAD

  useEffect(() => {
    // Initial check
=======
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
>>>>>>> 808af3561afb02764c6979aacc65af686b0c8874
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
<<<<<<< HEAD
      // Trigger sync when back online
      import('@/lib/sync').then(({ syncWithCloud }) => {
        syncWithCloud().catch(console.error);
      });
    };
    const handleOffline = () => setIsOnline(false);

    // Issue #8: Sync on app load if user is authenticated
    const doInitialSync = async () => {
      try {
        const { createClient } = await import('@/utils/supabase/client');
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user && navigator.onLine) {
          const { syncWithCloud } = await import('@/lib/sync');
          syncWithCloud().catch(console.error);
        }
      } catch (e) {
        console.error('Initial sync failed:', e);
      }
    };
    doInitialSync();

    // Issue #6: Refresh data when app becomes visible (e.g., reopened next day)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
=======
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
>>>>>>> 808af3561afb02764c6979aacc65af686b0c8874
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
<<<<<<< HEAD
=======
      if (authSubscription) authSubscription.unsubscribe();
>>>>>>> 808af3561afb02764c6979aacc65af686b0c8874
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return (
    <>
      {children}
      {!isOnline && (
        <div style={{
          position: 'fixed',
          bottom: '1rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--danger)', // or a darker/muted red if too bright
          color: 'white',
          padding: '0.5rem 1rem',
          borderRadius: '9999px', // pill shape
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          zIndex: 9999, // Ensure it's on top of everything
          fontSize: '0.85rem',
          fontWeight: 500,
          opacity: 0.9,
          pointerEvents: 'none', // Don't block clicks if user needs to click behind it
        }}>
          <CloudOff size={16} />
          <span>Offline Mode</span>
        </div>
      )}
    </>
  );
}
