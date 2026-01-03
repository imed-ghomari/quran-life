import React from 'react';
import { 
  Brain, 
  Repeat, 
  BarChart, 
  Check, 
  ArrowRight, 
  Zap, 
  Layers, 
  BookOpen 
} from 'lucide-react';
import './LandingPage.css';

interface LandingPageProps {
  /** * Callback function triggered when the user clicks the 
   * "Buy Premium" button in the pricing section.
   */
  onBuy: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onBuy }) => {
  return (
    <div className="landing-wrapper">
      {/* --- Navigation --- */}
      <nav className="nav">
        <div className="container nav-content">
          <div className="logo">
            <BookOpen size={28} strokeWidth={2.5} />
            <span>Quran Life</span>
          </div>
          <div className="nav-actions">
            <a href="#features" className="btn btn-secondary" style={{ marginRight: '10px' }}>
              Features
            </a>
            <button className="btn btn-primary" onClick={onBuy}>
              Get Started
            </button>
          </div>
        </div>
      </nav>

      <main>
        {/* --- Hero Section --- */}
        <section className="hero">
          <div className="container">
            <div className="animate-entry">
              <span className="badge" style={{ position: 'relative', top: 'auto', left: 'auto', transform: 'none', display: 'inline-block', marginBottom: '1rem' }}>
                New v2.0 Released
              </span>
              <h1 className="hero-title">
                Master your Quran Hifdh<br /> with Visual Mindmaps.
              </h1>
              <p className="hero-subtitle delay-100 animate-entry">
                The first platform combining Tldraw mindmapping, SM-2 Spaced Repetition, 
                and deep analytics to help you memorize and retain the Quran forever.
              </p>
              <div className="cta-group delay-200 animate-entry">
                <button className="btn btn-primary">
                  Start Memorizing Free
                  <ArrowRight size={18} />
                </button>
                <button className="btn btn-secondary">
                  View Demo
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* --- Features Grid --- */}
        <section id="features" className="features">
          <div className="container">
            <div className="section-header">
              <h2 className="section-title">Designed for Retention</h2>
              <p style={{ color: 'var(--foreground-secondary)' }}>
                Tools built specifically to solve the "forgetting curve" of Hifdh.
              </p>
            </div>
            
            <div className="grid">
              {/* Feature 1 */}
              <div className="card">
                <div className="icon-wrapper">
                  <Brain size={28} />
                </div>
                <h3>Visual Mindmapping</h3>
                <p>
                  Connect verses visually using our Tldraw integration. 
                  Create mental hooks and structural maps for every Surah.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="card">
                <div className="icon-wrapper">
                  <Repeat size={28} />
                </div>
                <h3>Smart Repetition</h3>
                <p>
                  Never forget a verse. Our SM-2 algorithm calculates the exact 
                  moment you need to review a page before you forget it.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="card">
                <div className="icon-wrapper">
                  <BarChart size={28} />
                </div>
                <h3>Deep Analytics</h3>
                <p>
                  Track your strength on every Juz. Visualize your retention rates, 
                  daily streaks, and forecasted completion dates.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="card">
                <div className="icon-wrapper">
                  <Zap size={28} />
                </div>
                <h3>Offline & Sync</h3>
                <p>
                  Study anywhere. Your mindmaps and progress sync seamlessly 
                  across devices and work perfectly offline.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* --- Pricing Section --- */}
        <section className="pricing">
          <div className="container">
            <div className="section-header">
              <h2 className="section-title">Simple, Transparent Pricing</h2>
              <p style={{ color: 'var(--foreground-secondary)' }}>
                Invest in your Akhirah without breaking the bank.
              </p>
            </div>

            <div className="pricing-grid">
              {/* Free Tier */}
              <div className="price-card">
                <h3>Seeker</h3>
                <div className="price">$0<span>/mo</span></div>
                <p style={{ color: 'var(--foreground-secondary)' }}>Perfect for getting started.</p>
                
                <ul className="features-list">
                  <li><Check size={20} className="check-icon" /> Core Mindmapping Tools</li>
                  <li><Check size={20} className="check-icon" /> Basic SM-2 Repetition</li>
                  <li><Check size={20} className="check-icon" /> 1 Device Sync</li>
                  <li><Check size={20} className="check-icon" /> Standard Support</li>
                </ul>

                <button className="btn btn-secondary btn-full">
                  Start for Free
                </button>
              </div>

              {/* Premium Tier */}
              <div className="price-card premium">
                <div className="badge">Most Popular</div>
                <h3>Hafidh Pro</h3>
                <div className="price">$10<span>/mo</span></div>
                <p style={{ color: 'var(--foreground-secondary)' }}>For serious students.</p>
                
                <ul className="features-list">
                  <li><Check size={20} className="check-icon" /> <strong>Everything in Seeker</strong></li>
                  <li><Check size={20} className="check-icon" /> Unlimited Mindmap Exports</li>
                  <li><Check size={20} className="check-icon" /> Advanced Retention Stats</li>
                  <li><Check size={20} className="check-icon" /> Cross-device Cloud Sync</li>
                  <li><Check size={20} className="check-icon" /> Priority Feature Access</li>
                </ul>

                {/* CRITICAL: Button calls the onBuy prop, NOT a link */}
                <button 
                  className="btn btn-primary btn-full" 
                  onClick={onBuy}
                  aria-label="Purchase Premium Subscription"
                >
                  Upgrade to Pro
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* --- Footer --- */}
      <footer className="footer">
        <div className="container">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Layers size={20} color="var(--accent)" />
            <span style={{ fontWeight: 'bold', color: 'var(--foreground)' }}>Quran Life</span>
          </div>
          <p>&copy; {new Date().getFullYear()} Quran Life. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;