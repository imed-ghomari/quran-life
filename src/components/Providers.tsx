"use client";

import { createContext, useEffect, useRef, useState } from "react";
import { appLogger } from "@/lib/logger";
import { SyncProvider, useSyncState } from "@/hooks/useSyncState";
// Conflict modal commented out per user request - using LWW strategy instead
// import SyncConflictModal from "./SyncConflictModal";
import OnboardingModal from "./OnboardingModal";
import { getSettings, ensureCacheLoaded } from "@/lib/storage";
import { initializeSyncEngine, setOnlineStatus, setAuthStatus } from "@/lib/syncEngine";
import { ThemeProvider } from "./ThemeProvider";

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

function OnboardingSyncCleanup() {
  const { status } = useSyncState();
  
  useEffect(() => {
    if (status === 'synced') {
      const checkAndClean = async () => {
        const { getSettings, clearSecondaryStorage } = await import('@/lib/storage');
        const settings = getSettings();
        
        // If we synced but onboarding is still incomplete, it means we might have pulled 
        // artifacts (mindmaps) from a previous incomplete session or race condition.
        // We must ensure the user has a clean slate for onboarding.
        if (!settings.isOnboardingComplete) {
             appLogger.addLog('[Onboarding] Sync finished but onboarding incomplete. Clearing secondary storage...', 'info');
             await clearSecondaryStorage();
        }
      };
      checkAndClean();
    }
  }, [status]);
  
  return null;
}

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

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        setAuthStatus(!!session?.user);
        
        if (event === 'SIGNED_OUT') {
           // Security: Clear all local data on logout to prevent leakage to other accounts
           appLogger.addLog('User signed out. Clearing local data...', 'info');
           const { clearAllData } = await import('@/lib/storage');
           await clearAllData();
           window.location.reload();
           return;
        }

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

        // Security Check 1: Explicit User Mismatch
        // If the stored data belongs to a different user, WIPE IT.
        if (settings.userId && settings.userId !== session.user.id) {
          console.warn('[Security] User mismatch detected. Clearing local data...');
          await clearAllData();
          window.location.reload();
          return;
        }

        // Security Check 1.5: Anonymous Dirty Data Protection
        // If we find data that has NO owner (userId is undefined), but we are logged in,
        // and that data is not empty/default, we must assume it belongs to a previous session/user.
        // To guarantee isolation, we wipe it and let the Cloud Sync restore the correct data for the current user.
        // Exception: If the data is effectively empty (clean slate), we can safely adopt it.
        const isDirtyState = Object.keys(settings.learnedVerses || {}).length > 0 || (settings.skippedSurahs || []).length > 0;
        if (!settings.userId && isDirtyState) {
             console.warn('[Security] Anonymous dirty data detected. Clearing to ensure isolation...');
             await clearAllData();
             window.location.reload();
             return;
        }

        // Security Check 2: Fresh User vs Stale Data (The "Clean Slate" Fix)
        // If the user account was created recently (< 10 mins ago) but we found existing local data
        // that is NOT tagged with a user ID, it means this is a new user inheriting old data from the device.
        // We must wipe it to ensure they get the onboarding flow.
        const userCreatedAt = new Date(session.user.created_at || Date.now()).getTime();
         const now = Date.now();
         const isNewUser = (now - userCreatedAt) < 60 * 60 * 1000; // 1 hour buffer (increased from 10m to catch more cases)
 
         // Case 1: Legacy Stale Data (No User ID)
         if (isNewUser && !settings.userId && settings.updatedAt !== "1970-01-01T00:00:00.000Z") {
              console.warn('[Onboarding] New user detected with stale local data. Clearing for fresh start...');
              await clearAllData();
              window.location.reload();
              return;
         }

         // Case 2: Dirty State with Incomplete Onboarding
         // If a user has data (learned verses, skipped surahs) but hasn't finished onboarding,
         // this implies stale data or a broken state. We must reset it so they get a clean slate.
         // We do this for ALL users (new or old) because incomplete onboarding implies invalid state.
         const hasDirtyData = Object.keys(settings.learnedVerses || {}).length > 0 || (settings.skippedSurahs || []).length > 0;
         if (!settings.isOnboardingComplete && hasDirtyData) {
             console.warn('[Onboarding] Incomplete onboarding with dirty settings. Resetting to defaults...');
             // We can't use clearAllData() because it wipes userId and causes a reload loop if we aren't careful.
             // Instead, we explicitly reset settings to default but keep userId.
             const { DEFAULT_SETTINGS, saveSettings, clearSecondaryStorage } = await import('@/lib/storage');
             
             const cleanSettings = {
                 ...DEFAULT_SETTINGS,
                 userId: session.user.id,
                 updatedAt: new Date().toISOString()
             };
             
             await saveSettings(cleanSettings);
             await clearSecondaryStorage(); // New helper to clear cycle start, progress, etc.
             
             // Reload to reflect changes
             window.location.reload();
             return;
         }

         // Ensure secondary storage (mindmaps, etc) is clean if onboarding is not complete
         // This handles the case where settings are clean (empty learnedVerses) but artifacts remain.
         if (!settings.isOnboardingComplete) {
             const { clearSecondaryStorage } = await import('@/lib/storage');
             await clearSecondaryStorage();
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
          <ThemeProvider>
            <OnboardingSyncCleanup />
            {children}
            {/* Conflict modal commented out - using LWW strategy instead */}
            {/* <SyncConflictHandler /> */}
            {showOnboarding && <OnboardingModal onComplete={() => setShowOnboarding(false)} />}
          </ThemeProvider>
        </SyncProvider>
      </OnlineStatusContext.Provider>
    </>
  );
}

