
"use client";

import { createContext, useState, useEffect, useMemo, useRef } from "react";
import { SyncProvider } from "@/hooks/useSyncState";
import OnboardingModal from "./OnboardingModal";
import { ThemeProvider } from "./ThemeProvider";
import { useInstantSettings } from "@/hooks/useInstantData";
import { usePathname, useRouter } from "next/navigation";
import { ConfirmDialogProvider } from "./ConfirmDialogProvider";
import { db } from "@/lib/instant";
import { clientEnv } from "@/lib/env/client";
import ModalWindow from "@/components/ui/ModalWindow";

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
const SW_MIGRATION_KEY = "sw-migration-2026-02-14-v10-next-pwa-navfix";
const AUTH_RESOLVED_ONCE_KEY = "auth:resolvedOnce";
const ACCESS_STATE_CACHE_KEY = "auth:accessStateCache:v1";
const ACCESS_STATE_CACHE_TTL_MS = 15 * 60 * 1000;
const OFFLINE_WARMUP_KEY = `offline:warmup:${SW_MIGRATION_KEY}`;
const OFFLINE_WARMUP_TASKS = [
  { label: "Dashboard", route: "/dashboard" },
  { label: "Todo", route: "/todo" },
  { label: "Statistics", route: "/statistics" },
  { label: "Settings", route: "/settings" },
  { label: "Docs", route: "/docs" },
  { label: "Offline handoff", route: "/offline-app" },
];
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

type AccessStateCache = {
  identityKey: string;
  cachedAt: number;
  state: Omit<AccessState, "isSubscriptionLoading">;
};

function readAccessStateCache(): AccessStateCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ACCESS_STATE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AccessStateCache;
    if (!parsed || typeof parsed !== "object") return null;
    const cachedAt = Number(parsed.cachedAt ?? 0);
    if (!Number.isFinite(cachedAt) || Date.now() - cachedAt > ACCESS_STATE_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(ACCESS_STATE_CACHE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
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
  const pathname = usePathname();
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const { user, isLoading: isAuthLoading } = db.useAuth();
  const [hasResolvedAuthOnce, setHasResolvedAuthOnce] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(AUTH_RESOLVED_ONCE_KEY) === "1";
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
  const [isPwaStandalone, setIsPwaStandalone] = useState(false);
  const [showOfflineWarmup, setShowOfflineWarmup] = useState(false);
  const [warmupStatus, setWarmupStatus] = useState({
    completed: 0,
    total: OFFLINE_WARMUP_TASKS.length,
    label: "Starting...",
    done: false,
  });
  const warmupInProgressRef = useRef(false);
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
    setHasLoadedAccessState(false);
    setIsAccessLoading(true);
  }, [authIdentityKey, cachedAccessState]);

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
    if (typeof window === "undefined") return;
    const mediaMatch = window.matchMedia("(display-mode: standalone)").matches;
    const iosStandalone =
      "standalone" in window.navigator
      && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
    setIsPwaStandalone(mediaMatch || iosStandalone);
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
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            ACCESS_STATE_CACHE_KEY,
            JSON.stringify({
              identityKey: authIdentityKey,
              cachedAt: Date.now(),
              state: {
                isAuthenticated: Boolean(data?.isAuthenticated),
                hasActiveSubscription: Boolean(data?.hasActiveSubscription),
                isPaymentBypass: Boolean(data?.isPaymentBypass),
                hasPremiumAccess: Boolean(data?.hasPremiumAccess),
                isEditor: Boolean(data?.isEditor),
              },
            } satisfies AccessStateCache)
          );
        }
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
    if (!isAuthLoading) {
      setHasResolvedAuthOnce(true);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(AUTH_RESOLVED_ONCE_KEY, "1");
      }
    }
  }, [isAuthLoading]);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isPwaStandalone) return;
    if (!isOnline) return;
    if (!user?.id) return;
    if (warmupInProgressRef.current) return;
    const isAppRoute =
      pathname === "/dashboard"
      || pathname === "/todo"
      || pathname === "/statistics"
      || pathname === "/settings"
      || pathname === "/offline-app"
      || pathname === "/docs"
      || pathname?.startsWith("/docs/");
    if (!isAppRoute) return;
    if (window.localStorage.getItem(OFFLINE_WARMUP_KEY) === "done") return;

    warmupInProgressRef.current = true;
    setShowOfflineWarmup(true);
    setWarmupStatus({
      completed: 0,
      total: OFFLINE_WARMUP_TASKS.length,
      label: "Preparing cache...",
      done: false,
    });

    const runWarmup = async () => {
      for (let i = 0; i < OFFLINE_WARMUP_TASKS.length; i++) {
        const task = OFFLINE_WARMUP_TASKS[i];
        setWarmupStatus((prev) => ({
          ...prev,
          label: `Downloading ${task.label}...`,
        }));
        try {
          void router.prefetch(task.route);
          await fetch(task.route, {
            method: "GET",
            credentials: "include",
            cache: "reload",
          });
          // Warm App Router flight payload as well.
          await fetch(`${task.route}?_rsc=warmup`, {
            method: "GET",
            credentials: "include",
            headers: {
              "RSC": "1",
              "Next-Router-Prefetch": "1",
            },
            cache: "reload",
          }).catch(() => undefined);
        } catch {
          // Best-effort warmup. The popup still reports progress.
        }
        setWarmupStatus({
          completed: i + 1,
          total: OFFLINE_WARMUP_TASKS.length,
          label: i + 1 === OFFLINE_WARMUP_TASKS.length ? "Offline cache is ready" : "Processing...",
          done: i + 1 === OFFLINE_WARMUP_TASKS.length,
        });
      }
      window.localStorage.setItem(OFFLINE_WARMUP_KEY, "done");
      window.setTimeout(() => {
        setShowOfflineWarmup(false);
      }, 700);
    };

    void runWarmup().finally(() => {
      warmupInProgressRef.current = false;
    });
  }, [isOnline, isPwaStandalone, pathname, router, user?.id]);

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
              <ModalWindow
                isOpen={showOfflineWarmup}
                closeOnBackdropClick={false}
                maxWidthClassName="max-w-[520px]"
                header={
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-[var(--foreground)]">Preparing offline mode</h3>
                    <span className="text-xs font-medium text-[var(--foreground-secondary)]">
                      {warmupStatus.completed}/{warmupStatus.total}
                    </span>
                  </div>
                }
                body={
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-[var(--foreground-secondary)]">
                      Downloading required app components for offline use.
                    </p>
                    <div
                      style={{
                        width: "100%",
                        height: "10px",
                        background: "var(--border)",
                        borderRadius: "999px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.max(6, Math.round((warmupStatus.completed / Math.max(1, warmupStatus.total)) * 100))}%`,
                          background: "var(--accent)",
                          transition: "width 240ms ease",
                        }}
                      />
                    </div>
                    <p className="text-sm text-[var(--foreground-secondary)]">
                      {warmupStatus.done ? "Completed." : warmupStatus.label}
                    </p>
                  </div>
                }
              />
            </ConfirmDialogProvider>
          </ThemeProvider>
        </SyncProvider>
      </AccessStateContext.Provider>
    </OnlineStatusContext.Provider>
  );
}
