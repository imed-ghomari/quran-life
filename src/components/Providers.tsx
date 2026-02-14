
"use client";

import { createContext, useState, useEffect, useMemo, useRef } from "react";
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
const SW_MIGRATION_KEY = "sw-migration-2026-02-14-v9-next-pwa-rsc";
const SW_CACHE_PREFIXES_TO_CLEAR = [
  "serwist",
  "workbox",
  "pages-",
  "static-code-",
  "static-assets-",
  "image-assets-",
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
  const [isAccessLoading, setIsAccessLoading] = useState(true);
  const [hasLoadedAccessState, setHasLoadedAccessState] = useState(false);
  const accessRequestSeqRef = useRef(0);

  const authIdentity = useMemo(() => {
    if (!user) return null;
    return {
      id: user.id,
      email: user.email ?? null,
      refresh_token: (user as { refresh_token?: string | null }).refresh_token ?? null,
      imageURL: (user as { imageURL?: string | null }).imageURL ?? null,
      type: (user as { type?: "user" | "guest" }).type,
      isGuest: Boolean((user as { isGuest?: boolean }).isGuest),
    };
  }, [user?.id, user?.email, (user as { refresh_token?: string | null } | null)?.refresh_token]);

  const authIdentityKey = useMemo(() => {
    if (!authIdentity) return "anon";
    return `${authIdentity.id}:${authIdentity.email ?? ""}:${authIdentity.refresh_token ?? ""}`;
  }, [authIdentity]);
  const lastResolvedIdentityRef = useRef<string>("boot");

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
    const requestSeq = accessRequestSeqRef.current + 1;
    accessRequestSeqRef.current = requestSeq;
    const shouldBlockForThisRequest =
      !hasLoadedAccessState || lastResolvedIdentityRef.current !== authIdentityKey;

    const syncAndRefreshAccessState = async () => {
      try {
        if (shouldBlockForThisRequest) {
          setIsAccessLoading(true);
        }

        await fetch("/api/instant-auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            type: "sync-user",
            appId: clientEnv.NEXT_PUBLIC_INSTANT_APP_ID,
            user: authIdentity ?? null,
          }),
        });

        if (!navigator.onLine) return;

        const response = await fetch("/api/access-state", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json();
        if (accessRequestSeqRef.current !== requestSeq) return;

        setAccessState({
          isAuthenticated: Boolean(data?.isAuthenticated),
          hasActiveSubscription: Boolean(data?.hasActiveSubscription),
          isPaymentBypass: Boolean(data?.isPaymentBypass),
          hasPremiumAccess: Boolean(data?.hasPremiumAccess),
          isEditor: Boolean(data?.isEditor),
        });
        lastResolvedIdentityRef.current = authIdentityKey;
      } catch {
        // Non-blocking: auth and local UI can still function if this check fails.
      } finally {
        if (accessRequestSeqRef.current === requestSeq) {
          setHasLoadedAccessState(true);
          setIsAccessLoading(false);
        }
      }
    };

    void syncAndRefreshAccessState();
  }, [authIdentity, authIdentityKey, hasLoadedAccessState, isAuthLoading, isOnline]);

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
          isSubscriptionLoading: isAuthLoading || (isOnline && (!hasLoadedAccessState || isAccessLoading)),
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
