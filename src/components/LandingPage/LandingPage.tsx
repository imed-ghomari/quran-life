import React, { useState } from 'react';
import { useTheme } from '../ThemeProvider';
import {
  Brain,
  Repeat,
  Copy, // For Similar Verses
  Check,
  ArrowRight,
  Zap,
  Layers,
  BookOpen,
  Sparkles,
  Sun,
  Moon,
  Monitor,
  Headphones,
  Smartphone,
  Anchor,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import './LandingPage.css';
import RoadmapSection from './RoadmapSection';

const FaqItem = ({ question, answer }: { question: string; answer: string }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={`faq-item ${isOpen ? 'open' : ''}`}>
      <button
        className="faq-question"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span>{question}</span>
        {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>
      <div
        className="faq-answer"
        style={{ maxHeight: isOpen ? '500px' : '0' }}
      >
        <p>{answer}</p>
      </div>
    </div>
  );
};

interface LandingPageProps {
  /** * Callback function triggered when the user clicks the 
   * "Buy Premium" button.
   */
  onBuy: (cycle: 'monthly' | 'yearly') => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onBuy }) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === 'system') setTheme('light');
    else if (theme === 'light') setTheme('dark');
    else setTheme('system');
  };

  const getThemeIcon = () => {
    // Larger size for mobile visibility
    const size = 22;
    switch (theme) {
      case 'light': return <Sun size={size} />;
      case 'dark': return <Moon size={size} />;
      case 'system': return <Monitor size={size} />;
      default: return <Sun size={size} />;
    }
  };

  return (
    <div className="landing-wrapper">
      {/* --- Navigation --- */}
      <nav className="nav">
        <div className="container nav-content">
          <div className="logo">
            <img src="/logo.png" width={28} height={28} alt="Quran Life Logo" />
            <span>Quran Life</span>
          </div>
          <div className="nav-actions">
            <a href="#features" className="nav-link">
              Features
            </a>
            <a href="#pricing" className="nav-link">
              Pricing
            </a>
            <a href="#roadmap" className="nav-link">
              Roadmap
            </a>
            <button
              className="btn btn-secondary nav-theme-btn"
              onClick={cycleTheme}
              aria-label="Toggle Theme"
            >
              {getThemeIcon()}
            </button>
            <button className="btn btn-primary" onClick={() => onBuy(billingCycle)}>
              Get Started
            </button>
          </div>
        </div>
      </nav>

      <main>
        {/* --- Hero Section --- */}
        <section id="top" className="hero">
          <div className="container hero-grid">
            <div className="hero-copy animate-entry">
              <h1 className="hero-title">
                Master your Quran Hifdh with Visual Mindmaps.
              </h1>
              <p className="hero-subtitle delay-100 animate-entry">
                The first platform combining intuitive mindmapping and smart spaced repetition
                to help you memorize and retain the Quran forever without the struggle.
              </p>
            </div>

            <div className="hero-media delay-200 animate-entry">
              <img
                src="/landing/hero-light.png"
                alt="Quran Life visual mindmap preview"
                className="hero-image hero-image-light"
                loading="eager"
                decoding="async"
                fetchPriority="high"
                width={1200}
                height={900}
              />
              <img
                src="/landing/hero-dark.png"
                alt="Quran Life visual mindmap preview"
                className="hero-image hero-image-dark"
                loading="eager"
                decoding="async"
                fetchPriority="high"
                width={1200}
                height={900}
              />
            </div>
          </div>
        </section>

        {/* --- Method Section (How it Works) --- */}
        <section id="method" className="features" style={{ background: 'var(--background)' }}>
          <div className="container">
            <div className="section-header">
              <h2 className="section-title">The 3-Phase System</h2>
              <p>
                A proven workflow designed to replace mindless repetition with deep understanding.
              </p>
            </div>

            <div className="grid">
              {/* Phase 1 */}
              <div className="card">
                <div className="icon-wrapper">
                  <Headphones size={28} />
                </div>
                <h3>1. Passive Exposure</h3>
                <p>
                  Start by listening. Your "Daily Portion" builds a natural familiarity with the verses' sound and flow before you even try to memorize.
                </p>
                <div className="card-preview">
                  <img
                    src="/landing/Passive_Exposure_Light.png"
                    alt="Passive Exposure screen preview in light mode"
                    className="card-preview-image card-preview-image-light"
                    loading="lazy"
                    decoding="async"
                    width={726}
                    height={772}
                  />
                  <img
                    src="/landing/Passive_Exposure_Dark.png"
                    alt="Passive Exposure screen preview in dark mode"
                    className="card-preview-image card-preview-image-dark"
                    loading="lazy"
                    decoding="async"
                    width={726}
                    height={772}
                  />
                </div>
              </div>

              {/* Phase 2 */}
              <div className="card">
                <div className="icon-wrapper">
                  <Anchor size={28} />
                </div>
                <h3>2. Visual Mapping</h3>
                <p>
                  Don't just repeat. Use the <strong>Splits setup modal</strong> to chunk verses and place them on a visual map, creating powerful mental hooks.
                </p>
                <div className="card-preview card-preview-placeholder card-preview-map" aria-hidden="true">
                  <div className="map-node node-main" />
                  <div className="map-node node-a" />
                  <div className="map-node node-b" />
                  <div className="map-node node-c" />
                  <div className="map-node node-d" />
                  <div className="map-link link-1" />
                  <div className="map-link link-2" />
                  <div className="map-link link-3" />
                  <div className="map-link link-4" />
                </div>
              </div>

              {/* Phase 3 */}
              <div className="card">
                <div className="icon-wrapper">
                  <Repeat size={28} />
                </div>
                <h3>3. Smart Review</h3>
                <p>
                  Lock it in. Our algorithm tracks every verse and notifies you to review exactly when your memory is about to fade.
                </p>
                <div className="card-preview card-preview-smart-review">
                  <img
                    src="/landing/smart-review-light.png"
                    alt="Smart Review screen preview in light mode"
                    className="card-preview-image card-preview-image-light"
                    loading="lazy"
                    decoding="async"
                    width={726}
                    height={772}
                  />
                  <img
                    src="/landing/smart-review-dark.png"
                    alt="Smart Review screen preview in dark mode"
                    className="card-preview-image card-preview-image-dark"
                    loading="lazy"
                    decoding="async"
                    width={726}
                    height={772}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* --- Features Grid --- */}
        <section id="features" className="features">
          <div className="container">
            <div className="section-header">
              <h2 className="section-title">Built for Hifdh</h2>
              <p>
                Specialized tools to solve the unique challenges of Quran memorization.
              </p>
            </div>

            <div className="grid">
              {/* Feature 1: Mindmapping */}
              <div className="card">
                <div className="icon-wrapper">
                  <Layers size={28} />
                </div>
                <h3>Infinite Canvas</h3>
                <p>
                  A distraction-free space to build your maps. Import templates or draw your own connections to visualize the Surah's structure.
                </p>
                <div className="card-preview card-preview-placeholder card-preview-canvas" >
                 <img
                    src="/landing/InfiniteCanva.jpeg"
                    alt="Mutashabihat Engine preview in light mode"
                    className="card-preview-image card-preview-image-light"
                    loading="lazy"
                    decoding="async"
                    width={726}
                    height={772}
                  />
                </div>
              </div>

              {/* Feature 2: Similar Verses */}
              <div className="card">
                <div className="icon-wrapper">
                  <Copy size={28} />
                </div>
                <h3>Mutashabihat Engine</h3>
                <p>
                  Automatically detects similar verses. Flags them during reviews so you can differentiate them with logic, not just guessing.
                </p>
                <div className="card-preview card-preview-mutashabihat">
                  <img
                    src="/landing/Mutashabihat_light.png"
                    alt="Mutashabihat Engine preview in light mode"
                    className="card-preview-image card-preview-image-light"
                    loading="lazy"
                    decoding="async"
                    width={726}
                    height={772}
                  />
                  <img
                    src="/landing/Mutashabihat_dark.png"
                    alt="Mutashabihat Engine preview in dark mode"
                    className="card-preview-image card-preview-image-dark"
                    loading="lazy"
                    decoding="async"
                    width={726}
                    height={772}
                  />
                </div>
              </div>

              {/* Feature 3: Offline */}
              <div className="card">
                <div className="icon-wrapper">
                  <Smartphone size={28} />
                </div>
                <h3>Offline & Mobile</h3>
                <p>
                  Install as an App (PWA). Your progress syncs to the cloud, but you can review your maps anywhere, anytime, without internet.
                </p>
                <div className="card-preview card-preview-placeholder card-preview-mobile" aria-hidden="true">
                 <img
                    src="/landing/Mobile.png"
                    alt="Mutashabihat Engine preview in dark mode"
                    className="card-preview-image card-preview-image-dark"
                    loading="lazy"
                    decoding="async"
                    width={726}
                    height={772}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* --- Pricing Section (Premium Only) --- */}
        <section id="pricing" className="pricing">
          <div className="container">
            <div className="section-header">
              <h2 className="section-title">Invest in your Akhirah</h2>
              <p>
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

                {billingCycle === 'monthly' ? (
                  <div className="price">$10<span>/mo</span></div>
                ) : (
                  <div className="price">$96<span>/yr</span></div>
                )}

                <p>
                  Unlock the full power of visual learning.
                </p>

                <ul className="features-list">
                  <li><Check size={20} className="check-icon" /> Unlimited Visual Mindmaps</li>
                  <li><Check size={20} className="check-icon" /> Daily Portion Generator</li>
                  <li><Check size={20} className="check-icon" /> Advanced Spaced Repetition System</li>
                  <li><Check size={20} className="check-icon" /> Mutashabihat (Similar Verses) Tool</li>
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
                <p className="guarantee">1 week trial</p>
              </div>
            </div>
          </div>
        </section>

        {/* --- FAQ Section --- */}
        <section id="faq" className="faq-section">
          <div className="container">
            <div className="section-header">
              <h2 className="section-title">Frequently Asked Questions</h2>
              <p>
                Everything you need to know about Quran Life.
              </p>
            </div>

            <div className="faq-grid">
              {[
                {
                  question: "How does the 'Visual Mindmap' technique actually help with Hifdh?",
                  answer: "Scientific research shows that the brain retains information better when it's structured visually. Instead of memorizing linear text, our Anchoring System allows you to break Surahs down into logical blocks (mindmaps). This creates 'mental hooks' that make recall faster and more reliable, especially for longer Surahs."
                },
                {
                  question: "I already memorized some Surahs. Is this app only for new students?",
                  answer: "It is not only for new students. You can set your Active Part (Juz) to focus on your current target, and you can skip Surahs you already know well so your Todo and Daily Portion stay focused. If needed, you can unskip them later and bring them back into your workflow."
                },
                {
                  question: "I already finished the Quran. Can Quran Life still make my Hifdh stronger?",
                  answer: "Yes. Quran Life can be used as a long-term maintenance system. Smart Review (FSRS) schedules your reviews over time, and the Mutashabihat tools help you handle similar verses that commonly cause slips. This is useful even if you are not learning from zero."
                },
                {
                  question: "Do I need to build a mindmap before reviews, or can I just start reviewing?",
                  answer: "For this method, the mindmap is core. The app is designed around visual anchors, and review works best after your map and verse splits are set. You can import a pre-made map or create/edit your own, then start Smart Review."
                },
                {
                  question: "Do I have to start from Surah Al-Baqarah, or can I focus only on the Juz I am working on?",
                  answer: "You can focus only on your current Juz. Quran Life lets you set an Active Part (Juz), and your Daily Portion and Todo are filtered to that focus so you can study in a structured way without restarting everything."
                }
              ].map((faq, index) => (
                <FaqItem key={index} question={faq.question} answer={faq.answer} />
              ))}
            </div>
          </div>
        </section>

        {/* --- Roadmap Section --- */}
        <RoadmapSection />
      </main>

      {/* --- Footer --- */}
      <footer id="footer" className="footer">
        <div className="container">
          <div className="footer-logo">
            <img src="/logo.png?v=3" width={20} height={20} alt="Quran Life Logo" />
            <span>Quran Life</span>
          </div>
          <div className="footer-links">
            <a className="footer-link" href="/terms">Terms of Service</a>
            <span aria-hidden="true">•</span>
            <a className="footer-link" href="/privacy">Privacy Policy</a>
            <span aria-hidden="true">•</span>
            <a
              className="footer-link discord-link"
              href="https://discord.gg/6wy3YRG2qB"
              target="_blank"
              rel="noreferrer"
            >
              Discord Community
            </a>
          </div>
          <p className="footer-meta">
            <span>&copy; {new Date().getFullYear()} Quran Life. All rights reserved.</span>
            <span className="footer-meta-separator" aria-hidden="true">•</span>
            <span className="footer-attribution">
              Quran text, audio, and mutashabihat are provided thanks to the{' '}
              <a
                href="https://qul.tarteel.ai/"
                target="_blank"
                rel="noreferrer"
              >
                Quran Universal Library
              </a>.
            </span>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
