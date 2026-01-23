'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { SURAHS, getSurah, getQuranVerses } from '@/lib/quranData';
import {
    useInstantSettings,
    useInstantNodes,
    useInstantMindMaps,
    useInstantMutashabihat,
    useInstantReviewErrors
} from '@/hooks/useInstantData';
import { MindMap, PartMindMap, MutashabihatDecision, hasNodeBeenReviewed, QuranPart } from '@/lib/types';
import { getMutashabihatForAbsolute, absoluteToSurahAyah } from '@/lib/mutashabihat';
import { X } from 'lucide-react';
import MindmapEditor from '@/components/MindmapEditor';
import MindmapViewer from '@/components/MindmapViewer';
import TodoKanban from '@/components/todo/TodoKanban';
import { AnchorBuilderState } from '@/components/todo/AnchorBuilders';
import { appLogger } from '@/lib/logger';
import { useTheme } from '@/components/ThemeProvider';

export default function TodoPage() {
    const { settings, saveSettings } = useInstantSettings();
    const { nodes } = useInstantNodes();
    const { mindmaps: mindmapsList, partMindMaps: partMindmapsList, saveMindMap, savePartMindMap } = useInstantMindMaps();
    const { decisions, custom: customMutashabihat, saveDecision, saveCustom } = useInstantMutashabihat();
    const { errors } = useInstantReviewErrors();

    const mindmaps = useMemo(() => {
        const acc: Record<number, MindMap> = {};
        mindmapsList.forEach(mm => {
            acc[mm.surahId] = mm as unknown as MindMap;
        });
        return acc;
    }, [mindmapsList]);

    const partMindmapsMap = useMemo(() => {
        const acc: Record<number, PartMindMap> = {};
        partMindmapsList.forEach(pmm => {
            acc[pmm.partId] = pmm as unknown as PartMindMap;
        });
        return acc;
    }, [partMindmapsList]);

    const [anchorBuilders, setAnchorBuilders] = useState<Record<number, AnchorBuilderState>>({});
    const [verses, setVerses] = useState<{ surahId: number; ayahId: number; text: string }[]>([]);

    const hasReviewedChunks = useCallback((surahId: number) => {
        return nodes.some(n => n.type === 'verse_segment' && n.surahId === surahId && hasNodeBeenReviewed(n.scheduler));
    }, [nodes]);

    // Theme detection
    const { theme } = useTheme();
    const [systemIsDark, setSystemIsDark] = useState(false);
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const mq = window.matchMedia('(prefers-color-scheme: dark)');
            setSystemIsDark(mq.matches);
            const handler = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
            mq.addEventListener('change', handler);
            return () => mq.removeEventListener('change', handler);
        }
    }, []);
    const isDark = theme === 'system' ? systemIsDark : theme === 'dark';

    // Mindmap Editor State
    const [activeMindmapEditor, setActiveMindmapEditor] = useState<{ surahId: number; snapshot?: any } | null>(null);
    const [activePartEditor, setActivePartEditor] = useState<{ partId: QuranPart; snapshot?: any } | null>(null);
    const [activeMindmapPreview, setActiveMindmapPreview] = useState<{ surahId: number; snapshot?: any; imageUrl?: string | null; imageUrlDark?: string | null } | null>(null);

    useEffect(() => {
        getQuranVerses()
            .then(setVerses)
            .catch(() => setVerses([]));
    }, []);

    const decisionsMap = useMemo(() => {
        const acc: Record<string, any> = {};
        decisions.forEach(d => {
            acc[d.id] = d;
        });
        return acc;
    }, [decisions]);

    const activePart = settings.activePart;

    const surahTasks = useMemo(() => {
        const eligible = SURAHS.filter(s =>
            (activePart === 5 || s.part === activePart) &&
            !settings.skippedSurahs?.includes(s.id)
        );
        return eligible
            .map(s => ({ surah: s, mindmap: mindmaps[s.id] }))
            .sort((a, b) => a.surah.id - b.surah.id);
    }, [mindmaps, activePart, settings.skippedSurahs]);

    const partTasks = useMemo(() => {
        const parts: QuranPart[] = [1, 2, 3, 4];
        return parts
            .filter(p => activePart === 5 || p === activePart)
            .map(p => ({ part: p, mindmap: partMindmapsMap[p] }));
    }, [partMindmapsMap, activePart]);

    const similarityItems = useMemo(() => {
        return errors
            .filter(e => e.type === 'similarity' && e.absoluteAyah)
            .map(err => {
                const muts = getMutashabihatForAbsolute(err.absoluteAyah!, customMutashabihat);
                return { err, muts };
            })
            .filter(entry => {
                const absolute = entry.err.absoluteAyah!;
                const verseDecision = decisionsMap[absolute.toString()];
                if (verseDecision?.status === 'ignored' || !!verseDecision?.confirmedAt) return false;

                const anyPhraseConfirmed = entry.muts.some((m: any) => {
                    const phraseDecision = decisionsMap[`${absolute}-${m.phraseId}`];
                    return !!phraseDecision?.confirmedAt;
                });

                return !anyPhraseConfirmed;
            });
    }, [errors, decisionsMap, customMutashabihat]);

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

    const handleSaveAnchors = async (surahId: number, verseCount: number) => {
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
            surahId,
            startVerse: a.start,
            endVerse: a.end,
            label: a.label,
        }));
        await saveMindMap(surahId, { ...existing, anchors: newAnchors });
    };

    const handleMarkComplete = async (surahId: number, currentMindmap?: any, forceState?: boolean) => {
        const existing = currentMindmap || mindmaps[surahId] || { surahId, anchors: [], imageUrl: null, isComplete: false };
        const tldrawSnapshot = currentMindmap?.tldrawSnapshot || existing.tldrawSnapshot;

        const updated = {
            ...existing,
            imageUrl: undefined, // Clear images to save storage
            imageUrlDark: undefined,
            tldrawSnapshot,
            isComplete: forceState !== undefined ? forceState : !existing.isComplete
        };

        await saveMindMap(surahId, updated);
    };

    const handleImportPremade = async (type: 'surah' | 'part', id: number) => {
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
                                    surahId: id,
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
                await saveMindMap(id, updated);
            } else {
                const pId = id as QuranPart;
                const existing = partMindmapsMap[pId] || { partId: pId, description: '', imageUrl: null, isComplete: false };
                const updated = {
                    ...existing,
                    ...data,
                    partId: pId,
                    isComplete: true
                };
                await savePartMindMap(pId, updated);
            }
            appLogger.addLog(`Imported premade mindmap for ${type} ${id}`, 'success');
            alert(`Premade mindmap for ${type} ${id} successfully imported!${importedAnchors.length > 0 ? ` (Imported ${importedAnchors.length} verse chunks)` : ''}`);
        } catch (error) {
            console.error('Import failed:', error);
            alert('Failed to import mindmap. Please try again.');
        }
    };

    const handlePartComplete = async (part: QuranPart, forceState?: boolean) => {
        const existing = partMindmapsMap[part] || { partId: part, imageUrl: null, description: '', isComplete: false };
        const updated = { ...existing, isComplete: forceState !== undefined ? forceState : !existing.isComplete };
        await savePartMindMap(part, updated);
    };

    const handleFixConfirm = (_surahId: number, _anchorId: string) => {
        // No-op for now as clearAnchorIssues was a no-op
    };

    const handleSimilarityDecision = async (absoluteAyah: number, status: MutashabihatDecision['status'], phraseId?: string, confirm: boolean = true) => {
        if (phraseId?.startsWith('custom-')) {
            const customId = phraseId.replace('custom-', '');
            const mut = customMutashabihat.find((m: any) => m.id === customId);
            if (mut) {
                await saveCustom({ ...mut, status });
            }
        }

        const key = phraseId ? `${absoluteAyah}-${phraseId}` : absoluteAyah.toString();
        const existing = decisions.find(d => d.phraseId === key) || { status: 'pending', note: '' };
        await saveDecision(key, {
            ...existing,
            status,
            confirmedAt: confirm ? new Date().toISOString() : existing.confirmedAt
        });
    };

    const handleEditorSave = useCallback(async (snapshot: any, images?: { light?: Blob, dark?: Blob }, shouldClose: boolean = true) => {
        if (!activeMindmapEditor) return;
        const { surahId } = activeMindmapEditor;

        const save = async (lightUrl: string | null, darkUrl: string | null) => {
            const existing = mindmaps[surahId] || { surahId, anchors: [], imageUrl: null, isComplete: false };
            const updated = {
                ...existing,
                imageUrl: lightUrl || undefined,
                imageUrlDark: darkUrl || undefined,
                tldrawSnapshot: snapshot
            };
            await saveMindMap(surahId, updated);
            if (shouldClose) {
                setActiveMindmapEditor(null);
            }
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
            await save(light, dark);
        } else {
            await save(null, null);
        }
    }, [activeMindmapEditor, mindmaps, saveMindMap]);

    const handlePartEditorSave = useCallback(async (snapshot: any, images?: { light?: Blob, dark?: Blob }, shouldClose: boolean = true) => {
        if (!activePartEditor) return;
        const { partId } = activePartEditor;

        const save = async (lightUrl: string | null, darkUrl: string | null) => {
            const existing = partMindmapsMap[partId] || { partId, imageUrl: null, description: '', isComplete: false };
            const updated = {
                ...existing,
                imageUrl: lightUrl || undefined,
                imageUrlDark: darkUrl || undefined,
                tldrawSnapshot: snapshot
            };
            await savePartMindMap(partId, updated);
            if (shouldClose) {
                setActivePartEditor(null);
            }
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
            await save(light, dark);
        } else {
            await save(null, null);
        }
    }, [activePartEditor, partMindmapsMap, savePartMindMap]);

    return (
        <div className="content-wrapper">
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
            <div className="content-wrapper !max-w-full h-full flex flex-col">
                <TodoKanban
                    suspendedAnchors={[]}
                    similarityGroups={groupedSimilarity}
                    partTasks={partTasks}
                    surahTasks={surahTasks}
                    verses={verses}
                    mindmaps={mindmaps}
                    isDark={isDark}
                    // Persisted State
                    kanbanState={settings.kanbanColumns}
                    onKanbanStateChange={(cols) => {
                        saveSettings({
                            kanbanColumns: cols
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
                    onDeleteMindmap={async (type, id) => {
                        if (type === 'surah') {
                            const existing = mindmaps[id] || { surahId: id, anchors: [], imageUrl: null, isComplete: false };
                            const updated = { ...existing, imageUrl: null, imageUrlDark: null, tldrawSnapshot: undefined, isComplete: false };
                            await saveMindMap(id, updated);
                        } else {
                            const pId = id as QuranPart;
                            const existing = partMindmapsMap[pId] || { partId: pId, description: '', imageUrl: null, isComplete: false };
                            const updated = { ...existing, imageUrl: null, imageUrlDark: null, tldrawSnapshot: undefined, isComplete: false };
                            await savePartMindMap(pId, updated);
                        }
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
