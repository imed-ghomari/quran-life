'use client';

import { useState, useEffect } from 'react';
import {
    Check,
    ChevronRight,
    ChevronLeft,
    BookOpen,
    Calendar,
    Target,
    Info,
    ExternalLink,
    Star
} from 'lucide-react';
import { AppSettings, getSettings, saveSettings, toggleSurahLearned, getSurahLearnedStatus } from '@/lib/storage';
import { SURAHS } from '@/lib/quranData';
import { PART_NAMES, QuranPart } from '@/lib/types';

interface OnboardingModalProps {
    onComplete: () => void;
}

export default function OnboardingModal({ onComplete }: OnboardingModalProps) {
    const [step, setStep] = useState(0);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [selectedPart, setSelectedPart] = useState<QuranPart>(4);
    const [days, setDays] = useState(30);

    useEffect(() => {
        const currentSettings = getSettings();
        setSettings(currentSettings);
        setSelectedPart(currentSettings.activePart || 4);
        setDays(currentSettings.completionDays || 30);
    }, []);

    if (!settings) return null;

    const handleNext = () => {
        if (step < 4) {
            setStep(step + 1);
        } else {
            // Save final settings
            const finalSettings = {
                ...getSettings(),
                activePart: selectedPart,
                completionDays: days,
                isOnboardingComplete: true,
            };
            saveSettings(finalSettings);
            onComplete();
        }
    };

    const handleBack = () => {
        if (step > 0) setStep(step - 1);
    };

    const toggleSurah = (surahId: number) => {
        toggleSurahLearned(surahId);
        // Refresh settings from storage to update UI
        setSettings({ ...getSettings() });
    };

    const isSurahLearned = (surahId: number) => {
        const status = getSurahLearnedStatus(surahId);
        return status.learned === status.total && status.total > 0;
    };

    const filteredSurahs = SURAHS.filter(s => selectedPart === 5 || s.part === selectedPart);

    return (
        <div className="onboarding-overlay" style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20000,
            padding: '1rem',
        }}>
            <div className="onboarding-card" style={{
                background: 'var(--background-secondary)',
                borderRadius: '24px',
                maxWidth: '600px',
                width: '100%',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                position: 'relative',
                overflow: 'hidden',
                border: '1px solid var(--border)',
            }}>
                {/* Progress Bar */}
                <div style={{
                    height: '6px',
                    background: 'var(--border)',
                    width: '100%',
                    position: 'relative',
                }}>
                    <div style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        height: '100%',
                        background: 'var(--accent)',
                        width: `${((step + 1) / 5) * 100}%`,
                        transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    }} />
                </div>

                {/* Content */}
                <div style={{
                    padding: '2rem',
                    flex: 1,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                }}>
                    {step === 0 && (
                        <div className="step-content animate-fade-in">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                                <div style={{ background: 'var(--verse-bg)', padding: '0.75rem', borderRadius: '14px', color: 'var(--accent)' }}>
                                    <Target size={28} />
                                </div>
                                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Choose Your Scope</h2>
                            </div>
                            <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                                Select the part of the Qur&apos;an you are currently focusing on. This will filter your dashboard and statistics.
                            </p>
                            <div style={{ display: 'grid', gap: '0.75rem' }}>
                                {(Object.entries(PART_NAMES) as [string, any][]).map(([id, info]) => {
                                    const partId = parseInt(id) as QuranPart;
                                    const isActive = selectedPart === partId;
                                    return (
                                        <button
                                            key={id}
                                            onClick={() => setSelectedPart(partId)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '1rem 1.25rem',
                                                borderRadius: '16px',
                                                background: isActive ? 'var(--verse-bg)' : 'var(--background)',
                                                border: `2px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease',
                                                textAlign: 'left',
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '1rem', color: isActive ? 'var(--accent)' : 'var(--foreground)' }}>{info.english}</div>
                                                <div style={{ fontSize: '0.85rem', color: 'var(--foreground-secondary)', marginTop: '2px' }}>{info.arabic}</div>
                                            </div>
                                            {isActive && <Check size={20} color="var(--accent)" strokeWidth={3} />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {step === 1 && (
                        <div className="step-content animate-fade-in">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                                <div style={{ background: 'var(--verse-bg)', padding: '0.75rem', borderRadius: '14px', color: 'var(--accent)' }}>
                                    <Calendar size={28} />
                                </div>
                                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Set Your Goal</h2>
                            </div>
                            <p style={{ color: 'var(--foreground-secondary)', marginBottom: '2rem', lineHeight: 1.6 }}>
                                How many days do you want to complete a full review cycle of your selected part?
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem', width: '100%' }}>
                                <div style={{ width: '100%', padding: '0 10px' }}>
                                    <div style={{ position: 'relative', width: '100%' }}>
                                        <input
                                            type="range"
                                            min="7"
                                            max="120"
                                            value={days}
                                            onChange={(e) => setDays(parseInt(e.target.value))}
                                            style={{
                                                width: '100%',
                                                accentColor: 'var(--accent)',
                                                height: '8px',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                background: 'var(--border)',
                                                appearance: 'none',
                                                WebkitAppearance: 'none',
                                                margin: 0,
                                            }}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 2px', marginTop: '0.75rem', color: 'var(--foreground-secondary)', fontSize: '0.85rem' }}>
                                            <span>7 days</span>
                                            <span>120 days</span>
                                        </div>
                                    </div>
                                </div>
                                <div style={{
                                    background: 'var(--verse-bg)',
                                    padding: '2rem',
                                    borderRadius: '24px',
                                    textAlign: 'center',
                                    border: '1px solid var(--border)',
                                    width: '100%',
                                }}>
                                    <span style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--accent)', display: 'block', lineHeight: 1 }}>{days}</span>
                                    <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--foreground-secondary)', marginTop: '0.5rem', display: 'block' }}>Days until completion</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="step-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                                <div style={{ background: 'var(--verse-bg)', padding: '0.75rem', borderRadius: '14px', color: 'var(--accent)' }}>
                                    <BookOpen size={28} />
                                </div>
                                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Mark Your Progress</h2>
                            </div>
                            <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1rem', lineHeight: 1.6 }}>
                                Mark the Surahs you have already memorized/learned in <b>{PART_NAMES[selectedPart].english}</b>.
                            </p>
                            <div style={{
                                flex: 1,
                                overflowY: 'auto',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                                gap: '0.5rem',
                                padding: '0.5rem',
                                background: 'var(--background)',
                                borderRadius: '16px',
                                border: '1px solid var(--border)',
                            }}>
                                {filteredSurahs.map(surah => {
                                    const learned = isSurahLearned(surah.id);
                                    return (
                                        <button
                                            key={surah.id}
                                            onClick={() => toggleSurah(surah.id)}
                                            style={{
                                                padding: '0.75rem',
                                                borderRadius: '12px',
                                                border: `1px solid ${learned ? 'var(--success)' : 'var(--border)'}`,
                                                background: learned ? 'var(--success-bg)' : 'var(--background-secondary)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '0.25rem',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease',
                                            }}
                                        >
                                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: learned ? 'var(--success)' : 'var(--foreground)' }}>{surah.name}</span>
                                            <span style={{ fontSize: '0.85rem', fontFamily: 'Amiri, serif', color: learned ? 'var(--success)' : 'var(--foreground-secondary)' }}>{surah.arabicName}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="step-content animate-fade-in">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                                <div style={{ background: 'var(--verse-bg)', padding: '0.75rem', borderRadius: '14px', color: 'var(--accent)' }}>
                                    <Info size={28} />
                                </div>
                                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>How to Start</h2>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <div style={{
                                        width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent)', color: 'white',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 700, fontSize: '0.9rem'
                                    }}>1</div>
                                    <div>
                                        <h3 style={{ margin: '0 0 0.25rem 0' }}>Daily Portfolio</h3>
                                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--foreground-secondary)' }}>
                                            Check the <b>Todo</b> tab to see your daily portion for maintenance and study progress.
                                        </p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <div style={{
                                        width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent)', color: 'white',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 700, fontSize: '0.9rem'
                                    }}>2</div>
                                    <div>
                                        <h3 style={{ margin: '0 0 0.25rem 0' }}>Mindmaps first</h3>
                                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--foreground-secondary)' }}>
                                            Always create or study the mindmap of a Surah before moving to verse-by-verse review.
                                        </p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <div style={{
                                        width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent)', color: 'white',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 700, fontSize: '0.9rem'
                                    }}>3</div>
                                    <div>
                                        <h3 style={{ margin: '0 0 0.25rem 0' }}>Synchronize</h3>
                                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--foreground-secondary)' }}>
                                            Log in with Supabase to sync your progress across devices and keep your data safe.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="step-content animate-fade-in" style={{ textAlign: 'center' }}>
                            <div style={{ marginBottom: '2rem' }}>
                                <div style={{
                                    width: '80px', height: '80px', background: 'var(--success-bg)', borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: 'var(--success)'
                                }}>
                                    <Star size={40} fill="var(--success)" />
                                </div>
                                <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>You&apos;re all set!</h2>
                                <p style={{ color: 'var(--foreground-secondary)', lineHeight: 1.6 }}>
                                    Welcome to Quran Life. Your personalized review plan is ready.
                                </p>
                            </div>

                            <div style={{
                                background: 'var(--verse-bg)',
                                padding: '1.5rem',
                                borderRadius: '20px',
                                border: '1px dashed var(--accent)',
                                marginBottom: '2rem'
                            }}>
                                <h3 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                    <Info size={18} /> Need more help?
                                </h3>
                                <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
                                    Explore our comprehensive documentation to learn more about the methodology.
                                </p>
                                <a
                                    href="/docs"
                                    target="_blank"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        color: 'var(--accent)',
                                        fontWeight: 700,
                                        textDecoration: 'none',
                                        fontSize: '0.95rem',
                                    }}
                                >
                                    Read Documentation <ExternalLink size={16} />
                                </a>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '1.25rem 2rem',
                    borderTop: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'var(--background)',
                    borderBottomLeftRadius: '24px',
                    borderBottomRightRadius: '24px',
                }}>
                    <button
                        onClick={handleBack}
                        disabled={step === 0}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: step === 0 ? 'transparent' : 'var(--foreground-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            fontWeight: 600,
                            cursor: step === 0 ? 'default' : 'pointer',
                        }}
                    >
                        <ChevronLeft size={20} /> Back
                    </button>

                    <button
                        onClick={handleNext}
                        style={{
                            background: 'var(--accent)',
                            color: 'white',
                            border: 'none',
                            padding: '0.85rem 1.75rem',
                            borderRadius: '14px',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(91, 143, 185, 0.3)',
                        }}
                    >
                        {step === 4 ? 'Get Started' : 'Continue'} <ChevronRight size={20} />
                    </button>
                </div>
            </div>

            <style jsx>{`
                .animate-fade-in {
                    animation: fadeIn 0.4s ease-out forwards;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .onboarding-overlay {
                    animation: overlayIn 0.3s ease-out;
                }
                @keyframes overlayIn {
                    from { background: rgba(0,0,0,0); }
                    to { background: rgba(0,0,0,0.7); }
                }
                input[type="range"] {
                    -webkit-appearance: none;
                }
                input[type="range"]::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    height: 20px;
                    width: 20px;
                    border-radius: 50%;
                    background: var(--accent);
                    cursor: pointer;
                    box-shadow: 0 0 10px rgba(0,0,0,0.1);
                    border: 2px solid white;
                }
                input[type="range"]::-webkit-slider-runnable-track {
                    width: 100%;
                    height: 8px;
                    cursor: pointer;
                    background: var(--border);
                    border-radius: 4px;
                }
                input[type="range"]::-moz-range-track {
                    width: 100%;
                    height: 8px;
                    cursor: pointer;
                    background: var(--border);
                    border-radius: 4px;
                }
            `}</style>
        </div>
    );
}
