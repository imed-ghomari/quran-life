'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { SURAHS, getSurah, getQuranVerses } from '@/lib/quranData';
import {
    useInstantSettings,
    useInstantNodes,
    useInstantMindMaps,
    useInstantMutashabihat,
    useInstantReviewErrors
} from '@/hooks/useInstantData';
import { MindMap, PartMindMap, MutashabihatDecision, hasNodeBeenReviewed, QuranPart, MemoryNode } from '@/lib/types';
import { createNewFSRSState } from '@/lib/fsrs';
import { getMutashabihatForAbsolute, absoluteToSurahAyah } from '@/lib/mutashabihat';
import { X } from 'lucide-react';
import MindmapEditor from '@/components/MindmapEditor';
import MindmapViewer from '@/components/MindmapViewer';
import TodoKanban from '@/components/todo/TodoKanban';
import { AnchorBuilderState } from '@/components/todo/AnchorBuilders';
import { appLogger } from '@/lib/logger';
import { APP_MODE, isOwnerMode } from '@/lib/appMode';
// Theme hook for responsive design adjustments
import { useTheme } from '@/components/ThemeProvider';


/**
 * TodoPage Component
 * 
 * This is the main controller for the Quran Life Kanban board.
 * It handles:
 * 1. Data synchronization with InstantDB (Settings, Nodes, Mindmaps, Errors).
 * 2. Aggregating tasks (Surahs/Parts) into Kanban columns.
 * 3. Managing "Mutashabihat" (Similarity) errors and resolution flows.
 * 4. Editor state for Mindmaps (Surah and Part level).
 * 5. Anchor building logic for defining verse ranges.
 */
export default function TodoPage() {
    // -- 1. Data Hooks: Syncing with InstantDB --
    const { settings, saveSettings } = useInstantSettings();
    const { nodes, saveNode } = useInstantNodes();
    // Raw lists from DB - might contain duplicates due to sync/offline issues
    const { mindmaps: mindmapsList, partMindMaps: partMindmapsList, saveMindMap, savePartMindMap, deleteMindMap, deletePartMindMap, isLoading: mindmapsLoading } = useInstantMindMaps();

    // Debug logging for development
    useEffect(() => {
        console.log('mindmapsList updated:', mindmapsList);
    }, [mindmapsList]);
    const { decisions, custom: customMutashabihat, saveDecision, saveCustom } = useInstantMutashabihat();
    const { errors } = useInstantReviewErrors();

    const appMode = APP_MODE;
    const [premadeIndex, setPremadeIndex] = useState<{ surah: number[]; part: number[]; updatedAt?: string } | null>(null);
    const autoImportedRef = useRef<Set<string>>(new Set());

    // -- 2. Data Memoization & Deduplication --
    // We map raw lists to a dictionary for O(1) access. 
    // CRITICAL: We also handle duplicates here. If multiple records exist for the same Surah/Part,
    // we only take the FIRST one. This prevents "ghost" items from overwriting valid data.
    const mindmaps = useMemo(() => {
        const acc: Record<number, MindMap> = {};
        mindmapsList.forEach(mm => {
            const sId = Number(mm.surahId);
            if (!acc[sId]) {
                // First-Wins strategy: Only assign if key doesn't exist yet.
                acc[sId] = mm as unknown as MindMap;
            }
        });
        return acc;
    }, [mindmapsList]);

    const partMindmapsMap = useMemo(() => {
        const acc: Record<number, PartMindMap> = {};
        partMindmapsList.forEach(pmm => {
            const pId = Number(pmm.partId);
            if (!acc[pId]) {
                // First-Wins strategy for Parts as well
                acc[pId] = pmm as unknown as PartMindMap;
            }
        });
        return acc;
    }, [partMindmapsList]);

    // -- 3. Local UI State --
    const [anchorBuilders, setAnchorBuilders] = useState<Record<number, AnchorBuilderState>>({});
    const [verses, setVerses] = useState<{ surahId: number; ayahId: number; text: string }[]>([]);

    // Check if the user has already reviewed chunks for this Surah (used to lock anchor editing)
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

    // -- 4. Task Aggregation --
    const activePart = settings.activePart;

    // Filter Surahs based on the user's active part setting
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

    // Gather Similarity Errors (Mutashabihat) that need resolution
    const similarityItems = useMemo(() => {
        return errors
            .filter(e => e.type === 'similarity' && e.absoluteAyah)
            .map(err => {
                const muts = getMutashabihatForAbsolute(err.absoluteAyah!, customMutashabihat);
                return { err, muts };
            })
            // Filter out items that are already resolved/ignored
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

    // Group similarity items by Surah for cleaner display in Kanban
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



    // -- 5. Anchor Logic --
    // Anchors define the breakdown of a Surah into chunks for memorization.
    const getBuilderState = (surahId: number) => {
        if (anchorBuilders[surahId]) return anchorBuilders[surahId];
        const surahMeta = SURAHS.find(s => s.id === surahId);
        const verseCount = surahMeta?.verseCount || 1;
        const mindmap = mindmaps[surahId];
        // If anchors exist in DB, rehydrate the builder state
        if (mindmap?.anchors?.length) {
            const sorted = [...mindmap.anchors].sort((a, b) => a.startVerse - b.startVerse);
            const breaks = sorted.slice(0, -1).map(a => Math.min(Math.max(1, a.endVerse + 1), verseCount - 1));
            const labels: Record<number, string> = {};
            sorted.forEach((a, idx) => { labels[idx] = a.label; });
            return { breaks, labels };
        }
        // Default clean state
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

    // Marks a Mindmap (Surah level) as complete/incomplete
    const handleMarkComplete = async (surahId: number, currentMindmap?: any, forceState?: boolean) => {
        console.log('handleMarkComplete called:', { surahId, forceState, currentMindmap });
        const existing = currentMindmap || mindmaps[surahId] || { surahId, anchors: [], imageUrl: null, isComplete: false };
        const tldrawSnapshot = currentMindmap?.tldrawSnapshot || existing.tldrawSnapshot;

        const isNowComplete = forceState !== undefined ? forceState : !existing.isComplete;
        console.log('isNowComplete:', isNowComplete);

        const updated = {
            ...existing,
            imageUrl: undefined, // Clear images to save storage
            imageUrlDark: undefined,
            tldrawSnapshot,
            isComplete: isNowComplete
        };

        await saveMindMap(surahId, updated);

        // If marking as complete, ensure a MemoryNode exists for scheduling
        if (isNowComplete) {
            console.log('Checking for existing mindmap MemoryNode for surah:', surahId);
            const existingNode = nodes.find(n => n.type === 'mindmap' && n.surahId === surahId);
            console.log('Existing node found:', existingNode);
            if (!existingNode) {
                const newNode: MemoryNode = {
                    id: crypto.randomUUID(),
                    type: 'mindmap',
                    surahId: surahId,
                    scheduler: createNewFSRSState(),
                    createdAt: new Date().toISOString()
                };
                console.log('Creating new MemoryNode:', newNode);
                await saveNode(newNode);
                appLogger.addLog(`Created scheduling node for Surah ${surahId} mindmap`, 'info');
                console.log('MemoryNode created successfully');
            } else {
                console.log('MemoryNode already exists, skipping creation');
            }
        }
    };

    const handleImportPremade = useCallback(async (type: 'surah' | 'part', id: number, options?: { silent?: boolean }) => {
        try {
            const response = await fetch(`/assets/premade-mindmaps/${type}-${id}.tldraw`);
            if (!response.ok) {
                if (response.status === 404) {
                    if (!options?.silent) {
                        alert(`Premade mindmap for this ${type} is not available yet.`);
                    }
                } else {
                    if (!options?.silent) {
                        alert(`Failed to import mindmap: ${response.statusText}`);
                    }
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
                    surahId: id, // Ensure ID matches
                    anchors: importedAnchors.length > 0 ? importedAnchors : (existing.anchors || []),
                    imageUrl: undefined,
                    imageUrlDark: undefined,
                    tldrawSnapshot: data,
                    isComplete: true,
                    source: 'premade' as const,
                    premadeId: `surah-${id}`,
                    premadeImportedAt: new Date().toISOString(),
                    premadeEdited: false
                };
                await saveMindMap(id, updated);
            } else {
                const pId = id as QuranPart;
                const existing = partMindmapsMap[pId] || { partId: pId, description: '', imageUrl: null, isComplete: false };
                const updated = {
                    ...existing,
                    partId: pId,
                    imageUrl: undefined,
                    imageUrlDark: undefined,
                    tldrawSnapshot: data,
                    isComplete: true,
                    source: 'premade' as const,
                    premadeId: `part-${id}`,
                    premadeImportedAt: new Date().toISOString(),
                    premadeEdited: false
                };
                await savePartMindMap(pId, updated);
            }
            appLogger.addLog(`Imported premade mindmap for ${type} ${id}`, 'success');
            if (!options?.silent) {
                alert(`Premade mindmap for ${type} ${id} successfully imported!${importedAnchors.length > 0 ? ` (Imported ${importedAnchors.length} verse chunks)` : ''}`);
            }
        } catch (error) {
            console.error('Import failed:', error);
            if (!options?.silent) {
                alert('Failed to import mindmap. Please try again.');
            }
        }
    }, [mindmaps, partMindmapsMap, saveMindMap, savePartMindMap]);

    const handleExportPremade = useCallback(async (type: 'surah' | 'part', id: number) => {
        const mindmap = type === 'surah' ? mindmaps[id] : partMindmapsMap[id];
        if (!mindmap?.tldrawSnapshot) {
            alert('No tldraw mindmap found to export.');
            return;
        }
        const anchors = type === 'surah' ? (mindmaps[id]?.anchors || []) : [];
        try {
            const response = await fetch('/api/premade-mindmaps/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type,
                    id,
                    tldrawSnapshot: mindmap.tldrawSnapshot,
                    anchors
                })
            });
            if (!response.ok) {
                const msg = await response.text();
                alert(`Export failed: ${msg || response.statusText}`);
                return;
            }
            const data = await response.json();
            setPremadeIndex(data.index || null);
            appLogger.addLog(`Exported premade mindmap for ${type} ${id}`, 'success');
            alert(`Premade mindmap for ${type} ${id} exported successfully.`);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Failed to export mindmap. Please try again.');
        }
    }, [mindmaps, partMindmapsMap]);

    const handleResetMindmap = useCallback(async (type: 'surah' | 'part', id: number) => {
        await handleImportPremade(type, id);
    }, [handleImportPremade]);

    useEffect(() => {
        if (isOwnerMode) return;
        fetch('/assets/premade-mindmaps/index.json', { cache: 'no-store' })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data && Array.isArray(data.surah) && Array.isArray(data.part)) {
                    setPremadeIndex(data);
                } else {
                    setPremadeIndex({ surah: [], part: [] });
                }
            })
            .catch(() => setPremadeIndex({ surah: [], part: [] }));
    }, [isOwnerMode]);

    useEffect(() => {
        if (isOwnerMode) return;
        if (mindmapsLoading) return;
        if (!premadeIndex) return;

        const hasAnyPremade = premadeIndex.surah.length > 0 || premadeIndex.part.length > 0;
        if (!hasAnyPremade) return;

        (async () => {
            let importedAny = false;

            for (const id of premadeIndex.surah) {
                const key = `surah-${id}`;
                if (autoImportedRef.current.has(key)) continue;
                if (mindmaps[id]) continue; // preserve user-created mindmap
                await handleImportPremade('surah', id, { silent: true });
                autoImportedRef.current.add(key);
                importedAny = true;
            }

            for (const id of premadeIndex.part) {
                const key = `part-${id}`;
                if (autoImportedRef.current.has(key)) continue;
                if (partMindmapsMap[id]) continue; // preserve user-created mindmap
                await handleImportPremade('part', id, { silent: true });
                autoImportedRef.current.add(key);
                importedAny = true;
            }

            if (importedAny) {
                appLogger.addLog('Auto-imported premade mindmaps (per missing item)', 'info');
            }
        })();
    }, [isOwnerMode, premadeIndex, mindmaps, partMindmapsMap, mindmapsLoading, handleImportPremade]);

    const hasPremadeMindmap = useCallback((type: 'surah' | 'part', id: number) => {
        if (!premadeIndex) return false;
        return type === 'surah' ? premadeIndex.surah.includes(id) : premadeIndex.part.includes(id);
    }, [premadeIndex]);

    const handlePartComplete = async (part: QuranPart, forceState?: boolean) => {
        const existing = partMindmapsMap[part] || { partId: part, imageUrl: null, description: '', isComplete: false };
        const isNowComplete = forceState !== undefined ? forceState : !existing.isComplete;
        const updated = { ...existing, isComplete: isNowComplete };
        await savePartMindMap(part, updated);

        // If marking as complete, ensure a MemoryNode exists for scheduling
        if (isNowComplete) {
            const existingNode = nodes.find(n => n.type === 'part_mindmap' && n.partId === part);
            if (!existingNode) {
                const newNode: MemoryNode = {
                    id: crypto.randomUUID(),
                    type: 'part_mindmap',
                    partId: part,
                    scheduler: createNewFSRSState(),
                    createdAt: new Date().toISOString()
                };
                await saveNode(newNode);
                appLogger.addLog(`Created scheduling node for Part ${part} mindmap`, 'info');
            }
        }
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
        const existing = decisions.find(d => d.phraseId === key) || { status: 'pending', notes: '' };
        await saveDecision(key, {
            ...existing,
            status,
            confirmedAt: confirm ? new Date().toISOString() : existing.confirmedAt
        });
    };

    const handleMutashabihatDecisionUpdate = useCallback((_representativeAbs: number, update: any, decisionKey: string) => {
        const existing = decisions.find(d => d.phraseId === decisionKey) || { status: 'pending', notes: '' };
        const normalized = {
            ...existing,
            ...update,
            notes: update.notes ?? existing.notes ?? existing.note ?? '',
            phraseId: decisionKey
        };
        saveDecision(decisionKey, normalized);
    }, [decisions, saveDecision]);

    // Handles saving from the Mindmap Editor modal (Surah)
    const handleEditorSave = useCallback(async (snapshot: any, _images?: { light?: Blob, dark?: Blob }, shouldClose: boolean = true) => {
        if (!activeMindmapEditor) return;
        const { surahId } = activeMindmapEditor;

        const existing = mindmaps[surahId] || { surahId, anchors: [], imageUrl: null, isComplete: false };
        const source: 'premade' | 'custom' = existing.source === 'premade' ? 'premade' : 'custom';
        const updated = {
            ...existing,
            imageUrl: undefined,
            imageUrlDark: undefined,
            tldrawSnapshot: snapshot,
            source,
            premadeEdited: source === 'premade' ? true : existing.premadeEdited
        };
        await saveMindMap(surahId, updated);
        if (shouldClose) {
            setActiveMindmapEditor(null);
        }
    }, [activeMindmapEditor, mindmaps, saveMindMap]);

    const handlePartEditorSave = useCallback(async (snapshot: any, _images?: { light?: Blob, dark?: Blob }, shouldClose: boolean = true) => {
        if (!activePartEditor) return;
        const { partId } = activePartEditor;

        const existing = partMindmapsMap[partId] || { partId, imageUrl: null, description: '', isComplete: false };
        const source: 'premade' | 'custom' = existing.source === 'premade' ? 'premade' : 'custom';
        const updated = {
            ...existing,
            imageUrl: undefined,
            imageUrlDark: undefined,
            tldrawSnapshot: snapshot,
            source,
            premadeEdited: source === 'premade' ? true : existing.premadeEdited
        };
        await savePartMindMap(partId, updated);
        if (shouldClose) {
            setActivePartEditor(null);
        }
    }, [activePartEditor, partMindmapsMap, savePartMindMap]);

    return (
        <div className="content-wrapper tab-content todo-page">
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
            <div className="w-full h-full flex flex-col px-2 sm:px-4 md:px-6 py-2 sm:py-4">
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
                    onExportPremade={isOwnerMode ? handleExportPremade : undefined}
                    onResetMindmap={!isOwnerMode ? handleResetMindmap : undefined}
                    onEditMindmap={(id, snapshot, isPart) => {
                        if (isPart) {
                            setActivePartEditor({ partId: id as any, snapshot });
                        } else {
                            setActiveMindmapEditor({ surahId: id, snapshot });
                        }
                    }}
                    onDeleteMindmap={async (type, id) => {
                        if (type === 'surah') {
                            // Find specific entity to delete
                            const entity = mindmapsList.find((m: any) => Number(m.surahId) === id);
                            if (entity && (entity as any).id) {
                                await deleteMindMap((entity as any).id);
                            }
                        } else {
                            // Find specific part entity to delete
                            const pId = id as QuranPart;
                            const entity = partMindmapsList.find((m: any) => Number(m.partId) === pId);
                            if (entity && (entity as any).id) {
                                await deletePartMindMap((entity as any).id);
                            }
                        }
                    }}
                    appMode={appMode}
                    getHasPremade={hasPremadeMindmap}
                    mutashabihatDecisions={decisions}
                    onMutashabihatDecisionUpdate={handleMutashabihatDecisionUpdate}
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
