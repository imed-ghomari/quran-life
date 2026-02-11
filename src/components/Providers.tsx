
"use client";

import { createContext, useState, useEffect } from "react";
import { SyncProvider } from "@/hooks/useSyncState";
import OnboardingModal from "./OnboardingModal";
import { ThemeProvider } from "./ThemeProvider";
import { useInstantSettings } from "@/hooks/useInstantData";
import { usePathname } from "next/navigation";
import { ConfirmDialogProvider } from "./ConfirmDialogProvider";

export const OnlineStatusContext = createContext(true);

function OnboardingWrapper() {
  const pathname = usePathname();
  const isAuthOrHome = pathname === '/' || pathname === '/auth';
  const isDocs = pathname?.startsWith('/docs');
  const { settings, isLoading, user } = useInstantSettings();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (isAuthOrHome || isDocs) {
      if (showOnboarding) setShowOnboarding(false);
      return;
    }
    
    if (user && !isLoading && settings && !settings.isOnboardingComplete) {
      setShowOnboarding(true);
    }
  }, [settings, isLoading, user, isAuthOrHome, isDocs, showOnboarding]);

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

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let hasReloadedForNewSW = false;
    const handleControllerChange = () => {
      if (hasReloadedForNewSW) return;
      hasReloadedForNewSW = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    void navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;
      void registration.update();
    });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  return (
    <OnlineStatusContext.Provider value={isOnline}>
      <SyncProvider>
        <ThemeProvider>
          <ConfirmDialogProvider>
            {children}
            <OnboardingWrapper />
          </ConfirmDialogProvider>
        </ThemeProvider>
      </SyncProvider>
    </OnlineStatusContext.Provider>
  );
}
