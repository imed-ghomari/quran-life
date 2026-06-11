import Link from 'next/link';
import Image from 'next/image';
import styles from './blog.module.css';
import BlogThemeToggle from './BlogThemeToggle';

type BlogShellProps = {
  activePath: 'blog' | 'home';
  children: React.ReactNode;
};

export default function BlogShell({ activePath, children }: BlogShellProps) {
  return (
    <div className={styles.shell}>
      <header className={styles.siteHeader}>
        <div className={`${styles.container} ${styles.siteHeaderInner}`}>
          <Link href="/blog" className={styles.brand}>
            <Image
              src="/logo.png"
              alt="Quran Life"
              width={42}
              height={42}
              className={styles.brandMark}
            />
            <span className={styles.brandText}>
              <span>Quran Life</span>
              <span className={styles.brandLabel}>Blog</span>
            </span>
          </Link>

          <nav className={styles.siteNav} aria-label="Blog site links">
            <Link href="/" className={styles.siteNavLink} data-active={activePath === 'home'}>
              Home
            </Link>
            <BlogThemeToggle />
            <Link href="/auth" className={styles.siteCta}>
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      <main className={styles.main}>{children}</main>

      <footer className={styles.siteFooter}>
        <div className={`${styles.container} ${styles.siteFooterInner}`}>
          <div className={styles.siteFooterMeta}>
            Quran Life blog for Quran memorization, hifdh workflows, and product updates.
          </div>
          <div className={styles.siteFooterLinks}>
            <Link href="/" className={styles.siteFooterLink}>
              Home
            </Link>
            <Link href="/privacy" className={styles.siteFooterLink}>
              Privacy
            </Link>
            <Link href="/terms" className={styles.siteFooterLink}>
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
