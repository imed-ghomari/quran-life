'use client';

import { useEffect, useMemo, useState } from 'react';

const OFFLINE_ACCESS_KEY = 'auth:offlineAccess';
const OFFLINE_ACCESS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FORCE_OFFLINE_OPEN_KEY = 'auth:forceOfflineOpen';
const OFFLINE_AUTO_REDIRECT_ATTEMPT_KEY = 'offline:autoRedirectAttemptAt';
const OFFLINE_AUTO_REDIRECT_COOLDOWN_MS = 45 * 1000;

function hasValidOfflineAccessMarker() {
  if (typeof window === 'undefined') return false;
  const raw = window.localStorage.getItem(OFFLINE_ACCESS_KEY);
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw) as { userId?: string; updatedAt?: number; supporter?: boolean };
    const updatedAt = Number(parsed?.updatedAt ?? 0);
    const hasValidTimestamp = Number.isFinite(updatedAt) && Date.now() - updatedAt <= OFFLINE_ACCESS_TTL_MS;
    const hasUserId = typeof parsed?.userId === 'string' && parsed.userId.length > 0;
    return hasValidTimestamp && hasUserId && parsed?.supporter === true;
  } catch {
    return false;
  }
}

function hadRecentAutoRedirectAttempt() {
  if (typeof window === 'undefined') return false;
  const raw = window.localStorage.getItem(OFFLINE_AUTO_REDIRECT_ATTEMPT_KEY);
  const timestamp = Number(raw ?? 0);
  return Number.isFinite(timestamp) && Date.now() - timestamp < OFFLINE_AUTO_REDIRECT_COOLDOWN_MS;
}

export default function OfflineAppPage() {
  const canOpenOffline = useMemo(() => hasValidOfflineAccessMarker(), []);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [hasRecentAutoAttempt, setHasRecentAutoAttempt] = useState(() => hadRecentAutoRedirectAttempt());

  useEffect(() => {
    if (!canOpenOffline) return;
    if (navigator.onLine) {
      window.localStorage.removeItem(OFFLINE_AUTO_REDIRECT_ATTEMPT_KEY);
      setHasRecentAutoAttempt(false);
      return;
    }

    if (hasRecentAutoAttempt) return;

    setIsRedirecting(true);
    window.localStorage.setItem(FORCE_OFFLINE_OPEN_KEY, Date.now().toString());
    window.localStorage.setItem(OFFLINE_AUTO_REDIRECT_ATTEMPT_KEY, Date.now().toString());
    window.location.replace('/dashboard');
  }, [canOpenOffline, hasRecentAutoAttempt]);

  const openDashboard = () => {
    setIsRedirecting(true);
    window.localStorage.setItem(FORCE_OFFLINE_OPEN_KEY, Date.now().toString());
    window.location.assign('/dashboard');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--background)',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      {canOpenOffline ? (
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            {hasRecentAutoAttempt ? 'Offline app ready' : 'Opening offline app'}
          </h2>
          <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1rem' }}>
            {isRedirecting
              ? 'Redirecting to your dashboard...'
              : hasRecentAutoAttempt
                ? 'Automatic redirect is paused briefly to prevent a loop. Tap below to retry opening your dashboard.'
                : 'Preparing offline access...'}
          </p>
          {hasRecentAutoAttempt && !isRedirecting && (
            <button type="button" className="btn btn-primary" onClick={openDashboard}>
              Try opening dashboard
            </button>
          )}
        </div>
      ) : (
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Offline access unavailable</h2>
          <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1rem' }}>
            Offline mode is available for supporter accounts after you sign in online once.
          </p>
          <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1rem' }}>
            Support the app to unlock offline access on this device and keep Quran Life available when you do not have internet.
          </p>
          <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.location.assign('/auth?support=1&plan=monthly')}
            >
              Become Supporter
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => window.location.assign('/auth')}>
              Go to sign in
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
