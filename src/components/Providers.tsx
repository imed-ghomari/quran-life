
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
type AccessState = {
  isSubscriptionLoading: boolean;
  isAuthenticated: boolean;
  hasActiveSubscription: boolean;
  isPaymentBypass: boolean;
  hasPremiumAccess: boolean;
  isEditor: boolean;
};
export const AccessStateContext = createContext<AccessState>({
  isSubscriptionLoading: false,
  isAuthenticated: false,
  hasActiveSubscription: false,
  isPaymentBypass: false,
  hasPremiumAccess: false,
  isEditor: false,
});
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
  const [accessState, setAccessState] = useState<Omit<AccessState, "isSubscriptionLoading">>({
    isAuthenticated: false,
    hasActiveSubscription: false,
    isPaymentBypass: false,
    hasPremiumAccess: false,
    isEditor: false,
  });
  const [isAccessLoading, setIsAccessLoading] = useState(false);

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
    let isCancelled = false;

    const syncAndRefreshAccessState = async () => {
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

        if (!navigator.onLine) return;
        if (isCancelled) return;

        setIsAccessLoading(true);
        const response = await fetch("/api/access-state", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json();
        if (isCancelled) return;

        setAccessState({
          isAuthenticated: Boolean(data?.isAuthenticated),
          hasActiveSubscription: Boolean(data?.hasActiveSubscription),
          isPaymentBypass: Boolean(data?.isPaymentBypass),
          hasPremiumAccess: Boolean(data?.hasPremiumAccess),
          isEditor: Boolean(data?.isEditor),
        });
      } catch {
        // Non-blocking: auth and local UI can still function if this check fails.
      } finally {
        if (!isCancelled) {
          setIsAccessLoading(false);
        }
      }
    };

    void syncAndRefreshAccessState();

    return () => {
      isCancelled = true;
    };
  }, [user, isAuthLoading, isOnline]);

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
      <AccessStateContext.Provider
        value={{
          ...accessState,
          isSubscriptionLoading: isAccessLoading || isAuthLoading,
        }}
      >
        <SyncProvider>
          <ThemeProvider>
            <ConfirmDialogProvider>
              {children}
              <OnboardingWrapper />
            </ConfirmDialogProvider>
          </ThemeProvider>
        </SyncProvider>
      </AccessStateContext.Provider>
    </OnlineStatusContext.Provider>
  );
}
