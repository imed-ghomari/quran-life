'use client';

import Link from 'next/link';
import styles from './not-found.module.css';
import { db } from '@/lib/instant';
import type { InstantUser } from '@instantdb/react';

export default function NotFound() {
  const authState = db.useAuth() as {
    user?: InstantUser | null;
    isLoading?: boolean;
  };
  const { user, isLoading } = authState ?? {};
  const showDashboard = Boolean(user);
  const showLanding = !user && !isLoading;

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.brand}>
          <img src="/logo.png" width={28} height={28} alt="Quran Life logo" />
          <span>Quran Life</span>
        </div>

        <p className={styles.kicker}>404</p>
        <h1 className={styles.title}>This page was not found</h1>
        <p className={styles.description}>
          The URL may be mistyped, moved, or no longer available.
        </p>

        <div className={styles.actions}>
          {showLanding && (
            <Link href="/" className={styles.buttonPrimary}>
              Back to landing page
            </Link>
          )}
          {showDashboard && (
            <Link href="/dashboard" className={styles.buttonGhost}>
              Go to dashboard
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
