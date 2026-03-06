
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
const SW_MIGRATION_KEY = "sw-migration-2026-03-06-v23-precache-docs-routes";
const AUTH_RESOLVED_ONCE_KEY = "auth:resolvedOnce";
const ACCESS_STATE_CACHE_KEY = "auth:accessStateCache:v1";
const ACCESS_STATE_CACHE_TTL_MS = 15 * 60 * 1000;
const ACCESS_STATE_REFRESH_INTERVAL_MS = 60 * 1000;
const SW_CACHE_PREFIXES_TO_CLEAR = [
  "serwist",
  "workbox",
  "pages-",
  "rsc-",
  "static-code-",
  "static-assets-",
  "image-assets-",
  "data-json-",
  "audio-runtime",
  "offline-content-",
  "next-pwa",
  "start-url",
];

type AccessStateCache = {
  identityKey: string;
  cachedAt: number;
  state: Omit<AccessState, "isSubscriptionLoading">;
};

function readAuthResolvedOnce() {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.sessionStorage.getItem(AUTH_RESOLVED_ONCE_KEY) === "1"
      || window.localStorage.getItem(AUTH_RESOLVED_ONCE_KEY) === "1"
    );
  } catch {
    return false;
  }
}

function writeAuthResolvedOnce() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(AUTH_RESOLVED_ONCE_KEY, "1");
  } catch {
    // Best-effort cache write.
  }
  try {
    window.localStorage.setItem(AUTH_RESOLVED_ONCE_KEY, "1");
  } catch {
    // Best-effort cache write.
  }
}

function readAccessStateCache(): AccessStateCache | null {
  if (typeof window === "undefined") return null;
  const rawValues: string[] = [];
  try {
    const sessionValue = window.sessionStorage.getItem(ACCESS_STATE_CACHE_KEY);
    if (sessionValue) rawValues.push(sessionValue);
  } catch {
    // Ignore storage read failure.
  }
  try {
    const localValue = window.localStorage.getItem(ACCESS_STATE_CACHE_KEY);
    if (localValue && !rawValues.includes(localValue)) rawValues.push(localValue);
  } catch {
    // Ignore storage read failure.
  }

  for (const raw of rawValues) {
    try {
      const parsed = JSON.parse(raw) as AccessStateCache;
      if (!parsed || typeof parsed !== "object") continue;
      const cachedAt = Number(parsed.cachedAt ?? 0);
      if (!Number.isFinite(cachedAt) || Date.now() - cachedAt > ACCESS_STATE_CACHE_TTL_MS) {
        window.sessionStorage.removeItem(ACCESS_STATE_CACHE_KEY);
        window.localStorage.removeItem(ACCESS_STATE_CACHE_KEY);
        continue;
      }
      try {
        window.sessionStorage.setItem(ACCESS_STATE_CACHE_KEY, raw);
      } catch {
        // Best-effort tab cache hydration.
      }
      return parsed;
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

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
  const [hasResolvedAuthOnce, setHasResolvedAuthOnce] = useState(() => {
    return readAuthResolvedOnce();
  });
  const [cachedAccessState] = useState<AccessStateCache | null>(() => readAccessStateCache());
  const [accessState, setAccessState] = useState<Omit<AccessState, "isSubscriptionLoading">>(() => (
    cachedAccessState?.state ?? {
      isAuthenticated: false,
      hasActiveSubscription: false,
      isPaymentBypass: false,
      hasPremiumAccess: false,
      isEditor: false,
    }
  ));
  const [isAccessLoading, setIsAccessLoading] = useState(() => !cachedAccessState);
  const [hasLoadedAccessState, setHasLoadedAccessState] = useState(() => Boolean(cachedAccessState));
  const accessRequestSeqRef = useRef(0);
  const lastAccessRefreshRef = useRef<{ identityKey: string; at: number } | null>(
    cachedAccessState
      ? { identityKey: cachedAccessState.identityKey, at: Number(cachedAccessState.cachedAt || 0) }
      : null
  );

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

  // Only block UI when the signed-in subject changes, not when tokens rotate.
  const authIdentityKey = useMemo(() => {
    if (!authIdentity) return "anon";
    return `${authIdentity.id}:${authIdentity.type ?? "user"}:${authIdentity.isGuest ? "guest" : "member"}`;
  }, [authIdentity?.id, authIdentity?.type, authIdentity?.isGuest]);
  const lastResolvedIdentityRef = useRef<string>("boot");

  useEffect(() => {
    if (!cachedAccessState) return;
    if (cachedAccessState.identityKey === authIdentityKey) {
      setAccessState(cachedAccessState.state);
      setHasLoadedAccessState(true);
      setIsAccessLoading(false);
      lastResolvedIdentityRef.current = authIdentityKey;
      return;
    }
    if (isAuthLoading && authIdentityKey === "anon") {
      setAccessState(cachedAccessState.state);
      setHasLoadedAccessState(true);
      setIsAccessLoading(false);
      return;
    }
    setHasLoadedAccessState(false);
    setIsAccessLoading(true);
  }, [authIdentityKey, cachedAccessState, isAuthLoading]);

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
    const lastRefresh = lastAccessRefreshRef.current;
    const recentlyRefreshedSameIdentity = Boolean(
      lastRefresh
      && lastRefresh.identityKey === authIdentityKey
      && Date.now() - lastRefresh.at < ACCESS_STATE_REFRESH_INTERVAL_MS
    );
    if (hasLoadedAccessState && recentlyRefreshedSameIdentity) {
      return;
    }
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
        if (typeof window !== "undefined") {
          const serializedState = JSON.stringify({
            identityKey: authIdentityKey,
            cachedAt: Date.now(),
            state: {
              isAuthenticated: Boolean(data?.isAuthenticated),
              hasActiveSubscription: Boolean(data?.hasActiveSubscription),
              isPaymentBypass: Boolean(data?.isPaymentBypass),
              hasPremiumAccess: Boolean(data?.hasPremiumAccess),
              isEditor: Boolean(data?.isEditor),
            },
          } satisfies AccessStateCache);
          try {
            window.sessionStorage.setItem(ACCESS_STATE_CACHE_KEY, serializedState);
          } catch {
            // Best-effort cache write.
          }
          try {
            window.localStorage.setItem(ACCESS_STATE_CACHE_KEY, serializedState);
          } catch {
            // Best-effort cache write.
          }
        }
        lastResolvedIdentityRef.current = authIdentityKey;
        lastAccessRefreshRef.current = { identityKey: authIdentityKey, at: Date.now() };
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
    if (!isAuthLoading) {
      setHasResolvedAuthOnce(true);
      writeAuthResolvedOnce();
    }
  }, [isAuthLoading]);

  useEffect(() => {
    const runServiceWorkerMigration = async () => {
      try {
        if (window.localStorage.getItem(SW_MIGRATION_KEY) === "done") return;
        if (!navigator.onLine) return;

        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }

        if ("caches" in window) {
          const cacheKeys = await caches.keys();
          const cacheKeysToDelete = cacheKeys.filter((key) =>
            SW_CACHE_PREFIXES_TO_CLEAR.some((prefix) => key.startsWith(prefix))
          );
          // Safety net for migrations between PWA plugins/cache naming schemes.
          if (cacheKeysToDelete.length !== cacheKeys.length) {
            cacheKeysToDelete.push(
              ...cacheKeys.filter((key) => !cacheKeysToDelete.includes(key))
            );
          }
          await Promise.all(cacheKeysToDelete.map((key) => caches.delete(key)));
        }

        try {
          window.sessionStorage.removeItem("quran_verses_cache_v2");
        } catch {
          // Non-fatal; migration still succeeds.
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
          isSubscriptionLoading:
            (isAuthLoading && !hasResolvedAuthOnce)
            || (isOnline && (!hasLoadedAccessState || isAccessLoading)),
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
