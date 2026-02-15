'use client';

import { useEffect, useMemo, useState } from 'react';

const OFFLINE_ACCESS_KEY = 'auth:offlineAccess';
const OFFLINE_ACCESS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FORCE_OFFLINE_OPEN_KEY = 'auth:forceOfflineOpen';
const OFFLINE_AUTO_REDIRECT_ATTEMPT_KEY = 'offline:autoRedirectAttemptAt';
const OFFLINE_AUTO_REDIRECT_COOLDOWN_MS = 10 * 1000;

function hasValidOfflineAccessMarker() {
  if (typeof window === 'undefined') return false;
  const raw = window.localStorage.getItem(OFFLINE_ACCESS_KEY);
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw) as { userId?: string; updatedAt?: number };
    const updatedAt = Number(parsed?.updatedAt ?? 0);
    const hasValidTimestamp = Number.isFinite(updatedAt) && Date.now() - updatedAt <= OFFLINE_ACCESS_TTL_MS;
    const hasUserId = typeof parsed?.userId === 'string' && parsed.userId.length > 0;
    return hasValidTimestamp && hasUserId;
  } catch {
    return false;
  }
}

function hadRecentAutoRedirectAttempt() {
  if (typeof window === 'undefined') return false;
  const raw = window.sessionStorage.getItem(OFFLINE_AUTO_REDIRECT_ATTEMPT_KEY);
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
      window.sessionStorage.removeItem(OFFLINE_AUTO_REDIRECT_ATTEMPT_KEY);
      setHasRecentAutoAttempt(false);
      return;
    }

    if (hasRecentAutoAttempt) return;

    setIsRedirecting(true);
    window.localStorage.setItem(FORCE_OFFLINE_OPEN_KEY, Date.now().toString());
    window.sessionStorage.setItem(OFFLINE_AUTO_REDIRECT_ATTEMPT_KEY, Date.now().toString());
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
                ? 'Automatic redirect was paused to prevent a loop. Tap below to open your dashboard again.'
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
            Connect once to sign in, then reopen the app offline.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.assign('/auth')}>
            Go to sign in
          </button>
        </div>
      )}
    </div>
  );
}
