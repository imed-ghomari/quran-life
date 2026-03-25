
"use client";

import { createContext, useContext, useState, useEffect, useMemo, useRef } from "react";
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
const DeploymentVersionContext = createContext("");
const SW_MIGRATION_KEY = "sw-migration-2026-03-14-v26-deploy-reset";
const SW_MIGRATION_STORAGE_KEY = "sw:migrationKey";
const SW_MIGRATION_SESSION_KEY = "sw:migrationSessionKey";
const DEPLOYMENT_VERSION_ENDPOINT = "/api/version";
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

function OnboardingSettingsGate() {
  const { settings, isLoading, user } = useInstantSettings();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (user && !isLoading && settings && !settings.isOnboardingComplete) {
      setShowOnboarding(true);
      return;
    }
    if (showOnboarding) setShowOnboarding(false);
  }, [settings, isLoading, user, showOnboarding]);

  if (!showOnboarding) return null;

  return <OnboardingModal onComplete={() => setShowOnboarding(false)} />;
}

function OnboardingWrapper() {
  const pathname = usePathname();
  const shouldCheckOnboarding =
    pathname !== '/'
    && pathname !== '/auth'
    && pathname !== '/checkout'
    && !pathname?.startsWith('/docs')
    && !pathname?.startsWith('/privacy')
    && !pathname?.startsWith('/terms')
    && !pathname?.startsWith('/offline');

  if (!shouldCheckOnboarding) return null;
  return <OnboardingSettingsGate />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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
  const [deploymentVersion, setDeploymentVersion] = useState(() => {
    const envVersion = String(clientEnv.NEXT_PUBLIC_DEPLOYMENT_ID || "").trim();
    return envVersion ? envVersion.slice(0, 12) : "";
  });
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
  const shouldResolveAccessState = useMemo(() => {
    if (!pathname) return true;
    if (pathname === '/') return false;
    if (pathname.startsWith('/privacy') || pathname.startsWith('/terms')) return false;
    return true;
  }, [pathname]);

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
    if (!shouldResolveAccessState) {
      setHasLoadedAccessState(true);
      setIsAccessLoading(false);
      return;
    }
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
  }, [authIdentity, authIdentityKey, hasLoadedAccessState, isAuthLoading, isOnline, shouldResolveAccessState]);

  useEffect(() => {
    if (!isAuthLoading) {
      setHasResolvedAuthOnce(true);
      writeAuthResolvedOnce();
    }
  }, [isAuthLoading]);

  useEffect(() => {
    let cancelled = false;

    const loadDeploymentVersion = async () => {
      try {
        const response = await fetch(DEPLOYMENT_VERSION_ENDPOINT, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        const nextVersion = String(data?.version ?? "").trim();
        if (!cancelled && nextVersion) {
          setDeploymentVersion(nextVersion);
        }
      } catch {
        // Best-effort debug metadata fetch.
      }
    };

    void loadDeploymentVersion();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const runServiceWorkerMigration = async () => {
      try {
        if (!navigator.onLine) return;

        let deploymentVersion = "";
        try {
          const response = await fetch(DEPLOYMENT_VERSION_ENDPOINT, { cache: "no-store" });
          if (response.ok) {
            const data = await response.json();
            deploymentVersion = String(data?.version ?? "");
          }
        } catch {
          deploymentVersion = "";
        }
        if (!deploymentVersion) return;

        const desiredMigrationKey = `${SW_MIGRATION_KEY}:${deploymentVersion}`;
        if (window.localStorage.getItem(SW_MIGRATION_STORAGE_KEY) === desiredMigrationKey) return;
        if (window.sessionStorage.getItem(SW_MIGRATION_SESSION_KEY) === desiredMigrationKey) return;
        try {
          window.sessionStorage.setItem(SW_MIGRATION_SESSION_KEY, desiredMigrationKey);
        } catch {
          // Best-effort session guard to prevent reload loops.
        }

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

        try {
          window.localStorage.setItem(SW_MIGRATION_STORAGE_KEY, desiredMigrationKey);
        } catch {
          // Best-effort cache write.
        }
        window.location.reload();
      } catch (error) {
        console.warn("Service worker migration failed", error);
        window.localStorage.removeItem(SW_MIGRATION_STORAGE_KEY);
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
        <DeploymentVersionContext.Provider value={deploymentVersion}>
          <SyncProvider>
            <ThemeProvider>
              <ConfirmDialogProvider>
                {children}
                <OnboardingWrapper />
              </ConfirmDialogProvider>
            </ThemeProvider>
          </SyncProvider>
        </DeploymentVersionContext.Provider>
      </AccessStateContext.Provider>
    </OnlineStatusContext.Provider>
  );
}

export function useDeploymentVersion() {
  return useContext(DeploymentVersionContext);
}
