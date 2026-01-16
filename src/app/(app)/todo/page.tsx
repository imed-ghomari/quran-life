'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import Image from 'next/image';
import { SURAHS, getSurah, getSurahsByPart, parseQuranJson } from '@/lib/quranData';
import {
    getMindMaps,
    getMindMap,
    saveMindMap,
    getPartMindMaps,
    getPartMindMap,
    savePartMindMap,
    getSettings,
    saveSettings,
    getReviewErrors,
    getSuspendedAnchors,
    clearAnchorIssues,
    getMutashabihatDecisions,
    setMutashabihatDecision,
    getCustomMutashabihat,
    saveCustomMutashabih,
    hasNodeBeenReviewed,
    CustomMutashabih,
    isSurahSkipped,
    MutashabihatDecision,
    getMemoryNodes,
} from '@/lib/storage';
import { getMutashabihatForAbsolute, absoluteToSurahAyah } from '@/lib/mutashabihat';
import { QuranPart } from '@/lib/types';
import { syncWithCloud } from '@/lib/sync';
import { ChevronDown, Brain, Map, MapPinned, AlertTriangle, ShieldAlert, SplitSquareHorizontal, Check, ImageIcon, ChevronRight, X, AlertCircle, Download, Upload, MoreVertical, FileText, Settings2, PenTool, Trash2, Plus, Minus, Info } from 'lucide-react';
import MindmapEditor from '@/components/MindmapEditor';
import MindmapViewer from '@/components/MindmapViewer';
import TodoKanban from '@/components/todo/TodoKanban';
import { AnchorBuilderState } from '@/components/todo/AnchorBuilders'; // Import type if needed for state definition
import { appLogger } from '@/lib/logger';
import Link from 'next/link';

export default function TodoPage() {
    const [mindmaps, setMindmaps] = useState(getMindMaps());
    const [partMindmaps, setPartMindmaps] = useState(getPartMindMaps());
    const [settingsVersion, setSettingsVersion] = useState(0);
    const [anchorBuilders, setAnchorBuilders] = useState<Record<number, AnchorBuilderState>>({});
    const [decisions, setDecisions] = useState<Record<string, any>>(getMutashabihatDecisions());
    const [verses, setVerses] = useState<{ surahId: number; ayahId: number; text: string }[]>([]);

    // Theme detection
    const [isDark, setIsDark] = useState(false);
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const mq = window.matchMedia('(prefers-color-scheme: dark)');
            setIsDark(mq.matches);
            const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
            mq.addEventListener('change', handler);
            return () => mq.removeEventListener('change', handler);
        }
    }, []);

    // Mindmap Editor State (for Surah and Part mindmaps)
    const [activeMindmapEditor, setActiveMindmapEditor] = useState<{ surahId: number; snapshot?: any } | null>(null);
    const [activePartEditor, setActivePartEditor] = useState<{ partId: QuranPart; snapshot?: any } | null>(null);

    const [activeMindmapPreview, setActiveMindmapPreview] = useState<{ surahId: number; snapshot?: any; imageUrl?: string | null; imageUrlDark?: string | null } | null>(null);


    const hasReviewedChunks = (surahId: number) => {
        const nodes = getMemoryNodes();
        return nodes.some(n => n.type === 'verse' && n.surahId === surahId && hasNodeBeenReviewed(n.scheduler));
    };

    const settings = getSettings();

    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === null || e.key.startsWith('quran-app-')) {
                setSettingsVersion(v => v + 1);
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

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



    const activePart = settings.activePart;

    const surahTasks = useMemo(() => {
        const learnedSurahIds = new Set(Object.keys(settings.learnedVerses || {}).map(Number));
        const eligible = SURAHS.filter(s =>
            (activePart === 5 || s.part === activePart) &&
            !isSurahSkipped(s.id) &&
            learnedSurahIds.has(s.id)
        );
        return eligible
            .map(s => ({ surah: s, mindmap: mindmaps[s.id] }))
            .sort((a, b) => a.surah.id - b.surah.id);
    }, [mindmaps, activePart, settings.learnedVerses]);

    const partTasks = useMemo(() => {
        const parts: QuranPart[] = [1, 2, 3, 4];
        return parts
            .filter(p => activePart === 5 || p === activePart)
            .map(p => ({ part: p, mindmap: partMindmaps[p] }));
    }, [partMindmaps, activePart]);

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

    const handleAddBreak = (surahId: number, breakPoint: number) => {
        const current = getBuilderState(surahId);
        const nextBreaks = Array.from(new Set([...current.breaks, breakPoint])).sort((a, b) => a - b);
        setAnchorBuilders(prev => ({ ...prev, [surahId]: { ...current, breaks: nextBreaks } }));
    };

    const handleRemoveBreakValue = (surahId: number, breakPoint: number) => {
        const current = getBuilderState(surahId);
        const nextBreaks = current.breaks.filter(b => b !== breakPoint);
        setAnchorBuilders(prev => ({ ...prev, [surahId]: { ...current, breaks: nextBreaks } }));
    };

    const handleSaveAnchors = (surahId: number, verseCount: number) => {
        const builder = getBuilderState(surahId);
        const boundaries = [1, ...builder.breaks, verseCount + 1];
        const anchors = boundaries.slice(0, -1).map((start, idx) => {
            const end = boundaries[idx + 1] - 1;
            const label = builder.labels[idx] || `Verses ${start}-${end}`;
            return { start, end, label };
        });

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

    const handleMarkComplete = (surahId: number, currentMindmap?: any, forceState?: boolean) => {
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
            isComplete: forceState !== undefined ? forceState : !existing.isComplete
        };

        saveMindMap(updated);

        // Update local state to reflect change immediately
        setMindmaps(prev => ({ ...prev, [surahId]: updated }));
        setSettingsVersion(v => v + 1);
        // syncWithCloud().catch(console.error);
    };

    const handleImportPremade = async (type: 'surah' | 'part', id: number) => {
        // Implementation follows "Working on a Copy" pattern:
        // We fetch official templates from /assets/premade-mindmaps/ but save them to the user's 
        // local storage. This allows users to modify their copy while the documentation 
        // remains linked to the original official template.
        try {
            const response = await fetch(`/assets/premade-mindmaps/${type}-${id}.tldraw`);
            if (!response.ok) {
                if (response.status === 404) {
                    alert(`Premade mindmap for this ${type} is not available yet.`);
                } else {
                    alert(`Failed to import mindmap: ${response.statusText}`);
                }
                return;
            }
            const data = await response.json();

            // Try to fetch premade anchors for surahs
            let importedAnchors: any[] = [];
            if (type === 'surah') {
                try {
                    const anchorResponse = await fetch(`/assets/premade-mindmaps/surah-${id}.chunks.txt`);
                    if (anchorResponse.ok) {
                        const text = await anchorResponse.text();
                        importedAnchors = text.split('\n')
                            .filter(line => line.trim())
                            .map((line, idx) => {
                                const parts = line.split('|').map(s => s.trim());
                                const range = parts[0];
                                const label = parts[1]; // Might be undefined
                                const [start, end] = range.split('-').map(n => parseInt(n.trim()));

                                // Skip if invalid range
                                if (isNaN(start)) return null;

                                return {
                                    id: `imported-${id}-${idx}-${Date.now()}`,
                                    startVerse: start,
                                    endVerse: end || start,
                                    label: label || `Chunk ${idx + 1}`
                                };
                            })
                            .filter(Boolean); // Filter out nulls
                        appLogger.addLog(`Found and parsed ${importedAnchors.length} anchors for surah ${id}`, 'info');
                    }
                } catch (anchorError) {
                    console.warn('Error fetching or parsing premade anchors:', anchorError);
                }
            }

            if (type === 'surah') {
                const existing = mindmaps[id] || { surahId: id, anchors: [], imageUrl: null, isComplete: false };
                const updated = {
                    ...existing,
                    ...data,
                    surahId: id, // Ensure ID matches
                    anchors: importedAnchors.length > 0 ? importedAnchors : (existing.anchors || []),
                    isComplete: true
                };
                saveMindMap(updated);
                setMindmaps(prev => ({ ...prev, [id]: updated }));
            } else {
                const pId = id as QuranPart;
                const existing = partMindmaps[pId] || { partId: pId, description: '', imageUrl: null, isComplete: false };
                const updated = {
                    ...existing,
                    ...data,
                    partId: pId,
                    isComplete: true
                };
                savePartMindMap(updated);
                setPartMindmaps(prev => ({ ...prev, [pId]: updated }));
            }
            appLogger.addLog(`Imported premade mindmap for ${type} ${id}`, 'success');
            setSettingsVersion(v => v + 1);
            alert(`Premade mindmap for ${type} ${id} successfully imported!${importedAnchors.length > 0 ? ` (Imported ${importedAnchors.length} verse chunks)` : ''}`);
        } catch (error) {
            console.error('Import failed:', error);
            alert('Failed to import mindmap. Please try again.');
        }
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

    const handlePartComplete = (part: QuranPart, forceState?: boolean) => {
        // Read directly from storage to avoid stale state closures
        const freshMaps = getPartMindMaps();
        const existing = freshMaps[part] || { partId: part, imageUrl: null, description: '', isComplete: false };

        const updated = { ...existing, isComplete: forceState !== undefined ? forceState : !existing.isComplete };
        savePartMindMap(updated);

        // Update local state to reflect change immediately
        setPartMindmaps(prev => ({ ...prev, [part]: updated }));
        setSettingsVersion(v => v + 1);
        // syncWithCloud().catch(console.error);
    };

    const handleFixConfirm = (surahId: number, anchorId: string) => {
        // We assume the user has already edited the mindmap if needed.
        // This function just resolves the specific issue.
        clearAnchorIssues(surahId, anchorId);
        setSettingsVersion(v => v + 1);
        // syncWithCloud().catch(console.error);
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

    const handleEditorSave = async (snapshot: any, images?: { light?: Blob, dark?: Blob }) => {
        if (!activeMindmapEditor) return;
        const { surahId } = activeMindmapEditor;

        const save = (lightUrl: string | null, darkUrl: string | null) => {
            const existing = getMindMap(surahId);
            const updated = {
                ...existing,
                imageUrl: lightUrl || existing.imageUrl,
                imageUrlDark: darkUrl || existing.imageUrlDark,
                tldrawSnapshot: snapshot
            };
            saveMindMap(updated);
            setMindmaps(prev => ({ ...prev, [surahId]: updated }));
            setSettingsVersion(v => v + 1);
            setActiveMindmapEditor(null);
            // syncWithCloud().catch(console.error);
        };

        if (images && (images.light || images.dark)) {
            const blobs = images;

            const processBlob = (blob: Blob | undefined): Promise<string | null> => {
                if (!blob) return Promise.resolve(null);
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });
            };

            const [light, dark] = await Promise.all([
                processBlob(blobs.light),
                processBlob(blobs.dark)
            ]);
            save(light, dark);
        } else {
            save(null, null);
        }
    };

    const handlePartEditorSave = async (snapshot: any, images?: { light?: Blob, dark?: Blob }) => {
        if (!activePartEditor) return;
        const { partId } = activePartEditor;

        const save = (lightUrl: string | null, darkUrl: string | null) => {
            const existing = getPartMindMap(partId);
            const updated = {
                ...existing,
                imageUrl: lightUrl || existing.imageUrl,
                imageUrlDark: darkUrl || existing.imageUrlDark,
                tldrawSnapshot: snapshot
            };
            savePartMindMap(updated);
            setPartMindmaps(prev => ({ ...prev, [partId]: updated }));
            setSettingsVersion(v => v + 1);
            setActivePartEditor(null);
            // syncWithCloud().catch(console.error);
        };

        if (images && (images.light || images.dark)) {
            const blobs = images;

            const processBlob = (blob: Blob | undefined): Promise<string | null> => {
                if (!blob) return Promise.resolve(null);
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });
            };

            const [light, dark] = await Promise.all([
                processBlob(blobs.light),
                processBlob(blobs.dark)
            ]);
            save(light, dark);
        } else {
            save(null, null);
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
                    docLink={`/docs/mindmaps/surah-${activeMindmapEditor.surahId}`}
                />
            )}
            {/* Part Mindmap Editor */}
            {activePartEditor && (
                <MindmapEditor
                    initialSnapshot={activePartEditor.snapshot}
                    onSave={handlePartEditorSave}
                    onClose={() => setActivePartEditor(null)}
                    title={`Part ${activePartEditor.partId} Mindmap Editor`}
                    docLink={`/docs/mindmaps/part-${activePartEditor.partId}`}
                />
            )}

            {/* Mindmap Preview Modal */}
            {activeMindmapPreview && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 10000,
                    background: 'var(--background)',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <div style={{
                        height: '50px',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 1rem'
                    }}>
                        <span style={{ fontWeight: 600 }}>Mindmap Preview</span>
                        <button
                            onClick={() => setActiveMindmapPreview(null)}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--foreground)' }}
                        >
                            <X size={24} />
                        </button>
                    </div>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <MindmapViewer
                            snapshot={activeMindmapPreview.snapshot}
                            imageUrl={activeMindmapPreview.imageUrl}
                            imageUrlDark={activeMindmapPreview.imageUrlDark}
                            isDark={isDark}
                            title="Mindmap Preview"
                            height="100%"
                        />
                    </div>
                </div>
            )}
            {/* Kanban Board Replacement */}
            <div className="h-[calc(100vh-100px)] w-full overflow-hidden mt-4">
                <TodoKanban
                    suspendedAnchors={suspendedAnchors}
                    similarityGroups={groupedSimilarity}
                    partTasks={partTasks}
                    surahTasks={surahTasks}
                    verses={verses}
                    decisions={decisions}
                    mindmaps={mindmaps}
                    partMindmaps={partMindmaps}
                    isDark={isDark}
                    // Persisted State
                    kanbanState={settings.kanbanColumns}
                    onKanbanStateChange={(cols) => {
                        const s = getSettings();
                        s.kanbanColumns = cols;
                        saveSettings(s);
                        setSettingsVersion(v => v + 1);
                        
                        // Mark as pending change for sync engine
                        import('@/lib/syncEngine').then(({ markPendingChanges }) => {
                            markPendingChanges();
                        });
                    }}
                    onFixConfirm={handleFixConfirm}
                    onSimilarityDecision={handleSimilarityDecision}
                    onPartComplete={handlePartComplete}
                    onSurahComplete={handleMarkComplete}
                    onImportPremade={handleImportPremade}
                    onEditMindmap={(id, snapshot, isPart) => {
                        if (isPart) {
                            setActivePartEditor({ partId: id as any, snapshot });
                        } else {
                            setActiveMindmapEditor({ surahId: id, snapshot });
                        }
                    }}
                    onViewMindmap={(data) => setActiveMindmapPreview(data)}
                    onDeleteMindmap={(type, id) => {
                        if (type === 'surah') {
                            const existing = mindmaps[id] || { surahId: id, anchors: [], imageUrl: null, isComplete: false };
                            saveMindMap({ ...existing, imageUrl: null, imageUrlDark: null, tldrawSnapshot: undefined, isComplete: false });
                            setMindmaps(prev => ({ ...prev, [id]: { ...existing, imageUrl: null, imageUrlDark: null, tldrawSnapshot: undefined, isComplete: false } }));
                        } else {
                            const pId = id as QuranPart;
                            const existing = partMindmaps[pId] || { partId: pId, description: '', imageUrl: null, isComplete: false };
                            savePartMindMap({ ...existing, imageUrl: null, imageUrlDark: null, tldrawSnapshot: undefined, isComplete: false });
                            setPartMindmaps(prev => ({ ...prev, [pId]: { ...existing, imageUrl: null, imageUrlDark: null, tldrawSnapshot: undefined, isComplete: false } }));
                        }
                        setSettingsVersion(v => v + 1);
                    }}
                    getBuilderState={getBuilderState}
                    onAddBreak={(sid, val) => handleAddBreak(sid, val)}
                    onRemoveBreak={(sid, val) => handleRemoveBreakValue(sid, val)}
                    onSaveAnchors={handleSaveAnchors}
                    hasReviewedChunks={hasReviewedChunks}
                />
            </div>
        </div >
    );
}
