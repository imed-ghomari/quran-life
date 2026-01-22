
"use client";

import { createContext, useState, useEffect } from "react";
import { SyncProvider } from "@/hooks/useSyncState";
import OnboardingModal from "./OnboardingModal";
import { ThemeProvider } from "./ThemeProvider";
import { useInstantSettings } from "@/hooks/useInstantData";
import { usePathname } from "next/navigation";

export const OnlineStatusContext = createContext(true);

function OnboardingWrapper() {
  const pathname = usePathname();
  const isAuthOrHome = pathname === '/' || pathname === '/auth';
  const { settings, isLoading, user } = useInstantSettings();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (isAuthOrHome) {
      if (showOnboarding) setShowOnboarding(false);
      return;
    }
    
    if (user && !isLoading && settings && !settings.isOnboardingComplete) {
      setShowOnboarding(true);
    }
  }, [settings, isLoading, user, isAuthOrHome, showOnboarding]);

  if (!showOnboarding) return null;

  return <OnboardingModal onComplete={() => setShowOnboarding(false)} />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);

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
          {children}
          <OnboardingWrapper />
        </ThemeProvider>
      </SyncProvider>
    </OnlineStatusContext.Provider>
  );
}
