'use client';

import React, { useEffect, useMemo, useState, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { OnlineStatusContext } from '@/components/Providers';
import { getSurahsByPart, getSurah, getQuranVerses, SURAHS } from '@/lib/quranData';
import { QuranPart, MemoryNode, getNodeStability, getNodeDifficulty, getNodeReps, getNodeDueDate } from '@/lib/types';
import { db } from '@/lib/instant';
import { useInstantSettings, useInstantNodes, useInstantMutashabihat } from '@/hooks/useInstantData';
import {
    Check, Clock, PauseCircle, RotateCcw, Download,
    Upload,
    Database,
    Brain,
    Plus,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Map as MapIcon,
    Book,
    Activity,
    X,
    Trash2,
    Sun,
    Moon,
    Monitor,
    Palette
} from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import AddCustomMutashabihModal from '@/components/AddCustomMutashabihModal';
import DailyCompletionSlider from '@/components/DailyCompletionSlider';
import { getAllMutashabihatRefs, absoluteToSurahAyah, getMutashabihatForAbsolute, surahAyahToAbsolute } from '@/lib/mutashabihat';

interface MutashabihatDecision {
    id: string; // absoluteAyah or absoluteAyah-phraseId
    status: 'confirmed' | 'ignored' | 'pending' | 'solved_mindmap' | 'solved_note';
    confirmedAt?: string;
    notes?: string;
}

function AppearanceCard() {
    const { theme, setTheme } = useTheme();

    return (
        <div className="card modern-card" style={{
            background: 'var(--background-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '16px'
        }}>
            <div className="section-title"
                style={{
                    color: 'var(--accent)',
                    fontWeight: 700,
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    fontSize: 'clamp(1rem, 5vw, 1.1rem)'
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ background: 'var(--accent)', color: 'white', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Palette size={18} />
                    </div>
                    <span>Appearance</span>
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <p style={{ color: 'var(--foreground-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                    Choose how Quran Life looks for you.
                </p>
                <div style={{ display: 'flex', gap: '0.65rem' }}>
                    {[
                        { id: 'light', label: 'Light', icon: Sun },
                        { id: 'dark', label: 'Dark', icon: Moon },
                        { id: 'system', label: 'System', icon: Monitor }
                    ].map((mode) => (
                        <button
                            key={mode.id}
                            onClick={() => setTheme(mode.id as any)}
                            style={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.75rem 0.5rem',
                                borderRadius: '12px',
                                border: theme === mode.id ? '2px solid var(--accent)' : '1px solid var(--border)',
                                background: theme === mode.id ? 'var(--verse-bg)' : 'var(--background)',
                                color: theme === mode.id ? 'var(--accent)' : 'var(--foreground-secondary)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            <mode.icon size={20} />
                            <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{mode.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

const MUT_STATES: { value: MutashabihatDecision['status']; label: string }[] = [
    { value: 'pending', label: 'Pending Review' },
    { value: 'ignored', label: 'Ignored (Not similar)' },
    { value: 'solved_mindmap', label: 'Solved by Mindmap' },
    { value: 'solved_note', label: 'Solved by Note' },
];

/**
 * Renders Arabic text with highlighted word ranges
 */
/**
 * Renders Arabic text with highlighted word ranges.
 * Note: Highlighting indices come from the Mutashabihat ul Quran dataset.
 * Some minor offsets (1-2 words) may occur due to variations in whitespace
 * or tokenization between datasets.
 */
function HighlightedVerse({ text, range }: { text: string; range?: [number, number] }) {
    if (!range) return <>{text}</>;
    const words = text.trim().split(/\s+/);
    return (
        <>
            {words.map((word, idx) => {
                const wordNum = idx + 1;
                const isHighlighted = wordNum >= range[0] && wordNum <= range[1];
                return (
                    <span key={idx} className={isHighlighted ? 'mut-word-highlight' : ''}>
                        {word}{' '}
                    </span>
                );
            })}
        </>
    );
}

export default function SettingsPage() {
    const router = useRouter();
    const isOnline = useContext(OnlineStatusContext);
    const { user } = db.useAuth();
    const { settings, saveSettings } = useInstantSettings();
    const { nodes: instantNodes } = useInstantNodes();
    const { decisions: instantDecisions, custom: instantCustomMutashabihat, saveDecision: updateInstantDecision, saveCustom: updateInstantCustom } = useInstantMutashabihat();

    const [decisions, setDecisions] = useState<Record<string, MutashabihatDecision>>({});
    const [expandedSurahs, setExpandedSurahs] = useState<Record<number, boolean>>({});
    const [expandedMutItems, setExpandedMutItems] = useState<Record<string, boolean>>({});
    const [selectedMutSurah, setSelectedMutSurah] = useState<number | null>(null);
    const [verses, setVerses] = useState<{ surahId: number; ayahId: number; text: string }[]>([]);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [targetSurahId, setTargetSurahId] = useState<number | undefined>();
    const [showDebugNodes, setShowDebugNodes] = useState(true);
    const [memoryNodes, setMemoryNodes] = useState<MemoryNode[]>([]);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [isMobile, setIsMobile] = useState(false);
    const [activeSlideOverGroup, setActiveSlideOverGroup] = useState<{
        id: string;
        title: string;
        type: 'verse_segment' | 'mindmap' | 'part_mindmap';
        nodes: MemoryNode[];
        surahId?: number;
    } | null>(null);

    const [activeMutSlideOver, setActiveMutSlideOver] = useState<{
        id: string;
        title: string;
        surahId: number;
        phraseId: string;
        group: {
            phraseId: string;
            ayahIds: number[];
            entry: any;
            absRefs: number[];
        };
        representativeAbs: number;
    } | null>(null);

    const [activeMobilePage, setActiveMobilePage] = useState<'account' | 'plan' | 'tracking' | 'appearance' | null>(null);

    // Sync instant decisions to local state for easier lookups
    useEffect(() => {
        const decisionsMap: Record<string, MutashabihatDecision> = {};
        instantDecisions.forEach(d => {
            decisionsMap[d.phraseId] = d as any;
        });
        setDecisions(decisionsMap);
    }, [instantDecisions]);

    // Sync instant nodes to local state
    useEffect(() => {
        setMemoryNodes(instantNodes);
    }, [instantNodes]);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const [sectionsExpanded, setSectionsExpanded] = useState({
        cloudSync: true,
        backupRestore: true,
        schedule: true,
        activePart: true,
        surahStatus: true,
        mutashabihat: true,
    });

    const toggleSection = (key: keyof typeof sectionsExpanded) => {
        // Disable folding on desktop
        if (window.innerWidth < 768) {
            setSectionsExpanded(s => ({ ...s, [key]: !s[key] }));
        }
    };

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 768) {
                setSectionsExpanded({
                    cloudSync: true,
                    backupRestore: true,
                    schedule: true,
                    activePart: true,
                    surahStatus: true,
                    mutashabihat: true,
                });
                setShowDebugNodes(true);
            }
        };

        if (typeof window !== 'undefined') {
            if (window.innerWidth < 768) {
                setSectionsExpanded({
                    cloudSync: false,
                    backupRestore: false,
                    schedule: false,
                    activePart: false,
                    surahStatus: false,
                    mutashabihat: false,
                });
                setShowDebugNodes(false);
            } else {
                setSectionsExpanded({
                    cloudSync: true,
                    backupRestore: true,
                    schedule: true,
                    activePart: true,
                    surahStatus: true,
                    mutashabihat: true,
                });
            }
        }

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // InstantDB Auth State
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [authStep, setAuthStep] = useState<'email' | 'code'>('email');
    const [isAuthProcessing, setIsAuthProcessing] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError(null);
        setIsAuthProcessing(true);

        try {
            if (authStep === 'email') {
                await db.auth.sendMagicCode({ email });
                setAuthStep('code');
            } else {
                await db.auth.signInWithMagicCode({ email, code });
            }
        } catch (err: any) {
            setAuthError(err.body?.message || err.message || 'An error occurred');
        } finally {
            setIsAuthProcessing(false);
        }
    };

    useEffect(() => {
        // Initial load handled by hook
        // setSettings(getSettings());

    }, []);

    const renderMobileView = () => {

        if (activeMobilePage === 'account') {
            return (
                <div className="content-wrapper">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                        <button onClick={() => setActiveMobilePage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                            <ChevronLeft size={28} />
                        </button>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Account & Data</h1>
                    </div>

                    <div className="card modern-card" style={{ background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Database size={18} /> User Account
                        </h2>
                        <p style={{ marginBottom: '1rem', color: 'var(--foreground-secondary)', fontSize: '0.9rem' }}>
                            {user
                                ? `Signed in as ${user.email}. Your data is synced automatically.`
                                : "Sign in to sync your progress across devices."}
                        </p>

                        <div style={{ opacity: isOnline ? 1 : 0.45, pointerEvents: isOnline ? 'auto' : 'none' }}>
                            {!isOnline && (
                                <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)' }}>
                                    <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Offline</div>
                                    <div style={{ color: 'var(--foreground-secondary)', fontSize: '0.85rem' }}>
                                        Cloud sync and authentication are paused. Keep using the app; changes will sync when online.
                                    </div>
                                </div>
                            )}

                            {user ? (
                                <>


                                    <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
                                        <button
                                            className="btn btn-secondary"
                                            onClick={async () => {
                                                // InstantDB handles sync automatically
                                                if (!window.confirm("Are you sure you want to sign out? You will be redirected to the landing page and will need to sign in again to access the app.")) return;

                                                // Sign out from InstantDB (it clears local storage token)
                                                db.auth.signOut();
                                                router.push('/');
                                            }}
                                            style={{ width: '100%', padding: '0.85rem', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 600, fontSize: '1rem', cursor: 'pointer' }}
                                        >
                                            Sign Out
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {authStep === 'email' ? (
                                        <input
                                            suppressHydrationWarning={true}
                                            type="email"
                                            placeholder="Enter your email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                            style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '1rem' }}
                                        />
                                    ) : (
                                        <input
                                            type="text"
                                            placeholder="Enter verification code"
                                            value={code}
                                            onChange={(e) => setCode(e.target.value)}
                                            required
                                            style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '1rem' }}
                                        />
                                    )}
                                    {authError && <p style={{ color: '#ef4444', fontSize: '0.85rem' }}>{authError}</p>}
                                    <button
                                        suppressHydrationWarning={true}
                                        type="submit"
                                        className="btn btn-primary"
                                        disabled={isAuthProcessing}
                                        style={{ width: '100%', padding: '0.85rem', fontSize: '1rem' }}
                                    >
                                        {isAuthProcessing ? 'Processing...' : (authStep === 'email' ? 'Send Code' : 'Verify Code')}
                                    </button>
                                </form>
                            )}
                        </div>
                    </div>

                    <div className="card modern-card" style={{ background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Download size={18} /> Backup, Import & Reset
                        </h2>
                        <p style={{ marginBottom: '1rem', color: 'var(--foreground-secondary)', fontSize: '0.9rem' }}>
                            Manage your data: Export backup, import from file, or reset all data.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={handleExport}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    padding: '1rem',
                                    fontSize: '0.9rem',
                                    height: 'auto',
                                    background: 'var(--background)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '12px'
                                }}
                            >
                                <Download size={20} style={{ color: 'var(--accent)' }} />
                                <span>Export Data</span>
                            </button>
                            <label
                                className="btn btn-secondary"
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    padding: '1rem',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    height: 'auto',
                                    background: 'var(--background)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '12px'
                                }}
                            >
                                <Upload size={20} style={{ color: 'var(--accent)' }} />
                                <span>Import Data</span>
                                <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
                            </label>
                            <button
                                className="btn btn-secondary"
                                onClick={handleReset}
                                style={{
                                    gridColumn: 'span 2',
                                    display: 'flex',
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    padding: '1rem',
                                    fontSize: '0.9rem',
                                    height: 'auto',
                                    background: 'var(--background)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '12px',
                                    color: '#ef4444'
                                }}
                            >
                                <Trash2 size={20} />
                                <span>Reset All Data</span>
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        if (activeMobilePage === 'plan') {
            return (
                <div className="content-wrapper">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                        <button onClick={() => setActiveMobilePage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                            <ChevronLeft size={28} />
                        </button>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Memorization Plan</h1>
                    </div>

                    <div className="card modern-card" style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Clock size={18} /> Completion Schedule
                        </h2>
                        <DailyCompletionSlider
                            days={settings.completionDays || 30}
                            onChange={handleCompletionDays}
                            activePart={settings.activePart}
                        />
                    </div>

                    <div className="card modern-card" style={{ padding: '1rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <PauseCircle size={18} /> Active Part
                        </h2>
                        <div className="part-selector" style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                            gap: '0.75rem'
                        }}>
                            {[
                                { id: 1, name: "Sab'ut-Tiwal" },
                                { id: 2, name: "Al-Mi'un" },
                                { id: 3, name: "Al-Mathani" },
                                { id: 4, name: "Al-Mufassal" },
                                { id: 5, name: "All Quran" }
                            ].map(p => (
                                <button
                                    suppressHydrationWarning={true}
                                    key={p.id}
                                    className={`part-option ${settings.activePart === p.id ? 'active' : ''}`}
                                    onClick={() => handleActivePart(p.id as QuranPart)}
                                    style={{
                                        padding: '1.25rem 0.75rem',
                                        borderRadius: '16px',
                                        border: settings.activePart === p.id ? '2px solid var(--accent)' : '2px solid var(--border)',
                                        background: settings.activePart === p.id ? 'var(--verse-bg)' : 'var(--background-secondary)',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        textAlign: 'center',
                                        gap: '0.25rem'
                                    }}
                                >
                                    <div className="part-number" style={{ fontSize: '1.4rem', fontWeight: 800, color: settings.activePart === p.id ? 'var(--accent)' : 'var(--foreground)' }}>
                                        {p.id === 5 ? '∞' : p.id}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: settings.activePart === p.id ? 'var(--accent)' : 'var(--foreground-secondary)' }}>{p.name}</div>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--foreground-secondary)', opacity: 0.8 }}>{getSurahsByPart(p.id as QuranPart).length} surahs</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            );
        }

        if (activeMobilePage === 'tracking') {
            return (
                <div className="content-wrapper">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                        <button onClick={() => setActiveMobilePage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                            <ChevronLeft size={28} />
                        </button>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Progress Tracking</h1>
                    </div>

                    <div className="card modern-card" style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Check size={18} /> Skipped Surah
                        </h2>
                        <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                            Search and add Surahs you want to skip (e.g., ones you know perfectly).
                        </p>

                        <div className="add-skipped-container" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                            <select
                                value={surahToSkipId}
                                onChange={(e) => setSurahToSkipId(e.target.value ? Number(e.target.value) : '')}
                                style={{
                                    flex: 1,
                                    padding: '0.75rem',
                                    borderRadius: '12px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--background)',
                                    color: 'var(--foreground)',
                                    fontSize: '0.95rem'
                                }}
                            >
                                <option value="">Select Surah to Skip...</option>
                                {SURAHS.map(s => (
                                    <option key={s.id} value={s.id} disabled={settings.skippedSurahs?.includes(s.id)}>
                                        {s.id}. {s.name} ({s.arabicName})
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={handleAddSkippedSurah}
                                disabled={!surahToSkipId}
                                style={{
                                    padding: '0 1.25rem',
                                    borderRadius: '12px',
                                    background: surahToSkipId ? 'var(--accent)' : 'var(--border)',
                                    color: 'white',
                                    fontWeight: 600,
                                    border: 'none',
                                    cursor: surahToSkipId ? 'pointer' : 'not-allowed',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Add
                            </button>
                        </div>

                        <div className="skipped-surahs-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {(!settings.skippedSurahs || settings.skippedSurahs.length === 0) && (
                                <p style={{ color: 'var(--foreground-secondary)', fontSize: '0.9rem', fontStyle: 'italic', width: '100%' }}>No surahs skipped.</p>
                            )}
                            {settings.skippedSurahs?.map(id => {
                                const s = SURAHS.find(surah => surah.id === id);
                                if (!s) return null;
                                return (
                                    <div key={id} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        padding: '0.5rem 0.75rem',
                                        borderRadius: '20px',
                                        background: 'var(--background)',
                                        border: '1px solid var(--border)',
                                        fontSize: '0.9rem'
                                    }}>
                                        <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{s.name}</span>
                                        <button
                                            onClick={() => handleRemoveSkippedSurah(id)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: 'var(--foreground-secondary)',
                                                cursor: 'pointer',
                                                padding: '2px',
                                                display: 'flex',
                                                alignItems: 'center'
                                            }}
                                            title="Unskip (Add back to cycle)"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="card modern-card" style={{ background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Activity size={18} /> Knowledge Tracking
                        </h2>
                        <div className="knowledge-groups-mobile">
                            {/* MINDMAPS MOBILE GROUP */}
                            <div className="mobile-group-item">
                                <div className="mobile-group-header" onClick={() => toggleGroup('mindmaps')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <MapIcon size={20} />
                                        <span style={{ fontWeight: 600 }}>Mindmaps</span>
                                    </div>
                                    <ChevronDown size={20} style={{ transform: expandedGroups['mindmaps'] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                </div>
                                {expandedGroups['mindmaps'] && (
                                    <div className="mobile-subgroup-list">
                                        <div className="mobile-subgroup-item" onClick={() => setActiveSlideOverGroup({
                                            id: 'mindmaps-part',
                                            title: 'Part Mindmaps',
                                            type: 'part_mindmap' as any as any,
                                            nodes: memoryNodes.filter(n => (n as any).type === 'part_mindmap')
                                        })}>
                                            <span>Part Mindmaps</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span className="status-badge">{memoryNodes.filter(n => (n as any).type === 'part_mindmap').length}</span>
                                                <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
                                            </div>
                                        </div>
                                        <div className="mobile-subgroup-item" onClick={() => setActiveSlideOverGroup({
                                            id: 'mindmaps-surah',
                                            title: 'Surah Mindmaps',
                                            type: 'mindmap' as any as any,
                                            nodes: memoryNodes.filter(n => (n as any).type === 'mindmap')
                                        })}>
                                            <span>Surah Mindmaps</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span className="status-badge">{memoryNodes.filter(n => (n as any).type === 'mindmap').length}</span>
                                                <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* VERSES MOBILE GROUP */}
                            <div className="mobile-group-item">
                                <div className="mobile-group-header" onClick={() => toggleGroup('verses')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <Book size={20} />
                                        <span style={{ fontWeight: 600 }}>Verses</span>
                                    </div>
                                    <ChevronDown size={20} style={{ transform: expandedGroups['verses'] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                </div>
                                {expandedGroups['verses'] && (
                                    <div className="mobile-subgroup-list">
                                        {/* Issue #10: Filter by active part */}
                                        {(() => {
                                            // Get all eligible surahs for the current active part
                                            const eligibleSurahs = SURAHS.filter(s =>
                                                (settings.activePart === 5 || s.part === settings.activePart) &&
                                                !settings.skippedSurahs?.includes(s.id)
                                            ).sort((a, b) => a.id - b.id);

                                            if (eligibleSurahs.length === 0) {
                                                return (
                                                    <div className="empty-state" style={{ padding: '1rem' }}>No surahs in Part {settings.activePart}</div>
                                                );
                                            }

                                            return eligibleSurahs.map(surah => {
                                                const surahId = surah.id;
                                                const surahNodes = memoryNodes.filter(n => n.type === 'verse_segment' && n.surahId === surahId);

                                                // Always show the surah group, even if no nodes exist yet (0 items)
                                                // This allows users to set maturity for the whole group before starting reviews
                                                return (
                                                    <div key={surahId} className="mobile-subgroup-item" onClick={() => setActiveSlideOverGroup({
                                                        id: `verse-surah-${surahId}`,
                                                        title: `${surah.id}. ${surah.name}`,
                                                        type: 'verse_segment',
                                                        nodes: surahNodes,
                                                        surahId
                                                    })}>
                                                        <span>{surah.name}</span>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span className={`status-badge ${surahNodes.length === 0 ? 'neutral' : ''}`}>
                                                                {surahNodes.length}
                                                            </span>
                                                            <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
                                                        </div>
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="card modern-card" style={{ background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Brain size={18} /> Similar Verse Coverage
                        </h2>
                        <div className="knowledge-groups-mobile">
                            {mutashabihatSurahs.map(({ surah, count }) => {
                                const isOpen = expandedSurahs[surah.id] ?? false;

                                // Calculate surah group data
                                const surahMutsMap: Record<string, {
                                    phraseId: string,
                                    ayahIds: number[],
                                    entry: any,
                                    absRefs: number[]
                                }> = {};

                                getAllMutashabihatRefs().filter(abs => {
                                    const ref = absoluteToSurahAyah(abs);
                                    return ref.surahId === surah.id;
                                }).forEach(abs => {
                                    const muts = getMutashabihatForAbsolute(abs);
                                    const ref = absoluteToSurahAyah(abs);
                                    muts.forEach(m => {
                                        if (!surahMutsMap[m.phraseId]) {
                                            surahMutsMap[m.phraseId] = { phraseId: m.phraseId, ayahIds: [], entry: m, absRefs: [] };
                                        }
                                        if (!surahMutsMap[m.phraseId].ayahIds.includes(ref.ayahId)) {
                                            surahMutsMap[m.phraseId].ayahIds.push(ref.ayahId);
                                            surahMutsMap[m.phraseId].absRefs.push(abs);
                                        }
                                    });
                                });

                                // Add custom mutashabihat
                                instantCustomMutashabihat.filter(c => c.surahId === surah.id).forEach(c => {
                                    const phraseId = `custom-${c.id}`;
                                    const abs = surahAyahToAbsolute(c.surahId, c.ayahId);
                                    const targetAbs = surahAyahToAbsolute(c.targetSurahId, c.targetAyahId);

                                    if (!surahMutsMap[phraseId]) {
                                        surahMutsMap[phraseId] = {
                                            phraseId,
                                            ayahIds: [c.ayahId],
                                            absRefs: [abs],
                                            entry: {
                                                phraseId,
                                                matches: [abs, targetAbs],
                                                meta: {
                                                    sourceAbs: abs,
                                                    sourceRange: [0, 0],
                                                    matches: [
                                                        { absolute: abs, wordRange: [0, 0] },
                                                        { absolute: targetAbs, wordRange: [0, 0] }
                                                    ]
                                                }
                                            }
                                        };
                                    }
                                });

                                const groups = Object.values(surahMutsMap).sort((a, b) => Math.min(...a.ayahIds) - Math.min(...b.ayahIds));

                                return (
                                    <div key={surah.id} className="mobile-group-item">
                                        <div className="mobile-group-header" onClick={() => setExpandedSurahs(prev => ({ ...prev, [surah.id]: !isOpen }))}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <span style={{
                                                    width: '24px', height: '24px', borderRadius: '6px',
                                                    background: 'var(--accent)', color: 'white',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '0.75rem', fontWeight: 700
                                                }}>{surah.id}</span>
                                                <span style={{ fontWeight: 600 }}>{surah.name}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span className="status-badge" style={{ background: 'var(--accent-light)', color: 'white' }}>{count}</span>
                                                <ChevronDown size={20} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                            </div>
                                        </div>
                                        {isOpen && (
                                            <div className="mobile-subgroup-list">
                                                {groups.map(group => {
                                                    const representativeAbs = group.absRefs.find(a => decisions[`${a}-${group.phraseId}`]?.status !== 'pending') || group.absRefs[0];
                                                    const decisionKey = `${representativeAbs}-${group.phraseId}`;
                                                    const existing = decisions[decisionKey] || { status: 'pending', notes: '' };
                                                    const isConfirmed = !!existing.confirmedAt;

                                                    return (
                                                        <div key={decisionKey} className="mobile-subgroup-item" onClick={() => setActiveMutSlideOver({
                                                            id: decisionKey,
                                                            title: `${surah.name} - Ayah ${group.ayahIds.join(', ')}`,
                                                            surahId: surah.id,
                                                            phraseId: group.phraseId,
                                                            group,
                                                            representativeAbs
                                                        })}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                                                                    {group.ayahIds.length > 1 ? `Ayat ${group.ayahIds.sort((a, b) => a - b).join(', ')}` : `Ayah ${group.ayahIds[0]}`}
                                                                </span>
                                                                <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                                                                    {group.entry.matches.length - 1} matches
                                                                </span>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                {isConfirmed && <Check size={16} style={{ color: '#22c55e' }} />}
                                                                <span className={`status-badge ${existing.status !== 'pending' ? 'active' : ''}`} style={{
                                                                    fontSize: '0.65rem',
                                                                    background: existing.status === 'pending' ? 'var(--border)' : 'var(--accent)',
                                                                    color: 'white'
                                                                }}>
                                                                    {MUT_STATES.find(s => s.value === existing.status)?.label.split(' ')[0]}
                                                                </span>
                                                                <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            );
        }

        if (activeMobilePage === 'appearance') {
            const { theme, setTheme } = useTheme();
            return (
                <div className="content-wrapper">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                        <button onClick={() => setActiveMobilePage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                            <ChevronLeft size={28} />
                        </button>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Appearance</h1>
                    </div>

                    <div className="card modern-card" style={{ background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Palette size={18} /> Theme Mode
                        </h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {[
                                { id: 'light', label: 'Light Mode', icon: Sun },
                                { id: 'dark', label: 'Dark Mode', icon: Moon },
                                { id: 'system', label: 'System Default', icon: Monitor }
                            ].map((mode) => (
                                <button
                                    key={mode.id}
                                    onClick={() => setTheme(mode.id as any)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '1rem',
                                        padding: '1rem',
                                        borderRadius: '12px',
                                        border: theme === mode.id ? '2px solid var(--accent)' : '1px solid var(--border)',
                                        background: theme === mode.id ? 'var(--verse-bg)' : 'var(--background)',
                                        color: theme === mode.id ? 'var(--accent)' : 'var(--foreground)',
                                        cursor: 'pointer',
                                        width: '100%',
                                        transition: 'all 0.2s ease',
                                        fontWeight: theme === mode.id ? 600 : 400
                                    }}
                                >
                                    <mode.icon size={20} />
                                    <span>{mode.label}</span>
                                    {theme === mode.id && <Check size={18} style={{ marginLeft: 'auto' }} />}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="content-wrapper">
                {/* <h1 className="text-2xl font-bold mb-6">Settings</h1> */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <button onClick={() => setActiveMobilePage('appearance')} className="modern-card" style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '1.25rem', background: 'var(--background-secondary)',
                        border: '1px solid var(--border)', borderRadius: '16px',
                        cursor: 'pointer', textAlign: 'left', width: '100%'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ background: 'var(--accent)', color: 'white', padding: '10px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Palette size={24} />
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Appearance</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--foreground-secondary)', marginTop: '2px' }}>Theme, Dark Mode</div>
                            </div>
                        </div>
                        <ChevronRight size={24} style={{ color: 'var(--foreground-secondary)' }} />
                    </button>

                    <button onClick={() => setActiveMobilePage('account')} className="modern-card" style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '1.25rem', background: 'var(--background-secondary)',
                        border: '1px solid var(--border)', borderRadius: '16px',
                        cursor: 'pointer', textAlign: 'left', width: '100%'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ background: 'var(--accent)', color: 'white', padding: '10px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Database size={24} />
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Account & Data</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--foreground-secondary)', marginTop: '2px' }}>Sync, Backup, Import</div>
                            </div>
                        </div>
                        <ChevronRight size={24} style={{ color: 'var(--foreground-secondary)' }} />
                    </button>

                    <button onClick={() => setActiveMobilePage('plan')} className="modern-card" style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '1.25rem', background: 'var(--background-secondary)',
                        border: '1px solid var(--border)', borderRadius: '16px',
                        cursor: 'pointer', textAlign: 'left', width: '100%'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ background: 'var(--accent)', color: 'white', padding: '10px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Clock size={24} />
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Memorization Plan</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--foreground-secondary)', marginTop: '2px' }}>Schedule, Active Part</div>
                            </div>
                        </div>
                        <ChevronRight size={24} style={{ color: 'var(--foreground-secondary)' }} />
                    </button>

                    <button onClick={() => setActiveMobilePage('tracking')} className="modern-card" style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '1.25rem', background: 'var(--background-secondary)',
                        border: '1px solid var(--border)', borderRadius: '16px',
                        cursor: 'pointer', textAlign: 'left', width: '100%'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ background: 'var(--accent)', color: 'white', padding: '10px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Activity size={24} />
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Progress Tracking</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--foreground-secondary)', marginTop: '2px' }}>Status, Knowledge, Similar Verses</div>
                            </div>
                        </div>
                        <ChevronRight size={24} style={{ color: 'var(--foreground-secondary)' }} />
                    </button>
                </div>
            </div>
        );
    };



    const toggleGroup = (groupId: string) => {
        setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
    };

    const getMaturityState = (level: 'reset' | 'medium' | 'strong' | 'mastered') => {
        const now = new Date().toISOString();
        switch (level) {
            case 'reset':
                return {
                    due: now,
                    stability: 0,
                    difficulty: 0,
                    elapsed_days: 0,
                    scheduled_days: 0,
                    reps: 0,
                    lapses: 0,
                    state: 'New',
                    last_review: now
                };
            case 'medium':
                return {
                    due: new Date(Date.now() + 14 * 86400000).toISOString(),
                    stability: 14,
                    difficulty: 5,
                    reps: 3,
                    state: 'Review',
                    scheduled_days: 14,
                    last_review: now
                };
            case 'strong':
                return {
                    due: new Date(Date.now() + 30 * 86400000).toISOString(),
                    stability: 30,
                    difficulty: 5,
                    reps: 5,
                    state: 'Review',
                    scheduled_days: 30,
                    last_review: now
                };
            case 'mastered':
                return {
                    due: new Date(Date.now() + 90 * 86400000).toISOString(),
                    stability: 90,
                    difficulty: 5,
                    reps: 8,
                    state: 'Review',
                    scheduled_days: 90,
                    last_review: now
                };
        }
    };

    const handleNodeMaturityReset = async (nodeId: string, level: 'reset' | 'medium' | 'strong' | 'mastered') => {
        const node = instantNodes.find(n => n.id === nodeId);
        if (!node) return;

        const newState = getMaturityState(level);
        await db.transact(db.tx.memoryNodes[nodeId].update({
            scheduler: { ...node.scheduler, ...newState }
        }));
    };

    const handleGroupMaturityReset = async (type: 'verse_segment' | 'mindmap' | 'part_mindmap' | 'verse', level: 'reset' | 'medium' | 'strong' | 'mastered', surahId?: number, surahName?: string) => {
        let typeLabel = '';
        if (surahName) {
            typeLabel = `all Verses for ${surahName}`;
        } else {
            typeLabel = type === 'verse_segment' || type === 'verse' ? 'all Verses' : (type === 'mindmap' ? 'all Surah Mindmaps' : 'all Part Mindmaps');
        }

        if (!window.confirm(`Are you sure you want to set the maturity of ${typeLabel} to ${level}?`)) return;

        const targetType = type === 'verse' ? 'verse_segment' : type;
        const newState = getMaturityState(level);

        const nodesToUpdate = instantNodes.filter(node => {
            if (node.type !== targetType) return false;
            if (surahId && node.surahId !== surahId) return false;
            return true;
        });

        if (nodesToUpdate.length === 0) {
            alert("No nodes found to update.");
            return;
        }

        const transactions = nodesToUpdate.map(node =>
            db.tx.memoryNodes[node.id].update({
                scheduler: { ...node.scheduler, ...newState }
            })
        );

        await db.transact(transactions);
    };

    useEffect(() => {
        getQuranVerses().then(setVerses).catch(() => setVerses([]));
    }, []);

    const handleCompletionDays = (days: number) => {
        saveSettings({ completionDays: Math.max(5, Math.min(120, days)) });
    };

    const handleActivePart = (part: QuranPart) => {
        saveSettings({ activePart: part });
    };

    const handleResetMutashabihat = async () => {
        const partName = settings?.activePart === 5 ? 'the whole Quran' : `Part ${settings?.activePart}`;
        const msg = `Are you sure you want to reset ALL mutashabihat decisions for ${partName}? This cannot be undone.`;
        if (!window.confirm(msg)) return;

        const absoluteAyat = getAllMutashabihatRefs(instantCustomMutashabihat).filter(abs => {
            const ref = absoluteToSurahAyah(abs);
            const surah = getSurah(ref.surahId);
            return surah && (settings?.activePart === 5 || surah.part === settings?.activePart);
        });

        const ayahSet = new Set(absoluteAyat.map(String));
        const decisionsToDelete = instantDecisions.filter(d => {
            const abs = d.phraseId.split('-')[0];
            return ayahSet.has(abs);
        });

        if (decisionsToDelete.length > 0) {
            await db.transact(decisionsToDelete.map(d => db.tx.mutashabihatDecisions[d.id].delete()));
        }
    };

    const [surahToSkipId, setSurahToSkipId] = useState<number | ''>('');

    const handleAddSkippedSurah = () => {
        if (!surahToSkipId) return;
        const currentSkipped = settings?.skippedSurahs || [];
        if (!currentSkipped.includes(Number(surahToSkipId))) {
            saveSettings({ skippedSurahs: [...currentSkipped, Number(surahToSkipId)] });
        }
        setSurahToSkipId('');
    };

    const handleRemoveSkippedSurah = (id: number) => {
        const currentSkipped = settings?.skippedSurahs || [];
        saveSettings({ skippedSurahs: currentSkipped.filter(s => s !== id) });
    };

    const handleDecisionUpdate = async (_absoluteAyah: number, update: MutashabihatDecision, phraseId: string) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _ignored, ...updateWithoutId } = update;
        await updateInstantDecision(phraseId, updateWithoutId);
    };

    const handleAddCustomMutashabih = async (mut: any) => {
        const [s1, a1] = mut.verseId.split(':').map(Number);
        const [s2, a2] = mut.targetVerseId.split(':').map(Number);

        const customItem = {
            id: mut.id || crypto.randomUUID(),
            verseId: mut.verseId,
            targetVerseId: mut.targetVerseId,
            surahId: s1,
            ayahId: a1,
            targetSurahId: s2,
            targetAyahId: a2,
            notes: mut.notes,
            status: mut.status,
            createdAt: new Date().toISOString()
        };

        await updateInstantCustom(customItem);
    };

    const handleExport = async () => {
        // Use hook data for export
        const exportData = {
            version: 1,
            timestamp: new Date().toISOString(),
            settings,
            memoryNodes: instantNodes,
            decisions: instantDecisions,
            exportedAt: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `quran-app-instantdb-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                JSON.parse(event.target?.result as string);
                if (confirm('Importing will overwrite current progress. Continue?')) {
                    // Implementation for InstantDB import would involve bulk transactions
                    // For now, let's warn that it's not fully implemented for InstantDB
                    alert("Import for InstantDB is not yet fully implemented. Please use cloud sync.");
                }
            } catch (err) {
                alert('Invalid backup file');
            }
        };
        reader.readAsText(file);
    };

    const handleReset = async () => {
        if (confirm('WARNING: This will delete ALL your data in the cloud. This action cannot be undone.\n\nAre you sure you want to reset all data?')) {
            if (confirm('Double check: Are you absolutely sure? All data will be lost forever.')) {
                // Clear all entities for this user
                const txs = [
                    ...instantNodes.map(n => db.tx.memoryNodes[n.id].delete()),
                    ...instantDecisions.map(d => db.tx.mutashabihatDecisions[d.id].delete())
                    // Add other entities here
                ];
                if (txs.length > 0) await db.transact(txs);
                window.location.reload();
            }
        }
    };

    const mutashabihatBySurah = useMemo(() => {
        const map: Record<number, number> = {};

        // Static dataset
        getAllMutashabihatRefs(instantCustomMutashabihat).forEach(abs => {
            const ref = absoluteToSurahAyah(abs);
            const surah = getSurah(ref.surahId);
            if (!surah || (settings.activePart !== 5 && surah.part !== settings.activePart)) return;

            const entries = getMutashabihatForAbsolute(abs, instantCustomMutashabihat);
            if (!map[ref.surahId]) map[ref.surahId] = 0;
            map[ref.surahId] += entries.length;
        });

        return map;
    }, [settings.activePart, instantCustomMutashabihat]);

    const mutashabihatSurahs = useMemo(() => {
        return getSurahsByPart(settings.activePart)
            .map(s => ({ surah: s, count: mutashabihatBySurah[s.id] || 0 }))
            .filter(entry => entry.count > 0);
    }, [settings.activePart, mutashabihatBySurah]);

    useEffect(() => {
        if (mutashabihatSurahs.length > 0 && !selectedMutSurah) {
            setSelectedMutSurah(mutashabihatSurahs[0].surah.id);
        } else if (mutashabihatSurahs.every(s => s.surah.id !== selectedMutSurah)) {
            setSelectedMutSurah(mutashabihatSurahs[0]?.surah.id ?? null);
        }
    }, [mutashabihatSurahs, selectedMutSurah]);

    return (
        <>
            {isMobile ? renderMobileView() : (
                <div className="content-wrapper">
                    <h1 className="hidden md:block text-2xl font-bold mb-6">Settings</h1>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <div className="settings-grid">

                            <div className="card modern-card" style={{
                                background: 'var(--background-secondary)',
                                border: '1px solid var(--border)',
                                borderRadius: '16px'
                            }}>
                                <div className="section-title"
                                    onClick={() => toggleSection('cloudSync')}
                                    style={{
                                        color: 'var(--accent)',
                                        fontWeight: 700,
                                        marginBottom: sectionsExpanded.cloudSync ? '1rem' : '0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '0.75rem',
                                        fontSize: 'clamp(1rem, 5vw, 1.1rem)',
                                        cursor: 'pointer'
                                    }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{ background: 'var(--accent)', color: 'white', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Database size={18} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span>User Account</span>
                                        </div>
                                    </div>
                                    <ChevronDown className="md:hidden" size={20} style={{ transform: sectionsExpanded.cloudSync ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                </div>

                                {sectionsExpanded.cloudSync && (
                                    <>
                                        <p style={{ marginBottom: '1rem', color: 'var(--foreground-secondary)', fontSize: '0.9rem' }}>
                                            {user
                                                ? `Signed in as ${user.email}. Your data is synced automatically.`
                                                : "Sign in to sync your progress across devices."}
                                        </p>

                                        <div style={{ opacity: isOnline ? 1 : 0.45, pointerEvents: isOnline ? 'auto' : 'none' }}>
                                            {!isOnline && (
                                                <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)' }}>
                                                    <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Offline</div>
                                                    <div style={{ color: 'var(--foreground-secondary)', fontSize: '0.85rem' }}>
                                                        Cloud sync and authentication are paused. Keep using the app; changes will sync when online.
                                                    </div>
                                                </div>
                                            )}

                                            {user ? (
                                                <>


                                                    <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
                                                        <button
                                                            className="btn btn-secondary"
                                                            onClick={async () => {
                                                                // InstantDB handles sync automatically
                                                                if (!window.confirm("Are you sure you want to sign out? You will be redirected to the landing page and will need to sign in again to access the app.")) return;

                                                                // Sign out from InstantDB (it clears local storage token)
                                                                db.auth.signOut();
                                                                router.push('/');
                                                            }}
                                                            style={{ width: '100%', padding: '0.85rem', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 600, fontSize: '1rem', cursor: 'pointer' }}
                                                        >
                                                            Sign Out
                                                        </button>
                                                    </div>
                                                </>
                                            ) : (
                                                <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                    {authStep === 'email' ? (
                                                        <input
                                                            type="email"
                                                            placeholder="Enter your email"
                                                            value={email}
                                                            onChange={(e) => setEmail(e.target.value)}
                                                            required
                                                            style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '1rem' }}
                                                        />
                                                    ) : (
                                                        <input
                                                            type="text"
                                                            placeholder="Enter verification code"
                                                            value={code}
                                                            onChange={(e) => setCode(e.target.value)}
                                                            required
                                                            style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '1rem' }}
                                                        />
                                                    )}
                                                    {authError && <p style={{ color: '#ef4444', fontSize: '0.85rem' }}>{authError}</p>}
                                                    <button
                                                        type="submit"
                                                        className="btn btn-primary"
                                                        disabled={isAuthProcessing}
                                                        style={{ width: '100%', padding: '0.85rem', fontSize: '1rem' }}
                                                    >
                                                        {isAuthProcessing ? 'Processing...' : (authStep === 'email' ? 'Send Code' : 'Verify Code')}
                                                    </button>
                                                </form>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                            <AppearanceCard />
                            <div className="card modern-card" style={{
                                background: 'var(--background-secondary)',
                                border: '1px solid var(--border)',
                                borderRadius: '16px'
                            }}>
                                <div className="section-title"
                                    onClick={() => toggleSection('backupRestore')}
                                    style={{
                                        color: 'var(--accent)',
                                        fontWeight: 700,
                                        marginBottom: sectionsExpanded.backupRestore ? '1rem' : '0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '0.75rem',
                                        fontSize: 'clamp(1rem, 5vw, 1.1rem)',
                                        cursor: 'pointer'
                                    }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{ background: 'var(--accent)', color: 'white', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Download size={18} />
                                        </div>
                                        <span>Backup, Import & Reset</span>
                                    </div>
                                    <ChevronDown className="md:hidden" size={20} style={{ transform: sectionsExpanded.backupRestore ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                </div>
                                {sectionsExpanded.backupRestore && (
                                    <>
                                        <p style={{ marginBottom: '1.25rem', color: 'var(--foreground-secondary)', fontSize: '0.9rem', lineHeight: '1.4' }}>
                                            Manage your data: Export backup, import from file, or reset all data.
                                        </p>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                            <button
                                                className="btn btn-secondary"
                                                onClick={handleExport}
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '0.5rem',
                                                    padding: '1rem',
                                                    fontSize: '0.9rem',
                                                    height: 'auto',
                                                    background: 'var(--background)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '12px'
                                                }}
                                            >
                                                <Download size={20} style={{ color: 'var(--accent)' }} />
                                                <span>Export Data</span>
                                            </button>
                                            <label
                                                className="btn btn-secondary"
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '0.5rem',
                                                    padding: '1rem',
                                                    cursor: 'pointer',
                                                    fontSize: '0.9rem',
                                                    height: 'auto',
                                                    background: 'var(--background)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '12px'
                                                }}
                                            >
                                                <Upload size={20} style={{ color: 'var(--accent)' }} />
                                                <span>Import Data</span>
                                                <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
                                            </label>
                                            <button
                                                className="btn btn-secondary"
                                                onClick={handleReset}
                                                style={{
                                                    gridColumn: 'span 2',
                                                    display: 'flex',
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '0.5rem',
                                                    padding: '1rem',
                                                    fontSize: '0.9rem',
                                                    height: 'auto',
                                                    background: 'var(--background)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '12px',
                                                    color: '#ef4444'
                                                }}
                                            >
                                                <Trash2 size={20} />
                                                <span>Reset All Data</span>
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="card modern-card" style={{
                                background: 'var(--background-secondary)',
                                border: '1px solid var(--border)',
                                borderRadius: '16px'
                            }}>
                                <div className="section-title"
                                    onClick={() => toggleSection('schedule')}
                                    style={{
                                        color: 'var(--accent)',
                                        fontWeight: 700,
                                        marginBottom: sectionsExpanded.schedule ? '1rem' : '0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '0.75rem',
                                        fontSize: 'clamp(1rem, 5vw, 1.1rem)',
                                        cursor: 'pointer'
                                    }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{ background: 'var(--accent)', color: 'white', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Clock size={18} />
                                        </div>
                                        <span>Completion Schedule</span>
                                    </div>
                                    <ChevronDown className="md:hidden" size={20} style={{ transform: sectionsExpanded.schedule ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                </div>
                                {sectionsExpanded.schedule && (
                                    <>
                                        <DailyCompletionSlider
                                            days={settings.completionDays || 30}
                                            onChange={handleCompletionDays}
                                            activePart={settings.activePart}
                                        />
                                    </>
                                )}
                            </div>

                            <div className="card modern-card" style={{
                                background: 'var(--background-secondary)',
                                border: '1px solid var(--border)',
                                borderRadius: '16px'
                            }}>
                                <div className="section-title"
                                    onClick={() => toggleSection('activePart')}
                                    style={{
                                        color: 'var(--accent)',
                                        fontWeight: 700,
                                        marginBottom: sectionsExpanded.activePart ? '1rem' : '0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '0.75rem',
                                        fontSize: 'clamp(1rem, 5vw, 1.1rem)',
                                        cursor: 'pointer'
                                    }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{ background: 'var(--accent)', color: 'white', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <PauseCircle size={18} />
                                        </div>
                                        <span>Active Part</span>
                                    </div>
                                    <ChevronDown className="md:hidden" size={20} style={{ transform: sectionsExpanded.activePart ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                </div>
                                {sectionsExpanded.activePart && (
                                    <div className="part-selector" style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                                        gap: '0.75rem'
                                    }}>
                                        {[
                                            { id: 1, name: "Sab'ut-Tiwal" },
                                            { id: 2, name: "Al-Mi'un" },
                                            { id: 3, name: "Al-Mathani" },
                                            { id: 4, name: "Al-Mufassal" },
                                            { id: 5, name: "All Quran" }
                                        ].map(p => (
                                            <button
                                                key={p.id}
                                                className={`part-option ${settings.activePart === p.id ? 'active' : ''}`}
                                                onClick={() => handleActivePart(p.id as QuranPart)}
                                                style={{
                                                    padding: '1.25rem 0.75rem',
                                                    borderRadius: '16px',
                                                    border: settings.activePart === p.id ? '2px solid var(--accent)' : '2px solid var(--border)',
                                                    background: settings.activePart === p.id ? 'var(--verse-bg)' : 'var(--background-secondary)',
                                                    transition: 'all 0.2s',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    textAlign: 'center',
                                                    gap: '0.25rem',
                                                    gridColumn: p.id === 5 ? '1 / -1' : 'auto'
                                                }}
                                            >
                                                <div className="part-number" style={{ fontSize: '1.4rem', fontWeight: 800, color: settings.activePart === p.id ? 'var(--accent)' : 'var(--foreground)' }}>
                                                    {p.id === 5 ? '∞' : p.id}
                                                </div>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: settings.activePart === p.id ? 'var(--accent)' : 'var(--foreground-secondary)' }}>{p.name}</div>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--foreground-secondary)', opacity: 0.8 }}>{getSurahsByPart(p.id as QuranPart).length} surahs</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="card modern-card" style={{
                                padding: sectionsExpanded.surahStatus ? 'clamp(1rem, 4vw, 1.5rem)' : '1rem',
                                background: 'var(--background-secondary)',
                                border: '1px solid var(--border)',
                                borderRadius: '16px'
                            }}>
                                <div className="section-title"
                                    onClick={() => toggleSection('surahStatus')}
                                    style={{
                                        color: 'var(--accent)',
                                        fontWeight: 700,
                                        marginBottom: sectionsExpanded.surahStatus ? '0.75rem' : '0',
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '0.75rem',
                                        cursor: 'pointer'
                                    }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{ background: 'var(--accent)', color: 'white', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Check size={18} />
                                        </div>
                                        <span style={{ fontSize: 'clamp(1rem, 5vw, 1.1rem)' }}>Skipped Surah</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <ChevronDown className="md:hidden" size={20} style={{ transform: sectionsExpanded.surahStatus ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                    </div>
                                </div>
                                {sectionsExpanded.surahStatus && (
                                    <>
                                        <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                                            Manage surahs you want to skip from the daily review queue.
                                        </p>

                                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                            <select
                                                value={surahToSkipId}
                                                onChange={(e) => setSurahToSkipId(e.target.value ? Number(e.target.value) : '')}
                                                style={{
                                                    flex: 1,
                                                    padding: '0.75rem',
                                                    borderRadius: '12px',
                                                    border: '1px solid var(--border)',
                                                    background: 'var(--background)',
                                                    color: 'var(--foreground)',
                                                    fontSize: '0.9rem',
                                                    outline: 'none'
                                                }}
                                            >
                                                <option value="">Select a surah to skip...</option>
                                                {SURAHS.map(s => (
                                                    <option key={s.id} value={s.id}>
                                                        {s.id}. {s.name} ({s.arabicName})
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={handleAddSkippedSurah}
                                                disabled={!surahToSkipId}
                                                style={{
                                                    padding: '0 1.25rem',
                                                    borderRadius: '12px',
                                                    background: surahToSkipId ? 'var(--accent)' : 'var(--border)',
                                                    color: 'white',
                                                    fontWeight: 600,
                                                    border: 'none',
                                                    cursor: surahToSkipId ? 'pointer' : 'not-allowed',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                Add
                                            </button>
                                        </div>

                                        <div className="skipped-surahs-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            {(!settings.skippedSurahs || settings.skippedSurahs.length === 0) && (
                                                <p style={{ color: 'var(--foreground-secondary)', fontSize: '0.9rem', fontStyle: 'italic', width: '100%' }}>No surahs skipped.</p>
                                            )}
                                            {settings.skippedSurahs?.map(id => {
                                                const s = SURAHS.find(surah => surah.id === id);
                                                if (!s) return null;
                                                return (
                                                    <div key={id} style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.5rem',
                                                        padding: '0.5rem 0.75rem',
                                                        background: 'var(--background)',
                                                        border: '1px solid var(--border)',
                                                        borderRadius: '20px',
                                                        fontSize: '0.85rem'
                                                    }}>
                                                        <span>{s.id}. {s.name}</span>
                                                        <button
                                                            onClick={() => handleRemoveSkippedSurah(id)}
                                                            style={{
                                                                background: 'none',
                                                                border: 'none',
                                                                padding: 0,
                                                                color: 'var(--foreground-secondary)',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center'
                                                            }}
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div style={{ marginTop: '1.5rem' }}>
                            <div className="card modern-card" style={{
                                background: 'var(--background-secondary)',
                                border: '1px solid var(--border)',
                                borderRadius: '16px'
                            }}>
                                <div className="section-title"
                                    onClick={() => {
                                        if (window.innerWidth < 768) {
                                            setShowDebugNodes(!showDebugNodes);
                                        }
                                    }}
                                    style={{
                                        color: 'var(--accent)',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        marginBottom: showDebugNodes ? '1.5rem' : '0',
                                        fontSize: 'clamp(1rem, 5vw, 1.1rem)'
                                    }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{ background: 'var(--accent)', color: 'white', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Activity size={18} />
                                        </div>
                                        <span>Knowledge Tracking</span>
                                    </div>
                                    <ChevronDown className="md:hidden" size={20} style={{ transform: showDebugNodes ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                </div>

                                {showDebugNodes && (
                                    <div style={{ marginTop: '1.5rem' }}>
                                        <p style={{ color: 'var(--foreground-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                                            This section shows your active memory nodes and their review schedules.
                                        </p>

                                        {isMobile ? (
                                            <div className="knowledge-groups-mobile">
                                                {/* MINDMAPS MOBILE GROUP */}
                                                <div className="mobile-group-item">
                                                    <div className="mobile-group-header" onClick={() => toggleGroup('mindmaps')}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            <MapIcon size={20} />
                                                            <span style={{ fontWeight: 600 }}>Mindmaps</span>
                                                        </div>
                                                        <ChevronDown size={20} style={{ transform: expandedGroups['mindmaps'] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                                    </div>
                                                    {expandedGroups['mindmaps'] && (
                                                        <div className="mobile-subgroup-list">
                                                            <div className="mobile-subgroup-item" onClick={() => setActiveSlideOverGroup({
                                                                id: 'mindmaps-part',
                                                                title: 'Part Mindmaps',
                                                                type: 'part_mindmap' as any,
                                                                nodes: memoryNodes.filter(n => (n as any).type === 'part_mindmap')
                                                            })}>
                                                                <span>Part Mindmaps</span>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <span className="status-badge">{memoryNodes.filter(n => (n as any).type === 'part_mindmap').length}</span>
                                                                    <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
                                                                </div>
                                                            </div>
                                                            <div className="mobile-subgroup-item" onClick={() => setActiveSlideOverGroup({
                                                                id: 'mindmaps-surah',
                                                                title: 'Surah Mindmaps',
                                                                type: 'mindmap' as any,
                                                                nodes: memoryNodes.filter(n => (n as any).type === 'mindmap')
                                                            })}>
                                                                <span>Surah Mindmaps</span>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <span className="status-badge">{memoryNodes.filter(n => (n as any).type === 'mindmap').length}</span>
                                                                    <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* VERSES MOBILE GROUP */}
                                                <div className="mobile-group-item">
                                                    <div className="mobile-group-header" onClick={() => toggleGroup('verses')}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            <Book size={20} />
                                                            <span style={{ fontWeight: 600 }}>Verses</span>
                                                        </div>
                                                        <ChevronDown size={20} style={{ transform: expandedGroups['verses'] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                                    </div>
                                                    {expandedGroups['verses'] && (
                                                        <div className="mobile-subgroup-list">
                                                            {/* Issue #10: Filter by active part */}
                                                            {(() => {
                                                                const filteredSurahs = Array.from(new Set(memoryNodes.filter(n => n.type === 'verse_segment').map(n => n.surahId)))
                                                                    .filter(surahId => {
                                                                        const surah = getSurah(surahId!);
                                                                        if (settings.activePart !== 5 && surah?.part !== settings.activePart) return false;
                                                                        if (settings.skippedSurahs?.includes(surahId!)) return false;
                                                                        return true;
                                                                    })
                                                                    .sort((a, b) => (a || 0) - (b || 0));

                                                                if (filteredSurahs.length === 0) {
                                                                    return (
                                                                        <div className="empty-state" style={{ padding: '1rem' }}>No verse nodes in Part {settings.activePart}</div>
                                                                    );
                                                                }

                                                                return filteredSurahs.map(surahId => {
                                                                    const surah = getSurah(surahId!);
                                                                    const surahNodes = memoryNodes.filter(n => n.type === 'verse_segment' && n.surahId === surahId);
                                                                    return (
                                                                        <div key={surahId} className="mobile-subgroup-item" onClick={() => setActiveSlideOverGroup({
                                                                            id: `verse-surah-${surahId}`,
                                                                            title: `${surah?.id}. ${surah?.name}`,
                                                                            type: 'verse_segment',
                                                                            nodes: surahNodes,
                                                                            surahId
                                                                        })}>
                                                                            <span>{surah?.name}</span>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                <span className="status-badge">{surahNodes.length}</span>
                                                                                <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                });
                                                            })()}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '0 -0.5rem', padding: '0 0.5rem' }}>
                                                <table className="debug-table" style={{ minWidth: '700px', width: '100%' }}>
                                                    <thead>
                                                        <tr>
                                                            <th>Target / Range</th>
                                                            <th>Maturity</th>
                                                            <th>Interval</th>
                                                            <th>Difficulty</th>
                                                            <th>Reps</th>
                                                            <th>Next Review</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {/* MINDMAPS GROUP */}
                                                        <tr className="group-header" onClick={() => toggleGroup('mindmaps')}>
                                                            <td colSpan={6} style={{ fontWeight: 700 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                        <ChevronDown size={16} style={{ transform: expandedGroups['mindmaps'] ? 'rotate(180deg)' : 'none' }} />
                                                                        <MapIcon size={16} /> Mindmaps
                                                                    </div>
                                                                    <select
                                                                        className="maturity-select"
                                                                        style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                                                        value=""
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        onChange={async (e) => {
                                                                            const val = e.target.value as any;
                                                                            if (!val) return;
                                                                            await handleGroupMaturityReset('mindmap', val);
                                                                            await handleGroupMaturityReset('part_mindmap', val);
                                                                        }}
                                                                    >
                                                                        <option value="">Set Group...</option>
                                                                        <option value="reset">Reset</option>
                                                                        <option value="medium">Medium</option>
                                                                        <option value="strong">Strong</option>
                                                                        <option value="mastered">Mastered</option>
                                                                    </select>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                        {expandedGroups['mindmaps'] && (
                                                            <>
                                                                {/* Part Mindmaps Subgroup */}
                                                                <tr className="subgroup-header" onClick={() => toggleGroup('mindmaps-part')}>
                                                                    <td colSpan={6} style={{ fontWeight: 600 }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                <ChevronDown size={14} style={{ transform: expandedGroups['mindmaps-part'] ? 'rotate(180deg)' : 'none' }} />
                                                                                Part Mindmaps
                                                                            </div>
                                                                            <select
                                                                                className="maturity-select"
                                                                                style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                                                                value=""
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                onChange={async (e) => {
                                                                                    const val = e.target.value as any;
                                                                                    if (!val) return;
                                                                                    await handleGroupMaturityReset('part_mindmap', val);
                                                                                }}
                                                                            >
                                                                                <option value="">Set Subgroup...</option>
                                                                                <option value="reset">Reset</option>
                                                                                <option value="medium">Medium</option>
                                                                                <option value="strong">Strong</option>
                                                                                <option value="mastered">Mastered</option>
                                                                            </select>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                {expandedGroups['mindmaps-part'] && (
                                                                    memoryNodes.filter(n => (n as any).type === 'part_mindmap').length > 0 ? (
                                                                        memoryNodes
                                                                            .filter(n => (n as any).type === 'part_mindmap')
                                                                            .sort((a, b) => (a.partId || 0) - (b.partId || 0))
                                                                            .map(node => (
                                                                                <tr key={node.id} className="node-row">
                                                                                    <td>Part {node.partId}</td>
                                                                                    <td>
                                                                                        <select
                                                                                            value=""
                                                                                            onChange={async (e) => {
                                                                                                if (!e.target.value) return;
                                                                                                await handleNodeMaturityReset(node.id, e.target.value as any);
                                                                                            }}
                                                                                            className="maturity-select"
                                                                                        >
                                                                                            <option value="">Set To...</option>
                                                                                            <option value="reset">Reset</option>
                                                                                            <option value="medium">Medium</option>
                                                                                            <option value="strong">Strong</option>
                                                                                            <option value="mastered">Mastered</option>
                                                                                        </select>
                                                                                    </td>
                                                                                    <td>{getNodeStability(node)}d</td>
                                                                                    <td>{getNodeDifficulty(node)}</td>
                                                                                    <td>{getNodeReps(node)}</td>
                                                                                    <td className={(getNodeDueDate(node) || '') <= new Date().toISOString().split('T')[0] ? 'status-overdue' : ''}>{getNodeDueDate(node)}</td>
                                                                                </tr>
                                                                            ))
                                                                    ) : (
                                                                        <tr className="node-row"><td colSpan={6} style={{ fontStyle: 'italic', opacity: 0.5 }}>No part mindmaps</td></tr>
                                                                    )
                                                                )}

                                                                {/* Surah Mindmaps Subgroup */}
                                                                <tr className="subgroup-header" onClick={() => toggleGroup('mindmaps-surah')}>
                                                                    <td colSpan={6} style={{ fontWeight: 600 }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                <ChevronDown size={14} style={{ transform: expandedGroups['mindmaps-surah'] ? 'rotate(180deg)' : 'none' }} />
                                                                                Surah Mindmaps
                                                                            </div>
                                                                            <select
                                                                                className="maturity-select"
                                                                                style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                                                                value=""
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                onChange={async (e) => {
                                                                                    const val = e.target.value as any;
                                                                                    if (!val) return;
                                                                                    await handleGroupMaturityReset('mindmap', val);
                                                                                }}
                                                                            >
                                                                                <option value="">Set Subgroup...</option>
                                                                                <option value="reset">Reset</option>
                                                                                <option value="medium">Medium</option>
                                                                                <option value="strong">Strong</option>
                                                                                <option value="mastered">Mastered</option>
                                                                            </select>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                {expandedGroups['mindmaps-surah'] && (
                                                                    memoryNodes.filter(n => (n as any).type === 'mindmap').length > 0 ? (
                                                                        memoryNodes
                                                                            .filter(n => (n as any).type === 'mindmap')
                                                                            .sort((a, b) => (a.surahId || 0) - (b.surahId || 0))
                                                                            .map(node => (
                                                                                <tr key={node.id} className="node-row">
                                                                                    <td>{node.surahId}. {getSurah(node.surahId!)?.name}</td>
                                                                                    <td>
                                                                                        <select
                                                                                            value=""
                                                                                            onChange={async (e) => {
                                                                                                if (!e.target.value) return;
                                                                                                await handleNodeMaturityReset(node.id, e.target.value as any);
                                                                                            }}
                                                                                            className="maturity-select"
                                                                                        >
                                                                                            <option value="">Set To...</option>
                                                                                            <option value="reset">Reset</option>
                                                                                            <option value="medium">Medium</option>
                                                                                            <option value="strong">Strong</option>
                                                                                            <option value="mastered">Mastered</option>
                                                                                        </select>
                                                                                    </td>
                                                                                    <td>{getNodeStability(node)}d</td>
                                                                                    <td>{getNodeDifficulty(node)}</td>
                                                                                    <td>{getNodeReps(node)}</td>
                                                                                    <td className={(getNodeDueDate(node) || '') <= new Date().toISOString().split('T')[0] ? 'status-overdue' : ''}>{getNodeDueDate(node)}</td>
                                                                                </tr>
                                                                            ))
                                                                    ) : (
                                                                        <tr className="node-row"><td colSpan={6} style={{ fontStyle: 'italic', opacity: 0.5 }}>No surah mindmaps</td></tr>
                                                                    )
                                                                )}
                                                            </>
                                                        )}

                                                        {/* VERSES GROUP */}
                                                        <tr className="group-header" onClick={() => toggleGroup('verses')}>
                                                            <td colSpan={6} style={{ fontWeight: 700 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                        <ChevronDown size={16} style={{ transform: expandedGroups['verses'] ? 'rotate(180deg)' : 'none' }} />
                                                                        <Book size={16} /> Verses
                                                                    </div>
                                                                    <select
                                                                        className="maturity-select"
                                                                        style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                                                        value=""
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        onChange={async (e) => {
                                                                            const val = e.target.value as any;
                                                                            if (!val) return;
                                                                            await handleGroupMaturityReset('verse', val);
                                                                        }}
                                                                    >
                                                                        <option value="">Set Group...</option>
                                                                        <option value="reset">Reset</option>
                                                                        <option value="medium">Medium</option>
                                                                        <option value="strong">Strong</option>
                                                                        <option value="mastered">Mastered</option>
                                                                    </select>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                        {expandedGroups['verses'] && (
                                                            <>
                                                                {/* Issue #10: Filter by active part, show only learned surahs */}
                                                                {(() => {
                                                                    const filteredSurahs = Array.from(new Set(memoryNodes.filter(n => n.type === 'verse_segment').map(n => n.surahId)))
                                                                        .filter(surahId => {
                                                                            const surah = getSurah(surahId!);
                                                                            // Filter by active part (show all if part 5)
                                                                            if (settings.activePart !== 5 && surah?.part !== settings.activePart) return false;
                                                                            // Only show non-skipped surahs
                                                                            if (settings.skippedSurahs?.includes(surahId!)) return false;
                                                                            return true;
                                                                        })
                                                                        .sort((a, b) => (a || 0) - (b || 0));

                                                                    if (filteredSurahs.length === 0) {
                                                                        return (
                                                                            <tr className="node-row"><td colSpan={6} style={{ fontStyle: 'italic', opacity: 0.5, paddingLeft: '2rem' }}>No verse nodes in Part {settings.activePart}</td></tr>
                                                                        );
                                                                    }

                                                                    return filteredSurahs.map(surahId => {
                                                                        const surah = getSurah(surahId!);
                                                                        const surahKey = `verse-surah-${surahId}`;
                                                                        const surahNodes = memoryNodes
                                                                            .filter(n => n.type === 'verse_segment' && n.surahId === surahId)
                                                                            .sort((a, b) => (a.startVerse || 0) - (b.startVerse || 0));

                                                                        return (
                                                                            <React.Fragment key={surahId}>
                                                                                <tr className="subgroup-header" onClick={() => toggleGroup(surahKey)}>
                                                                                    <td colSpan={6} style={{ fontWeight: 600 }}>
                                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                                <ChevronDown size={14} style={{ transform: expandedGroups[surahKey] ? 'rotate(180deg)' : 'none' }} />
                                                                                                {surah?.id}. {surah?.name} ({surahNodes.length})
                                                                                            </div>
                                                                                            {/* Issue #3: Bulk maturity controls per surah */}
                                                                                            <select
                                                                                                className="maturity-select"
                                                                                                style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                                                                                value=""
                                                                                                onClick={(e) => e.stopPropagation()}
                                                                                                onChange={async (e) => {
                                                                                                    const val = e.target.value as any;
                                                                                                    if (!val) return;
                                                                                                    await handleGroupMaturityReset('verse', val, surahId!, surah?.name);
                                                                                                    e.target.value = '';
                                                                                                }}
                                                                                            >
                                                                                                <option value="">Set Subgroup...</option>
                                                                                                <option value="reset">Reset</option>
                                                                                                <option value="medium">Medium</option>
                                                                                                <option value="strong">Strong</option>
                                                                                                <option value="mastered">Mastered</option>
                                                                                            </select>
                                                                                        </div>
                                                                                    </td>
                                                                                </tr>
                                                                                {expandedGroups[surahKey] && surahNodes.map(node => (
                                                                                    <tr key={node.id} className="node-row">
                                                                                        <td>Ayat {node.startVerse}-{node.endVerse}</td>
                                                                                        <td>
                                                                                            <select
                                                                                                value=""
                                                                                                onChange={async (e) => {
                                                                                                    await handleNodeMaturityReset(node.id, e.target.value as any);
                                                                                                }}
                                                                                                className="maturity-select"
                                                                                            >
                                                                                                <option value="">Set To...</option>
                                                                                                <option value="reset">Reset</option>
                                                                                                <option value="medium">Medium</option>
                                                                                                <option value="strong">Strong</option>
                                                                                                <option value="mastered">Mastered</option>
                                                                                            </select>
                                                                                        </td>
                                                                                        <td>{getNodeStability(node)}d</td>
                                                                                        <td>{getNodeDifficulty(node)}</td>
                                                                                        <td>{getNodeReps(node)}</td>
                                                                                        <td className={(getNodeDueDate(node) || '') <= new Date().toISOString().split('T')[0] ? 'status-overdue' : ''}>{getNodeDueDate(node)}</td>
                                                                                    </tr>
                                                                                ))}
                                                                            </React.Fragment>
                                                                        );
                                                                    });
                                                                })()}
                                                            </>
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="card modern-card" style={{
                            marginTop: '1.5rem',
                            background: 'var(--background-secondary)',
                            border: '1px solid var(--border)',
                            borderRadius: '16px',
                            padding: sectionsExpanded.mutashabihat ? 'clamp(1rem, 4vw, 1.5rem)' : '1rem'
                        }}>
                            <div className="section-title mut-header"
                                onClick={() => toggleSection('mutashabihat')}
                                style={{
                                    color: 'var(--accent)',
                                    fontWeight: 700,
                                    borderBottom: sectionsExpanded.mutashabihat ? '1px' : 'none',
                                    paddingBottom: sectionsExpanded.mutashabihat ? '1rem' : '0',
                                    marginBottom: sectionsExpanded.mutashabihat ? '1.25rem' : '0',
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    cursor: 'pointer'
                                }}>
                                <div style={{ background: 'var(--accent)', color: 'white', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Check size={18} />
                                </div>
                                <div style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    flex: 1,
                                    gap: '0.75rem'
                                }}>
                                    <span style={{ fontSize: 'clamp(1rem, 4vw, 1.1rem)' }}>Similar Verse Coverage</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        {sectionsExpanded.mutashabihat && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                <button
                                                    className="bulk-btn learned"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setTargetSurahId(undefined);
                                                        setIsAddModalOpen(true);
                                                    }}
                                                    title="Add Custom Mutashabih"
                                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}
                                                >
                                                    <Plus size={14} /> <span className="hide-mobile">Add Custom</span><span className="show-mobile">Add</span>
                                                </button>
                                                <button
                                                    className="bulk-btn reset-mut"
                                                    onClick={(e) => { e.stopPropagation(); handleResetMutashabihat(); }}
                                                    title="Reset all mutashabihat decisions for this part"
                                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}
                                                >
                                                    <RotateCcw size={14} /> <span className="hide-mobile">Reset Decisions</span><span className="show-mobile">Reset</span>
                                                </button>
                                            </div>
                                        )}
                                        <ChevronDown className="md:hidden" size={20} style={{ transform: sectionsExpanded.mutashabihat ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                    </div>
                                </div>
                            </div>
                            {sectionsExpanded.mutashabihat && (
                                <div style={{ marginTop: '1.5rem' }}>
                                    <p className="mut-subheader" style={{ color: 'var(--foreground-secondary)', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
                                        Surahs with similar verses in this part. Tap to expand and annotate similar ayat.
                                    </p>

                                    {isMobile ? (
                                        <div className="knowledge-groups-mobile">
                                            {mutashabihatSurahs.map(({ surah, count }) => {
                                                const isOpen = expandedSurahs[surah.id] ?? false;

                                                // Calculate surah group data
                                                const surahMutsMap: Record<string, {
                                                    phraseId: string,
                                                    ayahIds: number[],
                                                    entry: any,
                                                    absRefs: number[]
                                                }> = {};

                                                getAllMutashabihatRefs(instantCustomMutashabihat).filter(abs => {
                                                    const ref = absoluteToSurahAyah(abs);
                                                    return ref.surahId === surah.id;
                                                }).forEach(abs => {
                                                    const muts = getMutashabihatForAbsolute(abs, instantCustomMutashabihat);
                                                    const ref = absoluteToSurahAyah(abs);
                                                    muts.forEach(m => {
                                                        if (!surahMutsMap[m.phraseId]) {
                                                            surahMutsMap[m.phraseId] = { phraseId: m.phraseId, ayahIds: [], entry: m, absRefs: [] };
                                                        }
                                                        if (!surahMutsMap[m.phraseId].ayahIds.includes(ref.ayahId)) {
                                                            surahMutsMap[m.phraseId].ayahIds.push(ref.ayahId);
                                                            surahMutsMap[m.phraseId].absRefs.push(abs);
                                                        }
                                                    });
                                                });

                                                const groups = Object.values(surahMutsMap).sort((a, b) => Math.min(...a.ayahIds) - Math.min(...b.ayahIds));

                                                return (
                                                    <div key={surah.id} className="mobile-group-item">
                                                        <div className="mobile-group-header" onClick={() => setExpandedSurahs(prev => ({ ...prev, [surah.id]: !isOpen }))}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                                <span style={{
                                                                    width: '24px', height: '24px', borderRadius: '6px',
                                                                    background: 'var(--accent)', color: 'white',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    fontSize: '0.75rem', fontWeight: 700
                                                                }}>{surah.id}</span>
                                                                <span style={{ fontWeight: 600 }}>{surah.name}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span className="status-badge" style={{ background: 'var(--accent-light)', color: 'white' }}>{count}</span>
                                                                <ChevronDown size={20} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                                            </div>
                                                        </div>
                                                        {isOpen && (
                                                            <div className="mobile-subgroup-list">
                                                                {groups.map(group => {
                                                                    const representativeAbs = group.absRefs.find(a => decisions[`${a}-${group.phraseId}`]?.status !== 'pending') || group.absRefs[0];
                                                                    const decisionKey = `${representativeAbs}-${group.phraseId}`;
                                                                    const existing = decisions[decisionKey] || { status: 'pending', notes: '' };
                                                                    const isConfirmed = !!existing.confirmedAt;

                                                                    return (
                                                                        <div key={decisionKey} className="mobile-subgroup-item" onClick={() => setActiveMutSlideOver({
                                                                            id: decisionKey,
                                                                            title: `${surah.name} - Ayah ${group.ayahIds.join(', ')}`,
                                                                            surahId: surah.id,
                                                                            phraseId: group.phraseId,
                                                                            group,
                                                                            representativeAbs
                                                                        })}>
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                                <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                                                                                    {group.ayahIds.length > 1 ? `Ayat ${group.ayahIds.sort((a, b) => a - b).join(', ')}` : `Ayah ${group.ayahIds[0]}`}
                                                                                </span>
                                                                                <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                                                                                    {group.entry.matches.length - 1} matches
                                                                                </span>
                                                                            </div>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                {isConfirmed && <Check size={16} style={{ color: '#22c55e' }} />}
                                                                                <span className={`status-badge ${existing.status !== 'pending' ? 'active' : ''}`} style={{
                                                                                    fontSize: '0.65rem',
                                                                                    background: existing.status === 'pending' ? 'var(--border)' : 'var(--accent)',
                                                                                    color: 'white'
                                                                                }}>
                                                                                    {MUT_STATES.find(s => s.value === existing.status)?.label.split(' ')[0]}
                                                                                </span>
                                                                                <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '0 -0.5rem', padding: '0 0.5rem' }}>
                                            <table className="debug-table" style={{ minWidth: '700px', width: '100%' }}>
                                                <thead>
                                                    <tr>
                                                        <th style={{ width: '50px' }}></th>
                                                        <th>Ayah Number</th>
                                                        <th>Matches</th>
                                                        <th>Status</th>
                                                        <th>Actions</th>
                                                        <th>Note</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {mutashabihatSurahs.map(({ surah, count }) => {
                                                        const isOpen = expandedSurahs[surah.id] ?? false;
                                                        return (
                                                            <React.Fragment key={surah.id}>
                                                                <tr className="subgroup-header" onClick={() => setExpandedSurahs(prev => ({ ...prev, [surah.id]: !isOpen }))}>
                                                                    <td colSpan={6} style={{ fontWeight: 600 }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                                                                                {surah.id}. {surah.name} ({count})
                                                                            </div>
                                                                            <span className="status-badge partial" style={{ margin: 0 }}>{count} entries</span>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                {isOpen && (() => {
                                                                    const surahMutsMap: Record<string, {
                                                                        phraseId: string,
                                                                        ayahIds: number[],
                                                                        entry: any,
                                                                        absRefs: number[]
                                                                    }> = {};

                                                                    getAllMutashabihatRefs().filter(abs => {
                                                                        const ref = absoluteToSurahAyah(abs);
                                                                        return ref.surahId === surah.id;
                                                                    }).forEach(abs => {
                                                                        const muts = getMutashabihatForAbsolute(abs);
                                                                        const ref = absoluteToSurahAyah(abs);
                                                                        muts.forEach(m => {
                                                                            if (!surahMutsMap[m.phraseId]) {
                                                                                surahMutsMap[m.phraseId] = {
                                                                                    phraseId: m.phraseId,
                                                                                    ayahIds: [],
                                                                                    entry: m,
                                                                                    absRefs: []
                                                                                };
                                                                            }
                                                                            if (!surahMutsMap[m.phraseId].ayahIds.includes(ref.ayahId)) {
                                                                                surahMutsMap[m.phraseId].ayahIds.push(ref.ayahId);
                                                                                surahMutsMap[m.phraseId].absRefs.push(abs);
                                                                            }
                                                                        });
                                                                    });

                                                                    // Add custom mutashabihat
                                                                    instantCustomMutashabihat.filter(c => c.surahId === surah.id).forEach(c => {
                                                                        const phraseId = `custom-${c.id}`;
                                                                        const abs = surahAyahToAbsolute(c.surahId, c.ayahId);
                                                                        const targetAbs = surahAyahToAbsolute(c.targetSurahId, c.targetAyahId);

                                                                        if (!surahMutsMap[phraseId]) {
                                                                            surahMutsMap[phraseId] = {
                                                                                phraseId,
                                                                                ayahIds: [c.ayahId],
                                                                                absRefs: [abs],
                                                                                entry: {
                                                                                    phraseId,
                                                                                    matches: [abs, targetAbs],
                                                                                    meta: {
                                                                                        sourceAbs: abs,
                                                                                        sourceRange: [0, 0],
                                                                                        matches: [
                                                                                            { absolute: abs, wordRange: [0, 0] },
                                                                                            { absolute: targetAbs, wordRange: [0, 0] }
                                                                                        ]
                                                                                    }
                                                                                }
                                                                            };
                                                                        }
                                                                    });

                                                                    return Object.values(surahMutsMap)
                                                                        .sort((a, b) => {
                                                                            const aMin = Math.min(...a.ayahIds);
                                                                            const bMin = Math.min(...b.ayahIds);
                                                                            return aMin - bMin;
                                                                        })
                                                                        .map(group => {
                                                                            const entry = group.entry;
                                                                            // Use the first abs that has a decision, or the first one in the list
                                                                            const representativeAbs = group.absRefs.find(a => decisions[`${a}-${group.phraseId}`]?.status !== 'pending') || group.absRefs[0];
                                                                            const decisionKey = `${representativeAbs}-${group.phraseId}`;
                                                                            const existing = decisions[decisionKey] || { status: 'pending', notes: '' };
                                                                            const isConfirmed = !!existing.confirmedAt;
                                                                            const isDetailExpanded = expandedMutItems[decisionKey] || false;

                                                                            const toggleExpand = () => setExpandedMutItems(prev => ({ ...prev, [decisionKey]: !isDetailExpanded }));

                                                                            return (
                                                                                <React.Fragment key={decisionKey}>
                                                                                    <tr
                                                                                        className="node-row"
                                                                                        onClick={toggleExpand}
                                                                                        style={{ cursor: 'pointer' }}
                                                                                    >
                                                                                        <td style={{ paddingLeft: '1.5rem', width: '50px' }}>
                                                                                            <button
                                                                                                className="bulk-btn"
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    toggleExpand();
                                                                                                }}
                                                                                                style={{ padding: '4px', background: isDetailExpanded ? 'var(--accent)' : 'transparent', color: isDetailExpanded ? 'white' : 'inherit' }}
                                                                                            >
                                                                                                <ChevronDown size={14} style={{ transform: isDetailExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                                                                            </button>
                                                                                        </td>
                                                                                        <td>
                                                                                            <div style={{ fontWeight: 500 }}>
                                                                                                {group.ayahIds.length > 1 ? `Ayat ${group.ayahIds.sort((a, b) => a - b).join(', ')}` : `Ayah ${group.ayahIds[0]}`}
                                                                                            </div>
                                                                                            <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>
                                                                                                {group.phraseId.startsWith('custom-') ? 'Custom' : `Phrase #${group.phraseId}`}
                                                                                            </div>
                                                                                        </td>
                                                                                        <td>{entry.matches.length - 1} matches</td>
                                                                                        <td>
                                                                                            <select
                                                                                                value={existing.status}
                                                                                                onClick={(e) => e.stopPropagation()}
                                                                                                onChange={e => handleDecisionUpdate(representativeAbs, { ...existing, status: e.target.value as any }, decisionKey)}
                                                                                                className="maturity-select"
                                                                                                style={{
                                                                                                    borderColor: existing.status !== 'pending' ? 'var(--accent)' : 'var(--border)',
                                                                                                    color: existing.status !== 'pending' ? 'var(--accent)' : 'inherit'
                                                                                                }}
                                                                                            >
                                                                                                {MUT_STATES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                                                                            </select>
                                                                                        </td>
                                                                                        <td>
                                                                                            <button
                                                                                                className={`bulk-btn ${isConfirmed ? 'learned' : ''}`}
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    handleDecisionUpdate(representativeAbs, {
                                                                                                        ...existing,
                                                                                                        confirmedAt: isConfirmed ? undefined : new Date().toISOString()
                                                                                                    }, decisionKey);
                                                                                                }}
                                                                                                title={isConfirmed ? "Resolved" : "Not Resolved"}
                                                                                                style={{ minWidth: '100px' }}
                                                                                            >
                                                                                                {isConfirmed ? 'Resolved' : 'Not Resolved'}
                                                                                            </button>
                                                                                        </td>
                                                                                        <td>
                                                                                            <input
                                                                                                type="text"
                                                                                                placeholder="Add note..."
                                                                                                value={existing.notes || ''}
                                                                                                onClick={(e) => e.stopPropagation()}
                                                                                                onChange={e => handleDecisionUpdate(representativeAbs, { ...existing, notes: e.target.value }, decisionKey)}
                                                                                                style={{ minWidth: '150px' }}
                                                                                            />
                                                                                        </td>
                                                                                    </tr>
                                                                                    {isDetailExpanded && (
                                                                                        <tr>
                                                                                            <td colSpan={6} style={{ background: 'var(--verse-bg)', padding: '1.5rem', borderRadius: '0 0 8px 8px' }}>
                                                                                                <div className={`mut-context-block ${isConfirmed ? 'confirmed' : ''}`} style={{ margin: 0, border: 'none', background: 'transparent' }}>
                                                                                                    <div className="mut-text">
                                                                                                        <div className="mut-text-label" style={{ marginBottom: '0.75rem' }}>
                                                                                                            Surah {surah.name} - {group.ayahIds.join(', ')} {group.phraseId.startsWith('custom-') ? '' : `(Phrase #${group.phraseId})`}
                                                                                                        </div>
                                                                                                        <div className="mut-context">
                                                                                                            {group.absRefs.map(absRef => {
                                                                                                                const ref = absoluteToSurahAyah(absRef);
                                                                                                                const baseVerse = verses.find(v => v.surahId === ref.surahId && v.ayahId === ref.ayahId);
                                                                                                                const mutEntry = getMutashabihatForAbsolute(absRef).find(m => m.phraseId === group.phraseId);
                                                                                                                if (!mutEntry || !baseVerse) return null;

                                                                                                                return (
                                                                                                                    <div key={absRef} style={{ marginBottom: group.absRefs.length > 1 ? '1rem' : 0 }}>
                                                                                                                        <p className="arabic-text mut-core" style={{ fontSize: '1.25rem' }}>
                                                                                                                            <span className="mut-ayah-tag">{ref.ayahId}</span>
                                                                                                                            <HighlightedVerse
                                                                                                                                text={baseVerse.text}
                                                                                                                                range={mutEntry.meta.sourceAbs === absRef ? mutEntry.meta.sourceRange : mutEntry.meta.matches.find((m: any) => m.absolute === absRef)?.wordRange}
                                                                                                                            />
                                                                                                                        </p>
                                                                                                                    </div>
                                                                                                                );
                                                                                                            })}
                                                                                                        </div>
                                                                                                    </div>

                                                                                                    <div className="mut-matches" style={{ marginTop: '1.5rem' }}>
                                                                                                        {(() => {
                                                                                                            const matches = entry.matches.filter((m: any) => m !== representativeAbs);
                                                                                                            const isExpanded = expandedMutItems[`${decisionKey}-full`] || false;
                                                                                                            const visibleMatches = isExpanded ? matches : matches.slice(0, 4);
                                                                                                            const hasMore = matches.length > 4;

                                                                                                            return (
                                                                                                                <>
                                                                                                                    {visibleMatches.map((matchAbs: number, idx: number) => {
                                                                                                                        const mref = absoluteToSurahAyah(matchAbs);
                                                                                                                        const msurah = getSurah(mref.surahId);
                                                                                                                        const mVerse = verses.find(v => v.surahId === mref.surahId && v.ayahId === mref.ayahId);
                                                                                                                        const matchRange = entry.meta.matches.find((m: any) => m.absolute === matchAbs)?.wordRange;

                                                                                                                        return (
                                                                                                                            <div key={`${decisionKey}-match-${idx}`} className="mut-text match-item" style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                                                                                                                                <div className="mut-text-label" style={{ marginBottom: '0.5rem', fontSize: '0.8rem', opacity: 0.8 }}>
                                                                                                                                    Compare: Surah {msurah?.name} - {mref.ayahId}
                                                                                                                                </div>
                                                                                                                                <div className="mut-context">
                                                                                                                                    {mVerse && (
                                                                                                                                        <p className="arabic-text mut-core" style={{ fontSize: '1.2rem', opacity: 0.9 }}>
                                                                                                                                            <span className="mut-ayah-tag">{mref.ayahId}</span>
                                                                                                                                            <HighlightedVerse text={mVerse.text} range={matchRange} />
                                                                                                                                        </p>
                                                                                                                                    )}
                                                                                                                                </div>
                                                                                                                            </div>
                                                                                                                        );
                                                                                                                    })}
                                                                                                                    {hasMore && (
                                                                                                                        <button
                                                                                                                            className="btn-show-more"
                                                                                                                            onClick={() => setExpandedMutItems(prev => ({ ...prev, [`${decisionKey}-full`]: !isExpanded }))}
                                                                                                                            style={{
                                                                                                                                width: '100%',
                                                                                                                                padding: '8px',
                                                                                                                                marginTop: '8px',
                                                                                                                                fontSize: '0.8rem',
                                                                                                                                color: 'var(--accent)',
                                                                                                                                background: 'none',
                                                                                                                                border: '1px dashed var(--accent)',
                                                                                                                                borderRadius: '8px',
                                                                                                                                cursor: 'pointer'
                                                                                                                            }}
                                                                                                                        >
                                                                                                                            {isExpanded ? 'Show Less' : `Show ${matches.length - 4} More Similar Verses`}
                                                                                                                        </button>
                                                                                                                    )}
                                                                                                                </>
                                                                                                            );
                                                                                                        })()}
                                                                                                    </div>
                                                                                                </div>
                                                                                            </td>
                                                                                        </tr>
                                                                                    )}
                                                                                </React.Fragment>
                                                                            );
                                                                        });
                                                                })()}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Similar Verses Slide-over Detail View */}
            {activeMutSlideOver && (() => {
                const decisionKey = activeMutSlideOver.id;
                const existing = decisions[decisionKey] || { status: 'pending', notes: '' };
                const isConfirmed = !!existing.confirmedAt;
                const group = activeMutSlideOver.group;

                return (
                    <div className="slide-over-overlay" onClick={() => setActiveMutSlideOver(null)}>
                        <div className="slide-over-content" onClick={e => e.stopPropagation()}>
                            <div className="slide-over-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                                        <Brain size={18} />
                                    </div>
                                    <h3 style={{ margin: 0, fontSize: '1rem' }}>{activeMutSlideOver.title}</h3>
                                </div>
                                <button className="close-btn" onClick={() => setActiveMutSlideOver(null)}>
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="slide-over-body">
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                    <div style={{ flex: 1, minWidth: '140px' }}>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--foreground-secondary)', display: 'block', marginBottom: '4px' }}>Status</label>
                                        <select
                                            value={existing.status}
                                            onChange={e => handleDecisionUpdate(activeMutSlideOver.representativeAbs, { ...existing, status: e.target.value as any }, activeMutSlideOver.id)}
                                            className="maturity-select"
                                            style={{ width: '100%', padding: '8px' }}
                                        >
                                            {MUT_STATES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                        </select>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                        <button
                                            className={`bulk-btn ${isConfirmed ? 'learned' : ''}`}
                                            onClick={() => {
                                                handleDecisionUpdate(activeMutSlideOver.representativeAbs, {
                                                    ...existing,
                                                    confirmedAt: isConfirmed ? undefined : new Date().toISOString()
                                                }, activeMutSlideOver.id);
                                            }}
                                            style={{ height: '38px', minWidth: '100px' }}
                                        >
                                            {isConfirmed ? 'Resolved' : 'Mark Resolved'}
                                        </button>
                                    </div>
                                </div>

                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--foreground-secondary)', display: 'block', marginBottom: '4px' }}>Notes</label>
                                    <textarea
                                        placeholder="Add your distinction notes here..."
                                        value={existing.notes || ''}
                                        onChange={e => handleDecisionUpdate(activeMutSlideOver.representativeAbs, { ...existing, notes: e.target.value }, activeMutSlideOver.id)}
                                        style={{
                                            width: '100%',
                                            minHeight: '80px',
                                            padding: '12px',
                                            borderRadius: '12px',
                                            border: '1px solid var(--border)',
                                            background: 'var(--background-secondary)',
                                            fontSize: '0.9rem',
                                            resize: 'vertical'
                                        }}
                                    />
                                </div>

                                <div className={`mut-context-block ${isConfirmed ? 'confirmed' : ''}`} style={{ margin: 0, border: '1px solid var(--border)', background: 'transparent' }}>
                                    <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', background: 'var(--background-secondary)', fontWeight: 600 }}>
                                        Similarity Context
                                    </div>
                                    <div style={{ padding: '0.5rem' }}>
                                        {group.absRefs.map(absRef => {
                                            const ref = absoluteToSurahAyah(absRef);
                                            const baseVerse = verses.find(v => v.surahId === ref.surahId && v.ayahId === ref.ayahId);
                                            const mutEntry = getMutashabihatForAbsolute(absRef).find(m => m.phraseId === group.phraseId);
                                            if (!mutEntry || !baseVerse) return null;

                                            const matches = mutEntry.matches;
                                            const isExpanded = expandedMutItems[`${decisionKey}-full`] || false;
                                            const displayedMatches = isExpanded ? matches : matches.slice(0, 4);
                                            const hasMore = matches.length > 4;

                                            return (
                                                <div key={absRef} className="mut-text" style={{ padding: '1rem', borderBottom: '1px solid var(--border)' }}>
                                                    <div className="mut-text-label" style={{ marginBottom: '0.75rem', fontWeight: 600, color: 'var(--accent)' }}>
                                                        {getSurah(ref.surahId)?.name} - {ref.ayahId} {group.phraseId.startsWith('custom-') ? '' : `(Phrase #${group.phraseId})`}
                                                    </div>
                                                    <div className="mut-context">
                                                        <p className="arabic-text mut-core" style={{ fontSize: '1.3rem', textAlign: 'right', direction: 'rtl', lineHeight: '2.2', marginBottom: '1.5rem' }}>
                                                            <span className="mut-ayah-tag">{ref.ayahId}</span>
                                                            <HighlightedVerse
                                                                text={baseVerse.text}
                                                                range={(mutEntry.meta as any).sourceAbs === absRef ? (mutEntry.meta as any).sourceRange : (mutEntry.meta as any).matches.find((m: any) => m.absolute === absRef)?.wordRange}
                                                            />
                                                        </p>

                                                        {displayedMatches.filter((matchAbs: number) => matchAbs !== absRef).map((matchAbs: number, idx: number) => {
                                                            const mref = absoluteToSurahAyah(matchAbs);
                                                            const msurah = getSurah(mref.surahId);
                                                            const mVerse = verses.find(v => v.surahId === mref.surahId && v.ayahId === mref.ayahId);
                                                            const matchRange = (mutEntry.meta as any).matches.find((m: any) => m.absolute === matchAbs)?.wordRange;

                                                            return (
                                                                <div key={idx} className="mut-match-item" style={{
                                                                    marginBottom: '1rem',
                                                                    padding: '0.75rem',
                                                                    borderRadius: '8px',
                                                                    background: 'var(--background)',
                                                                    border: '1px solid var(--border)'
                                                                }}>
                                                                    <div className="mut-match-label" style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '0.5rem' }}>
                                                                        Compare: Surah {msurah?.name} - {mref.ayahId}
                                                                    </div>
                                                                    <div className="mut-context">
                                                                        {mVerse && (
                                                                            <p className="arabic-text mut-core" style={{ fontSize: '1.2rem', textAlign: 'right', direction: 'rtl', lineHeight: '2' }}>
                                                                                <span className="mut-ayah-tag">{mref.ayahId}</span>
                                                                                <HighlightedVerse text={mVerse.text} range={matchRange} />
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}

                                                        {hasMore && (
                                                            <button
                                                                className="btn-show-more"
                                                                onClick={() => setExpandedMutItems(prev => ({ ...prev, [`${decisionKey}-full`]: !isExpanded }))}
                                                                style={{
                                                                    width: '100%',
                                                                    padding: '8px',
                                                                    marginTop: '8px',
                                                                    fontSize: '0.8rem',
                                                                    color: 'var(--accent)',
                                                                    background: 'none',
                                                                    border: '1px dashed var(--accent)',
                                                                    borderRadius: '8px',
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                {isExpanded ? 'Show Less' : `Show ${matches.length - 4} More Similar Verses`}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            <style jsx>{`
                .add-custom-mut-btn {
                    background: var(--accent);
                    color: white;
                    border: none;
                    border-radius: 6px;
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    margin-left: auto;
                    margin-right: 12px;
                    transition: all 0.2s ease;
                    opacity: 0.8;
                }
                .add-custom-mut-btn:hover {
                    opacity: 1;
                    transform: scale(1.05);
                }
                .mut-fold-header, .mobile-group-header, .group-header, .subgroup-header, .nav-item, .surah-pill, .btn-part {
                    -webkit-tap-highlight-color: transparent;
                }

                @media (max-width: 767px) {
                    .hide-mobile {
                        display: none !important;
                    }
                }

                @media (min-width: 768px) {
                    .show-mobile {
                        display: none !important;
                    }
                }
                .mut-fold-header .mut-chevron {
                        margin-left: 0;
                    }
                    .bulk-btn {
                        padding: 4px 10px;
                        border-radius: 6px;
                        font-size: 0.7rem;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                        border: 1px solid var(--border);
                        background: var(--background);
                        color: var(--foreground-secondary);
                    }
                    .bulk-btn:hover {
                        background: var(--background-secondary);
                        transform: translateY(-1px);
                    }
                    .bulk-btn.learned:hover {
                        color: #22c55e;
                        border-color: #22c55e;
                        background: #22c55e10;
                    }
                    .bulk-btn.new:hover {
                        color: var(--danger);
                        border-color: var(--danger);
                        background: var(--danger)10;
                    }
                    .bulk-btn.skipped:hover {
                        color: #94a3b8;
                        border-color: #94a3b8;
                        background: #94a3b810;
                    }
                    .bulk-btn.reset-mut:hover {
                        color: var(--accent);
                        border-color: var(--accent);
                        background: var(--accent)10;
                    }

                    /* Slide-over styles */
                    .slide-over-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: rgba(0, 0, 0, 0.4);
                        backdrop-filter: blur(4px);
                        z-index: 2000;
                        display: flex;
                        justify-content: flex-end;
                        animation: fadeIn 0.3s ease;
                    }

                    .slide-over-content {
                        width: 90%;
                        max-width: 450px;
                        height: 100%;
                        background: var(--background);
                        box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
                        display: flex;
                        flex-direction: column;
                        animation: slideIn 0.3s ease;
                    }

                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }

                    @keyframes slideIn {
                        from { transform: translateX(100%); }
                        to { transform: translateX(0); }
                    }

                    .slide-over-header {
                        padding: 1.25rem;
                        border-bottom: 1px solid var(--border);
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        background: var(--background-secondary);
                    }

                    .close-btn {
                        background: none;
                        border: none;
                        color: var(--foreground-secondary);
                        cursor: pointer;
                        padding: 4px;
                        display: flex;
                        border-radius: 50%;
                        transition: background 0.2s;
                    }

                    .close-btn:hover {
                        background: var(--border);
                    }

                    .slide-over-body {
                        flex: 1;
                        overflow-y: auto;
                        padding: 1.25rem;
                        -webkit-overflow-scrolling: touch;
                    }

                    .mobile-node-list {
                        display: flex;
                        flex-direction: column;
                        gap: 1rem;
                    }

                    .mobile-node-card {
                        background: var(--background-secondary);
                        border: 1px solid var(--border);
                        border-radius: 12px;
                        padding: 1rem;
                    }

                    .node-card-main {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 1rem;
                    }

                    .node-target {
                        font-weight: 600;
                        font-size: 0.95rem;
                    }

                    .node-card-details {
                        display: grid;
                        grid-template-columns: repeat(4, 1fr);
                        gap: 0.5rem;
                        padding-top: 1rem;
                        border-top: 1px dashed var(--border);
                    }

                    .stat-item {
                        display: flex;
                        flex-direction: column;
                        gap: 2px;
                    }

                    .stat-label {
                        font-size: 0.65rem;
                        color: var(--foreground-secondary);
                        text-transform: uppercase;
                        letter-spacing: 0.02em;
                    }

                    .stat-value {
                        font-size: 0.8rem;
                        font-weight: 600;
                    }

                    .status-overdue {
                        color: var(--danger);
                    }

                    .status-badge {
                        font-size: 0.7rem;
                        padding: 2px 6px;
                        border-radius: 4px;
                        background: var(--accent-light);
                        color: white;
                        font-weight: 600;
                    }
                `}</style>

            <AddCustomMutashabihModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSave={handleAddCustomMutashabih}
                initialSurahId={targetSurahId}
            />

            {/* Mobile Slide-over for Node Management */}
            {activeSlideOverGroup && (
                <div className="slide-over-overlay" onClick={() => setActiveSlideOverGroup(null)}>
                    <div className="slide-over-content" onClick={e => e.stopPropagation()}>
                        <div className="slide-over-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                                    {activeSlideOverGroup.type === 'verse_segment' ? <Book size={18} /> : <MapIcon size={18} />}
                                </div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{activeSlideOverGroup.title}</h3>
                            </div>
                            <button className="close-btn" onClick={() => setActiveSlideOverGroup(null)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="slide-over-body">
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                                {/* Set All dropdown matching desktop */}
                                <select
                                    className="maturity-select"
                                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.85rem' }}
                                    value=""
                                    onChange={async (e) => {
                                        const val = e.target.value as any;
                                        if (!val) return;

                                        if (activeSlideOverGroup.type === 'verse_segment' && activeSlideOverGroup.surahId) {
                                            await handleGroupMaturityReset('verse', val, activeSlideOverGroup.surahId, activeSlideOverGroup.title);
                                        } else {
                                            await handleGroupMaturityReset(activeSlideOverGroup.type as any, val);
                                        }

                                        // Update local state to reflect changes
                                        setActiveSlideOverGroup(prev => {
                                            if (!prev) return null;
                                            const updatedNodes = instantNodes.filter(n => {
                                                if (prev.type === 'verse_segment') return n.type === 'verse_segment' && n.surahId === prev.surahId;
                                                return n.type === prev.type;
                                            });
                                            return { ...prev, nodes: updatedNodes };
                                        });
                                    }}
                                >
                                    <option value="">Set Subgroup...</option>
                                    <option value="reset">Reset</option>
                                    <option value="medium">Medium</option>
                                    <option value="strong">Strong</option>
                                    <option value="mastered">Mastered</option>
                                </select>
                            </div>

                            <div className="mobile-node-list">
                                {activeSlideOverGroup.nodes.length > 0 ? (
                                    activeSlideOverGroup.nodes
                                        .sort((a, b) => {
                                            if (activeSlideOverGroup.type === 'verse_segment') return (a.startVerse || 0) - (b.startVerse || 0);
                                            if (activeSlideOverGroup.type === 'mindmap') return (a.surahId || 0) - (b.surahId || 0);
                                            return (a.partId || 0) - (b.partId || 0);
                                        })
                                        .map(node => (
                                            <div key={node.id} className="mobile-node-card">
                                                <div className="node-card-main">
                                                    <div className="node-target">
                                                        {activeSlideOverGroup.type === 'verse_segment' ? `Ayat ${node.startVerse}-${node.endVerse}` :
                                                            activeSlideOverGroup.type === 'mindmap' ? `${node.surahId}. ${getSurah(node.surahId!)?.name}` :
                                                                `Part ${node.partId}`}
                                                    </div>
                                                    <select
                                                        value=""
                                                        onChange={async (e) => {
                                                            const val = e.target.value as any;
                                                            if (!val) return;
                                                            await handleNodeMaturityReset(node.id, val);

                                                            // Update local nodes in slideover
                                                            setActiveSlideOverGroup(prev => {
                                                                if (!prev) return null;
                                                                const updatedNodes = instantNodes.filter(n => {
                                                                    if (prev.type === 'verse_segment') return n.type === 'verse_segment' && n.surahId === prev.surahId;
                                                                    return n.type === prev.type;
                                                                });
                                                                return { ...prev, nodes: updatedNodes };
                                                            });
                                                        }}
                                                        className="maturity-select"
                                                        style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)' }}
                                                    >
                                                        <option value="">Set to...</option>
                                                        <option value="reset">Reset</option>
                                                        <option value="medium">Medium</option>
                                                        <option value="strong">Strong</option>
                                                        <option value="mastered">Mastered</option>
                                                    </select>
                                                </div>
                                                <div className="node-card-details">
                                                    <div className="stat-item">
                                                        <span className="stat-label">Interval</span>
                                                        <span className="stat-value">{getNodeStability(node)}d</span>
                                                    </div>
                                                    <div className="stat-item">
                                                        <span className="stat-label">Difficulty</span>
                                                        <span className="stat-value">{getNodeDifficulty(node)}</span>
                                                    </div>
                                                    <div className="stat-item">
                                                        <span className="stat-label">Reps</span>
                                                        <span className="stat-value">{getNodeReps(node)}</span>
                                                    </div>
                                                    <div className="stat-item">
                                                        <span className="stat-label">Next</span>
                                                        <span className={`stat-value ${(getNodeDueDate(node) || '') <= new Date().toISOString().split('T')[0] ? 'status-overdue' : ''}`}>
                                                            {getNodeDueDate(node)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                ) : (
                                    <div className="empty-state">No items found</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
