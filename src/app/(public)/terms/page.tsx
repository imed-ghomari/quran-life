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
          <div className="legal-meta">Effective date: March 14, 2026</div>

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
              <li>If a free trial is offered, your subscription will automatically convert to a paid plan when the trial ends unless you cancel beforehand.</li>
              <li>You can cancel your subscription at any time to stop future renewals.</li>
              <li>After cancellation, your subscription remains active until the end of the current billing period, and your user data will be deleted within one month after the subscription ends.</li>
              <li>Refund requests must be submitted within 14 days of your initial purchase or most recent renewal.</li>
              <li>We do not offer prorated refunds for partial billing periods.</li>
            </ul>
            <p>
              After the 14-day refund window, fees are non-refundable except where required by law or where Paddle
              approves a refund in its sole discretion.
            </p>
            <p>
              Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record
              for all our orders. Paddle provides all customer service inquiries and handles returns.
            </p>
          </section>

          <section className="legal-section">
            <h2>5. Subprocessors</h2>
            <p>
              We use trusted subprocessors to operate core parts of the Service, including:
            </p>
            <ul>
              <li>Paddle (payment processing and subscription billing).</li>
              <li>InstantDB (authentication, database, and sync infrastructure).</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>6. Acceptable Use</h2>
            <p>You agree not to misuse the Service. Examples of prohibited behavior include:</p>
            <ul>
              <li>Attempting to access other users&apos; data or accounts.</li>
              <li>Reverse engineering, scraping, or disrupting our systems.</li>
              <li>Using the Service for unlawful, harmful, or abusive content.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>7. Your Content</h2>
            <p>
              You own the mindmaps, notes, and other content you create. By using the Service, you grant us a
              limited license to store, process, and display that content solely to provide and improve the
              Service. You can delete your content within the app, and we will remove it from active systems
              within a reasonable time.
            </p>
          </section>

          <section className="legal-section">
            <h2>8. Intellectual Property</h2>
            <p>
              The Service, including its software, branding, and design elements, is owned by Quran Life or
              its licensors. You may not copy, modify, or redistribute any part of the Service without
              permission.
            </p>
          </section>

          <section className="legal-section">
            <h2>9. Disclaimers</h2>
            <p>
              Quran Life is an educational tool and is not a replacement for qualified teachers or religious
              guidance. The Service is provided as is without warranties of any kind, to the maximum extent
              permitted by law.
            </p>
          </section>

          <section className="legal-section">
            <h2>10. Limitation of Liability</h2>
            <p>
              To the extent permitted by law, Quran Life is not liable for indirect, incidental, or
              consequential damages arising from your use of the Service.
            </p>
          </section>

          <section className="legal-section">
            <h2>11. Termination</h2>
            <p>
              You may stop using the Service at any time. We may suspend or terminate access if you violate
              these Terms or misuse the Service. Upon termination, your right to use the Service ends.
            </p>
            <ul>
              <li>If you request account deletion, your subscription renewal is canceled and your account remains recoverable until the end of your current billing period.</li>
              <li>Before that billing-period end date, you can sign back in and cancel the deletion request from Settings.</li>
              <li>After that period ends, we will delete retained account data within one month.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>12. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. If we make material changes, we will provide notice
              within the app or by email. Continued use of the Service after changes means you accept the
              updated Terms.
            </p>
          </section>

          <section className="legal-section">
            <h2>13. Contact</h2>
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
