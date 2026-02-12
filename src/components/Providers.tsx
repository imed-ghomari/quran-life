
"use client";

import { createContext, useState, useEffect } from "react";
import { SyncProvider } from "@/hooks/useSyncState";
import OnboardingModal from "./OnboardingModal";
import { ThemeProvider } from "./ThemeProvider";
import { useInstantSettings } from "@/hooks/useInstantData";
import { usePathname } from "next/navigation";
import { ConfirmDialogProvider } from "./ConfirmDialogProvider";
import { db } from "@/lib/instant";
import { clientEnv } from "@/lib/env/client";

export const OnlineStatusContext = createContext(true);
const SW_MIGRATION_KEY = "sw-migration-2026-02-12-v4";
const SW_CACHE_PREFIXES_TO_CLEAR = [
  "serwist",
  "workbox",
  "pages-",
  "static-code-",
  "static-assets-",
  "data-json-",
  "audio-runtime",
  "offline-content-",
];

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
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const { user, isLoading: isAuthLoading } = db.useAuth();

  useEffect(() => {
    setIsOnline(navigator.onLine);
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
    if (isAuthLoading) return;
    const syncAuthCookie = async () => {
      try {
        await fetch("/api/instant-auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            type: "sync-user",
            appId: clientEnv.NEXT_PUBLIC_INSTANT_APP_ID,
            user: user ?? null,
          }),
        });
      } catch {
        // Non-blocking: client auth still works if cookie sync fails.
      }
    };

    void syncAuthCookie();
  }, [user, isAuthLoading]);

  useEffect(() => {
    const runServiceWorkerMigration = async () => {
      try {
        if (window.localStorage.getItem(SW_MIGRATION_KEY) === "done") return;
        if (!navigator.onLine) return;

        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(
            registrations.map(async (registration) => {
              const scriptUrl =
                registration.active?.scriptURL ||
                registration.waiting?.scriptURL ||
                registration.installing?.scriptURL ||
                "";

              if (scriptUrl.includes("/sw.js")) {
                await registration.unregister();
              }
            })
          );
        }

        if ("caches" in window) {
          const cacheKeys = await caches.keys();
          const cacheKeysToDelete = cacheKeys.filter((key) =>
            SW_CACHE_PREFIXES_TO_CLEAR.some((prefix) => key.startsWith(prefix))
          );
          await Promise.all(cacheKeysToDelete.map((key) => caches.delete(key)));
        }

        window.localStorage.setItem(SW_MIGRATION_KEY, "done");
        window.location.reload();
      } catch (error) {
        console.warn("Service worker migration failed", error);
        window.localStorage.removeItem(SW_MIGRATION_KEY);
      }
    };

    const handleOnline = () => {
      void runServiceWorkerMigration();
    };

    void runServiceWorkerMigration();
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("online", handleOnline);
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
