"use client";

import { useEffect, useState } from "react";
import { CloudOff } from "lucide-react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Initial check
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      // Trigger sync when back online
      import('@/lib/sync').then(({ syncWithCloud }) => {
        syncWithCloud().catch(console.error);
      });
    };
    const handleOffline = () => setIsOnline(false);

    // Issue #8: Sync on app load if user is authenticated
    const doInitialSync = async () => {
      try {
        const { createClient } = await import('@/utils/supabase/client');
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user && navigator.onLine) {
          const { syncWithCloud } = await import('@/lib/sync');
          syncWithCloud().catch(console.error);
        }
      } catch (e) {
        console.error('Initial sync failed:', e);
      }
    };
    doInitialSync();

    // Issue #6: Refresh data when app becomes visible (e.g., reopened next day)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Dispatch storage event to trigger refresh across components
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'quran-app-visibility-refresh',
          newValue: Date.now().toString(),
        }));
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return (
    <>
      {children}
      {!isOnline && (
        <div style={{
          position: 'fixed',
          bottom: '1rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--danger)', // or a darker/muted red if too bright
          color: 'white',
          padding: '0.5rem 1rem',
          borderRadius: '9999px', // pill shape
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          zIndex: 9999, // Ensure it's on top of everything
          fontSize: '0.85rem',
          fontWeight: 500,
          opacity: 0.9,
          pointerEvents: 'none', // Don't block clicks if user needs to click behind it
        }}>
          <CloudOff size={16} />
          <span>Offline Mode</span>
        </div>
      )}
    </>
  );
}
