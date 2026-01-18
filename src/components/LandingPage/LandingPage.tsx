import React, { useState } from 'react';
import {
  Brain,
  Repeat,
  Copy, // For Similar Verses
  Check,
  ArrowRight,
  Zap,
  Layers,
  BookOpen,
  Sparkles
} from 'lucide-react';
import './LandingPage.css';
import RoadmapSection from './RoadmapSection';
import ThemeToggle from '../ThemeToggle';

interface LandingPageProps {
  /** * Callback function triggered when the user clicks the 
   * "Buy Premium" button.
   */
  onBuy: (cycle: 'monthly' | 'yearly') => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onBuy }) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');

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
            <ThemeToggle 
              variant="mobile" 
              style={{ marginRight: '1rem', color: 'var(--foreground)' }} 
            />
            <a href="#features" className="btn btn-secondary nav-features-btn" style={{ marginRight: '10px' }}>
              Features
            </a>
            <button className="btn btn-primary" onClick={() => onBuy(billingCycle)}>
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
              <h1 className="hero-title">
                Master your Quran Hifdh<br /> with Visual Mindmaps.
              </h1>
              <p className="hero-subtitle delay-100 animate-entry">
                The first platform combining intuitive mindmapping and smart spaced repetition
                to help you memorize and retain the Quran forever—without the struggle.
              </p>
              <div className="cta-group delay-200 animate-entry">
                <button className="btn btn-primary" onClick={() => onBuy(billingCycle)}>
                  Start Your Journey
                  <ArrowRight size={18} />
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
                Tools built specifically to solve the &quot;forgetting curve&quot; of Hifdh.
              </p>
            </div>

            <div className="grid">
              {/* Feature 1: Mindmapping */}
              <div className="card">
                <div className="icon-wrapper">
                  <Brain size={28} />
                </div>
                <h3>Visual Mindmapping</h3>
                <p>
                  Connect verses visually on an infinite canvas.
                  Create mental hooks and structural maps for every Surah to recall them effortlessly.
                </p>
              </div>

              {/* Feature 2: Smart Repetition */}
              <div className="card">
                <div className="icon-wrapper">
                  <Repeat size={28} />
                </div>
                <h3>Smart Spaced Repetition</h3>
                <p>
                  Never forget a verse. Our system calculates the exact
                  moment you need to review a page before you forget it, maximizing efficiency.
                </p>
              </div>

              {/* Feature 3: Similar Verses (Mutashabihat) */}
              <div className="card">
                <div className="icon-wrapper">
                  <Copy size={28} />
                </div>
                <h3>Similar Verse Integration</h3>
                <p>
                  Automatically detect and link similar verses (Mutashabihat).
                  See exactly where else a phrase appears to prevent mixing up Surahs.
                </p>
              </div>

              {/* Feature 4: Reduced Rote Memorization */}
              <div className="card highlight-card">
                <div className="icon-wrapper">
                  <Sparkles size={28} />
                </div>
                <h3>Reduced Rote Memorization</h3>
                <p>
                  Stop repeating verses blindly. Understand the structure to memorize faster.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* --- Pricing Section (Premium Only) --- */}
        <section className="pricing">
          <div className="container">
            <div className="section-header">
              <h2 className="section-title">Invest in your Akhirah</h2>
              <p style={{ color: 'var(--foreground-secondary)' }}>
                One plan. Everything you need to master the Quran.
              </p>
              
              {/* Billing Toggle */}
              <div className="billing-toggle-container">
                <div className="billing-toggle">
                  <button 
                    className={`toggle-option ${billingCycle === 'monthly' ? 'active' : ''}`}
                    onClick={() => setBillingCycle('monthly')}
                  >
                    Monthly
                  </button>
                  <button 
                    className={`toggle-option ${billingCycle === 'yearly' ? 'active' : ''}`}
                    onClick={() => setBillingCycle('yearly')}
                  >
                    Yearly
                    <span className="save-badge">Save 20%</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="pricing-grid single-plan">
              {/* Premium Tier */}
              <div className="price-card premium">
                <div className="badge">Complete Access</div>
                <h3>Hafidh Pro</h3>
                
                {billingCycle === 'monthly' ? (
                  <div className="price">$10<span>/mo</span></div>
                ) : (
                  <div className="price">$96<span>/yr</span></div>
                )}
                
                <p style={{ color: 'var(--foreground-secondary)' }}>
                  Unlock the full power of visual learning.
                </p>

                <ul className="features-list">
                  <li><Check size={20} className="check-icon" /> Unlimited Visual Mindmaps</li>
                  <li><Check size={20} className="check-icon" /> Advanced Spaced Repetition System</li>
                  <li><Check size={20} className="check-icon" /> <strong>Mutashabihat (Similar Verses) Tool</strong></li>
                  <li><Check size={20} className="check-icon" /> Cross-device Cloud Sync</li>
                  <li><Check size={20} className="check-icon" /> Offline Access</li>
                </ul>

                {/* CRITICAL: Button calls the onBuy prop */}
                <button
                  className="btn btn-primary btn-full btn-lg"
                  onClick={() => onBuy(billingCycle)}
                  aria-label="Purchase Premium Subscription"
                >
                  Get Full Access Now
                </button>
                <p className="guarantee">30-day money-back guarantee</p>
              </div>
            </div>
          </div>
        </section>

        {/* --- Roadmap Section --- */}
        <RoadmapSection />
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