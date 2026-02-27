import Link from 'next/link';
import '../legal.css';

export const metadata = {
  title: 'Privacy Policy | Quran Life',
  description: 'Privacy Policy for Quran Life',
};

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <header className="legal-hero">
        <div className="legal-hero-inner">
          <Link href="/" className="legal-logo">
            <img src="/logo.png" width={28} height={28} alt="Quran Life Logo" />
            <span>Quran Life</span>
          </Link>
          <div className="legal-actions">
            <Link href="/terms" className="btn btn-secondary">Terms of Service</Link>
            <Link href="/" className="btn btn-primary">Back to Home</Link>
          </div>
        </div>
        <div className="legal-title-block">
          <h1 className="legal-title">Privacy Policy</h1>
          <p className="legal-subtitle">
            This policy explains what data we collect, how we use it, and the choices you have when using
            Quran Life.
          </p>
        </div>
      </header>

      <main className="legal-content">
        <article className="legal-card">
          <div className="legal-meta">Effective date: February 5, 2026</div>

          <section className="legal-section">
            <h2>1. Information We Collect</h2>
            <p>We collect the minimum information needed to provide the Service, including:</p>
            <ul>
              <li>Account information such as your email address and authentication details.</li>
              <li>Learning data like mindmaps, notes, review progress, and preferences.</li>
              <li>Usage data such as feature interactions, device type, and app performance metrics.</li>
              <li>Payment metadata (subscription status, plan, and timestamps). Full card details are handled
              by our payment processor.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>2. How We Use Information</h2>
            <p>We use your information to:</p>
            <ul>
              <li>Authenticate you and keep your account secure.</li>
              <li>Sync your mindmaps and learning progress across devices.</li>
              <li>Provide reminders, reviews, and personalization features.</li>
              <li>Process subscriptions and maintain billing status.</li>
              <li>Improve the Service and diagnose technical issues.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>3. Sharing and Service Providers</h2>
            <p>
              We share information with trusted service providers who help us deliver Quran Life. These may
              include authentication, database, analytics, and payment processing partners. They are only
              permitted to use your data to provide services to us.
            </p>
            <p>
              Current subprocessors include:
            </p>
            <ul>
              <li>Paddle (payment processing and subscription billing).</li>
              <li>InstantDB (authentication, database, and sync infrastructure).</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>4. Data Storage and Security</h2>
            <p>
              We use industry-standard safeguards to protect your data. Your learning content is stored in
              secure databases, and access is restricted to authorized personnel. No system is 100% secure, but
              we work hard to keep your information safe.
            </p>
          </section>

          <section className="legal-section">
            <h2>5. Your Choices</h2>
            <p>You can manage your data through the app settings. You may:</p>
            <ul>
              <li>Update account details or preferences.</li>
              <li>Cancel your subscription at any time.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>6. International Use</h2>
            <p>
              Quran Life may be accessed globally. By using the Service, you understand that your data may be
              processed in countries other than your own, depending on our service providers.
            </p>
          </section>

          <section className="legal-section">
            <h2>7. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes
              within the app or by email. Continued use of the Service after changes means you accept the
              updated policy.
            </p>
          </section>

          <section className="legal-section">
            <h2>8. Contact</h2>
            <p>
              If you have questions about privacy, please contact us through the support options in the app.
            </p>
            <div className="legal-inline-links">
              <Link href="/terms">Read the Terms of Service</Link>
              <Link href="/">Return to Quran Life</Link>
            </div>
          </section>
        </article>
      </main>
    </div>
  );
}
