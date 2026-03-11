"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type WorkboxLike = {
  addEventListener: (event: string, callback: (event?: any) => void) => void;
  removeEventListener: (event: string, callback: (event?: any) => void) => void;
  messageSkipWaiting: () => void | Promise<void>;
  register?: () => void | Promise<void>;
};

const getWorkbox = async (): Promise<WorkboxLike | null> => {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  const existing = (window as { workbox?: WorkboxLike }).workbox;
  if (existing) return existing;

  try {
    const { Workbox } = await import("workbox-window");
    const wb = new Workbox("/sw.js");
    await wb.register();
    return wb as unknown as WorkboxLike;
  } catch {
    return null;
  }
};

export function ServiceWorkerUpdateBanner({ isOnline }: { isOnline: boolean }) {
  const [updateReady, setUpdateReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const workboxRef = useRef<WorkboxLike | null>(null);
  const refreshingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let wb: WorkboxLike | null = null;

    const showUpdate = () => {
      if (!cancelled) {
        setUpdateReady(true);
        setDismissed(false);
      }
    };

    const handleControllerChange = () => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      window.location.reload();
    };
    const handleInstalled = (event?: { isUpdate?: boolean }) => {
      if (event?.isUpdate) showUpdate();
    };

    const setup = async () => {
      wb = await getWorkbox();
      if (cancelled || !wb) return;
      workboxRef.current = wb;

      wb.addEventListener("waiting", showUpdate);
      wb.addEventListener("externalwaiting", showUpdate);
      wb.addEventListener("installed", handleInstalled);
      navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    };

    void setup();

    return () => {
      cancelled = true;
      if (wb) {
        wb.removeEventListener("waiting", showUpdate);
        wb.removeEventListener("externalwaiting", showUpdate);
        wb.removeEventListener("installed", handleInstalled);
      }
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      }
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing || !workboxRef.current) return;
    setIsRefreshing(true);
    try {
      await workboxRef.current.messageSkipWaiting();
    } catch {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  if (!updateReady || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: "max(12px, env(safe-area-inset-top))",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1200,
        width: "min(720px, calc(100% - 24px))",
        padding: "14px 16px",
        borderRadius: "16px",
        border: "1px solid var(--border)",
        background: "color-mix(in srgb, var(--accent) 10%, var(--background-secondary))",
        color: "var(--text-primary)",
        boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <strong style={{ fontSize: "0.98rem" }}>Update available</strong>
        <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
          Refresh to load the newest version. Offline content will stay available after the update.
        </span>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          justifyContent: "flex-end",
        }}
      >
        <button
          className="btn btn-secondary std-normal-btn"
          onClick={() => setDismissed(true)}
          type="button"
        >
          Later
        </button>
        <button
          className="btn btn-primary std-normal-btn"
          onClick={handleRefresh}
          type="button"
          disabled={!isOnline || isRefreshing}
        >
          {isRefreshing ? "Refreshing..." : "Refresh now"}
        </button>
      </div>
    </div>
  );
}
