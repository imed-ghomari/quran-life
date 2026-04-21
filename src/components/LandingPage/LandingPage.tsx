import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '../ThemeProvider';
import {
  Repeat,
  Copy,
  Check,
  AlertTriangle,
  Sun,
  Moon,
  Monitor,
  Headphones,
  Smartphone,
  Anchor,
  ChevronDown,
  ChevronUp,
  ArrowUpRight
} from 'lucide-react';
import './LandingPage.css';
import RoadmapSection from './RoadmapSection';
import { clampTeacherSeatCount, formatCurrency, getStudentPlanPrice, getTeacherSeatPrice, getTeacherTotalPrice } from '@/lib/teacherPlan';
import { clientEnv } from '@/lib/env/client';

type ShowcaseItem = {
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: string | number }>;
  lightSrc: string;
  darkSrc: string;
  alt: string;
};

const methodItems: ShowcaseItem[] = [
  {
    title: '1. Passive Exposure',
    description:
      'Start by listening. Your "Daily Portion" builds a natural familiarity with the verses\' sound and flow before you even try to memorize.',
    icon: Headphones,
    lightSrc: '/landing/Passive_Exposure_Light.webp',
    darkSrc: '/landing/Passive_Exposure_Dark.webp',
    alt: 'Passive Exposure screen preview',
  },
  {
    title: '2. Visual Mapping',
    description:
      "Don't just repeat. Use the Splits setup modal to chunk verses and place them on a visual map, creating powerful mental hooks.",
    icon: Anchor,
    lightSrc: '/landing/visual-mapping-light.webp',
    darkSrc: '/landing/visual-mapping-dark.webp',
    alt: 'Visual Mapping screen preview',
  },
  {
    title: '3. Smart Review',
    description:
      'Lock it in. Our algorithm tracks every verse and notifies you to review exactly when your memory is about to fade.',
    icon: Repeat,
    lightSrc: '/landing/smart-review-card-light.webp',
    darkSrc: '/landing/smart-review-card-dark.webp',
    alt: 'Smart Review screen preview',
  },
];

const featureItems: ShowcaseItem[] = [
  {
    title: 'Error Detection',
    description:
      'Logs the exact verse where you made a mistake so you can detect weak spots early and fix them before they become repeated mistakes.',
    icon: AlertTriangle,
    lightSrc: '/landing/error-card-light.webp',
    darkSrc: '/landing/error-card-dark.webp',
    alt: 'Error Detection feature preview',
  },
  {
    title: 'Mutashabihat Engine',
    description:
      'Automatically detects similar verses. Flags them during reviews so you can differentiate them with logic, not just guessing.',
    icon: Copy,
    lightSrc: '/landing/mutashabihat-card-light.webp',
    darkSrc: '/landing/mutashabihat-card-dark.webp',
    alt: 'Mutashabihat Engine screen preview',
  },
  {
    title: 'Offline & Mobile',
    description:
      'Install as an App (PWA). Your progress syncs to the cloud, but you can review your maps anywhere, anytime, without internet.',
    icon: Smartphone,
    lightSrc: '/landing/mobile-card-light.webp',
    darkSrc: '/landing/mobile-card-dark.webp',
    alt: 'Offline and Mobile screen preview',
  },
];

const FeatureShowcase = ({
  items,
  idPrefix,
  inverted = false,
}: {
  items: ShowcaseItem[];
  idPrefix: string;
  inverted?: boolean;
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeItem = items[activeIndex];
  const panelId = `${idPrefix}-panel`;

  return (
    <div className={`feature-showcase${inverted ? ' feature-showcase-inverted' : ''}`}>
      <div className="feature-showcase-list" role="tablist" aria-orientation="vertical">
        {items.map((item, index) => {
          const Icon = item.icon;
          const isActive = index === activeIndex;
          const tabId = `${idPrefix}-tab-${index}`;

          return (
            <button
              key={item.title}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={panelId}
              className={`feature-showcase-card ${isActive ? 'active' : ''}`}
              onClick={() => setActiveIndex(index)}
            >
              <span className="feature-showcase-card-icon" aria-hidden="true">
                <Icon size={22} />
              </span>
              <span className="feature-showcase-card-content">
                <span className="feature-showcase-card-title">{item.title}</span>
                <span className="feature-showcase-card-description">{item.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-${activeIndex}`}
        className="feature-showcase-preview"
      >
        <img
          src={activeItem.lightSrc}
          alt={activeItem.alt}
          className="feature-showcase-image card-preview-image-light"
          loading="lazy"
          decoding="async"
          width={1400}
          height={1000}
        />
        <img
          src={activeItem.darkSrc}
          alt={activeItem.alt}
          className="feature-showcase-image card-preview-image-dark"
          loading="lazy"
          decoding="async"
          width={1400}
          height={1000}
        />
      </div>
    </div>
  );
};

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
  onBuy: (options: {
    role: 'student' | 'teacher';
    cycle: 'monthly' | 'yearly';
    students?: number;
  }) => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onBuy }) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [teacherStudentCount, setTeacherStudentCount] = useState(8);
  const { theme, setTheme } = useTheme();
  const showTeacherPricingUi = clientEnv.NEXT_PUBLIC_ENABLE_TEACHER_PRICING_UI;
  const teacherTotal = getTeacherTotalPrice(billingCycle, teacherStudentCount);
  const studentPrice = getStudentPlanPrice(billingCycle);
  const teacherSeatPrice = getTeacherSeatPrice(billingCycle);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = window.document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      root.setAttribute('data-theme', resolved);
    };

    applyTheme();
    if (theme === 'system') {
      if (media.addEventListener) {
        media.addEventListener('change', applyTheme);
        return () => media.removeEventListener('change', applyTheme);
      }
      media.addListener(applyTheme);
      return () => media.removeListener(applyTheme);
    }
  }, [theme]);

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
            <a href="#faq" className="nav-link">
              FAQ
            </a>
            <a href="#roadmap" className="nav-link">
              Roadmap
            </a>
            <span className="nav-divider" aria-hidden="true" />
            <Link href="/blog" className="nav-link">
              Blog
            </Link>
            <button
              className="btn btn-secondary nav-theme-btn"
              onClick={cycleTheme}
              aria-label="Toggle Theme"
            >
              {getThemeIcon()}
            </button>
            <button className="btn btn-primary" onClick={() => onBuy({ role: 'student', cycle: billingCycle })}>
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
                src="/landing/hero-tilted-light.webp"
                alt="Quran Life visual mindmap preview"
                className="hero-image hero-image-light"
                loading="eager"
                decoding="async"
                fetchPriority="high"
                width={1200}
                height={900}
              />
              <img
                src="/landing/hero-tilted-dark.webp"
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

            <FeatureShowcase items={methodItems} idPrefix="method-showcase" />
          </div>
        </section>

        {/* --- Features Grid --- */}
        <section id="features" className="features features-soft-band">
          <div className="container">
            <div className="section-header">
              <h2 className="section-title">Built for Hifdh</h2>
              <p>
                Specialized tools to solve the unique challenges of Quran memorization.
              </p>
            </div>

            <FeatureShowcase items={featureItems} idPrefix="feature-showcase" inverted />
          </div>
        </section>

        {/* --- Pricing Section (Premium Only) --- */}
        <section id="pricing" className="pricing">
          <div className="container">
            <div className="section-header">
              <h2 className="section-title">Invest in your Akhirah</h2>
              <p>
                {showTeacherPricingUi
                  ? 'Choose the plan that fits your memorization journey or your classroom.'
                  : 'One simple plan for full Quran Life access.'}
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

            <div className={`pricing-grid${showTeacherPricingUi ? '' : ' single-plan'}`}>
              <div className="price-card student-plan">
                <div className="badge">{showTeacherPricingUi ? 'Student' : 'Premium'}</div>

                <div className="price">{formatCurrency(studentPrice)}<span>{billingCycle === 'monthly' ? '/mo' : '/yr'}</span></div>

                <p>
                  Full Quran Life access for one learner.
                </p>

                <ul className="features-list">
                  <li><Check size={20} className="check-icon" /> Official Pre-Made Mindmaps</li>
                  <li><Check size={20} className="check-icon" /> Daily Portion Generator</li>
                  <li><Check size={20} className="check-icon" /> Advanced Spaced Repetition System</li>
                  <li><Check size={20} className="check-icon" /> Mutashabihat (Similar Verses) Tool</li>
                  <li><Check size={20} className="check-icon" /> Cross-device Cloud Sync</li>
                  <li><Check size={20} className="check-icon" /> Offline Access</li>
                </ul>

                <button
                  className="btn btn-secondary btn-full btn-lg"
                  onClick={() => onBuy({ role: 'student', cycle: billingCycle })}
                  aria-label="Purchase student subscription"
                >
                  Get Full Access Now
                </button>
                <p className="guarantee">1 week trial</p>
              </div>

              {showTeacherPricingUi ? (
                <div className="price-card premium">
                  <div className="badge">Teacher</div>

                  <div className="price">{formatCurrency(teacherTotal)}<span>{billingCycle === 'monthly' ? '/mo' : '/yr'}</span></div>

                  <p>
                    Cover your own account plus every student seat in one subscription.
                  </p>

                  <div className="teacher-seat-picker">
                    <div className="teacher-seat-picker-header">
                      <span>Students covered</span>
                    </div>
                    <div className="teacher-seat-picker-controls">
                      <button
                        type="button"
                        className="teacher-seat-stepper"
                        onClick={() => setTeacherStudentCount((current) => clampTeacherSeatCount(current - 1))}
                        aria-label="Decrease student seats"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={teacherStudentCount}
                        onChange={(event) => setTeacherStudentCount(clampTeacherSeatCount(event.target.value))}
                        className="teacher-seat-input"
                        aria-label="Teacher student count"
                      />
                      <button
                        type="button"
                        className="teacher-seat-stepper"
                        onClick={() => setTeacherStudentCount((current) => clampTeacherSeatCount(current + 1))}
                        aria-label="Increase student seats"
                      >
                        +
                      </button>
                    </div>
                    <p className="teacher-seat-summary">
                      Teacher base + {teacherStudentCount} student {teacherStudentCount === 1 ? 'seat' : 'seats'} at {formatCurrency(teacherSeatPrice)} each.
                    </p>
                  </div>

                  <ul className="features-list">
                    <li><Check size={20} className="check-icon" /> Everything in the student plan</li>
                    <li><Check size={20} className="check-icon" /> Shared class code for student onboarding</li>
                    <li><Check size={20} className="check-icon" /> Seat capacity tracking inside settings</li>
                    <li><Check size={20} className="check-icon" /> Increase or reduce covered students later</li>
                    <li><Check size={20} className="check-icon" /> Official Pre-Made Mindmaps</li>
                  </ul>

                  <button
                    className="btn btn-primary btn-full btn-lg"
                    onClick={() => onBuy({ role: 'teacher', cycle: billingCycle, students: teacherStudentCount })}
                    aria-label="Purchase teacher subscription"
                  >
                    Start Teacher Plan
                  </button>
                  <p className="guarantee">Teacher base + per-student seats. Adjust seats later from settings.</p>
                </div>
              ) : null}
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
                  question: "I already memorized some Surahs. Is this app only for new learners?",
                  answer: "It is not only for new learners. You can set your Active Part (Juz) to focus your Daily Portion on your current target, and you can skip Surahs you already know well so Todo stays useful without hiding other cards. If needed, you can unskip them later and bring them back into your workflow."
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
                  answer: "You can focus only on your current Juz. Quran Life lets you set an Active Part (Juz) so your Daily Portion follows that focus, while Todo stays global so you can still see every card and manage work across parts."
                }
              ].map((faq, index) => (
                <FaqItem key={index} question={faq.question} answer={faq.answer} />
              ))}
            </div>
          </div>
        </section>

        {/* --- Roadmap Section --- */}
        <RoadmapSection />

        {/* --- Cross-Project Shout-out --- */}
        <section className="partner-shoutout" aria-labelledby="partner-shoutout-title">
          <div className="container">
            <div className="partner-shoutout-card">
              <span className="partner-shoutout-badge">Free resource</span>
              <h2 id="partner-shoutout-title" className="partner-shoutout-title">
                Roadmap to Janna
              </h2>
              <p className="partner-shoutout-copy">If you are systematizing Quran memorization, you will likely want to systematize the other parts of your Muslim life too.</p>
              <a
                className="partner-shoutout-link"
                href="https://imed-ghomari.github.io/roadmap-to-janna/"
                target="_blank"
                rel="noreferrer"
              >
                Visit the free roadmap
                <ArrowUpRight size={18} />
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* --- Footer --- */}
      <footer id="footer" className="footer">
        <div className="container">
          <div className="footer-logo">
            <img src="/logo.png?v=3" width={20} height={20} alt="Quran Life Logo" />
            <span>Quran Life</span>
          </div>
          <div className="footer-links">
            <Link className="footer-link footer-link-blog" href="/blog">Blog</Link>
            <span className="footer-separator footer-separator-blog" aria-hidden="true">•</span>
            <a className="footer-link" href="/terms">Terms of Service</a>
            <span className="footer-separator" aria-hidden="true">•</span>
            <a className="footer-link" href="/privacy">Privacy Policy</a>
            <span className="footer-separator" aria-hidden="true">•</span>
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
