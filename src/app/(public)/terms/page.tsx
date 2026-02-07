import Link from 'next/link';
import '../legal.css';

export const metadata = {
  title: 'Terms of Service | Quran Life',
  description: 'Terms of Service for Quran Life',
};

export default function TermsPage() {
  return (
    <div className="legal-page">
      <header className="legal-hero">
        <div className="legal-hero-inner">
          <Link href="/" className="legal-logo">
            <img src="/logo.png" width={28} height={28} alt="Quran Life Logo" />
            <span>Quran Life</span>
          </Link>
          <div className="legal-actions">
            <Link href="/privacy" className="btn btn-secondary">Privacy Policy</Link>
            <Link href="/" className="btn btn-primary">Back to Home</Link>
          </div>
        </div>
        <div className="legal-title-block">
          <h1 className="legal-title">Terms of Service</h1>
          <p className="legal-subtitle">
            These Terms govern your access to Quran Life and explain the rules that keep our learning
            community safe, respectful, and focused on Qur&apos;an memorization.
          </p>
        </div>
      </header>

      <main className="legal-content">
        <article className="legal-card">
          <div className="legal-meta">Effective date: February 5, 2026</div>

          <section className="legal-section">
            <h2>1. Agreement to Terms</h2>
            <p>
              By creating an account, purchasing a subscription, or using Quran Life (the Service), you
              agree to these Terms of Service (the Terms). If you do not agree, please do not use the Service.
            </p>
          </section>

          <section className="legal-section">
            <h2>2. Who We Are</h2>
            <p>
              Quran Life is a platform that helps students memorize and retain the Qur&apos;an through visual
              mindmaps, spaced repetition, and structured review tools.
            </p>
          </section>

          <section className="legal-section">
            <h2>3. Eligibility and Account Responsibility</h2>
            <p>
              You are responsible for your account credentials and for all activity under your account.
              Please keep your login information secure.
            </p>
          </section>

          <section className="legal-section">
            <h2>4. Subscriptions, Trials, and Billing</h2>
            <p>
              Quran Life offers paid subscriptions (monthly or yearly) and may offer a free trial. Subscription
              fees are billed in advance and renew automatically unless you cancel before the renewal date.
            </p>
            <ul>
              <li>Billing is handled by our payment processor. We do not store your full payment details.</li>
              <li>Trial access ends automatically unless you subscribe before the trial expires.</li>
              <li>Refund are provided upon request and will be handled by our payment provider.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>5. Acceptable Use</h2>
            <p>You agree not to misuse the Service. Examples of prohibited behavior include:</p>
            <ul>
              <li>Attempting to access other users' data or accounts.</li>
              <li>Reverse engineering, scraping, or disrupting our systems.</li>
              <li>Using the Service for unlawful, harmful, or abusive content.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>6. Your Content</h2>
            <p>
              You own the mindmaps, notes, and other content you create. By using the Service, you grant us a
              limited license to store, process, and display that content solely to provide and improve the
              Service. You can delete your content within the app, and we will remove it from active systems
              within a reasonable time.
            </p>
          </section>

          <section className="legal-section">
            <h2>7. Intellectual Property</h2>
            <p>
              The Service, including its software, branding, and design elements, is owned by Quran Life or
              its licensors. You may not copy, modify, or redistribute any part of the Service without
              permission.
            </p>
          </section>

          <section className="legal-section">
            <h2>8. Disclaimers</h2>
            <p>
              Quran Life is an educational tool and is not a replacement for qualified teachers or religious
              guidance. The Service is provided as is without warranties of any kind, to the maximum extent
              permitted by law.
            </p>
          </section>

          <section className="legal-section">
            <h2>9. Limitation of Liability</h2>
            <p>
              To the extent permitted by law, Quran Life is not liable for indirect, incidental, or
              consequential damages arising from your use of the Service.
            </p>
          </section>

          <section className="legal-section">
            <h2>10. Termination</h2>
            <p>
              You may stop using the Service at any time. We may suspend or terminate access if you violate
              these Terms or misuse the Service. Upon termination, your right to use the Service ends.
            </p>
          </section>

          <section className="legal-section">
            <h2>11. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. If we make material changes, we will provide notice
              within the app or by email. Continued use of the Service after changes means you accept the
              updated Terms.
            </p>
          </section>

          <section className="legal-section">
            <h2>12. Contact</h2>
            <p>
              If you have questions about these Terms, please contact us through the support options in the
              app.
            </p>
            <div className="legal-inline-links">
              <Link href="/privacy">Read the Privacy Policy</Link>
              <Link href="/">Return to Quran Life</Link>
            </div>
          </section>
        </article>
      </main>
    </div>
  );
}
