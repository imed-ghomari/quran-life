"use client";

import { createContext, useEffect, useRef, useState } from "react";
import { appLogger } from "@/lib/logger";
import { SyncProvider, useSyncState } from "@/hooks/useSyncState";
// Conflict modal commented out per user request - using LWW strategy instead
// import SyncConflictModal from "./SyncConflictModal";
import OnboardingModal from "./OnboardingModal";
import { getSettings, ensureCacheLoaded } from "@/lib/storage";
import { initializeSyncEngine, setOnlineStatus, setAuthStatus } from "@/lib/syncEngine";

export const OnlineStatusContext = createContext(true);

// Conflict handler commented out - using LWW strategy instead
// function SyncConflictHandler() {
//   const { status, conflict, resolveConflict, dismissError } = useSyncState();
//
//   if (status !== 'conflict' || !conflict) return null;
//
//   return (
//     <SyncConflictModal
//       conflict={conflict}
//       onResolve={resolveConflict}
//       onCancel={dismissError}
//     />
//   );
// }

export function Providers({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const syncInProgress = useRef(false);

  // Initialize sync engine and connect online status
  useEffect(() => {
    // Initialize the new sync engine
    initializeSyncEngine();
  }, []);

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
        setAuthStatus(true);
        // Ensure local cache is loaded from IndexedDB before syncing with cloud
        // to prevent empty default settings from winning over remote data
        const { ensureCacheLoaded } = await import('@/lib/storage');
        await ensureCacheLoaded();

        // Use new sync engine's commitTask
        const { commitTask } = await import('@/lib/syncEngine');
        await commitTask('auth-trigger');
      } else {
        appLogger.addLog('No active session, skipping cloud sync', 'warning');
        setAuthStatus(false);
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
    setOnlineStatus(navigator.onLine);

    const handleOnline = () => {
      appLogger.addLog('App is online', 'success');
      setIsOnline(true);
      setOnlineStatus(true);
    };
    const handleOffline = () => {
      appLogger.addLog('App is offline', 'warning');
      setIsOnline(false);
      setOnlineStatus(false);
    };

    // Setup Auth Listener for sync (covers app load and sign-in)
    let authSubscription: any = null;
    const setupAuth = async () => {
      const { createClient } = await import('@/utils/supabase/client');
      const supabase = createClient();

      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        setAuthStatus(!!session?.user);
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          // Automatic sync on load/sign-in
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

    const handleInitialOnboarding = async () => {
      // Check if user is authenticated before showing onboarding
      const { createClient } = await import('@/utils/supabase/client');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        // Ensure cache is loaded
        const { ensureCacheLoaded, getSettings, updateSetting, clearAllData } = await import('@/lib/storage');
        await ensureCacheLoaded();
        
        const settings = getSettings();

        // Security Check: If the stored data belongs to a different user, WIPE IT.
        // This prevents User B from seeing User A's data on the same device.
        if (settings.userId && settings.userId !== session.user.id) {
          console.warn('[Security] User mismatch detected. Clearing local data...');
          await clearAllData();
          // Reload to ensure fresh state
          window.location.reload();
          return;
        }

        // Bind data to current user if not bound
        if (!settings.userId) {
          updateSetting('userId', session.user.id);
        }

        if (!settings.isOnboardingComplete) {
          setShowOnboarding(true);
        }
      }
    };
    handleInitialOnboarding();

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
          {/* Conflict modal commented out - using LWW strategy instead */}
          {/* <SyncConflictHandler /> */}
          {showOnboarding && <OnboardingModal onComplete={() => setShowOnboarding(false)} />}
        </SyncProvider>
      </OnlineStatusContext.Provider>
    </>
  );
}

