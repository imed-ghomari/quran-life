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
import { syncWithCloud } from '@/lib/sync';
import { ChevronDown, Brain, Map, MapPinned, AlertTriangle, ShieldAlert, SplitSquareHorizontal, Check, ImageIcon, ChevronRight, X, AlertCircle, Download, Upload, MoreVertical, FileText, Settings2, PenTool, Trash2 } from 'lucide-react';
import DocumentationModal from '@/components/DocumentationModal';
import MindmapEditor from '@/components/MindmapEditor';

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

    // Default main sections to open
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
        'maintenance': true,
        'construction': true
    });

    // Expansion states
    const [expandedSurahs, setExpandedSurahs] = useState<Record<number, boolean>>({});
    const [expandedMutItems, setExpandedMutItems] = useState<Record<string, boolean>>({});

    // Mobile Slide-over State
    type SlideOverType = 'suspended' | 'similar' | 'part' | 'surah';
    type SlideOverState = {
        type: SlideOverType;
        title: string;
        data?: any;
    } | null;
    const [activeSlideOver, setActiveSlideOver] = useState<SlideOverState>(null);

    // Mindmap Editor State (for Surah and Part mindmaps)
    const [activeMindmapEditor, setActiveMindmapEditor] = useState<{ surahId: number; snapshot?: any } | null>(null);
    const [activePartEditor, setActivePartEditor] = useState<{ partId: QuranPart; snapshot?: any } | null>(null);

    // Default subsections to collapsed
    const [collapsedSubgroups, setCollapsedSubgroups] = useState<Record<string, boolean>>({
        'suspended': true,
        'similar': true,
        'part': true,
        'surah': true
    });

    const toggleSubgroup = (group: string) => {
        setCollapsedSubgroups(prev => ({ ...prev, [group]: !prev[group] }));
    };

    useEffect(() => {
        // No longer forcing false on mobile since it's now false by default
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
            .then(data => setVerses(parseQuranJson(data as Record<string, any>)))
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

    const handleMarkComplete = (surahId: number, currentMindmap?: any) => {
        // Use current state as base if available to prevent data loss from stale storage
        // Otherwise read from storage
        const freshMaps = getMindMaps();
        const existing = currentMindmap || freshMaps[surahId] || { surahId, anchors: [], imageUrl: null, isComplete: false };
        // Ensure we preserve the image if it exists in either source
        const imageUrl = currentMindmap?.imageUrl || existing.imageUrl || null;
        const tldrawSnapshot = currentMindmap?.tldrawSnapshot || existing.tldrawSnapshot;

        const updated = {
            ...existing,
            imageUrl,
            tldrawSnapshot,
            isComplete: !existing.isComplete
        };

        saveMindMap(updated);

        // Update local state to reflect change immediately
        setMindmaps(prev => ({ ...prev, [surahId]: updated }));
        setSettingsVersion(v => v + 1);
        syncWithCloud().catch(console.error);
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
        // Read directly from storage to avoid stale state closures
        const freshMaps = getPartMindMaps();
        const existing = freshMaps[part] || { partId: part, imageUrl: null, description: '', isComplete: false };

        const updated = { ...existing, isComplete: !existing.isComplete };
        savePartMindMap(updated);

        // Update local state to reflect change immediately
        setPartMindmaps(prev => ({ ...prev, [part]: updated }));
        setSettingsVersion(v => v + 1);
        syncWithCloud().catch(console.error);
    };

    const handleFixConfirm = (surahId: number, anchorId: string) => {
        // We assume the user has already edited the mindmap if needed.
        // This function just resolves the specific issue.
        clearAnchorIssues(surahId, anchorId);
        setSettingsVersion(v => v + 1);
        syncWithCloud().catch(console.error);
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

    const handleEditorSave = async (snapshot: any, imageBlob?: Blob) => {
        if (!activeMindmapEditor) return;

        const { surahId } = activeMindmapEditor;
        const reader = new FileReader();
        reader.onloadend = () => {
            const imageUrl = reader.result as string;
            const existing = mindmaps[surahId] || { surahId, anchors: [], imageUrl: null, isComplete: false };
            saveMindMap({
                ...existing,
                imageUrl: imageBlob && imageBlob.size > 0 ? imageUrl : existing.imageUrl,
                tldrawSnapshot: snapshot
            });
            setSettingsVersion(v => v + 1);
            setActiveMindmapEditor(null);
            syncWithCloud().catch(console.error);
        };

        if (imageBlob && imageBlob.size > 0) {
            reader.readAsDataURL(imageBlob);
        } else {
            // Just save snapshot
            const existing = mindmaps[surahId] || { surahId, anchors: [], imageUrl: null, isComplete: false };
            saveMindMap({ ...existing, tldrawSnapshot: snapshot });
            setSettingsVersion(v => v + 1);
            setActiveMindmapEditor(null);
            syncWithCloud().catch(console.error);
        }
    };

    const handlePartEditorSave = async (snapshot: any, imageBlob?: Blob) => {
        if (!activePartEditor) return;

        const { partId } = activePartEditor;
        const reader = new FileReader();
        reader.onloadend = () => {
            const imageUrl = reader.result as string;
            const existing = partMindmaps[partId] || { partId, imageUrl: null, description: '', isComplete: false };
            savePartMindMap({
                ...existing,
                imageUrl: imageBlob && imageBlob.size > 0 ? imageUrl : existing.imageUrl,
                tldrawSnapshot: snapshot
            });
            setSettingsVersion(v => v + 1);
            setActivePartEditor(null);
            syncWithCloud().catch(console.error);
        };

        if (imageBlob && imageBlob.size > 0) {
            reader.readAsDataURL(imageBlob);
        } else {
            const existing = partMindmaps[partId] || { partId, imageUrl: null, description: '', isComplete: false };
            savePartMindMap({ ...existing, tldrawSnapshot: snapshot });
            setSettingsVersion(v => v + 1);
            setActivePartEditor(null);
            syncWithCloud().catch(console.error);
        }
    };

    return (
        <div className="content-wrapper" style={{ padding: '1rem', margin: '0 auto' }}>
            {/* Surah Mindmap Editor */}
            {activeMindmapEditor && (
                <MindmapEditor
                    initialSnapshot={activeMindmapEditor.snapshot}
                    onSave={handleEditorSave}
                    onClose={() => setActiveMindmapEditor(null)}
                    title="Surah Mindmap Editor"
                />
            )}
            {/* Part Mindmap Editor */}
            {activePartEditor && (
                <MindmapEditor
                    initialSnapshot={activePartEditor.snapshot}
                    onSave={handlePartEditorSave}
                    onClose={() => setActivePartEditor(null)}
                    title={`Part ${activePartEditor.partId} Mindmap Editor`}
                />
            )}
            <h1 className="hide-mobile">Todo</h1>

            {/* Maintenance Section */}
            <div className="card modern-card" style={{ padding: '1rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px', marginBottom: '1.5rem' }}>
                <div
                    onClick={() => toggleGroup('maintenance')}
                    style={{
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.5rem 0',
                        marginBottom: expandedGroups['maintenance'] ? '1.5rem' : '0'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '8px', borderRadius: '10px', display: 'flex' }}>
                            <ShieldAlert size={20} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Review Fixes</h2>
                                <span className="status-badge" style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                                    {suspendedAnchors.length + similarityItems.length}
                                </span>
                            </div>
                            <p style={{ fontSize: '0.8rem', color: 'var(--foreground-secondary)', margin: 0 }}>Maintenance: Resolve issues and similarity confusion</p>
                        </div>
                    </div>
                    <ChevronDown size={20} style={{ transform: expandedGroups['maintenance'] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </div>



                {expandedGroups['maintenance'] && (
                    <>
                        {/* Desktop View */}
                        <div className="hide-mobile" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '0 -0.5rem', padding: '0 0.5rem' }}>
                            <table className="debug-table" style={{ minWidth: '800px', width: '100%', tableLayout: 'fixed' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '25%' }}>Target</th>
                                        <th style={{ width: '40%' }}>Detail</th>
                                        <th style={{ width: '15%' }}>Status</th>
                                        <th style={{ width: '20%' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Suspended Anchors Sub-section */}
                                    <tr className="subgroup-header" onClick={() => toggleSubgroup('suspended')}>
                                        <td colSpan={4} style={{ fontWeight: 600 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'inherit' }}>
                                                {collapsedSubgroups['suspended'] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                                <AlertTriangle size={14} /> Suspended Anchors
                                                <span className="status-badge" style={{ fontSize: '0.65rem', opacity: 0.8, marginLeft: '0.5rem' }}>
                                                    {suspendedAnchors.length}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                    {!collapsedSubgroups['suspended'] && (
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
                                                const mindmap = mindmaps[issue.surahId];
                                                const chunkVerses = verses
                                                    .filter(v => v.surahId === issue.surahId && v.ayahId >= (issue.startVerse || 0) && v.ayahId <= (issue.endVerse || 0))
                                                    .map(v => v.text)
                                                    .join(' ');

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
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{issue.label}</span>
                                                                {chunkVerses && (
                                                                    <p className="arabic-text" style={{ fontSize: '0.9rem', color: 'var(--foreground-secondary)', margin: 0, opacity: 0.8, maxHeight: '3rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                        {chunkVerses}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span className="status-badge not-remembered" style={{ background: 'var(--danger)', color: 'white', fontSize: '0.75rem' }}>Suspended</span>
                                                        </td>
                                                        <td>
                                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                <button
                                                                    className="btn btn-secondary"
                                                                    onClick={() => setActiveMindmapEditor({ surahId: issue.surahId, snapshot: mindmap?.tldrawSnapshot })}
                                                                    style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', flex: 1 }}
                                                                >
                                                                    <PenTool size={14} style={{ marginRight: '4px' }} />
                                                                    Edit Map
                                                                </button>
                                                                <button
                                                                    className="btn btn-primary"
                                                                    style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', flex: 1 }}
                                                                    onClick={() => handleFixConfirm(issue.surahId, issue.anchorId)}
                                                                >
                                                                    <Check size={14} style={{ marginRight: '4px' }} /> Complete
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )
                                    )}

                                    {/* Similarity Checks Sub-section */}
                                    <tr className="subgroup-header" onClick={() => toggleSubgroup('similar')}>
                                        <td colSpan={4} style={{ fontWeight: 600 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'inherit' }}>
                                                {collapsedSubgroups['similar'] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                                <Brain size={14} /> Similar Verses Checks
                                                <span className="status-badge" style={{ fontSize: '0.65rem', opacity: 0.8, marginLeft: '0.5rem' }}>
                                                    {similarityItems.length}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                    {!collapsedSubgroups['similar'] && (
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
                                                                                                {msurah?.arabicName} {mref.ayahId}
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
                                                                                        className="btn btn-secondary"
                                                                                        style={{ padding: '0.25rem', fontSize: '0.7rem' }}
                                                                                        onClick={() => setExpandedMutItems(prev => ({ ...prev, [decisionKey]: !isExpanded }))}
                                                                                    >
                                                                                        {isExpanded ? 'Show Less' : `Show ${matches.length - 2} more...`}
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                        <td>
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                                                <select
                                                                                    value={existing.status}
                                                                                    onChange={e => handleSimilarityDecision(abs, e.target.value as any, entry.phraseId, false)}
                                                                                    style={{ width: '100%', padding: '0.4rem', borderRadius: '8px', fontSize: '0.75rem', border: '1px solid var(--border)', background: 'var(--background)' }}
                                                                                >
                                                                                    {MUT_STATES.map(s => (
                                                                                        <option key={s.value} value={s.value}>{s.label}</option>
                                                                                    ))}
                                                                                </select>
                                                                                {isConfirmed && (
                                                                                    <span style={{ fontSize: '0.65rem', color: 'var(--success)', fontWeight: 600 }}>✓ Confirmed</span>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                        <td>
                                                                            <button
                                                                                className={`btn ${isConfirmed ? 'btn-secondary' : 'btn-primary'}`}
                                                                                onClick={() => handleSimilarityDecision(abs, existing.status, entry.phraseId, true)}
                                                                                style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', width: '100%' }}
                                                                            >
                                                                                {isConfirmed ? 'Update' : 'Confirm'}
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

                        {/* Mobile View List Lists */}
                        <div className="show-mobile" style={{ flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
                            {/* Suspended Anchors Mobile Group */}
                            <div className="mobile-group-item">
                                <div className="mobile-group-header" onClick={() => toggleSubgroup('suspended')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <AlertTriangle size={16} />
                                        <span style={{ fontWeight: 600 }}>Suspended Anchors</span>
                                        <span className={`status-badge ${suspendedAnchors.length === 0 ? 'learned' : 'not-remembered'}`}>
                                            {suspendedAnchors.length}
                                        </span>
                                    </div>
                                    {collapsedSubgroups['suspended'] ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                                </div>
                                {!collapsedSubgroups['suspended'] && (
                                    <div className="mobile-subgroup-list">
                                        {suspendedAnchors.length === 0 ? (
                                            <div className="empty-state" style={{ padding: '1rem', fontSize: '0.85rem' }}>No suspended anchors!</div>
                                        ) : (
                                            suspendedAnchors.map(issue => {
                                                const key = `${issue.surahId}-${issue.anchorId}`;
                                                const surah = getSurah(issue.surahId);
                                                const mindmap = mindmaps[issue.surahId];
                                                const chunkVerses = verses
                                                    .filter(v => v.surahId === issue.surahId && v.ayahId >= (issue.startVerse || 0) && v.ayahId <= (issue.endVerse || 0))
                                                    .map(v => v.text)
                                                    .join(' ');

                                                return (
                                                    <div key={key} className="mobile-subgroup-item" style={{ flexDirection: 'column', alignItems: 'flex-start', paddingLeft: '1rem', background: 'var(--background)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '0.5rem' }}>
                                                            <div className="node-target" style={{ fontSize: '0.9rem' }}>{surah?.name} - {issue.label}</div>
                                                            <span className="status-badge not-remembered" style={{ fontSize: '0.7rem' }}>Suspended</span>
                                                        </div>
                                                        {chunkVerses && (
                                                            <p className="arabic-text" style={{ width: '100%', fontSize: '0.85rem', color: 'var(--foreground-secondary)', margin: '0 0 0.75rem 0', opacity: 0.8, textAlign: 'right' }}>
                                                                {chunkVerses.slice(0, 100)}{chunkVerses.length > 100 ? '...' : ''}
                                                            </p>
                                                        )}
                                                        <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                                                            <button
                                                                className="btn btn-secondary"
                                                                onClick={() => setActiveMindmapEditor({ surahId: issue.surahId, snapshot: mindmap?.tldrawSnapshot })}
                                                                style={{ padding: '0.4rem', fontSize: '0.75rem', flex: 1 }}
                                                            >
                                                                <PenTool size={14} style={{ marginRight: '4px' }} />
                                                                Edit Map
                                                            </button>
                                                            <button
                                                                className="btn btn-primary"
                                                                style={{ padding: '0.4rem', fontSize: '0.75rem', flex: 1 }}
                                                                onClick={() => handleFixConfirm(issue.surahId, issue.anchorId)}
                                                            >
                                                                <Check size={14} /> Complete
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Similarity Checks Mobile Group */}
                            <div className="mobile-group-item">
                                <div className="mobile-group-header" onClick={() => toggleSubgroup('similar')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Brain size={16} />
                                        <span style={{ fontWeight: 600 }}>Similarity Checks</span>
                                        <span className={`status-badge ${groupedSimilarity.length === 0 ? 'learned' : 'partial'}`}>
                                            {groupedSimilarity.length} Surahs
                                        </span>
                                    </div>
                                    {collapsedSubgroups['similar'] ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                                </div>
                                {!collapsedSubgroups['similar'] && (
                                    <div className="mobile-subgroup-list">
                                        {groupedSimilarity.length === 0 ? (
                                            <div className="empty-state" style={{ padding: '1rem', fontSize: '0.85rem' }}>No checks needed.</div>
                                        ) : (
                                            groupedSimilarity.map(({ surah, items, count }) => (
                                                <div key={surah!.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <div
                                                        className="mobile-subgroup-item"
                                                        onClick={() => toggleSurahExpand(surah!.id)}
                                                        style={{ paddingLeft: '1rem', background: 'var(--background-secondary)', justifyContent: 'space-between', borderTop: 'none' }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <div className="surah-number" style={{ width: '1.5rem', height: '1.5rem', fontSize: '0.7rem' }}>{surah!.id}</div>
                                                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{surah?.name}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <span style={{ fontSize: '0.75rem', color: 'var(--foreground-secondary)' }}>{count} items</span>
                                                            <ChevronDown size={16} style={{ transform: expandedSurahs[surah!.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                                        </div>
                                                    </div>

                                                    {expandedSurahs[surah!.id] && (
                                                        <div style={{ background: 'var(--background)', padding: '0.5rem' }}>
                                                            {items.map(({ err, muts }) => {
                                                                const abs = err.absoluteAyah!;
                                                                const ref = absoluteToSurahAyah(abs);
                                                                const baseVerse = verses.find(v => v.surahId === ref.surahId && v.ayahId === ref.ayahId);

                                                                return muts.map((entry: any) => {
                                                                    const decisionKey = `${abs}-${entry.phraseId}`;
                                                                    const existing = decisions[decisionKey] || { status: 'pending', note: '' };
                                                                    const isConfirmed = !!existing.confirmedAt;
                                                                    const matches = entry.matches.filter((m: any) => m !== abs);

                                                                    // Mobile: show all matches to be safe, or just first 2 like desktop
                                                                    // Let's show first 2 to save space, and a toggle if needed? 
                                                                    // For simplicity in this fix, we'll just show up to 2.
                                                                    const visibleMatches = matches.slice(0, 2);

                                                                    return (
                                                                        <div key={decisionKey} style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '0.75rem', background: 'var(--background)' }}>

                                                                            {/* Header: Ayah Number + Status */}
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                                                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent)' }}>Ayah {ref.ayahId} Issue</span>
                                                                                {isConfirmed && <span style={{ color: 'var(--success)', fontSize: '0.7rem' }}>✓ Confirmed</span>}
                                                                            </div>

                                                                            {/* Base Verse Context */}
                                                                            {baseVerse && (
                                                                                <div style={{ marginBottom: '1rem', borderBottom: '1px dashed var(--border)', paddingBottom: '0.75rem' }}>
                                                                                    <p className="arabic-text" style={{ fontSize: '1rem', textAlign: 'right', margin: 0 }}>
                                                                                        <HighlightedVerse
                                                                                            text={baseVerse.text}
                                                                                            range={entry.meta.sourceAbs === abs ? entry.meta.sourceRange : entry.meta.matches.find((m: any) => m.absolute === abs)?.wordRange}
                                                                                        />
                                                                                    </p>
                                                                                </div>
                                                                            )}

                                                                            {/* Confused With Section */}
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                                                                                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--foreground-secondary)', textTransform: 'uppercase' }}>Confused With:</span>
                                                                                {visibleMatches.map((matchAbs: number, idx: number) => {
                                                                                    const mref = absoluteToSurahAyah(matchAbs);
                                                                                    const msurah = getSurah(mref.surahId);
                                                                                    const mVerse = verses.find(v => v.surahId === mref.surahId && v.ayahId === mref.ayahId);
                                                                                    const matchRange = entry.meta.matches.find((m: any) => m.absolute === matchAbs)?.wordRange;

                                                                                    return (
                                                                                        <div key={idx} style={{ padding: '0.5rem', background: 'var(--background-secondary)', borderRadius: '6px' }}>
                                                                                            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--foreground-secondary)', marginBottom: '0.25rem' }}>
                                                                                                {msurah?.arabicName} {mref.ayahId}
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
                                                                                    <span style={{ fontSize: '0.7rem', fontStyle: 'italic', color: 'var(--foreground-secondary)', textAlign: 'center' }}>
                                                                                        + {matches.length - 2} more...
                                                                                    </span>
                                                                                )}
                                                                            </div>

                                                                            {/* Action Area */}
                                                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                                <select
                                                                                    value={existing.status}
                                                                                    onChange={e => handleSimilarityDecision(abs, e.target.value as any, entry.phraseId, false)}
                                                                                    style={{ flex: 1, padding: '0.4rem', borderRadius: '6px', fontSize: '0.75rem', border: '1px solid var(--border)', background: 'var(--background)' }}
                                                                                >
                                                                                    {MUT_STATES.map(s => (
                                                                                        <option key={s.value} value={s.value}>{s.label}</option>
                                                                                    ))}
                                                                                </select>
                                                                                <button
                                                                                    className={`btn ${isConfirmed ? 'btn-secondary' : 'btn-primary'}`}
                                                                                    onClick={() => handleSimilarityDecision(abs, existing.status, entry.phraseId, true)}
                                                                                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
                                                                                >
                                                                                    {isConfirmed ? 'Update' : 'Confirm'}
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                });
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Construction Section */}
            <div className="card modern-card" style={{ padding: '1rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', borderRadius: '16px', marginBottom: '1.5rem' }}>
                <div
                    onClick={() => toggleGroup('construction')}
                    style={{
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.5rem 0',
                        marginBottom: expandedGroups['construction'] ? '1.5rem' : '0'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ background: 'var(--accent-light)', color: 'var(--accent)', padding: '8px', borderRadius: '10px', display: 'flex' }}>
                            <Map size={20} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Course Setup</h2>
                                <span className="status-badge" style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                                    {1 + incompleteSurahMaps.length}
                                </span>
                            </div>
                            <p style={{ fontSize: '0.8rem', color: 'var(--foreground-secondary)', margin: 0 }}>Construction: Prepare mindmaps for your active parts</p>
                        </div>
                    </div>
                    <ChevronDown size={20} style={{ transform: expandedGroups['construction'] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </div>

                {expandedGroups['construction'] && (
                    <>
                        {/* Desktop View */}
                        <div className="hide-mobile" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '0 -0.5rem', padding: '0 0.5rem' }}>
                            <table className="debug-table" style={{ minWidth: '800px', width: '100%', tableLayout: 'fixed' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '25%' }}>Target</th>
                                        <th style={{ width: '35%' }}>Detail</th>
                                        <th style={{ width: '15%' }}>Status</th>
                                        <th style={{ width: '25%' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Part Mindmaps Sub-section */}
                                    <tr className="subgroup-header" onClick={() => toggleSubgroup('part')}>
                                        <td colSpan={4} style={{ fontWeight: 600 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'inherit' }}>
                                                {collapsedSubgroups['part'] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                                <Map size={14} /> Part Mindmaps
                                                <span className="status-badge" style={{ fontSize: '0.65rem', opacity: 0.8, marginLeft: '0.5rem' }}>
                                                    1
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                    {!collapsedSubgroups['part'] && (
                                        partTasks.filter(t => t.part === activePart).map(({ part, mindmap }) => {
                                            const isActive = part === activePart;
                                            const isComplete = mindmap?.isComplete && mindmap?.imageUrl;
                                            return (
                                                <tr key={part} className="node-row">
                                                    <td style={{ fontWeight: 600 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            <div className="surah-number" style={{ background: isActive ? 'var(--accent)' : 'var(--foreground-secondary)', width: '2rem', height: '2rem', fontSize: '0.85rem' }}>P{part}</div>
                                                            <span>Part {part}</span>
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
                                                            <button
                                                                className="btn btn-secondary"
                                                                onClick={() => setActivePartEditor({ partId: part, snapshot: mindmap?.tldrawSnapshot })}
                                                                style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', minWidth: '80px', flex: 1 }}
                                                            >
                                                                <PenTool size={14} style={{ marginRight: '4px' }} />
                                                                {mindmap?.tldrawSnapshot ? 'Edit' : 'Create'}
                                                            </button>
                                                            <button
                                                                className={`btn ${!mindmap?.imageUrl ? 'btn-secondary' : 'btn-success'}`}
                                                                disabled={!mindmap?.imageUrl}
                                                                onClick={() => handlePartComplete(part)}
                                                                style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', minWidth: '90px', flex: 1 }}
                                                            >
                                                                <Check size={14} /> {mindmap?.isComplete ? 'Done' : 'Complete'}
                                                            </button>
                                                            {/* Issue #5: Delete button for Part Mindmaps */}
                                                            {mindmap?.imageUrl && (
                                                                <button
                                                                    className="btn btn-secondary"
                                                                    onClick={() => {
                                                                        if (confirm('Are you sure you want to delete this part mindmap? This cannot be undone.')) {
                                                                            const updatedMap = { partId: part, imageUrl: null, description: '', isComplete: false, tldrawSnapshot: undefined };
                                                                            setPartMindmaps(prev => ({ ...prev, [part]: updatedMap }));
                                                                            savePartMindMap(updatedMap);
                                                                            syncWithCloud().catch(console.error);
                                                                        }
                                                                    }}
                                                                    style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                                                                    title="Delete Mindmap"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}

                                    {/* Surah Mindmaps Sub-section */}
                                    <tr className="subgroup-header" onClick={() => toggleSubgroup('surah')}>
                                        <td colSpan={4} style={{ fontWeight: 600 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'inherit' }}>
                                                {collapsedSubgroups['surah'] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                                <MapPinned size={14} /> Surah Mindmaps
                                                <span className="status-badge" style={{ fontSize: '0.65rem', opacity: 0.8, marginLeft: '0.5rem' }}>
                                                    {incompleteSurahMaps.length}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                    {!collapsedSubgroups['surah'] && (
                                        surahTasks.length === 0 ? (
                                            <tr className="node-row">
                                                <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--success)' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                                        <Check size={24} />
                                                        <span style={{ fontWeight: 600 }}>No surahs in this part!</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            surahTasks.map(({ surah, mindmap }) => {
                                                const isExpanded = expandedSurahs[surah.id] || false;
                                                const isComplete = mindmap?.isComplete && mindmap?.imageUrl;
                                                return (
                                                    <React.Fragment key={surah.id}>
                                                        <tr className="node-row" onClick={() => toggleSurahExpand(surah.id)} style={{ cursor: 'pointer' }}>
                                                            <td style={{ fontWeight: 600 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                                    <div className="surah-number" style={{ width: '2rem', height: '2rem', fontSize: '0.85rem' }}>{surah.id}</div>
                                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                        <span className="surah-arabic" style={{ fontSize: '1rem' }}>{surah.arabicName}</span>
                                                                        <span className="surah-english" style={{ fontSize: '0.8rem', color: 'var(--foreground-secondary)' }}>{surah.name}</span>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <span style={{ fontSize: '0.85rem', color: 'var(--foreground-secondary)' }}>
                                                                    {mindmap?.anchors?.length || 0} anchors
                                                                </span>
                                                            </td>
                                                            <td>
                                                                <span className={`status-badge ${isComplete ? 'learned' : 'partial'}`} style={{ fontSize: '0.75rem' }}>
                                                                    {isComplete ? 'Complete' : 'Incomplete'}
                                                                </span>
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
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                            <button
                                                                                className="btn btn-secondary"
                                                                                onClick={() => setActiveMindmapEditor({ surahId: surah.id, snapshot: mindmap?.tldrawSnapshot })}
                                                                                style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
                                                                            >
                                                                                <PenTool size={14} style={{ marginRight: '4px' }} />
                                                                                {mindmap?.tldrawSnapshot ? 'Edit Map' : 'Start Map'}
                                                                            </button>
                                                                            <button
                                                                                className={`btn ${!mindmap?.imageUrl ? 'btn-secondary' : isComplete ? 'btn-secondary' : 'btn-success'}`}
                                                                                disabled={!mindmap?.imageUrl}
                                                                                onClick={() => handleMarkComplete(surah.id, mindmap)}
                                                                                style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
                                                                            >
                                                                                <Check size={14} style={{ marginRight: '4px' }} />
                                                                                {isComplete ? 'Mark Incomplete' : 'Complete'}
                                                                            </button>

                                                                            {mindmap?.imageUrl && (
                                                                                <button
                                                                                    className="btn btn-secondary"
                                                                                    onClick={() => {
                                                                                        if (confirm('Are you sure you want to delete this mindmap? This cannot be undone.')) {
                                                                                            // Reset both image and snapshot
                                                                                            const updatedMap = { ...mindmap, imageUrl: null, tldrawSnapshot: undefined, isComplete: false };
                                                                                            const newMaps = { ...mindmaps, [surah.id]: updatedMap };
                                                                                            setMindmaps(newMaps);
                                                                                            saveMindMap(updatedMap);
                                                                                            syncWithCloud().catch(console.error);
                                                                                        }
                                                                                    }}
                                                                                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                                                                                    title="Delete Mindmap"
                                                                                >
                                                                                    <Trash2 size={14} />
                                                                                </button>
                                                                            )}
                                                                        </div>

                                                                        {mindmap?.imageUrl && (
                                                                            <div style={{ marginTop: '1rem' }}>
                                                                                <div style={{ position: 'relative', width: '100%', height: '400px', marginBottom: '1rem', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                                                                                    <img src={mindmap.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#f5f5f5' }} />
                                                                                </div>

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

                        {/* Mobile View List Lists */}
                        <div className="show-mobile" style={{ flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
                            {/* Part Mindmaps Mobile Group */}
                            <div className="mobile-group-item">
                                <div className="mobile-group-header" onClick={() => toggleSubgroup('part')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Map size={16} />
                                        <span style={{ fontWeight: 600 }}>Part Mindmaps</span>
                                        <span className={`status-badge ${partTasks.filter(t => t.part === activePart).every(t => t.mindmap?.isComplete && t.mindmap?.imageUrl) ? 'learned' : 'partial'}`}>
                                            Part {activePart}
                                        </span>
                                    </div>
                                    {collapsedSubgroups['part'] ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                                </div>
                                {!collapsedSubgroups['part'] && (
                                    <div className="mobile-subgroup-list">
                                        {partTasks.filter(t => t.part === activePart).map(({ part, mindmap }) => {
                                            const isComplete = mindmap?.isComplete && mindmap?.imageUrl;
                                            return (
                                                <div key={part} className="mobile-subgroup-item" style={{ flexDirection: 'column', alignItems: 'flex-start', paddingLeft: '1rem', background: 'var(--background)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '0.5rem' }}>
                                                        <div className="node-target" style={{ fontSize: '0.9rem' }}>Part {part}</div>
                                                        <span className={`status-badge ${isComplete ? 'learned' : 'partial'}`}>
                                                            {isComplete ? 'Complete' : 'Incomplete'}
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                                                        <button
                                                            className="btn btn-secondary"
                                                            onClick={() => setActivePartEditor({ partId: part, snapshot: mindmap?.tldrawSnapshot })}
                                                            style={{ padding: '0.4rem', fontSize: '0.75rem', flex: 1 }}
                                                        >
                                                            <PenTool size={14} style={{ marginRight: '4px' }} />
                                                            {mindmap?.tldrawSnapshot ? 'Edit' : 'Create'}
                                                        </button>
                                                        <button
                                                            className={`btn ${!mindmap?.imageUrl ? 'btn-secondary' : 'btn-success'}`}
                                                            disabled={!mindmap?.imageUrl}
                                                            onClick={() => handlePartComplete(part)}
                                                            style={{ padding: '0.4rem', fontSize: '0.75rem', flex: 1 }}
                                                        >
                                                            <Check size={14} /> {mindmap?.isComplete ? 'Done' : 'Complete'}
                                                        </button>
                                                        {/* Issue #5: Delete button for mobile Part Mindmaps */}
                                                        {mindmap?.imageUrl && (
                                                            <button
                                                                className="btn btn-secondary"
                                                                onClick={() => {
                                                                    if (confirm('Delete this part mindmap?')) {
                                                                        const updatedMap = { partId: part, imageUrl: null, description: '', isComplete: false, tldrawSnapshot: undefined };
                                                                        setPartMindmaps(prev => ({ ...prev, [part]: updatedMap }));
                                                                        savePartMindMap(updatedMap);
                                                                        syncWithCloud().catch(console.error);
                                                                    }
                                                                }}
                                                                style={{ padding: '0.4rem', fontSize: '0.75rem', color: 'var(--danger)' }}
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Surah Mindmaps Mobile Group */}
                            <div className="mobile-group-item">
                                <div className="mobile-group-header" onClick={() => toggleSubgroup('surah')}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <MapPinned size={16} />
                                        <span style={{ fontWeight: 600 }}>Surah Mindmaps</span>
                                        <span className={`status-badge ${incompleteSurahMaps.length === 0 ? 'learned' : 'partial'}`} style={incompleteSurahMaps.length === 0 ? { background: 'var(--success-bg)', color: 'var(--success)' } : {}}>
                                            {incompleteSurahMaps.length} To Do
                                        </span>
                                    </div>
                                    {collapsedSubgroups['surah'] ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                                </div>
                                {!collapsedSubgroups['surah'] && (
                                    <div className="mobile-subgroup-list">
                                        {surahTasks.length === 0 ? (
                                            <div className="empty-state" style={{ padding: '1rem', fontSize: '0.85rem' }}>No surahs in this part!</div>
                                        ) : (
                                            surahTasks.map(({ surah, mindmap }) => {
                                                const isExpanded = expandedSurahs[surah.id] || false;
                                                return (
                                                    <div key={surah.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <div
                                                            className="mobile-subgroup-item"
                                                            onClick={() => toggleSurahExpand(surah.id)}
                                                            style={{ paddingLeft: '1rem', background: 'var(--background-secondary)', justifyContent: 'space-between', borderTop: 'none' }}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <div className="surah-number" style={{ width: '1.5rem', height: '1.5rem', fontSize: '0.7rem' }}>{surah.id}</div>
                                                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{surah.name}</span>
                                                                {/* Issue #7: Show complete/incomplete status badge */}
                                                                <span className={`status-badge ${mindmap?.isComplete && mindmap?.imageUrl ? 'learned' : 'partial'}`} style={{ fontSize: '0.6rem', padding: '2px 6px' }}>
                                                                    {mindmap?.isComplete && mindmap?.imageUrl ? '✓' : '○'}
                                                                </span>
                                                            </div>
                                                            <ChevronDown size={16} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                                        </div>

                                                        {isExpanded && (
                                                            <div style={{ background: 'var(--background)', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                    <button
                                                                        className="upload-tile"
                                                                        style={{ padding: '0.5rem', height: 'auto', margin: 0, flex: 1, justifyContent: 'center', border: '1px dashed var(--border)', background: 'transparent', cursor: 'pointer' }}
                                                                        onClick={() => setActiveMindmapEditor({ surahId: surah.id, snapshot: mindmap?.tldrawSnapshot })}
                                                                    >
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                            <PenTool size={16} />
                                                                            <span style={{ fontSize: '0.75rem' }}>{mindmap?.tldrawSnapshot ? 'Edit Map' : 'Start Map'}</span>
                                                                        </div>
                                                                    </button>
                                                                    <button
                                                                        className={`btn ${!mindmap?.imageUrl ? 'btn-secondary' : 'btn-success'}`}
                                                                        disabled={!mindmap?.imageUrl}
                                                                        onClick={() => handleMarkComplete(surah.id, mindmap)}
                                                                        style={{ flex: 1, fontSize: '0.75rem', padding: '0.5rem' }}
                                                                    >
                                                                        <Check size={16} /> {mindmap?.isComplete ? 'Done' : 'Complete'}
                                                                    </button>
                                                                    {/* Issue #4: Delete button for mobile Surah Mindmaps */}
                                                                    {mindmap?.imageUrl && (
                                                                        <button
                                                                            className="btn btn-secondary"
                                                                            onClick={() => {
                                                                                if (confirm('Delete this mindmap?')) {
                                                                                    const updatedMap = { ...mindmap, imageUrl: null, tldrawSnapshot: undefined, isComplete: false };
                                                                                    setMindmaps(prev => ({ ...prev, [surah.id]: updatedMap }));
                                                                                    saveMindMap(updatedMap);
                                                                                    syncWithCloud().catch(console.error);
                                                                                }
                                                                            }}
                                                                            style={{ padding: '0.5rem', fontSize: '0.75rem', color: 'var(--danger)' }}
                                                                        >
                                                                            <Trash2 size={14} />
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                {/* Complex Anchor Builder Trigger */}
                                                                {mindmap?.imageUrl && (
                                                                    <button
                                                                        className="btn btn-secondary"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setActiveSlideOver({ type: 'surah', title: 'Surah Mindmaps', data: { surahId: surah.id } });
                                                                        }}
                                                                        style={{ width: '100%', padding: '0.5rem', fontSize: '0.75rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}
                                                                    >
                                                                        <Settings2 size={16} /> Manage Anchors (Advanced)
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {
                isAllDone && (
                    <div className="card modern-card" style={{ padding: '2rem', textAlign: 'center', background: 'var(--success-bg)', border: '1px solid var(--border)', borderRadius: '16px', marginBottom: '1.5rem' }}>
                        <div className="empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                            <Check size={48} style={{ color: 'var(--success)' }} />
                            <div>
                                <h2 style={{ color: 'var(--success)', marginBottom: '0.25rem' }}>All Clear!</h2>
                                <p style={{ color: 'var(--foreground-secondary)' }}>You've completed all pending tasks for this part.</p>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Mobile Slide-Over */}
            {
                activeSlideOver && (
                    <div className="slide-over-overlay" onClick={() => setActiveSlideOver(null)}>
                        <div className="slide-over-content" onClick={e => e.stopPropagation()}>
                            <div className="slide-over-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                                        {activeSlideOver.type === 'suspended' ? <AlertTriangle size={18} /> :
                                            activeSlideOver.type === 'similar' ? <Brain size={18} /> :
                                                activeSlideOver.type === 'part' ? <Map size={18} /> :
                                                    <MapPinned size={18} />}
                                    </div>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{activeSlideOver.title}</h3>
                                </div>
                                <button className="close-btn" onClick={() => setActiveSlideOver(null)}>
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="slide-over-body">
                                {activeSlideOver.type === 'suspended' && (
                                    <div className="mobile-node-list">
                                        {suspendedAnchors.length === 0 ? (
                                            <div className="empty-state">No suspended anchors!</div>
                                        ) : (
                                            suspendedAnchors.map(issue => {
                                                const key = `${issue.surahId}-${issue.anchorId}`;
                                                const surah = getSurah(issue.surahId);
                                                return (
                                                    <div key={key} className="mobile-node-card">
                                                        <div className="node-card-main">
                                                            <div className="node-target">
                                                                {surah?.name} - {issue.label}
                                                            </div>
                                                            <span className="status-badge not-remembered" style={{ background: 'var(--danger)', color: 'white' }}>Suspended</span>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                                            <button
                                                                className="btn btn-secondary"
                                                                onClick={() => setActiveMindmapEditor({ surahId: issue.surahId, snapshot: mindmaps[issue.surahId]?.tldrawSnapshot })}
                                                                style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', flex: 1 }}
                                                            >
                                                                <PenTool size={14} style={{ marginRight: '4px' }} />
                                                                Edit Map
                                                            </button>
                                                            <button
                                                                className="btn btn-primary"
                                                                style={{ padding: '0.4rem', fontSize: '0.75rem', flex: 1 }}
                                                                onClick={() => handleFixConfirm(issue.surahId, issue.anchorId)}
                                                            >
                                                                <Check size={14} style={{ marginRight: '4px' }} /> Confirm Fix
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}

                                {activeSlideOver.type === 'similar' && (
                                    <div className="mobile-node-list">
                                        {groupedSimilarity.length === 0 ? (
                                            <div className="empty-state">No similarity checks needed.</div>
                                        ) : (
                                            groupedSimilarity.map(({ surah, items, count }) => (
                                                <div key={surah!.id} className="mobile-node-card">
                                                    <div className="node-card-main" onClick={() => toggleSurahExpand(surah!.id)} style={{ marginBottom: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <div className="surah-number" style={{ width: '1.5rem', height: '1.5rem', fontSize: '0.75rem' }}>{surah!.id}</div>
                                                            <div className="node-target">{surah?.name}</div>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <span className="status-badge partial">{count} items</span>
                                                            <ChevronDown size={16} style={{ transform: expandedSurahs[surah!.id] ? 'rotate(180deg)' : 'none' }} />
                                                        </div>
                                                    </div>

                                                    {expandedSurahs[surah!.id] && (
                                                        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                            {items.map(({ err, muts }) => {
                                                                const abs = err.absoluteAyah!;
                                                                const ref = absoluteToSurahAyah(abs);
                                                                return muts.map((entry: any) => {
                                                                    const decisionKey = `${abs}-${entry.phraseId}`;
                                                                    const existing = decisions[decisionKey] || { status: 'pending', note: '' };
                                                                    const isConfirmed = !!existing.confirmedAt;
                                                                    const matches = entry.matches.filter((m: any) => m !== abs);

                                                                    return (
                                                                        <div key={decisionKey} style={{ padding: '0.75rem', background: 'var(--background)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                                                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Ayah {ref.ayahId}</span>
                                                                                {isConfirmed && <span style={{ color: 'var(--success)', fontSize: '0.7rem' }}>✓ Confirmed</span>}
                                                                            </div>

                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                                                                <select
                                                                                    value={existing.status}
                                                                                    onChange={e => handleSimilarityDecision(abs, e.target.value as any, entry.phraseId, false)}
                                                                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', fontSize: '0.8rem', border: '1px solid var(--border)' }}
                                                                                >
                                                                                    {MUT_STATES.map(s => (
                                                                                        <option key={s.value} value={s.value}>{s.label}</option>
                                                                                    ))}
                                                                                </select>
                                                                                <button
                                                                                    className={`btn ${isConfirmed ? 'btn-secondary' : 'btn-primary'}`}
                                                                                    onClick={() => handleSimilarityDecision(abs, existing.status, entry.phraseId, true)}
                                                                                    style={{ padding: '0.4rem', fontSize: '0.8rem', width: '100%' }}
                                                                                >
                                                                                    {isConfirmed ? 'Update' : 'Confirm'}
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                });
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}

                                {activeSlideOver.type === 'part' && (
                                    <div className="mobile-node-list">
                                        {partTasks.filter(t => t.part === activePart).map(({ part, mindmap }) => {
                                            const isComplete = mindmap?.isComplete && mindmap?.imageUrl;
                                            return (
                                                <div key={part} className="mobile-node-card">
                                                    <div className="node-card-main">
                                                        <div className="node-target">Part {part}</div>
                                                        <span className={`status-badge ${isComplete ? 'learned' : 'partial'}`}>
                                                            {isComplete ? 'Complete' : 'Incomplete'}
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <label className="upload-tile" style={{ padding: '0.5rem', height: 'auto', margin: 0, justifyContent: 'center', flex: 1 }}>
                                                            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handlePartMindmapUpdate(part, e.target.files?.[0] || null)} />
                                                            <span style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <ImageIcon size={16} /> {mindmap?.imageUrl ? 'Replace' : 'Upload'}
                                                            </span>
                                                        </label>
                                                        <button
                                                            className={`btn ${!mindmap?.imageUrl ? 'btn-secondary' : 'btn-success'}`}
                                                            disabled={!mindmap?.imageUrl}
                                                            onClick={() => handlePartComplete(part)}
                                                            style={{ padding: '0.5rem', fontSize: '0.8rem', flex: 1 }}
                                                        >
                                                            <Check size={16} /> {mindmap?.isComplete ? 'Done' : 'Complete'}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {activeSlideOver.type === 'surah' && (
                                    <div className="mobile-node-list">
                                        {(() => {
                                            const targetId = activeSlideOver.data?.surahId;
                                            const itemsToShow = targetId
                                                ? surahTasks.filter(t => t.surah.id === targetId)
                                                : incompleteSurahMaps;

                                            if (itemsToShow.length === 0) return <div className="empty-state">No surah mindmaps found.</div>;

                                            return itemsToShow.map(({ surah, mindmap }) => {
                                                const isExpanded = expandedSurahs[surah.id] || targetId === surah.id; // Auto-expand if targeted
                                                return (
                                                    <div key={surah.id} className="mobile-node-card">
                                                        <div className="node-card-main" onClick={() => toggleSurahExpand(surah.id)}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <div className="surah-number" style={{ width: '1.5rem', height: '1.5rem', fontSize: '0.75rem' }}>{surah.id}</div>
                                                                <div className="node-target">{surah.name}</div>
                                                            </div>
                                                            <ChevronDown size={16} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }} />
                                                        </div>

                                                        {isExpanded && (
                                                            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                                <button
                                                                    className="upload-tile"
                                                                    style={{ padding: '0.5rem', height: 'auto', margin: 0, border: '1px dashed var(--border)', background: 'transparent', width: '100%', cursor: 'pointer' }}
                                                                    onClick={() => setActiveMindmapEditor({ surahId: surah.id, snapshot: mindmap?.tldrawSnapshot })}
                                                                >
                                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                                                        <PenTool size={20} style={{ color: 'var(--accent)' }} />
                                                                        <span style={{ fontSize: '0.75rem' }}>{mindmap?.tldrawSnapshot ? 'Edit Mindmap' : 'Create Mindmap'}</span>
                                                                    </div>
                                                                </button>

                                                                {mindmap?.imageUrl && (
                                                                    <div style={{ marginTop: '0.5rem' }}>
                                                                        <div style={{ position: 'relative', width: '100%', height: '200px', marginBottom: '1rem', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                                                                            <img src={mindmap.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#f5f5f5' }} />
                                                                        </div>

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
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        })()}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            <DocumentationModal
                title="Todo & Setup Help"
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
        </div >
    );
}
