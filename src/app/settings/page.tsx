'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { User } from '@supabase/supabase-js';
import { syncWithCloud, SyncResult } from '@/lib/sync';
import { getSurahsByPart, getSurah, parseQuranJson } from '@/lib/quranData';
import {
    AppSettings,
    getSettings,
    updateSetting,
    toggleSurahLearned,
    toggleSurahSkipped,
    isSurahSkipped,
    getSurahLearnedStatus,
    setGroupMaturity,
    getMaturityLevel,
    setNodeMaturity,
    getMutashabihatDecisions,
    setMutashabihatDecision,
    saveCustomMutashabih,
    getCustomMutashabihat,
    CustomMutashabih,
    exportBackup,
    importBackup,
    MutashabihatDecision,
    bulkSetSurahStatus,
    resetMutashabihatDecisions,
} from '@/lib/storage';
import { QuranPart } from '@/lib/types';
import {
    Check, Clock, PauseCircle, RotateCcw, Download,
    Upload,
    ShieldCheck,
    Database,
    Settings,
    Brain,
    Plus,
    ChevronDown,
    Map,
    Book,
    Activity,
    X
} from 'lucide-react';
import DocumentationModal from '@/components/DocumentationModal';
import AddCustomMutashabihModal from '@/components/AddCustomMutashabihModal';
import { getAllMutashabihatRefs, absoluteToSurahAyah, getMutashabihatForAbsolute, surahAyahToAbsolute } from '@/lib/mutashabihat';
import { MemoryNode, getMemoryNodes } from '@/lib/storage';

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
    const supabase = createClient();
    const [user, setUser] = useState<User | null>(null);
    const [settings, setSettings] = useState<AppSettings>(getSettings());
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
        };
        getUser();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => subscription.unsubscribe();
    }, [supabase]);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError(null);
        setIsSyncing(true);

        const { error } = isSignUp
            ? await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                }
            })
            : await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            setAuthError(error.message);
        } else if (isSignUp) {
            setAuthError('Check your email for the confirmation link!');
        }
        setIsSyncing(false);
    };

    // Auto-sync on session load - only if we haven't synced in this component instance
    const hasAutoSynced = useRef(false);
    useEffect(() => {
        if (user && !hasAutoSynced.current) {
            handleSync();
            hasAutoSynced.current = true;
        }
    }, [user]);

    const handleSync = async () => {
        setIsSyncing(true);
        const result = await syncWithCloud();
        setSyncResult(result);
        setIsSyncing(false);
        if (result.status === 'success') {
            setVersion(v => v + 1); // Refresh UI with merged data
        }
    };
    const [version, setVersion] = useState(0);
    const [decisions, setDecisions] = useState<Record<string, MutashabihatDecision>>(getMutashabihatDecisions());
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
        type: 'verse' | 'mindmap' | 'part_mindmap';
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

    useEffect(() => {
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
            setSectionsExpanded({
                cloudSync: false,
                backupRestore: false,
                schedule: false,
                activePart: false,
                surahStatus: false,
                mutashabihat: false,
            });
            setShowDebugNodes(false);
        }
    }, []);

    const toggleGroup = (groupId: string) => {
        setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
    };

    const handleGroupMaturityReset = (type: 'verse' | 'mindmap' | 'part_mindmap', surahId?: number, surahName?: string) => {
        let typeLabel = '';
        if (surahName) {
            typeLabel = `all Verses for ${surahName}`;
        } else {
            typeLabel = type === 'verse' ? 'all Verses' : (type === 'mindmap' ? 'all Surah Mindmaps' : 'all Part Mindmaps');
        }

        if (!window.confirm(`Are you sure you want to reset the maturity of ${typeLabel}?`)) return;
        setGroupMaturity(type, 'reset', surahId);
        setVersion(v => v + 1);
    };

    useEffect(() => {
        setMemoryNodes(getMemoryNodes());
    }, [version]);

    useEffect(() => {
        setSettings(getSettings());
        setDecisions(getMutashabihatDecisions());
    }, [version]);

    useEffect(() => {
        fetch('/qpc-hafs-word-by-word.json')
            .then(res => res.json())
            .then(data => setVerses(parseQuranJson(data as Record<string, any>)))
            .catch(() => setVerses([]));
    }, []);

    const activePartSurahs = useMemo(() => getSurahsByPart(settings.activePart), [settings.activePart]);

    const handleCompletionDays = (days: number) => {
        updateSetting('completionDays', Math.max(5, Math.min(120, days)));
        setVersion(v => v + 1);
    };

    const handleActivePart = (part: QuranPart) => {
        updateSetting('activePart', part);
        setVersion(v => v + 1);
    };

    const handleBulkStatus = (status: 'learned' | 'new' | 'skipped') => {
        const partName = settings.activePart === 5 ? 'the whole Quran' : `Part ${settings.activePart}`;
        const msg = `Are you sure you want to mark ALL surahs in ${partName} as ${status.toUpperCase()}? This will override their current individual statuses.`;
        if (!window.confirm(msg)) return;

        const surahIds = activePartSurahs.map(s => s.id);
        bulkSetSurahStatus(surahIds, status);
        setVersion(v => v + 1);
    };

    const handleResetMutashabihat = () => {
        const partName = settings.activePart === 5 ? 'the whole Quran' : `Part ${settings.activePart}`;
        const msg = `Are you sure you want to reset ALL mutashabihat decisions for ${partName}? This cannot be undone.`;
        if (!window.confirm(msg)) return;

        const absoluteAyat = getAllMutashabihatRefs().filter(abs => {
            const ref = absoluteToSurahAyah(abs);
            const surah = getSurah(ref.surahId);
            return surah && (settings.activePart === 5 || surah.part === settings.activePart);
        });
        resetMutashabihatDecisions(absoluteAyat);
        setVersion(v => v + 1);
    };

    const handleCycleStatus = (surahId: number) => {
        const { learned, total } = getSurahLearnedStatus(surahId);
        const skipped = isSurahSkipped(surahId);
        const isLearned = learned === total;

        if (!isLearned && !skipped) {
            // State: Not Learned -> Set to Learned
            toggleSurahLearned(surahId);
        } else if (isLearned && !skipped) {
            // State: Learned -> Set to Skipped
            toggleSurahLearned(surahId); // Unlearn first
            toggleSurahSkipped(surahId); // Then skip
        } else {
            // State: Skipped -> Set to Not Learned
            toggleSurahSkipped(surahId); // Unskip
        }
        setVersion(v => v + 1);
    };

    const handleDecisionUpdate = (absoluteAyah: number, update: MutashabihatDecision, phraseId: string) => {
        if (phraseId.startsWith('custom-')) {
            const customId = phraseId.replace('custom-', '');
            const allCustoms = getCustomMutashabihat();
            const mut = allCustoms.find((m: CustomMutashabih) => m.id === customId);
            if (mut) {
                mut.status = update.status;
                mut.note = update.note;
                saveCustomMutashabih(mut);
            }
        }

        const key = `${absoluteAyah}-${phraseId}`;
        setMutashabihatDecision(key as any, update);
        setVersion(v => v + 1);
    };

    const handleAddCustomMutashabih = (mut: CustomMutashabih) => {
        saveCustomMutashabih(mut);

        // Also save to decisions for consistency and immediate UI update
        const abs1 = surahAyahToAbsolute(mut.verse1.surahId, mut.verse1.ayahId);
        const abs2 = surahAyahToAbsolute(mut.verse2.surahId, mut.verse2.ayahId);

        const isSolved = mut.status !== 'pending' && mut.status !== 'ignored';
        const decision = {
            status: mut.status,
            note: mut.note,
            confirmedAt: isSolved ? new Date().toISOString() : undefined
        };
        setMutashabihatDecision(`${abs1}-custom-${mut.id}` as any, decision);
        setMutashabihatDecision(`${abs2}-custom-${mut.id}` as any, decision);

        setVersion(v => v + 1);
    };

    const handleExport = () => {
        const data = exportBackup();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `quran-app-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target?.result as string);
                if (confirm('Importing will overwrite current progress. Continue?')) {
                    importBackup(data);
                    setVersion(v => v + 1);
                    alert('Successfully imported!');
                }
            } catch (err) {
                alert('Invalid backup file');
            }
        };
        reader.readAsText(file);
    };

    const mutashabihatBySurah = useMemo(() => {
        const map: Record<number, number> = {};
        getAllMutashabihatRefs().forEach(abs => {
            const ref = absoluteToSurahAyah(abs);
            const surah = getSurah(ref.surahId);
            if (!surah || (settings.activePart !== 5 && surah.part !== settings.activePart)) return;

            // Count total mutashabihat groups (entries) for this surah
            const entries = getMutashabihatForAbsolute(abs);
            if (!map[ref.surahId]) map[ref.surahId] = 0;
            map[ref.surahId] += entries.length;
        });
        return map;
    }, [settings.activePart]);

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
        <div className="content-wrapper" style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem' }}>
            <h1 className="hide-mobile">Settings</h1>

            <div className="settings-grid" style={{ gap: '0.85rem' }}>
                <div className="card modern-card" style={{
                    padding: sectionsExpanded.cloudSync ? 'clamp(1rem, 4vw, 1.5rem)' : '1rem',
                    background: 'var(--background-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '16px'
                }}>
                    <div className="section-title"
                        onClick={() => setSectionsExpanded(s => ({ ...s, cloudSync: !s.cloudSync }))}
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
                            <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                                <Database size={18} />
                            </div>
                            <span>Cloud Sync</span>
                        </div>
                        <ChevronDown size={20} style={{ transform: sectionsExpanded.cloudSync ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    </div>
                    {sectionsExpanded.cloudSync && (
                        <>
                            <p style={{ marginBottom: '1rem', color: 'var(--foreground-secondary)', fontSize: '0.9rem' }}>
                                {user
                                    ? `Signed in as ${user.email}. Your data is synced automatically.`
                                    : "Sign in to sync your progress across devices."}
                            </p>

                            {user ? (
                                <>
                                    <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '8px', background: 'var(--background)', border: '1px solid var(--border)', fontSize: '0.85rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                            <span style={{ color: 'var(--foreground-secondary)' }}>Status:</span>
                                            <span style={{
                                                color: isSyncing ? 'var(--accent)' : (syncResult?.status === 'error' ? '#ef4444' : '#10b981'),
                                                fontWeight: 600
                                            }}>
                                                {isSyncing ? 'Syncing...' : (syncResult?.message || 'Ready')}
                                            </span>
                                        </div>
                                        {settings.lastSyncedAt && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: 'var(--foreground-secondary)' }}>Last Synced:</span>
                                                <span style={{ color: 'var(--foreground-secondary)' }}>
                                                    {new Date(settings.lastSyncedAt).toLocaleString()}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
                                        <button
                                            className="btn btn-primary"
                                            onClick={() => handleSync()}
                                            disabled={isSyncing}
                                            style={{ width: '100%', padding: '0.85rem', fontSize: '1rem' }}
                                        >
                                            {isSyncing ? 'Syncing...' : 'Sync Now'}
                                        </button>
                                        <button
                                            className="btn btn-secondary"
                                            onClick={() => supabase.auth.signOut()}
                                            style={{ width: '100%', padding: '0.85rem', background: 'transparent', border: '1px solid var(--border)', fontSize: '1rem' }}
                                        >
                                            Sign Out
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <input
                                        type="email"
                                        placeholder="Email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '1rem' }}
                                    />
                                    <input
                                        type="password"
                                        placeholder="Password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '1rem' }}
                                    />
                                    {authError && <p style={{ color: '#ef4444', fontSize: '0.85rem' }}>{authError}</p>}
                                    <button
                                        type="submit"
                                        className="btn btn-primary"
                                        disabled={isSyncing}
                                        style={{ width: '100%', padding: '0.85rem', fontSize: '1rem' }}
                                    >
                                        {isSyncing ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Sign In')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsSignUp(!isSignUp)}
                                        style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.85rem', cursor: 'pointer' }}
                                    >
                                        {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                                    </button>
                                </form>
                            )}
                        </>
                    )}
                </div>

                <div className="card modern-card" style={{
                    padding: sectionsExpanded.backupRestore ? 'clamp(1rem, 4vw, 1.5rem)' : '1rem',
                    background: 'var(--background-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '16px'
                }}>
                    <div className="section-title"
                        onClick={() => setSectionsExpanded(s => ({ ...s, backupRestore: !s.backupRestore }))}
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
                            <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                                <Download size={18} />
                            </div>
                            <span>Backup & Restore</span>
                        </div>
                        <ChevronDown size={20} style={{ transform: sectionsExpanded.backupRestore ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    </div>
                    {sectionsExpanded.backupRestore && (
                        <>
                            <p style={{ marginBottom: '1rem', color: 'var(--foreground-secondary)', fontSize: '0.9rem' }}>Secure your progress or transfer to another device.</p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <button className="btn btn-secondary" onClick={handleExport} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0.85rem', fontSize: '0.9rem' }}>
                                    <Download size={18} /> <span className="hide-mobile">Export</span>
                                </button>
                                <label className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0.85rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                                    <Upload size={18} /> <span className="hide-mobile">Import</span>
                                    <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
                                </label>
                            </div>
                        </>
                    )}
                </div>

                <div className="card modern-card" style={{
                    padding: sectionsExpanded.schedule ? 'clamp(1rem, 4vw, 1.5rem)' : '1rem',
                    background: 'var(--background-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '16px'
                }}>
                    <div className="section-title"
                        onClick={() => setSectionsExpanded(s => ({ ...s, schedule: !s.schedule }))}
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
                            <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                                <Clock size={18} />
                            </div>
                            <span>Completion Schedule</span>
                        </div>
                        <ChevronDown size={20} style={{ transform: sectionsExpanded.schedule ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    </div>
                    {sectionsExpanded.schedule && (
                        <>
                            <p style={{ marginBottom: '1rem', color: 'var(--foreground-secondary)', fontSize: '0.9rem' }}>How many days to complete the active part.</p>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={settings.completionDays || ''}
                                onChange={e => {
                                    const val = e.target.value;
                                    if (val === '') {
                                        updateSetting('completionDays', 0);
                                        setVersion(v => v + 1);
                                        return;
                                    }
                                    const parsed = parseInt(val, 10);
                                    if (!isNaN(parsed)) {
                                        updateSetting('completionDays', Math.min(180, parsed));
                                        setVersion(v => v + 1);
                                    }
                                }}
                                onBlur={() => {
                                    if (!settings.completionDays || settings.completionDays < 5) {
                                        handleCompletionDays(5);
                                    }
                                }}
                                style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '1rem' }}
                            />
                        </>
                    )}
                </div>

                <div className="card modern-card" style={{
                    padding: sectionsExpanded.activePart ? 'clamp(1rem, 4vw, 1.5rem)' : '1rem',
                    background: 'var(--background-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '16px'
                }}>
                    <div className="section-title"
                        onClick={() => setSectionsExpanded(s => ({ ...s, activePart: !s.activePart }))}
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
                            <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                                <PauseCircle size={18} />
                            </div>
                            <span>Active Part</span>
                        </div>
                        <ChevronDown size={20} style={{ transform: sectionsExpanded.activePart ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
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
                    )}
                </div>
            </div>

            <div style={{ marginTop: '0.85rem' }}>
                <div className="card modern-card" style={{
                    padding: sectionsExpanded.surahStatus ? 'clamp(1rem, 4vw, 1.5rem)' : '1rem',
                    background: 'var(--background-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '16px'
                }}>
                    <div className="section-title"
                        onClick={() => setSectionsExpanded(s => ({ ...s, surahStatus: !s.surahStatus }))}
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
                            <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                                <Check size={18} />
                            </div>
                            <span style={{ fontSize: 'clamp(1rem, 5vw, 1.1rem)' }}>Surah Status</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {sectionsExpanded.surahStatus && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <button className="bulk-btn learned" onClick={(e) => { e.stopPropagation(); handleBulkStatus('learned'); }} title="Mark all as Learned" style={{ fontSize: '0.8rem' }}>
                                        <span className="hide-mobile">All Learned</span><span className="show-mobile">Learned</span>
                                    </button>
                                    <button className="bulk-btn new" onClick={(e) => { e.stopPropagation(); handleBulkStatus('new'); }} title="Mark all as New" style={{ fontSize: '0.8rem' }}>
                                        <span className="hide-mobile">All New</span><span className="show-mobile">New</span>
                                    </button>
                                    <button className="bulk-btn skipped" onClick={(e) => { e.stopPropagation(); handleBulkStatus('skipped'); }} title="Mark all as Skipped" style={{ fontSize: '0.8rem' }}>
                                        <span className="hide-mobile">All Skipped</span><span className="show-mobile">Skipped</span>
                                    </button>
                                </div>
                            )}
                            <ChevronDown size={20} style={{ transform: sectionsExpanded.surahStatus ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                        </div>
                    </div>
                    {sectionsExpanded.surahStatus && (
                        <>
                            <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                                Manage learned and skipped surahs for the active part. <br />
                                <span style={{ opacity: 0.8, fontSize: '0.8rem' }}>Tap a surah to cycle between: <b>Not Learned (Red)</b> → <b>Learned (Green)</b> → <b>Skipped (Grey)</b></span>
                            </p>
                            <div className="surah-pills-container" style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '0.6rem',
                                marginTop: '0.5rem'
                            }}>
                                {activePartSurahs.map(s => {
                                    const { learned, total } = getSurahLearnedStatus(s.id);
                                    const skipped = isSurahSkipped(s.id);
                                    const isLearned = learned === total;

                                    let statusColor = 'var(--danger)'; // Not Learned (Red)
                                    if (isLearned) {
                                        statusColor = '#22c55e'; // Learned (Green)
                                    } else if (skipped) {
                                        statusColor = '#94a3b8'; // Skipped (Grey)
                                    }

                                    return (
                                        <button
                                            key={s.id}
                                            onClick={() => handleCycleStatus(s.id)}
                                            className="surah-pill"
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '0.5rem 0.8rem',
                                                borderRadius: '24px',
                                                border: `1px solid ${statusColor}`,
                                                background: `${statusColor}15`, // Translucent background
                                                color: statusColor,
                                                fontSize: '0.85rem',
                                                fontWeight: 500,
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease',
                                                outline: 'none'
                                            }}
                                            title={`${s.name} - Tap to cycle status`}
                                        >
                                            <span style={{
                                                width: '20px',
                                                height: '20px',
                                                borderRadius: '50%',
                                                background: statusColor,
                                                color: 'white',
                                                fontSize: '0.7rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                marginRight: '0.5rem',
                                                flexShrink: 0
                                            }}>
                                                {s.id}
                                            </span>
                                            <span style={{ marginRight: '0.4rem' }}>{s.arabicName}</span>
                                            <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{s.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div style={{ marginTop: '0.85rem' }}>
                <div className="card modern-card" style={{
                    padding: sectionsExpanded.mutashabihat ? 'clamp(1rem, 4vw, 1.5rem)' : '1rem',
                    background: 'var(--background-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '16px'
                }}>
                    <div className="section-title"
                        onClick={() => setShowDebugNodes(!showDebugNodes)}
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
                            <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                                <Activity size={18} />
                            </div>
                            <span>Knowledge Tracking</span>
                        </div>
                        <ChevronDown size={20} style={{ transform: showDebugNodes ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
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
                                                <Map size={20} />
                                                <span style={{ fontWeight: 600 }}>Mindmaps</span>
                                            </div>
                                            <ChevronDown size={20} style={{ transform: expandedGroups['mindmaps'] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                        </div>
                                        {expandedGroups['mindmaps'] && (
                                            <div className="mobile-subgroup-list">
                                                <div className="mobile-subgroup-item" onClick={() => setActiveSlideOverGroup({
                                                    id: 'mindmaps-part',
                                                    title: 'Part Mindmaps',
                                                    type: 'part_mindmap',
                                                    nodes: memoryNodes.filter(n => n.type === 'part_mindmap')
                                                })}>
                                                    <span>Part Mindmaps</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span className="status-badge">{memoryNodes.filter(n => n.type === 'part_mindmap').length}</span>
                                                        <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
                                                    </div>
                                                </div>
                                                <div className="mobile-subgroup-item" onClick={() => setActiveSlideOverGroup({
                                                    id: 'mindmaps-surah',
                                                    title: 'Surah Mindmaps',
                                                    type: 'mindmap',
                                                    nodes: memoryNodes.filter(n => n.type === 'mindmap')
                                                })}>
                                                    <span>Surah Mindmaps</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span className="status-badge">{memoryNodes.filter(n => n.type === 'mindmap').length}</span>
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
                                                {Array.from(new Set(memoryNodes.filter(n => n.type === 'verse').map(n => n.surahId)))
                                                    .sort((a, b) => (a || 0) - (b || 0))
                                                    .map(surahId => {
                                                        const surah = getSurah(surahId!);
                                                        const surahNodes = memoryNodes.filter(n => n.type === 'verse' && n.surahId === surahId);
                                                        return (
                                                            <div key={surahId} className="mobile-subgroup-item" onClick={() => setActiveSlideOverGroup({
                                                                id: `verse-surah-${surahId}`,
                                                                title: `${surah?.id}. ${surah?.name}`,
                                                                type: 'verse',
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
                                                    })}
                                                {memoryNodes.filter(n => n.type === 'verse').length === 0 && (
                                                    <div className="empty-state" style={{ padding: '1rem' }}>No verse nodes</div>
                                                )}
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
                                                <th>Ease</th>
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
                                                            <Map size={16} /> Mindmaps
                                                        </div>
                                                        <button
                                                            className="bulk-btn reset-mut"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (window.confirm('Are you sure you want to reset the maturity of ALL Mindmaps (both Surah and Part mindmaps)?')) {
                                                                    setGroupMaturity('mindmap', 'reset');
                                                                    setGroupMaturity('part_mindmap', 'reset');
                                                                    setVersion(v => v + 1);
                                                                }
                                                            }}
                                                            title="Reset all mindmaps maturity"
                                                        >
                                                            Reset Group
                                                        </button>
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
                                                                <button
                                                                    className="bulk-btn reset-mut"
                                                                    onClick={(e) => { e.stopPropagation(); handleGroupMaturityReset('part_mindmap'); }}
                                                                    title="Reset all part mindmaps maturity"
                                                                >
                                                                    Reset Group
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {expandedGroups['mindmaps-part'] && (
                                                        memoryNodes.filter(n => n.type === 'part_mindmap').length > 0 ? (
                                                            memoryNodes
                                                                .filter(n => n.type === 'part_mindmap')
                                                                .sort((a, b) => (a.partId || 0) - (b.partId || 0))
                                                                .map(node => (
                                                                    <tr key={node.id} className="node-row">
                                                                        <td>Part {node.partId}</td>
                                                                        <td>
                                                                            <select
                                                                                value={getMaturityLevel(node.scheduler.interval)}
                                                                                onChange={(e) => {
                                                                                    setNodeMaturity(node.id, e.target.value as any);
                                                                                    setMemoryNodes(getMemoryNodes());
                                                                                }}
                                                                                className="maturity-select"
                                                                            >
                                                                                <option value="reset">Reset</option>
                                                                                <option value="medium">Medium</option>
                                                                                <option value="strong">Strong</option>
                                                                                <option value="mastered">Mastered</option>
                                                                            </select>
                                                                        </td>
                                                                        <td>{node.scheduler.interval}d</td>
                                                                        <td>{node.scheduler.easeFactor}</td>
                                                                        <td>{node.scheduler.repetition}</td>
                                                                        <td className={node.scheduler.dueDate <= new Date().toISOString().split('T')[0] ? 'status-overdue' : ''}>{node.scheduler.dueDate}</td>
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
                                                                <button
                                                                    className="bulk-btn reset-mut"
                                                                    onClick={(e) => { e.stopPropagation(); handleGroupMaturityReset('mindmap'); }}
                                                                    title="Reset all surah mindmaps maturity"
                                                                >
                                                                    Reset Group
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {expandedGroups['mindmaps-surah'] && (
                                                        memoryNodes.filter(n => n.type === 'mindmap').length > 0 ? (
                                                            memoryNodes
                                                                .filter(n => n.type === 'mindmap')
                                                                .sort((a, b) => (a.surahId || 0) - (b.surahId || 0))
                                                                .map(node => (
                                                                    <tr key={node.id} className="node-row">
                                                                        <td>{node.surahId}. {getSurah(node.surahId!)?.name}</td>
                                                                        <td>
                                                                            <select
                                                                                value={getMaturityLevel(node.scheduler.interval)}
                                                                                onChange={(e) => {
                                                                                    setNodeMaturity(node.id, e.target.value as any);
                                                                                    setMemoryNodes(getMemoryNodes());
                                                                                }}
                                                                                className="maturity-select"
                                                                            >
                                                                                <option value="reset">Reset</option>
                                                                                <option value="medium">Medium</option>
                                                                                <option value="strong">Strong</option>
                                                                                <option value="mastered">Mastered</option>
                                                                            </select>
                                                                        </td>
                                                                        <td>{node.scheduler.interval}d</td>
                                                                        <td>{node.scheduler.easeFactor}</td>
                                                                        <td>{node.scheduler.repetition}</td>
                                                                        <td className={node.scheduler.dueDate <= new Date().toISOString().split('T')[0] ? 'status-overdue' : ''}>{node.scheduler.dueDate}</td>
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
                                                        <button
                                                            className="bulk-btn reset-mut"
                                                            onClick={(e) => { e.stopPropagation(); handleGroupMaturityReset('verse'); }}
                                                            title="Reset all verses maturity"
                                                        >
                                                            Reset Group
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                            {expandedGroups['verses'] && (
                                                <>
                                                    {/* Group by Surah */}
                                                    {Array.from(new Set(memoryNodes.filter(n => n.type === 'verse').map(n => n.surahId))).sort((a, b) => (a || 0) - (b || 0)).map(surahId => {
                                                        const surah = getSurah(surahId!);
                                                        const surahKey = `verse-surah-${surahId}`;
                                                        const surahNodes = memoryNodes
                                                            .filter(n => n.type === 'verse' && n.surahId === surahId)
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
                                                                            <button
                                                                                className="bulk-btn reset-mut"
                                                                                onClick={(e) => { e.stopPropagation(); handleGroupMaturityReset('verse', surahId!, surah?.name); }}
                                                                                title={`Reset all verses maturity for ${surah?.name}`}
                                                                            >
                                                                                Reset Group
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                {expandedGroups[surahKey] && surahNodes.map(node => (
                                                                    <tr key={node.id} className="node-row">
                                                                        <td>Ayat {node.startVerse}-{node.endVerse}</td>
                                                                        <td>
                                                                            <select
                                                                                value={getMaturityLevel(node.scheduler.interval)}
                                                                                onChange={(e) => {
                                                                                    setNodeMaturity(node.id, e.target.value as any);
                                                                                    setMemoryNodes(getMemoryNodes());
                                                                                }}
                                                                                className="maturity-select"
                                                                            >
                                                                                <option value="reset">Reset</option>
                                                                                <option value="medium">Medium</option>
                                                                                <option value="strong">Strong</option>
                                                                                <option value="mastered">Mastered</option>
                                                                            </select>
                                                                        </td>
                                                                        <td>{node.scheduler.interval}d</td>
                                                                        <td>{node.scheduler.easeFactor}</td>
                                                                        <td>{node.scheduler.repetition}</td>
                                                                        <td className={node.scheduler.dueDate <= new Date().toISOString().split('T')[0] ? 'status-overdue' : ''}>{node.scheduler.dueDate}</td>
                                                                    </tr>
                                                                ))}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                    {memoryNodes.filter(n => n.type === 'verse').length === 0 && (
                                                        <tr className="node-row"><td colSpan={6} style={{ fontStyle: 'italic', opacity: 0.5, paddingLeft: '2rem' }}>No verse nodes</td></tr>
                                                    )}
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
                padding: 'clamp(1rem, 4vw, 1.5rem)'
            }}>
                <div className="section-title mut-header"
                    onClick={() => setSectionsExpanded(s => ({ ...s, mutashabihat: !s.mutashabihat }))}
                    style={{
                        color: 'var(--accent)',
                        fontWeight: 700,
                        borderBottom: sectionsExpanded.mutashabihat ? '1px solid var(--border)' : 'none',
                        paddingBottom: sectionsExpanded.mutashabihat ? '1rem' : '0',
                        marginBottom: sectionsExpanded.mutashabihat ? '1.25rem' : '0',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '1rem',
                        cursor: 'pointer'
                    }}>
                    <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
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
                            <ChevronDown size={20} style={{ transform: sectionsExpanded.mutashabihat ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
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
                                                        const existing = decisions[decisionKey] || { status: 'pending', note: '' };
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
                                                                const existing = decisions[decisionKey] || { status: 'pending', note: '' };
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
                                                                                    onChange={e => handleDecisionUpdate(representativeAbs, { ...existing, status: e.target.value as any }, group.phraseId)}
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
                                                                                        }, group.phraseId);
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
                                                                                    value={existing.note || ''}
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                    onChange={e => handleDecisionUpdate(representativeAbs, { ...existing, note: e.target.value }, group.phraseId)}
                                                                                    className="maturity-select"
                                                                                    style={{ width: '100%', minWidth: '150px' }}
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

            {/* Similar Verses Slide-over Detail View */}
            {activeMutSlideOver && (() => {
                const decisionKey = activeMutSlideOver.id;
                const existing = decisions[decisionKey] || { status: 'pending', note: '' };
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
                                            onChange={e => handleDecisionUpdate(activeMutSlideOver.representativeAbs, { ...existing, status: e.target.value as any }, activeMutSlideOver.phraseId)}
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
                                                }, activeMutSlideOver.phraseId);
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
                                        value={existing.note || ''}
                                        onChange={e => handleDecisionUpdate(activeMutSlideOver.representativeAbs, { ...existing, note: e.target.value }, activeMutSlideOver.phraseId)}
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

            <DocumentationModal
                title="Settings & Setup"
                cards={[
                    {
                        title: "Active Part",
                        icon: Settings,
                        description: "Focus your learning by selecting one of the 4 main Quranic portions. This filters all progress data, including Similar Verses and Surah Status, to only show relevant information for your current goal.",
                        items: [
                            "As-Sab'ut-Tiwal (Long Seven): Surah 2 to 9.",
                            "Al-Mi'un (The Hundreds): Surah 10 to 18.",
                            "Al-Mathani (The Often-Repeated): Surah 19 to 33.",
                            "Al-Mufassal (The Brief): Surah 34 to 114."
                        ]
                    },
                    {
                        title: "Similar Verse Coverage",
                        icon: Brain,
                        description: "Track and resolve similar phrases (Mutashabihat) that often cause confusion during memorization.",
                        items: [
                            "Resolved: Mark a group as resolved once you've memorized the distinctions.",
                            "Notes: Add personal hints or mnemonic devices to help you differentiate similar verses.",
                            "Coverage: The progress bar reflects how many identified similarity groups you have addressed in the active part.",
                            "Custom: Use the 'Add Custom' button to create your own similarity comparisons between any two verses."
                        ]
                    },
                    {
                        title: "Status vs. Maturity",
                        icon: ShieldCheck,
                        description: "Understanding the difference between availability and review frequency.",
                        items: [
                            "Surah Status (Learned/New/Skipped): Determines if a surah is included in your review cycle. 'Skipped' surahs are hidden from all calculations.",
                            "Maturity Levels: Represents how well you know a verse or mindmap. Higher levels (Strong/Mastered) increase the interval between reviews.",
                            "Resetting: You can reset maturity for entire groups (e.g., all verses in a surah) using the 'Reset Group' buttons."
                        ]
                    },
                    {
                        title: "Cloud Sync & Backup",
                        icon: Database,
                        description: "Protect your progress and access it from any device.",
                        items: [
                            "Cloud Sync: Sign in to automatically sync your settings, notes, and maturity progress to the cloud.",
                            "Manual Backup: Use the 'Export Backup' feature to download a local copy of your data at any time.",
                            "Data Privacy: Your data is stored securely and only accessible by you when signed in."
                        ]
                    }
                ]}
            />

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

                @media (max-width: 1023px) {
                    .hide-mobile {
                        display: none !important;
                    }
                }

                @media (min-width: 1024px) {
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
                                    {activeSlideOverGroup.type === 'verse' ? <Book size={18} /> : <Map size={18} />}
                                </div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{activeSlideOverGroup.title}</h3>
                            </div>
                            <button className="close-btn" onClick={() => setActiveSlideOverGroup(null)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="slide-over-body">
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                                <button
                                    className="bulk-btn reset-mut"
                                    onClick={() => {
                                        if (window.confirm(`Are you sure you want to reset all nodes in ${activeSlideOverGroup.title}?`)) {
                                            if (activeSlideOverGroup.type === 'verse') {
                                                handleGroupMaturityReset('verse', activeSlideOverGroup.surahId, activeSlideOverGroup.title);
                                            } else {
                                                handleGroupMaturityReset(activeSlideOverGroup.type as any);
                                            }
                                            // Refresh local nodes
                                            const updated = getMemoryNodes();
                                            setMemoryNodes(updated);
                                            setActiveSlideOverGroup(prev => prev ? {
                                                ...prev,
                                                nodes: updated.filter(n => {
                                                    if (prev.type === 'verse') return n.type === 'verse' && n.surahId === prev.surahId;
                                                    return n.type === prev.type;
                                                })
                                            } : null);
                                        }
                                    }}
                                >
                                    Reset All
                                </button>
                            </div>

                            <div className="mobile-node-list">
                                {activeSlideOverGroup.nodes.length > 0 ? (
                                    activeSlideOverGroup.nodes
                                        .sort((a, b) => {
                                            if (activeSlideOverGroup.type === 'verse') return (a.startVerse || 0) - (b.startVerse || 0);
                                            if (activeSlideOverGroup.type === 'mindmap') return (a.surahId || 0) - (b.surahId || 0);
                                            return (a.partId || 0) - (b.partId || 0);
                                        })
                                        .map(node => (
                                            <div key={node.id} className="mobile-node-card">
                                                <div className="node-card-main">
                                                    <div className="node-target">
                                                        {activeSlideOverGroup.type === 'verse' ? `Ayat ${node.startVerse}-${node.endVerse}` :
                                                            activeSlideOverGroup.type === 'mindmap' ? `${node.surahId}. ${getSurah(node.surahId!)?.name}` :
                                                                `Part ${node.partId}`}
                                                    </div>
                                                    <select
                                                        value={getMaturityLevel(node.scheduler.interval)}
                                                        onChange={(e) => {
                                                            setNodeMaturity(node.id, e.target.value as any);
                                                            const updated = getMemoryNodes();
                                                            setMemoryNodes(updated);
                                                            // Update local nodes in slideover
                                                            setActiveSlideOverGroup(prev => prev ? {
                                                                ...prev,
                                                                nodes: updated.filter(n => {
                                                                    if (prev.type === 'verse') return n.type === 'verse' && n.surahId === prev.surahId;
                                                                    return n.type === prev.type;
                                                                })
                                                            } : null);
                                                        }}
                                                        className="maturity-select"
                                                        style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)' }}
                                                    >
                                                        <option value="reset">Reset</option>
                                                        <option value="medium">Medium</option>
                                                        <option value="strong">Strong</option>
                                                        <option value="mastered">Mastered</option>
                                                    </select>
                                                </div>
                                                <div className="node-card-details">
                                                    <div className="stat-item">
                                                        <span className="stat-label">Interval</span>
                                                        <span className="stat-value">{node.scheduler.interval}d</span>
                                                    </div>
                                                    <div className="stat-item">
                                                        <span className="stat-label">Ease</span>
                                                        <span className="stat-value">{node.scheduler.easeFactor}</span>
                                                    </div>
                                                    <div className="stat-item">
                                                        <span className="stat-label">Reps</span>
                                                        <span className="stat-value">{node.scheduler.repetition}</span>
                                                    </div>
                                                    <div className="stat-item">
                                                        <span className="stat-label">Next</span>
                                                        <span className={`stat-value ${node.scheduler.dueDate <= new Date().toISOString().split('T')[0] ? 'status-overdue' : ''}`}>
                                                            {node.scheduler.dueDate}
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
        </div>
    );
}
