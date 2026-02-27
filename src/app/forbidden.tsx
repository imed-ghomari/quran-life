import Link from 'next/link';
import styles from './not-found.module.css';

export default function ForbiddenPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.brand}>
          <img src="/logo.png" width={28} height={28} alt="Quran Life logo" />
          <span>Quran Life</span>
        </div>

        <p className={styles.kicker}>403</p>
        <h1 className={styles.title}>Subscription renewal required</h1>
        <p className={styles.description}>
          Your subscription is no longer active. Renew to continue accessing member pages.
        </p>

        <div className={styles.actions}>
          <Link href="/auth" className={styles.buttonPrimary}>
            Go to subscription page
          </Link>
          <Link href="/" className={styles.buttonGhost}>
            Back to landing page
          </Link>
        </div>
      </section>
    </main>
  );
}
