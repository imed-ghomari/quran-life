'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
        'part-mindmaps': true,
        'fix-mindmaps': true,
        'similarity-checks': true,
        'surah-mindmaps': true
    });

    useEffect(() => {
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
            setExpandedGroups({
                'part-mindmaps': false,
                'fix-mindmaps': false,
                'similarity-checks': false,
                'surah-mindmaps': false
            });
        }
    }, []);

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

    const toggleGroup = (groupId: string) => {
        setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
    };

    const toggleSurahExpand = (id: number) => setExpandedSurahs(prev => ({ ...prev, [id]: !prev[id] }));

    const activePart = settings.activePart;

    const surahTasks = useMemo(() => {
        const eligible = SURAHS.filter(s => (activePart === 5 || s.part === activePart) && !isSurahSkipped(s.id));
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

    const isFixEmpty = suspendedAnchors.length === 0;
    const isSimilarityEmpty = groupedSimilarity.length === 0;
    const isIncompleteSurahsEmpty = incompleteSurahMaps.length === 0;
    const isAllDone = isFixEmpty && isSimilarityEmpty && isIncompleteSurahsEmpty;

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

            <div className="card modern-card" style={{ padding: '1rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px', marginBottom: '1.5rem' }}>
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '0 -0.5rem', padding: '0 0.5rem' }}>
                    <table className="debug-table" style={{ minWidth: '700px', width: '100%' }}>
                        <thead>
                            <tr>
                                <th>Target / Range</th>
                                <th>Content</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="group-header" onClick={() => toggleGroup('part-mindmaps')}>
                                <td colSpan={4} style={{ fontWeight: 700 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <ChevronDown size={16} style={{ transform: expandedGroups['part-mindmaps'] ? 'rotate(180deg)' : 'none' }} />
                                            <Map size={16} /> Part Mindmaps
                                        </div>
                                    </div>
                                </td>
                            </tr>
                            {expandedGroups['part-mindmaps'] && (
                                partTasks.map(({ part, mindmap }) => {
                                    const isActive = part === activePart;
                                    const isComplete = mindmap?.isComplete && mindmap?.imageUrl;
                                    return (
                                        <tr key={part} className="node-row">
                                            <td style={{ fontWeight: 600 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <div className="surah-number" style={{ background: isActive ? 'var(--accent)' : 'var(--foreground-secondary)', width: '2rem', height: '2rem', fontSize: '0.85rem' }}>P{part}</div>
                                                    <span>Part {part}</span>
                                                    {isActive && <span className="status-badge learned" style={{ fontSize: '0.65rem' }}>Active</span>}
                                                </div>
                                            </td>
                                            <td>
                                                <span style={{ color: 'var(--foreground-secondary)', fontSize: '0.85rem' }}>
                                                    {getSurahsByPart(part).length} surahs
                                                </span>
                                            </td>
                                            <td>
                                                {isComplete ? (
                                                    <span className="status-badge learned" style={{ fontSize: '0.75rem' }}>Complete</span>
                                                ) : (
                                                    <span className="status-badge partial" style={{ fontSize: '0.75rem' }}>Incomplete</span>
                                                )}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <label className="upload-tile" style={{ padding: '0.35rem 0.6rem', height: 'auto', margin: 0, justifyContent: 'center', minWidth: '90px' }}>
                                                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handlePartMindmapUpdate(part, e.target.files?.[0] || null)} />
                                                        <span style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <ImageIcon size={14} /> {mindmap?.imageUrl ? 'Replace' : 'Upload'}
                                                        </span>
                                                    </label>
                                                    <button
                                                        className={`btn ${!mindmap?.imageUrl ? 'btn-secondary' : 'btn-success'}`}
                                                        disabled={!mindmap?.imageUrl}
                                                        onClick={() => handlePartComplete(part)}
                                                        style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', minWidth: '110px' }}
                                                    >
                                                        <Check size={14} /> {mindmap?.isComplete ? 'Completed' : 'Complete'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card modern-card" style={{ padding: '1rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px', marginBottom: '1.5rem' }}>
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '0 -0.5rem', padding: '0 0.5rem' }}>
                    <table className="debug-table" style={{ minWidth: '700px', width: '100%' }}>
                        <thead>
                            <tr>
                                <th>Target / Range</th>
                                <th>Issue</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="group-header" onClick={() => toggleGroup('fix-mindmaps')}>
                                <td colSpan={4} style={{ fontWeight: 700 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <ChevronDown size={16} style={{ transform: expandedGroups['fix-mindmaps'] ? 'rotate(180deg)' : 'none' }} />
                                            <AlertTriangle size={16} /> Fix Mindmaps
                                        </div>
                                    </div>
                                </td>
                            </tr>
                            {expandedGroups['fix-mindmaps'] && (
                                suspendedAnchors.length === 0 ? (
                                    <tr className="node-row">
                                        <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--success)' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                                <Check size={24} />
                                                <span style={{ fontWeight: 600 }}>No suspended anchors! Great job.</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    suspendedAnchors.map(issue => {
                                        const key = `${issue.surahId}-${issue.anchorId}`;
                                        const surah = getSurah(issue.surahId);
                                        return (
                                            <tr key={key} className="node-row">
                                                <td style={{ fontWeight: 600 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                        <div className="surah-number" style={{ background: 'var(--danger)', width: '2rem', height: '2rem', fontSize: '0.85rem' }}>{issue.surahId}</div>
                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                            <span className="surah-arabic" style={{ fontSize: '1rem' }}>{surah?.arabicName}</span>
                                                            <span className="surah-english" style={{ fontSize: '0.8rem', color: 'var(--foreground-secondary)' }}>{surah?.name}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span style={{ fontSize: '0.85rem' }}>{issue.label}</span>
                                                </td>
                                                <td>
                                                    <span className="status-badge not-remembered" style={{ background: 'var(--danger)', color: 'white', fontSize: '0.75rem' }}>Suspended</span>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <label className="upload-tile" style={{ padding: '0.35rem 0.6rem', height: 'auto', margin: 0, justifyContent: 'center', minWidth: '90px' }}>
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
                                                            <span style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <ImageIcon size={14} /> {fixDrafts[key] ? 'Replace' : 'Upload Fix'}
                                                            </span>
                                                        </label>
                                                        <button 
                                                            className="btn btn-primary" 
                                                            style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', minWidth: '100px' }} 
                                                            onClick={() => handleFixConfirm(issue.surahId, issue.anchorId)} 
                                                            disabled={!fixDrafts[key]}
                                                        >
                                                            <Check size={14} /> Confirm Fix
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card modern-card" style={{ padding: '1rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px', marginBottom: '1.5rem' }}>
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '0 -0.5rem', padding: '0 0.5rem' }}>
                    <table className="debug-table" style={{ minWidth: '800px', width: '100%' }}>
                        <thead>
                            <tr>
                                <th>Target / Range</th>
                                <th style={{ width: '40%' }}>Similar Verses</th>
                                <th>Decision</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="group-header" onClick={() => toggleGroup('similarity-checks')}>
                                <td colSpan={4} style={{ fontWeight: 700 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <ChevronDown size={16} style={{ transform: expandedGroups['similarity-checks'] ? 'rotate(180deg)' : 'none' }} />
                                            <ShieldAlert size={16} /> Similar Verses Checks
                                        </div>
                                    </div>
                                </td>
                            </tr>
                            {expandedGroups['similarity-checks'] && (
                                groupedSimilarity.length === 0 ? (
                                    <tr className="node-row">
                                        <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--success)' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                                <Check size={24} />
                                                <span style={{ fontWeight: 600 }}>No similarity checks needed.</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    groupedSimilarity.map(({ surah, items, count }) => {
                                        const isSurahOpen = expandedSurahs[surah!.id] ?? false;
                                        return (
                                            <React.Fragment key={surah!.id}>
                                                <tr className="subgroup-header" onClick={() => setExpandedSurahs(prev => ({ ...prev, [surah!.id]: !isSurahOpen }))}>
                                                    <td colSpan={4} style={{ fontWeight: 600 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <ChevronDown size={14} style={{ transform: isSurahOpen ? 'rotate(180deg)' : 'none' }} />
                                                            <div className="surah-number" style={{ width: '1.5rem', height: '1.5rem', fontSize: '0.75rem' }}>{surah!.id}</div>
                                                            <span>{surah!.arabicName} — {surah!.name}</span>
                                                            <span className="status-badge partial" style={{ fontSize: '0.65rem' }}>{count} items</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {isSurahOpen && items.map(({ err, muts }) => {
                                                    const abs = err.absoluteAyah!;
                                                    const ref = absoluteToSurahAyah(abs);
                                                    const baseVerse = verses.find(v => v.surahId === ref.surahId && v.ayahId === ref.ayahId);

                                                    return muts.map((entry: any) => {
                                                        const decisionKey = `${abs}-${entry.phraseId}`;
                                                        const existing = decisions[decisionKey] || { status: 'pending', note: '' };
                                                        const isConfirmed = !!existing.confirmedAt;
                                                        const isExpanded = expandedMutItems[decisionKey] || false;
                                                        const matches = entry.matches.filter((m: any) => m !== abs);
                                                        const visibleMatches = isExpanded ? matches : matches.slice(0, 2);

                                                        return (
                                                            <tr key={decisionKey} className={`node-row ${isConfirmed ? 'confirmed' : ''}`}>
                                                                <td style={{ verticalAlign: 'top' }}>
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent)' }}>Ayah {ref.ayahId}</span>
                                                                        {baseVerse && (
                                                                            <p className="arabic-text" style={{ fontSize: '1rem', textAlign: 'right', margin: 0 }}>
                                                                                <HighlightedVerse
                                                                                    text={baseVerse.text}
                                                                                    range={entry.meta.sourceAbs === abs ? entry.meta.sourceRange : entry.meta.matches.find((m: any) => m.absolute === abs)?.wordRange}
                                                                                />
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td style={{ verticalAlign: 'top' }}>
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                                        {visibleMatches.map((matchAbs: number, idx: number) => {
                                                                            const mref = absoluteToSurahAyah(matchAbs);
                                                                            const msurah = getSurah(mref.surahId);
                                                                            const mVerse = verses.find(v => v.surahId === mref.surahId && v.ayahId === mref.ayahId);
                                                                            const matchRange = entry.meta.matches.find((m: any) => m.absolute === matchAbs)?.wordRange;

                                                                            return (
                                                                                <div key={idx} style={{ padding: '0.5rem', background: 'var(--background)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                                                                    <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--foreground-secondary)', marginBottom: '0.25rem' }}>
                                                                                        {msurah?.name} - {mref.ayahId}
                                                                                    </div>
                                                                                    {mVerse && (
                                                                                        <p className="arabic-text" style={{ fontSize: '0.9rem', textAlign: 'right', margin: 0 }}>
                                                                                            <HighlightedVerse text={mVerse.text} range={matchRange} />
                                                                                        </p>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                        {matches.length > 2 && (
                                                                            <button
                                                                                className="btn-show-more"
                                                                                onClick={() => setExpandedMutItems(prev => ({ ...prev, [decisionKey]: !isExpanded }))}
                                                                                style={{ fontSize: '0.7rem', padding: '4px', border: '1px dashed var(--accent)', color: 'var(--accent)', background: 'none', borderRadius: '4px' }}
                                                                            >
                                                                                {isExpanded ? 'Show Less' : `+${matches.length - 2} more`}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td>
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                                        <select
                                                                            value={existing.status}
                                                                            onChange={e => handleSimilarityDecision(abs, e.target.value as any, entry.phraseId, e.target.value === 'ignored')}
                                                                            className="maturity-select"
                                                                            style={{ width: '100%' }}
                                                                        >
                                                                            {MUT_STATES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                                                        </select>
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Note..."
                                                                            value={existing.note || ''}
                                                                            onChange={e => {
                                                                                const key = `${abs}-${entry.phraseId}`;
                                                                                setMutashabihatDecision(key as any, { ...existing, note: e.target.value });
                                                                                setSettingsVersion(v => v + 1);
                                                                            }}
                                                                            style={{ fontSize: '0.75rem', padding: '0.35rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--background)' }}
                                                                        />
                                                                    </div>
                                                                </td>
                                                                <td>
                                                                    <button
                                                                        className={`btn ${isConfirmed ? 'btn-success' : 'btn-primary'}`}
                                                                        onClick={() => handleSimilarityDecision(abs, existing.status, entry.phraseId, true)}
                                                                        style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', width: '100%' }}
                                                                    >
                                                                        {isConfirmed ? <Check size={14} /> : 'Resolved'}
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    });
                                                })}
                                            </React.Fragment>
                                        );
                                    })
                                )
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card modern-card" style={{ padding: '1rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px', marginBottom: '1.5rem' }}>
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '0 -0.5rem', padding: '0 0.5rem' }}>
                    <table className="debug-table" style={{ minWidth: '700px', width: '100%' }}>
                        <thead>
                            <tr>
                                <th>Target / Range</th>
                                <th>Segments</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="group-header" onClick={() => toggleGroup('surah-mindmaps')}>
                                <td colSpan={4} style={{ fontWeight: 700 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <ChevronDown size={16} style={{ transform: expandedGroups['surah-mindmaps'] ? 'rotate(180deg)' : 'none' }} />
                                            <MapPinned size={16} /> Surah Mindmaps • {activePart === 5 ? 'All Quran' : `Part ${activePart}`}
                                        </div>
                                    </div>
                                </td>
                            </tr>
                            {expandedGroups['surah-mindmaps'] && (
                                surahTasks.length === 0 ? (
                                    <tr className="node-row">
                                        <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--foreground-secondary)' }}>
                                            No surahs in this part (or all are skipped).
                                        </td>
                                    </tr>
                                ) : (
                                    surahTasks.map(({ surah, mindmap }) => {
                                        const isIncomplete = !mindmap || !mindmap.imageUrl || !mindmap.isComplete;
                                        const isExpanded = expandedSurahs[surah.id] ?? false;
                                        return (
                                            <React.Fragment key={surah.id}>
                                                <tr 
                                                    className={`node-row ${isExpanded ? 'active' : ''}`} 
                                                    onClick={() => toggleSurahExpand(surah.id)}
                                                    style={{ cursor: 'pointer', background: isIncomplete ? 'rgba(245, 158, 11, 0.02)' : 'transparent' }}
                                                >
                                                    <td style={{ fontWeight: 600 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            <div className="surah-number" style={{ background: isIncomplete ? 'var(--warning)' : 'var(--accent)', width: '2rem', height: '2rem', fontSize: '0.85rem' }}>{surah.id}</div>
                                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                <span className="surah-arabic" style={{ fontSize: '1.1rem' }}>{surah.arabicName}</span>
                                                                <span className="surah-english" style={{ fontSize: '0.8rem', color: 'var(--foreground-secondary)' }}>{surah.name}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                            {mindmap?.anchors?.length > 0 ? (
                                                                mindmap.anchors.slice(0, 3).map(a => (
                                                                    <span key={a.id} style={{ fontSize: '0.65rem', background: 'var(--verse-bg)', color: 'var(--accent)', padding: '0.15rem 0.35rem', borderRadius: '4px', border: '1px solid var(--accent-light)' }}>
                                                                        {a.label}
                                                                    </span>
                                                                ))
                                                            ) : (
                                                                <span style={{ fontSize: '0.75rem', color: 'var(--foreground-secondary)', fontStyle: 'italic' }}>No segments</span>
                                                            )}
                                                            {mindmap?.anchors?.length > 3 && <span style={{ fontSize: '0.65rem', color: 'var(--foreground-secondary)' }}>+{mindmap.anchors.length - 3}</span>}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        {isIncomplete ? (
                                                            <span className="status-badge partial" style={{ fontSize: '0.75rem' }}>Needs Attention</span>
                                                        ) : (
                                                            <span className="status-badge learned" style={{ fontSize: '0.75rem' }}>Ready</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <ChevronDown size={18} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--foreground-secondary)' }} />
                                                        </div>
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr className="node-row expanded-content" onClick={e => e.stopPropagation()}>
                                                        <td colSpan={4} style={{ padding: '1.5rem', background: 'var(--background)' }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                                                    <label className="upload-tile" style={{ padding: '0.75rem', display: 'flex', justifyContent: 'center', margin: 0, height: 'auto' }}>
                                                                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleSurahImageUpdate(surah.id, e.target.files?.[0] || null)} />
                                                                        <span style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                            <ImageIcon size={18} /> {mindmap?.imageUrl ? 'Replace Image' : 'Upload Mindmap'}
                                                                        </span>
                                                                    </label>
                                                                    <button
                                                                        className={`btn ${!mindmap?.imageUrl ? 'btn-secondary' : 'btn-success'}`}
                                                                        disabled={!mindmap?.imageUrl}
                                                                        onClick={() => handleMarkComplete(surah.id)}
                                                                        style={{ fontSize: '0.85rem', padding: '0.75rem' }}
                                                                    >
                                                                        <Check size={18} /> {mindmap?.isComplete ? 'Completed' : 'Mark Complete'}
                                                                    </button>
                                                                </div>

                                                                <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
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
                                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '1rem', background: 'var(--background-secondary)', borderRadius: '8px' }}>
                                                                        {mindmap.anchors.map(a => (
                                                                            <span key={a.id} style={{ fontSize: '0.75rem', background: 'var(--verse-bg)', color: 'var(--accent)', padding: '0.3rem 0.6rem', borderRadius: '6px', border: '1px solid var(--accent-light)', fontWeight: 600 }}>
                                                                                {a.label} ({a.startVerse}-{a.endVerse})
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })
                                )
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {isAllDone && (
                <div className="card modern-card" style={{ padding: '2rem', textAlign: 'center', background: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: '16px', marginBottom: '1.5rem' }}>
                    <div className="empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                        <Check size={48} style={{ color: 'var(--success)' }} />
                        <div>
                            <h2 style={{ color: 'var(--success)', marginBottom: '0.25rem' }}>All Clear!</h2>
                            <p style={{ color: 'var(--foreground-secondary)' }}>You've completed all pending tasks for this part.</p>
                        </div>
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
