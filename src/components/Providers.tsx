
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
import { CheckCircle2, Download } from "lucide-react";

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
const SW_MIGRATION_KEY = "sw-migration-2026-02-15-v17-build-cache-bust";
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
const OFFLINE_WARMUP_ASSETS = [
  { label: "Quran verses", url: "/qpc-hafs-word-by-word.json" },
  { label: "Search index", url: "/search-index.json" },
];
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
  const totalWarmupTasks = OFFLINE_WARMUP_TASKS.length + OFFLINE_WARMUP_ASSETS.length;

  const [warmupStatus, setWarmupStatus] = useState({
    completed: 0,
    total: totalWarmupTasks,
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
      total: totalWarmupTasks,
      label: "Preparing cache...",
      done: false,
    });

    const runWarmup = async () => {
      const markProgress = (completed: number, label: string) => {
        setWarmupStatus({
          completed,
          total: totalWarmupTasks,
          label,
          done: completed === totalWarmupTasks,
        });
      };

      let completed = 0;

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
        completed += 1;
        markProgress(completed, "Processing...");
      }

      for (let i = 0; i < OFFLINE_WARMUP_ASSETS.length; i++) {
        const asset = OFFLINE_WARMUP_ASSETS[i];
        setWarmupStatus((prev) => ({
          ...prev,
          label: `Downloading ${asset.label}...`,
        }));
        try {
          await fetch(asset.url, {
            method: "GET",
            credentials: "include",
            cache: "reload",
          });
        } catch {
          // Best-effort warmup. The popup still reports progress.
        }
        completed += 1;
        markProgress(completed, completed === totalWarmupTasks ? "Offline cache is ready" : "Processing...");
      }
      window.localStorage.setItem(OFFLINE_WARMUP_KEY, "done");
      window.setTimeout(() => {
        setShowOfflineWarmup(false);
      }, 700);
    };

    void runWarmup().finally(() => {
      warmupInProgressRef.current = false;
    });
  }, [isOnline, isPwaStandalone, pathname, router, totalWarmupTasks, user?.id]);

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
              {showOfflineWarmup && (
                <div
                  className="toast-container"
                  style={{
                    position: "fixed",
                    top: "20px",
                    right: "20px",
                    zIndex: 1200,
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    pointerEvents: "none",
                    maxWidth: "calc(100vw - 40px)",
                  }}
                >
                  <div
                    className="review-toast success"
                    style={{
                      padding: "0.7rem 1rem",
                      borderRadius: "12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
                      animation: "slideInRight 0.3s ease-out",
                      background: "color-mix(in srgb, var(--accent) 14%, var(--background-secondary))",
                      border: "1px solid var(--border)",
                      color: "var(--foreground)",
                      minWidth: "240px",
                      maxWidth: "340px",
                      fontSize: "0.85rem",
                      pointerEvents: "auto",
                      backdropFilter: "blur(12px)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {warmupStatus.done ? <CheckCircle2 size={18} /> : <Download size={18} />}
                      <span style={{ fontWeight: 600 }}>Preparing offline mode</span>
                      <span
                        style={{
                          marginLeft: "auto",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          opacity: 0.9,
                        }}
                      >
                        {warmupStatus.completed}/{warmupStatus.total}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        opacity: 0.9,
                        paddingLeft: "28px",
                        whiteSpace: "pre-line",
                      }}
                    >
                      {warmupStatus.done ? "Offline cache is ready" : warmupStatus.label}
                    </div>
                    <div
                      style={{
                        height: "2px",
                        width: "100%",
                        borderRadius: "999px",
                        background: "color-mix(in srgb, var(--foreground) 20%, transparent)",
                        overflow: "hidden",
                        marginTop: "2px",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.max(6, Math.round((warmupStatus.completed / Math.max(1, warmupStatus.total)) * 100))}%`,
                          background: "color-mix(in srgb, var(--foreground) 70%, transparent)",
                          transition: "width 240ms ease",
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </ConfirmDialogProvider>
          </ThemeProvider>
        </SyncProvider>
      </AccessStateContext.Provider>
    </OnlineStatusContext.Provider>
  );
}
