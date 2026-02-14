import Link from 'next/link';
import styles from './not-found.module.css';

export default function NotFound() {
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
          <Link href="/" className={styles.buttonPrimary}>
            Back to landing page
          </Link>
          <Link href="/dashboard" className={styles.buttonGhost}>
            Go to dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}

