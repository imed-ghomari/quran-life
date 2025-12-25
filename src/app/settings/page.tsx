'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { User } from '@supabase/supabase-js';
import { syncWithCloud, SyncResult } from '@/lib/sync';
import { SURAHS, getSurahsByPart, getSurah, parseQuranJson } from '@/lib/quranData';
import {
    AppSettings,
    getSettings,
    updateSetting,
    toggleSurahLearned,
    toggleSurahSkipped,
    isSurahSkipped,
    getSurahLearnedStatus,
    setSurahMaturity,
    setGroupMaturity,
    resetAllMaturity,
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
import { Check, Clock, PauseCircle, RotateCcw, Download,
    Upload,
    ShieldCheck,
    Database,
    HelpCircle,
    Settings,
    Brain,
    Plus,
    Eye,
    ChevronDown,
    Map,
    Book,
    Activity
} from 'lucide-react';
import HelpSection from '@/components/HelpSection';
import AddCustomMutashabihModal from '@/components/AddCustomMutashabihModal';
import { getAllMutashabihatRefs, absoluteToSurahAyah, getMutashabihatForAbsolute, surahAyahToAbsolute } from '@/lib/mutashabihat';
import { MemoryNode, getMemoryNodes } from '@/lib/storage';

const MUT_STATES: { value: MutashabihatDecision['status']; label: string }[] = [
    { value: 'pending', label: 'Pending Review' },
    { value: 'ignored', label: 'Ignored (Not similar)' },
    { value: 'solved_mindmap', label: 'Solved by Mindmap' },
    { value: 'solved_note', label: 'Solved by Note' },
];

type MaturityLevel = 'reset' | 'medium' | 'strong' | 'mastered';

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

    const toggleGroup = (groupId: string) => {
        setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
    };

    const handleGroupMaturityReset = (type: 'verse' | 'mindmap' | 'part_mindmap') => {
        const typeLabel = type === 'verse' ? 'all Verses' : (type === 'mindmap' ? 'all Surah Mindmaps' : 'all Part Mindmaps');
        if (!window.confirm(`Are you sure you want to reset the maturity of ${typeLabel}?`)) return;
        setGroupMaturity(type, 'reset');
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
            .then(data => setVerses(parseQuranJson(data)))
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
        const msg = `Are you sure you want to mark ALL surahs in Part ${settings.activePart} as ${status.toUpperCase()}? This will override their current individual statuses.`;
        if (!window.confirm(msg)) return;

        const surahIds = activePartSurahs.map(s => s.id);
        bulkSetSurahStatus(surahIds, status);
        setVersion(v => v + 1);
    };

    const handleResetMutashabihat = () => {
        const msg = `Are you sure you want to reset ALL mutashabihat decisions for Part ${settings.activePart}? This cannot be undone.`;
        if (!window.confirm(msg)) return;

        const absoluteAyat = getAllMutashabihatRefs().filter(abs => {
            const ref = absoluteToSurahAyah(abs);
            const surah = getSurah(ref.surahId);
            return surah && surah.part === settings.activePart;
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
            if (!surah || surah.part !== settings.activePart) return;
            
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
        <div className="content-wrapper">
            <h1>Settings</h1>

            <div className="settings-grid">
                <div className="card modern-card" style={{ padding: '1.5rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px' }}>
                    <div className="section-title" style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: '0.75rem' }}>
                        <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                            <Database size={18} />
                        </div>
                        <span>Cloud Sync</span>
                    </div>
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
                                    style={{ width: '100%', padding: '0.85rem' }}
                                >
                                    {isSyncing ? 'Syncing...' : 'Sync Now'}
                                </button>
                                <button 
                                    className="btn btn-secondary"
                                    onClick={() => supabase.auth.signOut()}
                                    style={{ width: '100%', padding: '0.85rem', background: 'transparent', border: '1px solid var(--border)' }}
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
                                style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)' }}
                            />
                            <input
                                type="password"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)' }}
                            />
                            {authError && <p style={{ color: '#ef4444', fontSize: '0.85rem' }}>{authError}</p>}
                            <button 
                                type="submit"
                                className="btn btn-primary"
                                disabled={isSyncing}
                                style={{ width: '100%', padding: '0.85rem' }}
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
                </div>

                <div className="card modern-card" style={{ padding: '1.5rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px' }}>
                    <div className="section-title" style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: '0.75rem' }}>
                        <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                            <Download size={18} />
                        </div>
                        <span>Backup & Restore</span>
                    </div>
                    <p style={{ marginBottom: '1rem', color: 'var(--foreground-secondary)', fontSize: '0.9rem' }}>Secure your progress or transfer to another device.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <button className="btn btn-secondary" onClick={handleExport} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0.85rem' }}>
                            <Download size={18} /> Export
                        </button>
                        <label className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0.85rem', cursor: 'pointer' }}>
                            <Upload size={18} /> Import
                            <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
                        </label>
                    </div>
                </div>

                <div className="card modern-card" style={{ padding: '1.5rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px' }}>
                    <div className="section-title" style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: '0.75rem' }}>
                        <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                            <Clock size={18} />
                        </div>
                        <span>Completion Schedule</span>
                    </div>
                    <p style={{ marginBottom: '1rem', color: 'var(--foreground-secondary)', fontSize: '0.9rem' }}>How many days to complete the active part.</p>
                    <input
                        type="number"
                        min={5}
                        max={180}
                        value={settings.completionDays}
                        onChange={e => handleCompletionDays(parseInt(e.target.value || '0', 10))}
                        style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)' }}
                    />
                </div>

                <div className="card modern-card" style={{ padding: '1.5rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px' }}>
                    <div className="section-title" style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: '0.75rem' }}>
                        <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                            <PauseCircle size={18} />
                        </div>
                        <span>Active Part</span>
                    </div>
                    <div className="part-selector" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                        {[
                            { id: 1, name: "As-Sab'ut-Tiwal" },
                            { id: 2, name: "Al-Mi'un" },
                            { id: 3, name: "Al-Mathani" },
                            { id: 4, name: "Al-Mufassal" }
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
                                <div className="part-number" style={{ fontSize: '1.4rem', fontWeight: 800, color: settings.activePart === p.id ? 'var(--accent)' : 'var(--foreground)' }}>{p.id}</div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: settings.activePart === p.id ? 'var(--accent)' : 'var(--foreground-secondary)' }}>{p.name}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--foreground-secondary)', opacity: 0.8 }}>{getSurahsByPart(p.id as QuranPart).length} surahs</div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
                <div className="card modern-card" style={{ padding: '1.5rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px' }}>
                    <div className="section-title" style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: '0.75rem' }}>
                        <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                            <Check size={18} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                            <span>Surah Status</span>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="bulk-btn learned" onClick={() => handleBulkStatus('learned')} title="Mark all as Learned">All Learned</button>
                                <button className="bulk-btn new" onClick={() => handleBulkStatus('new')} title="Mark all as New">All New</button>
                                <button className="bulk-btn skipped" onClick={() => handleBulkStatus('skipped')} title="Mark all as Skipped">All Skipped</button>
                            </div>
                        </div>
                    </div>
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
                            let statusLabel = 'Not Learned';
                            if (isLearned) {
                                statusColor = '#22c55e'; // Learned (Green)
                                statusLabel = 'Learned';
                            } else if (skipped) {
                                statusColor = '#94a3b8'; // Skipped (Grey)
                                statusLabel = 'Skipped';
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
                </div>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
                <div className="card modern-card" style={{ padding: '1.5rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px' }}>
                    <div className="section-title" 
                         onClick={() => setShowDebugNodes(!showDebugNodes)}
                         style={{ color: 'var(--accent)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                                <Activity size={18} />
                            </div>
                            <span>Knowledge Tracking</span>
                        </div>
                        <ChevronDown size={20} style={{ transform: showDebugNodes ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    </div>
                    
                    {showDebugNodes && (
                        <div style={{ marginTop: '1.5rem', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                            <p style={{ color: 'var(--foreground-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                                This section shows your active memory nodes and their review schedules.
                            </p>
                            
                            <table className="debug-table" style={{ minWidth: '800px' }}>
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
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                    <ChevronDown size={14} style={{ transform: expandedGroups[surahKey] ? 'rotate(180deg)' : 'none' }} />
                                                                    {surah?.id}. {surah?.name} ({surahNodes.length})
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
            </div>

            <div className="card modern-card" style={{ marginTop: '1.5rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem' }}>
                <div className="section-title mut-header" style={{ color: 'var(--accent)', fontWeight: 700, borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
                    <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                        <Check size={18} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <span>Mutashabihat Coverage (Active Part)</span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button 
                                className="bulk-btn learned" 
                                onClick={() => {
                                    setTargetSurahId(undefined);
                                    setIsAddModalOpen(true);
                                }}
                                title="Add Custom Mutashabih"
                                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                                <Plus size={14} /> Add Custom
                            </button>
                            <button 
                                className="bulk-btn reset-mut" 
                                onClick={handleResetMutashabihat}
                                title="Reset all mutashabihat decisions for this part"
                                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                                <RotateCcw size={14} /> Reset Decisions
                            </button>
                        </div>
                    </div>
                </div>
                <p className="mut-subheader" style={{ color: 'var(--foreground-secondary)', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                    Surahs with mutashabihat in this part. Tap to expand and annotate similar ayat.
                </p>
                {mutashabihatSurahs.length === 0 ? (
                    <div className="empty-state">
                        <p>No mutashabihat entries for this part.</p>
                    </div>
                ) : (
                    <div style={{ marginTop: '1.5rem', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                        <table className="debug-table" style={{ minWidth: '800px' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: '50px' }}></th>
                                    <th>Verse / Phrase</th>
                                    <th>Status</th>
                                    <th>Note</th>
                                    <th>Matches</th>
                                    <th>Actions</th>
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
                                                                            {group.ayahIds.length > 1 ? `Ayat ${group.ayahIds.sort((a,b)=>a-b).join(', ')}` : `Ayah ${group.ayahIds[0]}`}
                                                                        </div>
                                                                        <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>
                                                                            {group.phraseId.startsWith('custom-') ? 'Custom' : `Phrase #${group.phraseId}`}
                                                                        </div>
                                                                    </td>
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
                                                                    <td>{entry.matches.length - 1} matches</td>
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
                                                                            title={isConfirmed ? "Resolve" : "Not Resolved"}
                                                                            style={{ minWidth: '100px' }}
                                                                        >
                                                                            {isConfirmed ? 'Resolve' : 'Not Resolved'}
                                                                        </button>
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

            <HelpSection
                cards={[
                    {
                        title: "Active Part",
                        icon: Settings,
                        description: "Manage your current focus by switching between the 4 main parts based on traditional classifications.",
                        items: [
                            "As-Sab'ut-Tiwal (Long Seven): Surah 2 to 9.",
                            "Al-Mi'un (The Hundreds): Surah 10 to 18.",
                            "Al-Mathani (The Often-Repeated): Surah 19 to 33.",
                            "Al-Mufassal (The Brief): Surah 34 to 114."
                        ]
                    },
                    {
                        title: "Mutashabihat Coverage",
                        icon: Brain,
                        description: "Manage notes for similar verses to prevent confusion during reviews.",
                        items: [
                            "Use the notes section to write down your personal distinctions for mutashabihat verses.",
                            "The coverage indicator shows how many identified similarity conflicts you have addressed.",
                            "Once addressed, these verses won't trigger 'similarity warnings' in your Todo tab."
                        ]
                    },
                    {
                        title: "Status vs. Maturity",
                        icon: ShieldCheck,
                        description: "It is important to understand the difference between a Surah's Status and its Maturity.",
                        items: [
                            "Surah Status (Learned/Skipped): Manages availability. Setting a surah to 'Learned' adds it to your review cycle; 'Skipped' removes it entirely.",
                            "Surah Maturity (Reset/Medium/Strong/Mastered): Manages frequency. This represents how well you know the verses. Higher maturity means the verses appear less often in reviews.",
                            "Relation: Status determines IF you review it; Maturity determines WHEN."
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
                `}</style>

            <AddCustomMutashabihModal 
                isOpen={isAddModalOpen} 
                onClose={() => setIsAddModalOpen(false)} 
                onSave={handleAddCustomMutashabih}
                initialSurahId={targetSurahId}
            />
        </div>
    );
}
