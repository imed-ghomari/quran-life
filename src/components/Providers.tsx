
"use client";

import { createContext, useState } from "react";
import { SyncProvider } from "@/hooks/useSyncState";
// Conflict modal commented out per user request - using LWW strategy instead
// import SyncConflictModal from "./SyncConflictModal";
import OnboardingModal from "./OnboardingModal";
import { ThemeProvider } from "./ThemeProvider";
import { useDexieSync } from "@/hooks/useDexieSync";
import { useSyncState } from "@/hooks/useSyncState";
import { useEffect } from "react";
import { appLogger } from "@/lib/logger";

export const OnlineStatusContext = createContext(true);

function OnboardingSyncCleanup() {
  const { status } = useSyncState();
  
  useEffect(() => {
    if (status === 'synced') {
      const checkAndClean = async () => {
        const { getSettings, clearSecondaryStorage, DEFAULT_SETTINGS } = await import('@/lib/storage');
        const settings = getSettings();
        const hasDefaultUpdatedAt = !settings.updatedAt || settings.updatedAt === DEFAULT_SETTINGS.updatedAt;
        const hasProgress = Object.keys(settings.learnedVerses || {}).length > 0 || (settings.skippedSurahs || []).length > 0;
        const shouldClean = !settings.isOnboardingComplete && !settings.userId && hasDefaultUpdatedAt && !hasProgress;
        if (shouldClean) {
          appLogger.addLog('[Onboarding] Sync finished with empty onboarding state. Clearing secondary storage...', 'info');
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

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <OnlineStatusContext.Provider value={isOnline}>
      <SyncProvider>
        <ThemeProvider>
          <OnboardingSyncCleanup />
          {children}
          {showOnboarding && <OnboardingModal onComplete={() => setShowOnboarding(false)} />}
        </ThemeProvider>
      </SyncProvider>
    </OnlineStatusContext.Provider>
  );
}
