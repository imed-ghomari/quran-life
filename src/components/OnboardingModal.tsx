'use client';

import { useState, useEffect, useRef } from 'react';
import {
    Check,
    ChevronRight,
    ChevronLeft,
    BookOpen,
    Calendar,
    Target,
    Info,
    ExternalLink,
    Star,
    EyeOff
} from 'lucide-react';
import Link from 'next/link';
import DailyCompletionSlider from './DailyCompletionSlider';
import { useInstantSettings, useInstantNodes } from '@/hooks/useInstantData';
import { id } from '@instantdb/react';
import { db } from '@/lib/instant';
import { SURAHS } from '@/lib/quranData';
import { PART_NAMES, QuranPart, getMaturityState } from '@/lib/types';
import { createNewFSRSState } from '@/lib/fsrs';

interface OnboardingModalProps {
    onComplete: () => void;
}

const ONBOARDING_TX_BATCH_SIZE = 100;

export default function OnboardingModal({ onComplete }: OnboardingModalProps) {
    const [step, setStep] = useState(0);
    const { settings, user } = useInstantSettings();
    const { nodes } = useInstantNodes();
    const [selectedPart, setSelectedPart] = useState<QuranPart>(4);
    const [days, setDays] = useState(30);
    const [localSkipped, setLocalSkipped] = useState<number[]>([]);
    const [dailyPortionModeChoice, setDailyPortionModeChoice] = useState<'audio' | 'reading'>('audio');
    const initializationKey = useRef<string | null>(null);

    useEffect(() => {
        if (!settings || !user) return;
        const key = `${user.id}-${settings.id ?? 'new'}`;
        if (initializationKey.current === key) return;
        setSelectedPart(settings.activePart || 4);
        setDays(settings.completionDays || 30);
        setLocalSkipped(settings.skippedSurahs || []);
        setDailyPortionModeChoice(settings.dailyPortionMode ?? 'audio');
        initializationKey.current = key;
    }, [settings, user]);

    if (!settings || !user) return null;

    const completeOnboarding = async () => {
        // Save final settings
        const settingsId = settings.id || id();
        
        const transactions = [
            db.tx.settings[settingsId].update({
                activePart: selectedPart,
                completionDays: days,
                isOnboardingComplete: true,
                skippedSurahs: localSkipped,
                dailyPortionMode: dailyPortionModeChoice,
                userId: user.id
            }) as any
        ];

        // Sync memory nodes for skipped surahs
        for (const surahId of localSkipped) {
            const surah = SURAHS.find(s => s.id === surahId);
            if (!surah) continue;

            for (let i = 1; i <= surah.verseCount; i++) {
                const targetId = `verse-${surahId}-${i}-${i}`;
                const alreadyExists = nodes.some(n =>
                    n.targetId === targetId ||
                    (
                        n.type === 'verse_segment' &&
                        n.surahId === surahId &&
                        n.startVerse === i &&
                        n.endVerse === i
                    )
                );
                if (!alreadyExists) {
                    const maturity = getMaturityState('mastered');
                    const nodeId = id();
                    transactions.push(
                        db.tx.memoryNodes[nodeId].update({
                            type: 'verse_segment',
                            surahId: surahId,
                            startVerse: i,
                            endVerse: i,
                            targetId,
                            scheduler: {
                                ...createNewFSRSState(),
                                ...maturity
                            },
                            createdAt: new Date().toISOString(),
                            userId: user.id
                        }) as any
                    );
                }
            }
        }
        
        // Large first-time setups can timeout if sent as one mutation; commit in batches.
        for (let i = 0; i < transactions.length; i += ONBOARDING_TX_BATCH_SIZE) {
            const batch = transactions.slice(i, i + ONBOARDING_TX_BATCH_SIZE);
            await db.transact(batch);
        }
        onComplete();
    };

    const handleNext = async () => {
        if (step < 4) {
            setStep(step + 1);
        } else {
            await completeOnboarding();
        }
    };

    const handleBack = () => {
        if (step > 0) setStep(step - 1);
    };

    const toggleSkippedSurah = (surahId: number) => {
        setLocalSkipped(prev => {
            const current = new Set(prev);
            if (current.has(surahId)) {
                current.delete(surahId);
            } else {
                current.add(surahId);
            }
            return Array.from(current).sort((a, b) => a - b);
        });
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
                                    const startSurah = SURAHS.find(s => s.id === info.surahs[0])?.name;
                                    const endSurah = SURAHS.find(s => s.id === info.surahs[1])?.name;

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
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 700, fontSize: '1rem', color: isActive ? 'var(--accent)' : 'var(--foreground)' }}>{info.english}</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--foreground-secondary)', marginTop: '4px', opacity: 0.8 }}>
                                                    From <b>{startSurah}</b> to <b>{endSurah}</b>
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                <div style={{ fontSize: '0.85rem', color: 'var(--foreground-secondary)' }}>{info.arabic}</div>
                                                {isActive && <Check size={20} color="var(--accent)" strokeWidth={3} />}
                                            </div>
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
                            <div style={{ width: '100%', marginTop: '1rem' }}>
                                <DailyCompletionSlider
                                    days={days}
                                    onChange={setDays}
                                    activePart={selectedPart}
                                />
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="step-content animate-fade-in">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                                <div style={{ background: 'var(--verse-bg)', padding: '0.75rem', borderRadius: '14px', color: 'var(--accent)' }}>
                                    <BookOpen size={28} />
                                </div>
                                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Daily Portion Mode</h2>
                            </div>
                            <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                                Choose how you want to go through your daily portion by default. You can change this later in Settings.
                            </p>
                            <div className="adv-segmented" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                                <button
                                    type="button"
                                    className={`adv-seg-btn ${dailyPortionModeChoice === 'audio' ? 'adv-seg-active' : ''}`}
                                    onClick={() => setDailyPortionModeChoice('audio')}
                                >
                                    <span>Listening</span>
                                </button>
                                <button
                                    type="button"
                                    className={`adv-seg-btn ${dailyPortionModeChoice === 'reading' ? 'adv-seg-active' : ''}`}
                                    onClick={() => setDailyPortionModeChoice('reading')}
                                >
                                    <span>Reading</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="step-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                                <div style={{ background: 'var(--verse-bg)', padding: '0.75rem', borderRadius: '14px', color: 'var(--accent)' }}>
                                    <EyeOff size={28} />
                                </div>
                                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Skip Common Surahs</h2>
                            </div>
                            <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                                You can skip Surahs you already know well. Skipping them means they won&apos;t appear in your daily review queue, allowing you to focus on what you&apos;re currently memorizing.
                            </p>
                            <div style={{
                                flex: 1,
                                overflowY: 'auto',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                                gap: '0.75rem',
                                padding: '0.5rem',
                            }}>
                                {[1, 32, 67, 112, 113, 114].map(id => {
                                    const surah = SURAHS.find(s => s.id === id);
                                    if (!surah) return null;
                                    const isSkipped = localSkipped.includes(id);
                                    
                                    return (
                                        <button
                                            key={id}
                                            onClick={() => toggleSkippedSurah(id)}
                                            style={{
                                                padding: '1rem',
                                                borderRadius: '16px',
                                                border: `2px solid ${isSkipped ? 'var(--foreground-secondary)' : 'var(--border)'}`,
                                                background: isSkipped ? 'var(--background-secondary)' : 'var(--background)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease',
                                                opacity: isSkipped ? 0.7 : 1,
                                            }}
                                        >
                                            <div style={{ 
                                                width: '24px', 
                                                height: '24px', 
                                                borderRadius: '50%', 
                                                border: `2px solid ${isSkipped ? 'var(--foreground-secondary)' : 'var(--border)'}`,
                                                background: isSkipped ? 'var(--foreground-secondary)' : 'transparent',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                marginBottom: '0.25rem'
                                            }}>
                                                {isSkipped && <EyeOff size={14} color="var(--background)" />}
                                            </div>
                                            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{surah.name}</span>
                                            <span style={{ fontFamily: 'Amiri, serif', color: 'var(--foreground-secondary)' }}>{surah.arabicName}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="step-content animate-fade-in">
                            


                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                                <div style={{ background: 'var(--verse-bg)', padding: '0.75rem', borderRadius: '14px', color: 'var(--accent)' }}>
                                    <Info size={28} />
                                </div>
                                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>How to Start</h2>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.5rem' }}>
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
                                            Log in with your email to sync your progress across devices and keep your data safe.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div style={{
                                background: 'var(--verse-bg)',
                                padding: '1.5rem',
                                borderRadius: '20px',
                                border: '1px dashed var(--accent)',
                                marginBottom: '2rem',
                                textAlign: 'center'
                            }}>
                                <h3 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                    <Info size={18} /> Need more help?
                                </h3>
                                
                                <Link
                                    href="/docs"
                                    onClick={() => { void completeOnboarding(); }}
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
                                </Link>
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
