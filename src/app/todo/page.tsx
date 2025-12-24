'use client';

import { useEffect, useMemo, useState } from 'react';
import { SURAHS, getSurah, getSurahsByPart, parseQuranJson } from '@/lib/quranData';
import {
    getMindMaps,
    saveMindMap,
    getPartMindMaps,
    savePartMindMap,
    getSettings,
    getReviewErrors,
    getSuspendedAnchors,
    clearAnchorIssues,
    getMutashabihatDecisions,
    setMutashabihatDecision,
    getCustomMutashabihat,
    saveCustomMutashabih,
    CustomMutashabih,
    isSurahSkipped,
    MutashabihatDecision,
} from '@/lib/storage';
import { getMutashabihatForAbsolute, absoluteToSurahAyah } from '@/lib/mutashabihat';
import { QuranPart } from '@/lib/types';
import { Check, ImageIcon, Map, MapPinned, AlertTriangle, ShieldAlert, SplitSquareHorizontal, ChevronDown, Brain } from 'lucide-react';
import HelpSection from '@/components/HelpSection';

const MUT_STATES: { value: MutashabihatDecision['status']; label: string }[] = [
    { value: 'pending', label: 'Pending Review' },
    { value: 'ignored', label: 'Ignored (Not similar)' },
    { value: 'solved_mindmap', label: 'Solved by Mindmap' },
    { value: 'solved_note', label: 'Solved by Note' },
];

/**
 * Renders Arabic text with highlighted word ranges
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

type AnchorBuilderState = { breaks: number[]; labels: Record<number, string> };

function AnchorBuilder({
    surahId,
    verseCount,
    builderState,
    onAddPointer,
    onMovePointer,
    onRemovePointer,
    onLabelChange,
    onSave,
}: {
    surahId: number;
    verseCount: number;
    builderState: AnchorBuilderState;
    onAddPointer: () => void;
    onMovePointer: (idx: number, value: number) => void;
    onRemovePointer: (idx: number) => void;
    onLabelChange: (idx: number, value: string) => void;
    onSave: () => void;
}) {
    const breaks = [...builderState.breaks].sort((a, b) => a - b).filter(b => b > 0 && b < verseCount);
    const boundaries = [1, ...breaks, verseCount + 1];
    const segments = boundaries.slice(0, -1).map((start, idx) => ({ start, end: boundaries[idx + 1] - 1, idx }));

    return (
        <div className="anchor-builder" style={{ padding: '1rem', background: 'var(--background-secondary)', borderRadius: '16px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                        <SplitSquareHorizontal size={18} />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '1rem' }}>Define Anchors</span>
                </div>
                <button className="btn btn-secondary" style={{ padding: '0.5rem 0.85rem', fontSize: '0.85rem' }} onClick={onAddPointer}>
                    + Add Split
                </button>
            </div>

            <div className="anchor-bar-wrapper" style={{ margin: '0.5rem 0' }}>
                <div className="anchor-bar" style={{ height: '24px', borderRadius: '12px' }}>
                    {segments.map(seg => (
                        <div key={`${surahId}-seg-${seg.idx}`} className="anchor-bar-segment" style={{ flex: seg.end - seg.start + 1, borderRight: '1px solid rgba(255,255,255,0.2)' }} />
                    ))}
                </div>
                <div className="anchor-pointers">
                    {breaks.map((b, i) => (
                        <div
                            key={`${surahId}-pointer-${i}`}
                            className="anchor-pointer"
                            style={{ left: `${(b / verseCount) * 100}%`, height: '36px', width: '3px', borderRadius: '2px' }}
                            title={`Ayah ${b}`}
                        />
                    ))}
                </div>
            </div>

            {breaks.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--background)', padding: '1rem', borderRadius: '12px', border: '1px dotted var(--border)' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--foreground-secondary)' }}>Adjust Pointers</span>
                    {breaks.map((b, i) => (
                        <div key={`${surahId}-control-${i}`} className="pointer-control" style={{ background: 'var(--background-secondary)', padding: '0.5rem 0.75rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, minWidth: '40px' }}>#{i + 1}</span>
                            <input
                                type="range"
                                min={1}
                                max={verseCount - 1}
                                value={b}
                                onChange={e => onMovePointer(i, parseInt(e.target.value, 10))}
                                style={{ flex: 1, accentColor: 'var(--accent)' }}
                            />
                            <input
                                type="number"
                                min={1}
                                max={verseCount - 1}
                                value={b}
                                onChange={e => onMovePointer(i, parseInt(e.target.value || '1', 10))}
                                style={{ width: 64, borderRadius: 8, border: '1px solid var(--border)', padding: '0.35rem 0.45rem', fontSize: '0.85rem', fontWeight: 700 }}
                            />
                            <button className="btn btn-secondary" style={{ padding: '0.35rem 0.65rem', color: 'var(--danger)' }} onClick={() => onRemovePointer(i)}>×</button>
                        </div>
                    ))}
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--foreground-secondary)' }}>Segment Labels</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
                    {segments.map(seg => (
                        <div key={`${surahId}-label-${seg.idx}`} className="segment-label" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.75rem', background: 'var(--background)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--accent)' }}>Ayahs {seg.start} - {seg.end}</span>
                            <input
                                className="anchor-input"
                                type="text"
                                placeholder="Label (e.g. Story of Adam)"
                                value={builderState.labels[seg.idx] || ''}
                                onChange={e => onLabelChange(seg.idx, e.target.value)}
                                style={{ border: 'none', background: 'transparent', padding: '0.25rem 0', borderBottom: '1px solid var(--border)', borderRadius: 0 }}
                            />
                        </div>
                    ))}
                </div>
            </div>

            <button className="btn btn-primary btn-full" onClick={onSave} style={{ marginTop: '0.5rem', padding: '0.85rem' }}>
                Confirm & Save Anchors
            </button>
        </div>
    );
}

export default function TodoPage() {
    const [mindmaps, setMindmaps] = useState(getMindMaps());
    const [partMindmaps, setPartMindmaps] = useState(getPartMindMaps());
    const [settingsVersion, setSettingsVersion] = useState(0);
    const [anchorBuilders, setAnchorBuilders] = useState<Record<number, AnchorBuilderState>>({});
    const [fixDrafts, setFixDrafts] = useState<Record<string, string>>({});
    const [decisions, setDecisions] = useState<Record<string, any>>(getMutashabihatDecisions());
    const [verses, setVerses] = useState<{ surahId: number; ayahId: number; text: string }[]>([]);
    const [expandedSurahs, setExpandedSurahs] = useState<Record<number, boolean>>({});
    const [expandedMutItems, setExpandedMutItems] = useState<Record<string, boolean>>({});
    const settings = getSettings();

    useEffect(() => {
        setMindmaps(getMindMaps());
        setPartMindmaps(getPartMindMaps());
        setDecisions(getMutashabihatDecisions());
    }, [settingsVersion]);

    useEffect(() => {
        fetch('/qpc-hafs-word-by-word.json')
            .then(res => res.json())
            .then(data => setVerses(parseQuranJson(data)))
            .catch(() => setVerses([]));
    }, []);

    const toggleSurahExpand = (id: number) => setExpandedSurahs(prev => ({ ...prev, [id]: !prev[id] }));

    const activePart = settings.activePart;

    const surahTasks = useMemo(() => {
        const eligible = SURAHS.filter(s => s.part === activePart && !isSurahSkipped(s.id));
        return eligible
            .map(s => ({ surah: s, mindmap: mindmaps[s.id] }))
            .sort((a, b) => {
                const aIncomplete = !a.mindmap || !a.mindmap.isComplete || !a.mindmap.imageUrl;
                const bIncomplete = !b.mindmap || !b.mindmap.isComplete || !b.mindmap.imageUrl;
                if (aIncomplete !== bIncomplete) return aIncomplete ? -1 : 1;
                return a.surah.id - b.surah.id;
            });
    }, [mindmaps, settingsVersion, activePart]);

    const incompleteSurahMaps = surahTasks.filter(t => !t.mindmap || !t.mindmap.isComplete || !t.mindmap.imageUrl);

    const partTasks = useMemo(() => {
        const parts: QuranPart[] = [1, 2, 3, 4];
        return parts.map(p => ({ part: p, mindmap: partMindmaps[p] }));
    }, [partMindmaps, settingsVersion]);

    const suspendedAnchors = getSuspendedAnchors();

    const reviewErrors = getReviewErrors().filter(e => e.absoluteAyah);
    const similarityItems = reviewErrors
        .map(err => {
            const absolute = err.absoluteAyah!;
            const muts = getMutashabihatForAbsolute(absolute);
            return { err, muts };
        })
        .filter(entry => entry.muts.length > 0)
        .filter(entry => {
            const absolute = entry.err.absoluteAyah!;
            // Check if generic verse decision exists and is confirmed or ignored
            const verseDecision = decisions[absolute.toString()];
            if (verseDecision?.status === 'ignored' || !!verseDecision?.confirmedAt) return false;

            // Check if any specific phrase decisions are confirmed
            const anyPhraseConfirmed = entry.muts.some((m: any) => {
                const phraseDecision = decisions[`${absolute}-${m.phraseId}`];
                return !!phraseDecision?.confirmedAt;
            });

            return !anyPhraseConfirmed;
        });

    const groupedSimilarity = useMemo(() => {
        const groups: Record<number, typeof similarityItems> = {};
        similarityItems.forEach(item => {
            const ref = absoluteToSurahAyah(item.err.absoluteAyah!);
            if (!groups[ref.surahId]) groups[ref.surahId] = [];
            groups[ref.surahId].push(item);
        });
        return Object.entries(groups).map(([surahId, items]) => ({
            surah: getSurah(parseInt(surahId)),
            items,
            count: items.length
        })).filter(g => g.surah);
    }, [similarityItems]);

    const shouldCollapseSurahSection = false; // always show active part section
    const shouldCollapsePartSection = false; // always show all part cards
    const shouldCollapseFixSection = false; // show even if empty
    const shouldCollapseSimilarity = false; // show even if empty

    const handleSurahImageUpdate = (surahId: number, file: File | null) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            const imageUrl = reader.result as string;
            const existing = mindmaps[surahId] || { surahId, anchors: [], imageUrl: null, isComplete: false };
            saveMindMap({ ...existing, imageUrl, isComplete: !!imageUrl && existing.isComplete });
            setSettingsVersion(v => v + 1);
        };
        reader.readAsDataURL(file);
    };

    const getBuilderState = (surahId: number) => {
        if (anchorBuilders[surahId]) return anchorBuilders[surahId];
        const surahMeta = SURAHS.find(s => s.id === surahId);
        const verseCount = surahMeta?.verseCount || 1;
        const mindmap = mindmaps[surahId];
        if (mindmap?.anchors?.length) {
            const sorted = [...mindmap.anchors].sort((a, b) => a.startVerse - b.startVerse);
            const breaks = sorted.slice(0, -1).map(a => Math.min(Math.max(1, a.endVerse + 1), verseCount - 1));
            const labels: Record<number, string> = {};
            sorted.forEach((a, idx) => { labels[idx] = a.label; });
            return { breaks, labels };
        }
        return { breaks: [], labels: {} };
    };

    const handleAddPointer = (surahId: number, verseCount: number) => {
        const current = getBuilderState(surahId);
        const sorted = [...current.breaks].sort((a, b) => a - b);
        const last = sorted[sorted.length - 1] || 0;
        const seed = Math.min(verseCount - 1, Math.max(last + 1, 1));
        const nextBreaks = Array.from(new Set([...current.breaks, seed])).sort((a, b) => a - b).filter(b => b > 0 && b < verseCount);
        setAnchorBuilders(prev => ({ ...prev, [surahId]: { ...current, breaks: nextBreaks } }));
    };

    const handleMovePointer = (surahId: number, index: number, value: number, verseCount: number) => {
        const current = getBuilderState(surahId);
        const clamped = Math.min(Math.max(1, value), verseCount - 1);
        const nextBreaks = [...current.breaks];
        nextBreaks[index] = clamped;
        const uniqueSorted = Array.from(new Set(nextBreaks)).sort((a, b) => a - b);
        setAnchorBuilders(prev => ({ ...prev, [surahId]: { ...current, breaks: uniqueSorted } }));
    };

    const handleRemovePointer = (surahId: number, index: number) => {
        const current = getBuilderState(surahId);
        const nextBreaks = current.breaks.filter((_, i) => i !== index);
        setAnchorBuilders(prev => ({ ...prev, [surahId]: { ...current, breaks: nextBreaks } }));
    };

    const handleLabelChange = (surahId: number, segmentIndex: number, value: string) => {
        const current = getBuilderState(surahId);
        setAnchorBuilders(prev => ({
            ...prev,
            [surahId]: { ...current, labels: { ...current.labels, [segmentIndex]: value } },
        }));
    };

    const handleSaveAnchors = (surahId: number, verseCount: number) => {
        const builder = getBuilderState(surahId);
        const boundaries = [1, ...builder.breaks, verseCount + 1];
        const anchors = boundaries.slice(0, -1).map((start, idx) => {
            const end = boundaries[idx + 1] - 1;
            const label = builder.labels[idx] || '';
            return { start, end, label };
        }).filter(a => a.label.trim().length > 0);

        const existing = mindmaps[surahId] || { surahId, anchors: [], imageUrl: null, isComplete: false };
        const newAnchors = anchors.map(a => ({
            id: `anchor-${surahId}-${a.start}-${a.end}`,
            startVerse: a.start,
            endVerse: a.end,
            label: a.label,
        }));
        saveMindMap({ ...existing, anchors: newAnchors });
        setSettingsVersion(v => v + 1);
    };

    const handleMarkComplete = (surahId: number) => {
        const existing = mindmaps[surahId] || { surahId, anchors: [], imageUrl: null, isComplete: false };
        saveMindMap({ ...existing, isComplete: true });
        setSettingsVersion(v => v + 1);
    };

    const handlePartMindmapUpdate = (part: QuranPart, file: File | null) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            const imageUrl = reader.result as string;
            const existing = partMindmaps[part] || { partId: part, imageUrl: null, description: '', isComplete: false };
            savePartMindMap({ ...existing, imageUrl, isComplete: !!imageUrl && existing.isComplete });
            setSettingsVersion(v => v + 1);
        };
        reader.readAsDataURL(file);
    };

    const handlePartComplete = (part: QuranPart) => {
        const existing = partMindmaps[part] || { partId: part, imageUrl: null, description: '', isComplete: false };
        savePartMindMap({ ...existing, isComplete: true });
        setSettingsVersion(v => v + 1);
    };

    const handleFixConfirm = (surahId: number, anchorId: string) => {
        const key = `${surahId}-${anchorId}`;
        const newUrl = fixDrafts[key];
        const existing = mindmaps[surahId] || { surahId, anchors: [], imageUrl: null, isComplete: false };
        saveMindMap({ ...existing, imageUrl: newUrl || existing.imageUrl, isComplete: true });
        clearAnchorIssues(surahId, anchorId);
        setSettingsVersion(v => v + 1);
    };

    const handleSimilarityDecision = (absoluteAyah: number, status: MutashabihatDecision['status'], phraseId?: string, confirm: boolean = true) => {
        if (phraseId?.startsWith('custom-')) {
            const customId = phraseId.replace('custom-', '');
            const allCustoms = getCustomMutashabihat();
            const mut = allCustoms.find((m: CustomMutashabih) => m.id === customId);
            if (mut) {
                mut.status = status;
                saveCustomMutashabih(mut);
            }
        }

        const key = phraseId ? `${absoluteAyah}-${phraseId}` : absoluteAyah.toString();
        const existing = decisions[key] || { status: 'pending', note: '' };
        setMutashabihatDecision(key as any, {
            ...existing,
            status,
            confirmedAt: confirm ? new Date().toISOString() : existing.confirmedAt
        });
        setSettingsVersion(v => v + 1);
    };

    return (
        <div className="content-wrapper" style={{ maxWidth: '1000px', padding: '1rem' }}>
            <h1>Todo</h1>

            <div className="card">
                <div className="section-title"><Map size={18} /> <span>Part Mindmaps</span></div>
                <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1rem' }}>Overall mindmaps for each of the 4 Quran parts.</p>
                <div className="part-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    {partTasks.map(({ part, mindmap }) => {
                        const isIncomplete = !mindmap || !mindmap.imageUrl || !mindmap.isComplete;
                        const isActive = part === activePart;
                        return (
                            <div key={part} className={`surah-item modern-card ${isActive ? 'active-part' : ''}`} style={{
                                background: 'var(--background-secondary)',
                                borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                                padding: '1rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.75rem',
                                boxShadow: isActive ? '0 4px 12px rgba(14, 165, 233, 0.1)' : 'none'
                            }}>
                                <div className="surah-info">
                                    <div className="surah-number" style={{ background: isActive ? 'var(--accent)' : 'var(--foreground-secondary)' }}>P{part}</div>
                                    <div className="surah-names">
                                        <span className="surah-english" style={{ fontWeight: 700 }}>Part {part}</span>
                                        <span className="surah-english" style={{ color: 'var(--foreground-secondary)', fontSize: '0.8rem' }}>{getSurahsByPart(part).length} surahs</span>
                                    </div>
                                    {isActive && <span className="status-badge learned" style={{ fontSize: '0.65rem', marginLeft: 'auto' }}>Active</span>}
                                </div>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <label className="upload-tile" style={{ justifyContent: 'center' }}>
                                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handlePartMindmapUpdate(part, e.target.files?.[0] || null)} />
                                        <span style={{ fontSize: '0.85rem' }}><ImageIcon size={16} /> {mindmap?.imageUrl ? 'Replace' : 'Upload'}</span>
                                    </label>
                                    <button
                                        className={`btn ${!mindmap?.imageUrl ? 'btn-secondary' : 'btn-success'}`}
                                        disabled={!mindmap?.imageUrl}
                                        onClick={() => handlePartComplete(part)}
                                        style={{ width: '100%', fontSize: '0.85rem' }}
                                    >
                                        <Check size={16} /> Mark complete
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="card">
                <div className="section-title"><AlertTriangle size={18} /> <span>Fix Mindmaps</span></div>
                <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1rem' }}>Anchors that failed 3 times are suspended. Upload updated mindmaps to fix.</p>
                {suspendedAnchors.length === 0 ? (
                    <div className="empty-state" style={{ background: 'var(--success-bg)', borderRadius: '12px', padding: '2rem' }}>
                        <Check size={32} color="var(--success)" style={{ marginBottom: '0.5rem' }} />
                        <p style={{ color: 'var(--success)', fontWeight: 600 }}>No suspended anchors! Great job.</p>
                    </div>
                ) : (
                    <div className="modern-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1.5rem' }}>
                        {suspendedAnchors.map(issue => {
                            const key = `${issue.surahId}-${issue.anchorId}`;
                            const surah = getSurah(issue.surahId);
                            return (
                                <div key={key} className="surah-item modern-card" style={{ borderColor: 'var(--danger)', background: 'rgba(239, 68, 68, 0.02)', padding: '1rem', marginBottom: '0' }}>
                                    <div className="surah-info" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                                        <div className="surah-number" style={{ background: 'var(--danger)' }}>{issue.surahId}</div>
                                        <div className="surah-names">
                                            <span className="surah-arabic">{surah?.arabicName}</span>
                                            <span className="surah-english">{surah?.name} — {issue.label}</span>
                                        </div>
                                        <span className="status-badge not-remembered" style={{ marginLeft: 'auto', background: 'var(--danger)', color: 'white' }}>Suspended</span>
                                    </div>
                                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <label className="upload-tile" style={{ justifyContent: 'center' }}>
                                            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                const reader = new FileReader();
                                                reader.onloadend = () => {
                                                    const url = reader.result as string;
                                                    setFixDrafts(prev => ({ ...prev, [key]: url }));
                                                };
                                                reader.readAsDataURL(file);
                                            }} />
                                            <span style={{ fontSize: '0.85rem' }}><ImageIcon size={16} /> {fixDrafts[key] ? 'Replace update' : 'Upload fix'}</span>
                                        </label>
                                        <button className="btn btn-primary" style={{ fontSize: '0.85rem' }} onClick={() => handleFixConfirm(issue.surahId, issue.anchorId)} disabled={!fixDrafts[key]}>
                                            <Check size={16} /> Confirm Fix
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="card">
                <div className="section-title"><ShieldAlert size={18} /> <span>Similar Verses Checks</span></div>
                <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1rem' }}>Review errors that might be due to similar verses (Mutashabihat). Confirmed items will disappear.</p>
                {groupedSimilarity.length === 0 ? (
                    <div className="empty-state" style={{ background: 'var(--success-bg)', borderRadius: '12px', padding: '2rem' }}>
                        <Check size={32} color="var(--success)" style={{ marginBottom: '0.5rem' }} />
                        <p style={{ color: 'var(--success)', fontWeight: 600 }}>No similarity checks needed.</p>
                    </div>
                ) : (
                    <div className="mutashabihat-fold">
                        {groupedSimilarity.map(({ surah, items, count }) => {
                            const isOpen = expandedSurahs[surah!.id] ?? false;
                            return (
                                <div key={surah!.id} className="mut-fold-item">
                                    <button
                                        className={`mut-fold-header ${isOpen ? 'open' : ''}`}
                                        onClick={() => setExpandedSurahs(prev => ({ ...prev, [surah!.id]: !isOpen }))}
                                    >
                                        <div className="surah-number">{surah!.id}</div>
                                        <div className="surah-names">
                                            <span className="surah-arabic">{surah!.arabicName}</span>
                                            <span className="surah-english">{surah!.name}</span>
                                        </div>
                                        <span className="status-badge partial">{count}</span>
                                        <span className="mut-chevron">{isOpen ? '▴' : '▾'}</span>
                                    </button>
                                    {isOpen && (
                                        <div className="mut-fold-body">
                                            {items.map(({ err, muts }) => {
                                                const abs = err.absoluteAyah!;
                                                const ref = absoluteToSurahAyah(abs);
                                                const surahMeta = getSurah(ref.surahId);
                                                const baseVerse = verses.find(v => v.surahId === ref.surahId && v.ayahId === ref.ayahId);

                                                return (
                                                    <div key={abs} className="mut-verse-group">
                                                        {muts.map((entry: any) => {
                                                            const decisionKey = `${abs}-${entry.phraseId}`;
                                                            const existing = decisions[decisionKey] || { status: 'pending', note: '' };
                                                            const isConfirmed = !!existing.confirmedAt;

                                                            return (
                                                                <div key={decisionKey} className={`mut-context-block ${isConfirmed ? 'confirmed' : ''}`}>
                                                                    <div className="mut-text">
                                                                        <div className="mut-text-label">
                                                                            Surah {surahMeta?.name} - {ref.ayahId} {entry.phraseId.startsWith('custom-') ? '' : `(Phrase #${entry.phraseId})`}
                                                                        </div>
                                                                        <div className="mut-context">
                                                                            {baseVerse && (
                                                                                <p className="arabic-text mut-core">
                                                                                    <span className="mut-ayah-tag">{ref.ayahId}</span>
                                                                                    <HighlightedVerse
                                                                                        text={baseVerse.text}
                                                                                        range={entry.meta.sourceAbs === abs ? entry.meta.sourceRange : entry.meta.matches.find((m: any) => m.absolute === abs)?.wordRange}
                                                                                    />
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    <div className="mut-matches">
                                                                        {(() => {
                                                                            const matches = entry.matches.filter((m: any) => m !== abs);
                                                                            const isExpanded = expandedMutItems[decisionKey] || false;
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
                                                                                            <div key={`${decisionKey}-match-${idx}`} className="mut-text match-item">
                                                                                                <div className="mut-text-label">
                                                                                                    Compare: Surah {msurah?.name} - {mref.ayahId}
                                                                                                </div>
                                                                                                <div className="mut-context">
                                                                                                    {mVerse && (
                                                                                                        <p className="arabic-text mut-core">
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
                                                                                            onClick={() => setExpandedMutItems(prev => ({ ...prev, [decisionKey]: !isExpanded }))}
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

                                                                    <div className="mut-actions-v2">
                                                                        <div className="action-row">
                                                                            <select
                                                                                value={existing.status}
                                                                                onChange={e => handleSimilarityDecision(abs, e.target.value as any, entry.phraseId, e.target.value === 'ignored')}
                                                                                className={existing.status !== 'pending' ? 'active' : ''}
                                                                            >
                                                                                {MUT_STATES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                                                            </select>

                                                                            <button
                                                                                className={`btn-confirm ${isConfirmed ? 'confirmed' : ''}`}
                                                                                onClick={() => handleSimilarityDecision(abs, existing.status, entry.phraseId, true)}
                                                                            >
                                                                                {isConfirmed ? <Check size={16} /> : 'Confirm Fix'}
                                                                            </button>
                                                                        </div>
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Add distinction note..."
                                                                            value={existing.note || ''}
                                                                            onChange={e => {
                                                                                const key = `${abs}-${entry.phraseId}`;
                                                                                setMutashabihatDecision(key as any, { ...existing, note: e.target.value });
                                                                                setSettingsVersion(v => v + 1);
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="card">
                <div className="section-title"><MapPinned size={18} /> <span>Surah Mindmaps • Part {activePart}</span></div>
                <p style={{ color: 'var(--foreground-secondary)', marginBottom: '1.5rem' }}>Only surahs from the active part are listed.</p>
                {surahTasks.length === 0 ? (
                    <div className="empty-state"><p>No surahs in this part (or all are skipped).</p></div>
                ) : (
                    <div className="modern-list" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '0.75rem' }}>
                        {surahTasks.map(({ surah, mindmap }) => {
                            const isIncomplete = !mindmap || !mindmap.imageUrl || !mindmap.isComplete;
                            return (
                                <div key={surah.id} className="surah-item modern-card" style={{
                                    background: isIncomplete ? 'rgba(245, 158, 11, 0.02)' : 'var(--background-secondary)',
                                    borderColor: isIncomplete ? 'var(--warning)' : 'var(--border)',
                                    marginBottom: '0',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'stretch',
                                    gap: expandedSurahs[surah.id] ? '1.5rem' : '0',
                                    padding: '1rem 1.25rem',
                                    width: '100%',
                                    maxWidth: '100%',
                                    cursor: 'pointer'
                                }} onClick={() => toggleSurahExpand(surah.id)}>
                                    <div className="surah-info" style={{ borderBottom: expandedSurahs[surah.id] ? '1px solid var(--border)' : 'none', paddingBottom: expandedSurahs[surah.id] ? '1rem' : '0', transition: 'all 0.2s' }}>
                                        <div className="surah-number" style={{ background: isIncomplete ? 'var(--warning)' : 'var(--accent)', width: '2rem', height: '2rem', fontSize: '0.85rem' }}>{surah.id}</div>
                                        <div className="surah-names">
                                            <span className="surah-arabic" style={{ fontSize: '1.25rem' }}>{surah.arabicName}</span>
                                            <span className="surah-english" style={{ fontSize: '0.9rem' }}>{surah.name}</span>
                                        </div>
                                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
                                            {isIncomplete ? <span className="status-badge partial" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}>Needs Attention</span> : <span className="status-badge learned" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}>Ready</span>}
                                            <ChevronDown size={18} style={{ transform: expandedSurahs[surah.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--foreground-secondary)' }} />
                                        </div>
                                    </div>
                                    {expandedSurahs[surah.id] && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, width: '100%' }} onClick={e => e.stopPropagation()}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                                <label className="upload-tile" style={{ height: 'auto', padding: '0.75rem', display: 'flex', justifyContent: 'center' }}>
                                                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleSurahImageUpdate(surah.id, e.target.files?.[0] || null)} />
                                                    <span style={{ fontSize: '0.85rem' }}><ImageIcon size={18} /> {mindmap?.imageUrl ? 'Replace image' : 'Upload mindmap'}</span>
                                                </label>
                                                <button
                                                    className={`btn ${!mindmap?.imageUrl ? 'btn-secondary' : 'btn-success'}`}
                                                    disabled={!mindmap?.imageUrl}
                                                    onClick={() => handleMarkComplete(surah.id)}
                                                    style={{ fontSize: '0.85rem', padding: '0.75rem' }}
                                                >
                                                    <Check size={18} /> {mindmap?.isComplete ? 'Completed' : 'Mark complete'}
                                                </button>
                                            </div>
                                            <div style={{ background: 'var(--background)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', width: '100%' }}>
                                                <AnchorBuilder
                                                    surahId={surah.id}
                                                    verseCount={surah.verseCount}
                                                    builderState={getBuilderState(surah.id)}
                                                    onAddPointer={() => handleAddPointer(surah.id, surah.verseCount)}
                                                    onMovePointer={(idx, value) => handleMovePointer(surah.id, idx, value, surah.verseCount)}
                                                    onRemovePointer={idx => handleRemovePointer(surah.id, idx)}
                                                    onLabelChange={(idx, value) => handleLabelChange(surah.id, idx, value)}
                                                    onSave={() => handleSaveAnchors(surah.id, surah.verseCount)}
                                                />
                                            </div>
                                            {mindmap?.anchors?.length > 0 && (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                    {mindmap.anchors.map(a => (
                                                        <span key={a.id} style={{ fontSize: '0.75rem', background: 'var(--verse-bg)', color: 'var(--accent)', padding: '0.3rem 0.6rem', borderRadius: '6px', border: '1px solid var(--accent-light)', fontWeight: 600 }}>
                                                            {a.label} ({a.startVerse}-{a.endVerse})
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {shouldCollapseSurahSection && shouldCollapsePartSection && shouldCollapseFixSection && shouldCollapseSimilarity && (
                <div className="card">
                    <div className="empty-state">
                        <Check size={32} />
                        <p>All todos cleared!</p>
                    </div>
                </div>
            )}

            <HelpSection
                cards={[
                    {
                        title: "Surah & Part Mindmaps",
                        icon: Map,
                        description: "Visual memory aids (mindmaps) are key to long-term retention. We use two levels of mapping:",
                        items: [
                            "Part Mindmap: A high-level overview of an entire section (Part) to help you understand the core themes and flow.",
                            "Surah Mindmap: A detailed visual guide for a specific Surah. You upload an image and use the builder to split it into smaller, manageable segments for review.",
                            "Mark a mindmap as 'Complete' to enable its automatic review cycle."
                        ]
                    },
                    {
                        title: "Fixing Memory Gaps",
                        icon: ShieldAlert,
                        description: "When you reach 3 failed reviews for a specific segment, it is automatically suspended to prevent repeating mistakes.",
                        items: [
                            "Suspended segments appear here to alert you of a 'memory gap'.",
                            "Review your mental image, update the mindmap if needed, and 'Clear Issues' to resume your reviews."
                        ]
                    },
                    {
                        title: "Verifying Similarity",
                        icon: Brain,
                        description: "Mutashabihat (similar verses) often cause confusion. This section helps you verify if a mistake was due to a similarity.",
                        items: [
                            "Check if your review errors stem from confusion between two similar verses.",
                            "Add a distinction note or update your mindmap to highlight the difference between them.",
                            "Once you decide how to handle the similarity, the warning will clear from your list."
                        ]
                    }
                ]}
            />
        </div>
    );
}
