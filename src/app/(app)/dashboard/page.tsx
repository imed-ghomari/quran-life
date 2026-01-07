'use client';

/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { parseQuranJson, getSurah, getSurahsByPart } from '@/lib/quranData';
import { Verse, getAudioPath } from '@/lib/types';
import {
    CheckCircle,
    Play,
    Pause,
    SkipBack,
    SkipForward,
    BookOpen,
    EyeOff,
    ChevronDown,
    X,
    Check,
    Brain,
    Info,
    ZoomIn,
    ZoomOut,
    Maximize2,
    Move,
    PenTool,
    RotateCcw,
    AlertCircle
} from 'lucide-react';
import dynamic from 'next/dynamic';
import MindmapViewer from '@/components/MindmapViewer';
import { QuranPart } from '@/lib/types';
import {
    getSettings,
    getDueNodes,
    updateMemoryNode,
    sm2,
    getMindMap,
    getPartMindMap,
    getMindMaps,
    getPartMindMaps,
    saveMindMap,
    savePartMindMap,
    MemoryNode,
    markListeningComplete,
    getListeningCompletedToday,
    getCurrentDayInCycle,
    saveReviewError,
    removeReviewError,
    isSurahSkipped,
    findAnchorForRange,
    getListeningProgress,
    saveListeningProgress,
    postponeNode,
    getPortionPointer,
} from '@/lib/storage';
import { syncWithCloud } from '@/lib/sync';

// Dynamic import of MindmapEditor to keep bundle size small and avoid SSR issues
const MindmapEditor = dynamic(() => import('@/components/MindmapEditor'), { ssr: false });
import { surahAyahToAbsolute, hasMutashabihForAbsolute } from '@/lib/mutashabihat';

type PlaybackSpeed = 0.75 | 1 | 1.25 | 1.5 | 2;

function splitIntoChunks(text: string, wordsPerChunk: number = 3): string[] {
    const words = text.split(/\s+/);
    if (words.length <= wordsPerChunk + 2) return [text];
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += wordsPerChunk) {
        chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
    }
    return chunks;
}

export default function TodayPage() {
    const [allVerses, setAllVerses] = useState<Verse[]>([]);
    const [dueNodes, setDueNodes] = useState<MemoryNode[]>([]);
    const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
    const [revealedChunks, setRevealedChunks] = useState(0);
    const [currentVerseInReview, setCurrentVerseInReview] = useState(0);
    const [showGrading, setShowGrading] = useState(false);
    const [todaysPortion, setTodaysPortion] = useState<Verse[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentVerseIndex, setCurrentVerseIndex] = useState(0);
    const [speed, setSpeed] = useState<PlaybackSpeed>(1);
    const [isLoaded, setIsLoaded] = useState(false);
    const [listeningComplete, setListeningComplete] = useState(false);
    const [settingsVersion, setSettingsVersion] = useState(0);
    const [readOnlyMode, setReadOnlyMode] = useState(true);
    const [viewState, setViewState] = useState({ reviewExpanded: true, dailyExpanded: true });

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

    // Mindmap Editor States
    const [activeMindmapEditor, setActiveMindmapEditor] = useState<{ surahId: number; snapshot?: any } | null>(null);
    const [activePartEditor, setActivePartEditor] = useState<{ partId: QuranPart; snapshot?: any } | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
            setViewState({ reviewExpanded: false, dailyExpanded: false });
        }
    }, []);

    const [zoomImage, setZoomImage] = useState<string | null>(null);

    // Toast & Undo
    interface ToastItem {
        id: string;
        type: 'success' | 'error' | 'postpone';
        message: string;
        info?: string;
    }
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [lastGrading, setLastGrading] = useState<{ node: MemoryNode; index: number; errorId?: string } | null>(null);

    const addToast = useCallback((type: 'success' | 'error' | 'postpone', message: string, info?: string) => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts(prev => [...prev, { id, type, message, info }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    }, []);

    const audioRef = useRef<HTMLAudioElement>(null);
    const targetBoxRef = useRef<HTMLDivElement>(null);

    // Load data
    useEffect(() => {
        async function load() {
            // Check session storage first
            const cached = sessionStorage.getItem('quran_verses_cache_v2');
            if (cached) {
                setAllVerses(JSON.parse(cached));
                setIsLoaded(true);
                return;
            }

            try {
                const response = await fetch('/qpc-hafs-word-by-word.json');
                const data = await response.json() as Record<string, any>;
                const verses = parseQuranJson(data);
                setAllVerses(verses);
                setIsLoaded(true);

                try {
                    sessionStorage.setItem('quran_verses_cache_v2', JSON.stringify(verses));
                } catch (e) {
                    console.warn('Failed to cache verses in sessionStorage', e);
                }
            } catch (_e) {
                try {
                    if ('caches' in window) {
                        const cachedRes = await caches.match('/qpc-hafs-word-by-word.json');
                        if (cachedRes) {
                            const data = await cachedRes.json() as Record<string, any>;
                            const verses = parseQuranJson(data);
                            setAllVerses(verses);
                            setIsLoaded(true);
                            return;
                        }
                    }
                } catch (e) {
                    console.warn('Failed to load verses from cache', e);
                }
                setAllVerses([]);
                setIsLoaded(true);
            }
        }
        load();
    }, []);

    // Settings sync
    useEffect(() => {
        const handleStorage = (e: StorageEvent) => {
            if (e.key?.includes('quran-app')) {
                // Force immediate refresh of settings version
                setSettingsVersion(v => v + 1);
            }
        };
        window.addEventListener('storage', handleStorage);
        const interval = setInterval(() => setSettingsVersion(v => v + 1), 2500);
        return () => {
            window.removeEventListener('storage', handleStorage);
            clearInterval(interval);
        };
    }, []);

    // Reload due nodes
    useEffect(() => {
        if (!isLoaded) return;

        // Only refresh due nodes list if we aren't in the middle of a review session
        // This prevents "skipping" cards when background sync happens
        if (dueNodes.length === 0 || currentReviewIndex === 0) {
            const settings = getSettings();
            setDueNodes(getDueNodes());
        }
        setListeningComplete(getListeningCompletedToday());
    }, [settingsVersion, isLoaded, dueNodes.length, currentReviewIndex]);

    // Calculate today's portion (preserve per-part listening progress)
    const portionData = useMemo(() => {
        if (allVerses.length === 0) return { portion: [], startVerseIndex: 0, versesPerDay: 0, totalVerses: 0 };
        const settings = getSettings();
        const surahsInPart = getSurahsByPart(settings.activePart).filter(s => !isSurahSkipped(s.id));
        if (surahsInPart.length === 0) return { portion: [], startVerseIndex: 0, versesPerDay: 0, totalVerses: 0 };

        // Flatten verses - optimized filter
        const activeSurahIds = new Set(surahsInPart.map(s => s.id));
        const allVersesInPart = allVerses.filter(v => activeSurahIds.has(v.surahId));

        const totalVerses = allVersesInPart.length;
        if (totalVerses === 0) return { portion: [], startVerseIndex: 0, versesPerDay: 0, totalVerses: 0 };

        const versesPerDay = Math.ceil(totalVerses / settings.completionDays);
        const startIdx = getPortionPointer(settings.activePart);
        let endIdx = startIdx + versesPerDay;

        // Intelligent Division: Merge short trailing surah segments
        if (endIdx < totalVerses) {
            const lastVerseInProposed = allVersesInPart[endIdx - 1];
            const nextVerse = allVersesInPart[endIdx];
            if (nextVerse && nextVerse.surahId === lastVerseInProposed.surahId) {
                // Check how many are left in this surah
                let i = endIdx;
                let remainingCount = 0;
                let remainingLength = 0;
                while (i < totalVerses && allVersesInPart[i].surahId === lastVerseInProposed.surahId) {
                    remainingCount++;
                    remainingLength += allVersesInPart[i].text.length;
                    i++;
                }
                // If <= 5 verses or total text is short (< 400 chars)
                if (remainingCount <= 5 || remainingLength < 400) {
                    // Ignore surahs with very long verses (e.g. Baqarah 282)
                    const surahVerses = allVersesInPart.filter(v => v.surahId === lastVerseInProposed.surahId);
                    const hasVeryLongVerses = surahVerses.some(v => v.text.length > 600);

                    if (!hasVeryLongVerses) {
                        endIdx = i;
                    }
                }
            }
        }

        let portion: Verse[];
        if (endIdx <= totalVerses) {
            portion = allVersesInPart.slice(startIdx, endIdx);
        } else {
            // Handle wrap-around
            portion = [...allVersesInPart.slice(startIdx), ...allVersesInPart.slice(0, endIdx - totalVerses)];
        }

        const saved = getListeningProgress(settings.activePart);
        const startVerseIndex = portion.length > 0 ? Math.min(saved.currentVerseIndex, portion.length - 1) : 0;

        return { portion, startVerseIndex, versesPerDay, totalVerses };
    }, [allVerses]);

    useEffect(() => {
        setTodaysPortion(portionData.portion);
        setCurrentVerseIndex(portionData.startVerseIndex);
    }, [portionData]);

    // Persist listening progress per part
    // (REMOVED: Automatic saving on every verse change)
    // useEffect(() => {
    //     const settings = getSettings();
    //     saveListeningProgress(settings.activePart, currentVerseIndex);
    // }, [currentVerseIndex]);

    // Audio setup
    useEffect(() => {
        if (audioRef.current && todaysPortion.length > 0 && currentVerseIndex < todaysPortion.length) {
            const verse = todaysPortion[currentVerseIndex];
            // Only update src if it changed to prevent loop glitch
            const newSrc = getAudioPath(verse.surahId, verse.ayahId);
            const urlPath = new URL(newSrc, 'http://localhost').pathname; // hack for relative path check
            if (!audioRef.current.src.includes(urlPath)) {
                audioRef.current.src = newSrc;
                // Force reset playback rate when source changes
                audioRef.current.playbackRate = speed;
                if (isPlaying) {
                    audioRef.current.play().catch(() => setIsPlaying(false));
                }
            } else {
                // Ensure speed is updated even if src didn't change (e.g. user toggled speed mid-verse)
                audioRef.current.playbackRate = speed;
            }
        }
    }, [currentVerseIndex, todaysPortion, isPlaying, speed]);

    // Keep playback rate in sync when speed changes (even mid-verse)
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.playbackRate = speed;
        }
    }, [speed]);

    // Ensure speed persists on play
    const handleAudioPlay = () => {
        if (audioRef.current) audioRef.current.playbackRate = speed;
    };

    // Pause audio when switching to Read mode
    useEffect(() => {
        if (readOnlyMode && isPlaying) {
            if (audioRef.current) {
                audioRef.current.pause();
                setIsPlaying(false);
            }
        }
    }, [readOnlyMode, isPlaying]);


    const handleAudioEnded = () => {
        if (currentVerseIndex < todaysPortion.length - 1) {
            setCurrentVerseIndex(prev => prev + 1);
        } else {
            setIsPlaying(false);
        }
    };

    const togglePlay = () => {
        if (audioRef.current) {
            if (isPlaying) audioRef.current.pause();
            else audioRef.current.play().catch(console.error);
            setIsPlaying(!isPlaying);
        }
    };

    const cycleSpeed = () => {
        const speeds: PlaybackSpeed[] = [0.75, 1, 1.25, 1.5, 2];
        setSpeed(speeds[(speeds.indexOf(speed) + 1) % speeds.length]);
    };

    // Grade review
    const handleGrade = useCallback((remembered: boolean) => {
        const node = dueNodes[currentReviewIndex];
        if (!node) return;

        const errorId = !remembered ? `err-${Date.now()}` : undefined;
        // Save state for undo BEFORE updating
        setLastGrading({
            node: JSON.parse(JSON.stringify(node)), // Deep copy original
            index: currentReviewIndex,
            errorId
        });

        const grade = remembered ? 4 : 1;
        updateMemoryNode({ ...node, scheduler: sm2(grade, node.scheduler) });

        if (!remembered) {
            saveReviewError({
                id: errorId!,
                timestamp: new Date().toISOString(),
                nodeId: node.id,
                nodeType: node.type,
                surahId: node.surahId,
                partId: node.partId,
                startVerse: node.startVerse,
                endVerse: node.endVerse,
                grade,
                anchorLabel: findAnchorForRange(node.surahId!, node.startVerse, node.endVerse)?.label,
                anchorId: findAnchorForRange(node.surahId!, node.startVerse, node.endVerse)?.id,
                absoluteAyah: node.startVerse && node.surahId ? surahAyahToAbsolute(node.surahId, node.startVerse) : undefined,
            });
        }

        const info = node.type === 'part_mindmap' ? `Part ${node.partId}` :
            node.type === 'mindmap' ? getSurah(node.surahId!)?.arabicName :
                `${getSurah(node.surahId!)?.arabicName} (${node.startVerse}-${node.endVerse})`;

        addToast(remembered ? 'success' : 'error', remembered ? 'Remembered' : 'Forgot', info);

        if (currentReviewIndex < dueNodes.length - 1) {
            setCurrentReviewIndex(prev => prev + 1);
            // Move to next item - stay hidden until clicked
            setRevealedChunks(0);
            setCurrentVerseInReview(0);
            setShowGrading(false);
        } else {
            setDueNodes([]); // Done
        }
    }, [dueNodes, currentReviewIndex, addToast]);

    const handlePostpone = useCallback(() => {
        const node = dueNodes[currentReviewIndex];
        if (!node) return;

        setLastGrading({
            node: JSON.parse(JSON.stringify(node)),
            index: currentReviewIndex,
        });

        updateMemoryNode(postponeNode(node));

        const info = node.type === 'part_mindmap' ? `Part ${node.partId}` :
            node.type === 'mindmap' ? getSurah(node.surahId!)?.arabicName :
                `${getSurah(node.surahId!)?.arabicName} (${node.startVerse}-${node.endVerse})`;

        addToast('postpone', 'Postponed to tomorrow', info);

        if (currentReviewIndex < dueNodes.length - 1) {
            setCurrentReviewIndex(prev => prev + 1);
            setRevealedChunks(0);
            setCurrentVerseInReview(0);
            setShowGrading(false);
        } else {
            setDueNodes([]);
        }
    }, [dueNodes, currentReviewIndex, addToast]);

    const handleUndo = () => {
        if (!lastGrading) return;
        updateMemoryNode(lastGrading.node);
        if (lastGrading.errorId) {
            removeReviewError(lastGrading.errorId);
        }
        setCurrentReviewIndex(lastGrading.index);
        setRevealedChunks(0);
        setCurrentVerseInReview(0);
        setShowGrading(true); // Return to grading view of the undone card
        setLastGrading(null);
        setToasts([]);
    };

    useEffect(() => {
        if (toasts.length > 0) {
            // cleanup is handled by addToast's setTimeout
        }
    }, [toasts]);

    const handleCompleteListening = () => {
        const settings = getSettings();
        markListeningComplete(settings.activePart, portionData.versesPerDay, portionData.totalVerses);
        setListeningComplete(true);
        setSettingsVersion(v => v + 1);
    };

    // Get content
    const getCurrentReviewContent = () => {
        if (dueNodes.length === 0 || currentReviewIndex >= dueNodes.length) return null;
        const node = dueNodes[currentReviewIndex];

        if (node.type === 'part_mindmap') {
            const pm = getPartMindMap(node.partId as any);
            return { type: 'part_mindmap', partId: node.partId, mindmap: pm };
        } else if (node.type === 'mindmap') {
            const s = getSurah(node.surahId!);
            const m = getMindMap(node.surahId!);
            return { type: 'mindmap', surah: s, mindmap: m };
        } else {
            const s = getSurah(node.surahId!);
            const vs = allVerses.filter(v => v.surahId === node.surahId && v.ayahId >= (node.startVerse || 1) && v.ayahId <= (node.endVerse || 999));

            // Context with mutashabihat-aware expansion
            const contextVerses: Verse[] = [];
            const start = node.startVerse || 1;
            let lookback = 1;
            while (contextVerses.length < 2 || (contextVerses.length < 5 && hasMutashabihForAbsolute(surahAyahToAbsolute(node.surahId!, start - lookback + 1)))) {
                const candidate = allVerses.find(v => v.surahId === node.surahId && v.ayahId === start - lookback);
                if (!candidate) break;
                contextVerses.unshift(candidate);
                const abs = surahAyahToAbsolute(candidate.surahId, candidate.ayahId);
                if (!hasMutashabihForAbsolute(abs) && contextVerses.length >= 2) break;
                lookback++;
            }

            return { type: 'verse', surah: s, verses: vs, contextVerses };
        }
    };

    const reviewContent = getCurrentReviewContent();

    // Reveal Logic
    const getCurrentVerseChunks = () => {
        if (!reviewContent || reviewContent.type !== 'verse' || !reviewContent.verses || !reviewContent.verses.length) return [];
        const v = reviewContent.verses[currentVerseInReview];
        return splitIntoChunks(v.text);
    };

    const verseChunks = getCurrentVerseChunks();
    const totalChunks = verseChunks.length;
    const totalVerses = reviewContent?.type === 'verse' ? reviewContent.verses?.length || 0 : 0;

    const verseChunkMap = reviewContent?.type === 'verse'
        ? reviewContent.verses?.map(v => splitIntoChunks(v.text)) || []
        : [];

    const handleRevealNext = useCallback(() => {
        if (revealedChunks < totalChunks) {
            setRevealedChunks(prev => prev + 1);
        } else if (currentVerseInReview < totalVerses - 1) {
            setCurrentVerseInReview(prev => prev + 1);
            setRevealedChunks(1); // One click moves and reveals first chunk
        } else {
            setShowGrading(true);
        }
    }, [revealedChunks, totalChunks, currentVerseInReview, totalVerses]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (dueNodes.length === 0) return;
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            if (showGrading) {
                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    handlePostpone();
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    handleGrade(true);
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    handleGrade(false);
                }
            } else {
                if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    handleRevealNext();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [dueNodes, showGrading, handlePostpone, handleGrade, handleRevealNext]);

    useEffect(() => {
        if (targetBoxRef.current) {
            const nextBlur = targetBoxRef.current.querySelector('.next-blur') as HTMLElement;
            if (nextBlur) {
                // Use manual scrollTo on the container to prevent the whole window from scrolling
                const container = targetBoxRef.current;
                const elementTop = nextBlur.offsetTop;
                const elementHeight = nextBlur.offsetHeight;
                const containerHeight = container.offsetHeight;

                container.scrollTo({
                    top: elementTop - (containerHeight / 2) + (elementHeight / 2),
                    behavior: 'smooth'
                });
            } else if (showGrading) {
                // If we finished the verse, scroll to the bottom of the box
                targetBoxRef.current.scrollTo({ top: targetBoxRef.current.scrollHeight, behavior: 'smooth' });
            }
        }
    }, [revealedChunks, currentVerseInReview, showGrading]);

    if (!isLoaded) return <div className="content-wrapper"><div className="loading">Loading...</div></div>;

    const handleMindmapIncomplete = (surahId: number) => {
        if (!window.confirm("Are you sure you want to mark this mindmap as INCOMPLETE? It will be removed from the review section until you mark it as complete again.")) return;

        const mm = getMindMap(surahId);
        const updated = { ...mm, isComplete: false };
        saveMindMap(updated);
        setSettingsVersion(v => v + 1);
        addToast('success', 'Mindmap marked as incomplete', getSurah(surahId)?.name);
        // (REMOVED: Automatic sync)
        // syncWithCloud().catch(console.error);
    };

    const handlePartMindmapIncomplete = (partId: QuranPart) => {
        if (!window.confirm("Are you sure you want to mark this part mindmap as INCOMPLETE? It will be removed from the review section until you mark it as complete again.")) return;

        const mm = getPartMindMap(partId);
        const updated = { ...mm, isComplete: false };
        savePartMindMap(updated);
        setSettingsVersion(v => v + 1);
        addToast('success', 'Part mindmap marked as incomplete', `Part ${partId}`);
        // (REMOVED: Automatic sync)
        // syncWithCloud().catch(console.error);
    };

    const handleMindmapEditorSave = async (snapshot: any, images?: { light?: Blob, dark?: Blob }) => {
        if (!activeMindmapEditor) return;
        const { surahId } = activeMindmapEditor;

        const save = (lightUrl: string | null, darkUrl: string | null) => {
            const existing = getMindMap(surahId);
            saveMindMap({
                ...existing,
                imageUrl: lightUrl || existing.imageUrl,
                imageUrlDark: darkUrl || existing.imageUrlDark,
                tldrawSnapshot: snapshot
            });
            setSettingsVersion(v => v + 1);
            setActiveMindmapEditor(null);
            // (REMOVED: Automatic sync)
            // syncWithCloud().catch(console.error);
        };

        if (images && (images.light || images.dark)) {
            const blobs = images;
            const urls: { light: string | null, dark: string | null } = { light: null, dark: null };

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

    const handlePartMindmapEditorSave = async (snapshot: any, images?: { light?: Blob, dark?: Blob }) => {
        if (!activePartEditor) return;
        const { partId } = activePartEditor;

        const save = (lightUrl: string | null, darkUrl: string | null) => {
            const existing = getPartMindMap(partId);
            savePartMindMap({
                ...existing,
                imageUrl: lightUrl || existing.imageUrl,
                imageUrlDark: darkUrl || existing.imageUrlDark,
                tldrawSnapshot: snapshot
            });
            setSettingsVersion(v => v + 1);
            setActivePartEditor(null);
            // (REMOVED: Automatic sync)
            // syncWithCloud().catch(console.error);
        };

        if (images && (images.light || images.dark)) {
            const blobs = images;
            const urls: { light: string | null, dark: string | null } = { light: null, dark: null };

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
        <div className="content-wrapper">
            {activeMindmapEditor && (
                <MindmapEditor
                    title={`Edit ${getSurah(activeMindmapEditor.surahId)?.name} Mindmap`}
                    initialSnapshot={activeMindmapEditor.snapshot}
                    onSave={handleMindmapEditorSave}
                    onClose={() => setActiveMindmapEditor(null)}
                />
            )}
            {activePartEditor && (
                <MindmapEditor
                    title={`Edit Part ${activePartEditor.partId} Mindmap`}
                    initialSnapshot={activePartEditor.snapshot}
                    onSave={handlePartMindmapEditorSave}
                    onClose={() => setActivePartEditor(null)}
                />
            )}
            <h1 className="hide-mobile">Today</h1>
            <audio ref={audioRef} onEnded={handleAudioEnded} onPlay={handleAudioPlay} preload="auto" />

            <div className="today-grid">
                {/* Reviews Col */}
                <div className="card">
                    <div className="collapsible-header" onClick={() => setViewState(s => ({ ...s, reviewExpanded: !s.reviewExpanded }))}>
                        <div className="section-title"><CheckCircle size={20} /><span>Reviews</span>{(dueNodes.length - currentReviewIndex) > 0 && <span className="status-badge learned">{dueNodes.length - currentReviewIndex}</span>}</div>
                        <span className={`collapse-icon ${viewState.reviewExpanded ? 'open' : ''}`}><ChevronDown size={20} /></span>
                    </div>

                    {viewState.reviewExpanded && (
                        <div className="review-section-content">
                            {dueNodes.length === 0 ? (
                                <div className="empty-state"><CheckCircle size={40} className="empty-icon" /><p>No reviews due!</p></div>
                            ) : reviewContent && (
                                <div style={{ paddingTop: '0.5rem' }}>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--foreground-secondary)', marginBottom: '0.5rem' }}>
                                        {currentReviewIndex + 1} • {
                                            reviewContent.type === 'part_mindmap' ? `Part ${reviewContent.partId} Mindmap` :
                                                reviewContent.type === 'mindmap' ? `${reviewContent.surah?.arabicName} Mindmap` :
                                                    `${reviewContent.surah?.arabicName} (${reviewContent.verses?.length || 0} verses)`
                                        }
                                    </p>

                                    {reviewContent.type === 'verse' && (
                                        <div>
                                            {/* Context */}
                                            {reviewContent.contextVerses && reviewContent.contextVerses.length > 0 && (
                                                <div className="context-box" style={{ opacity: 0.6, fontSize: '0.75rem', marginBottom: '0.75rem', padding: '0.5rem', borderLeft: '3px solid var(--border)' }}>
                                                    {reviewContent.contextVerses.map(c => <p key={c.ayahId} className="arabic-text" style={{ fontSize: '1rem' }}>{c.text}</p>)}
                                                </div>
                                            )}

                                            {/* Target as grouped paragraph */}
                                            <div ref={targetBoxRef} className="target-box" style={{
                                                padding: '0.75rem',
                                                background: 'var(--verse-bg)',
                                                borderRadius: 10,
                                                height: '320px',
                                                overflowY: 'auto',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 10,
                                                position: 'relative'
                                            }}>
                                                <div className="grouped-verse" style={{ direction: 'rtl', fontSize: '1.2rem' }}>
                                                    {reviewContent.verses?.map((v, idx) => {
                                                        const chunks = verseChunkMap[idx] || [];
                                                        const isPast = idx < currentVerseInReview;
                                                        const isCurrent = idx === currentVerseInReview;

                                                        // Show all if grading or already passed
                                                        const showAll = showGrading || isPast;

                                                        const visibleChunks = showAll ? chunks : isCurrent ? chunks.slice(0, revealedChunks) : [];
                                                        const nextChunk = (!showAll && isCurrent) ? chunks[revealedChunks] : undefined;
                                                        const remainingHidden = showAll ? '' : (isCurrent ? chunks.slice(revealedChunks + 1).join(' ') : v.text);

                                                        return (
                                                            <span key={v.ayahId} className="grouped-verse-block">
                                                                <span className="verse-badge" style={{ fontSize: '0.6rem', padding: '1px 4px' }}>{v.ayahId}</span>
                                                                <span className="grouped-verse-text arabic-text">
                                                                    {visibleChunks.map((c, i) => <span key={`${v.ayahId}-c-${i}`}>{c} </span>)}
                                                                    {nextChunk && <span className="blurred-chunk next-blur">{nextChunk}</span>}
                                                                    {remainingHidden && <span className="blurred-chunk strong-blur">{remainingHidden}</span>}
                                                                </span>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Controls */}
                                            {!showGrading ? (
                                                <button className="btn btn-primary btn-full" style={{ marginTop: '0.75rem', padding: '0.65rem' }} onClick={handleRevealNext} title="Shortcut: Arrow Right">
                                                    {revealedChunks >= totalChunks && currentVerseInReview >= totalVerses - 1 ? 'Finish Reciting' : 'Reveal Chunk'}
                                                </button>
                                            ) : (
                                                <div className="review-buttons" style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                                                    <button className="review-btn postpone" style={{ padding: '0.65rem', background: 'var(--background-secondary)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', color: 'var(--foreground)' }} onClick={handlePostpone} title="Shortcut: Arrow Left">
                                                        <span style={{ fontSize: '0.85rem' }}>Not sure</span>
                                                        <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>Next: Today</span>
                                                    </button>
                                                    <button className="review-btn not-remembered" style={{ padding: '0.65rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }} onClick={() => handleGrade(false)} title="Shortcut: Arrow Down">
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><X size={14} /> <span style={{ fontSize: '0.85rem' }}>Forgot</span></div>
                                                        <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>Next: 1d</span>
                                                    </button>
                                                    <button className="review-btn remembered" style={{ padding: '0.65rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }} onClick={() => handleGrade(true)} title="Shortcut: Arrow Right">
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={14} /> <span style={{ fontSize: '0.85rem' }}>Remembered</span></div>
                                                        <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>
                                                            Next: {(() => {
                                                                const next = sm2(5, dueNodes[currentReviewIndex].scheduler);
                                                                const days = Math.round((new Date(next.dueDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                                                                return days <= 1 ? '1d' : `${days}d`;
                                                            })()}
                                                        </span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {(reviewContent.type === 'part_mindmap' || reviewContent.type === 'mindmap') && (
                                        <div>
                                            {!showGrading ? (
                                                <div className="verse-hidden" onClick={() => setShowGrading(true)}>
                                                    <EyeOff size={24} style={{ marginBottom: 8 }} />
                                                    <p>Visualize mindmap structure...</p>
                                                    <p style={{ fontSize: '0.8rem', marginTop: 8 }}>Tap to Check</p>
                                                </div>
                                            ) : (
                                                <div>
                                                    {(() => {
                                                        const hasContent = !!reviewContent.mindmap?.imageUrl || !!reviewContent.mindmap?.imageUrlDark || !!reviewContent.mindmap?.tldrawSnapshot;

                                                        if (!hasContent) {
                                                            return (
                                                                <div
                                                                    className="verse-hidden"
                                                                    style={{ background: 'var(--accent-light)', border: '1px dashed var(--accent)', color: 'var(--accent)', cursor: 'pointer' }}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (reviewContent.type === 'mindmap') {
                                                                            setActiveMindmapEditor({ surahId: reviewContent.surah!.id, snapshot: reviewContent.mindmap?.tldrawSnapshot });
                                                                        } else {
                                                                            setActivePartEditor({ partId: reviewContent.partId as QuranPart, snapshot: reviewContent.mindmap?.tldrawSnapshot });
                                                                        }
                                                                    }}
                                                                >
                                                                    <PenTool size={24} style={{ marginBottom: 8 }} />
                                                                    <p>Preview missing (Lean Sync)</p>
                                                                    <p style={{ fontSize: '0.8rem', marginTop: 8 }}>Click to view & generate local preview</p>
                                                                </div>
                                                            );
                                                        }

                                                        return (
                                                            <div style={{ marginBottom: '1rem' }}>
                                                                <MindmapViewer
                                                                    snapshot={reviewContent.mindmap?.tldrawSnapshot}
                                                                    imageUrl={reviewContent.mindmap?.imageUrl}
                                                                    imageUrlDark={reviewContent.mindmap?.imageUrlDark}
                                                                    isDark={isDark}
                                                                    title={reviewContent.type === 'mindmap' ? `${reviewContent.surah?.arabicName} Mindmap` : `Part ${reviewContent.partId} Mindmap`}
                                                                    height={320}
                                                                />
                                                            </div>
                                                        );
                                                    })()}

                                                    {/* Quick Actions */}
                                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                                        <button
                                                            className="btn btn-secondary"
                                                            style={{ flex: 1, padding: '0.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (reviewContent.type === 'mindmap') {
                                                                    setActiveMindmapEditor({ surahId: reviewContent.surah!.id, snapshot: reviewContent.mindmap?.tldrawSnapshot });
                                                                } else {
                                                                    setActivePartEditor({ partId: reviewContent.partId as QuranPart, snapshot: reviewContent.mindmap?.tldrawSnapshot });
                                                                }
                                                            }}
                                                        >
                                                            <PenTool size={14} /> Edit Map
                                                        </button>
                                                        <button
                                                            className="btn btn-secondary"
                                                            style={{ flex: 1, padding: '0.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'var(--danger)' }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (reviewContent.type === 'mindmap') {
                                                                    handleMindmapIncomplete(reviewContent.surah!.id);
                                                                } else {
                                                                    handlePartMindmapIncomplete(reviewContent.partId as QuranPart);
                                                                }
                                                            }}
                                                        >
                                                            <RotateCcw size={14} /> Mark Incomplete
                                                        </button>
                                                    </div>

                                                    <div className="review-buttons" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                                        <button className="review-btn postpone" style={{ background: 'var(--background-secondary)', border: '1px solid var(--border)', color: 'var(--foreground)' }} onClick={handlePostpone} title="Shortcut: Arrow Left">Not sure</button>
                                                        <button className="review-btn not-remembered" onClick={() => handleGrade(false)} title="Shortcut: Arrow Down"><X size={20} /> Forgot</button>
                                                        <button className="review-btn remembered" onClick={() => handleGrade(true)} title="Shortcut: Arrow Right"><Check size={20} /> Remembered</button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Daily Portion Col */}
                <div className="card">
                    <div className="collapsible-header" onClick={() => setViewState(s => ({ ...s, dailyExpanded: !s.dailyExpanded }))}>
                        <div className="section-title"><BookOpen size={20} /><span>Daily Portion</span>{listeningComplete ? <span className="status-badge learned">✓</span> : <span className="status-badge partial show-mobile" style={{ background: 'transparent', padding: 0, color: 'var(--warning)', display: 'flex', alignItems: 'center' }}><AlertCircle size={18} /></span>}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            {!listeningComplete && (
                                <div className="toggle-wrapper" onClick={(e) => { e.stopPropagation(); setReadOnlyMode(!readOnlyMode); }} style={{ cursor: 'pointer' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: !readOnlyMode ? 'var(--accent)' : 'var(--foreground-secondary)' }}>Audio</span>
                                    <div className={`toggle-switch ${!readOnlyMode ? 'active' : ''}`} />
                                </div>
                            )}
                            <span className={`collapse-icon ${viewState.dailyExpanded ? 'open' : ''}`}><ChevronDown size={20} /></span>
                        </div>
                    </div>

                    {viewState.dailyExpanded && (
                        <div className="daily-section-content">
                            {listeningComplete ? (
                                <div className="empty-state"><CheckCircle size={40} className="empty-icon" /><p>Daily portion complete!</p></div>
                            ) : (
                                <>
                                    <div className="content-wrapper" style={{ maxWidth: '800px', margin: '0 auto', padding: '1rem' }}>
                                        <p style={{ fontSize: '0.85rem', color: 'var(--foreground-secondary)' }}>
                                            {getSettings().activePart === 5 ? 'All Quran' : `Part ${getSettings().activePart}`}
                                        </p>
                                    </div>

                                    {!readOnlyMode ? (
                                        <div className="audio-player">
                                            <h3 className="section-subtitle" style={{ marginBottom: '0.35rem' }}>Audio mode</h3>
                                            <div className="progress-bar" style={{ marginBottom: '0.75rem' }}>
                                                <div className="progress-fill" style={{ width: `${((currentVerseIndex + 1) / todaysPortion.length) * 100}%` }} />
                                            </div>
                                            <div className="player-controls">
                                                <button className="player-btn" onClick={() => setCurrentVerseIndex(Math.max(0, currentVerseIndex - 1))}><SkipBack size={20} /></button>
                                                <button className="player-btn main" onClick={togglePlay}>{isPlaying ? <Pause size={24} /> : <Play size={24} />}</button>
                                                <button className="player-btn" onClick={() => setCurrentVerseIndex(Math.min(todaysPortion.length - 1, currentVerseIndex + 1))}><SkipForward size={20} /></button>
                                                <button className="player-btn speed-btn" onClick={cycleSpeed}>{speed}x</button>
                                            </div>
                                            <div className="verse-item" style={{ marginTop: '1rem' }}>
                                                {todaysPortion[currentVerseIndex] && (
                                                    <>
                                                        <div className="verse-ref">
                                                            {getSurah(todaysPortion[currentVerseIndex].surahId)?.arabicName} : {todaysPortion[currentVerseIndex].ayahId}
                                                        </div>
                                                        {todaysPortion[currentVerseIndex].ayahId === 1 ? (
                                                            todaysPortion[currentVerseIndex].surahId !== 1 &&
                                                            todaysPortion[currentVerseIndex].surahId !== 9 && (
                                                                <div className="arabic-text" style={{ fontSize: '1.1rem', opacity: 0.8, marginBottom: '0.5rem', textAlign: 'center' }}>
                                                                    بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ
                                                                </div>
                                                            )
                                                        ) : (
                                                            <div className="arabic-text" style={{ fontSize: '1.1rem', opacity: 0.8, marginBottom: '0.5rem', textAlign: 'center' }}>
                                                                أَعُوذُ بِٱللَّهِ مِنَ ٱلشَّيْطَانِ ٱلرَّجِيمِ
                                                            </div>
                                                        )}
                                                        <div className="arabic-text">{todaysPortion[currentVerseIndex].text}</div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="read-view" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                                            <h3 className="section-subtitle" style={{ marginBottom: '0.35rem' }}>Read mode</h3>
                                            {todaysPortion.map((v, idx) => {
                                                const prevVerse = idx > 0 ? todaysPortion[idx - 1] : null;
                                                const isNewSurah = !prevVerse || prevVerse.surahId !== v.surahId;
                                                const surah = getSurah(v.surahId);

                                                return (
                                                    <div key={idx}>
                                                        {isNewSurah && surah && (
                                                            <div className="surah-header-transition" style={{ textAlign: 'center', padding: '1rem 0', margin: '1rem 0', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                                                                <h3 style={{ fontSize: '1.2rem', marginBottom: 4 }}>{surah.arabicName}</h3>
                                                                {v.ayahId === 1 ? (
                                                                    surah.id !== 9 && surah.id !== 1 && <p className="arabic-text" style={{ fontSize: '1.1rem' }}>بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</p>
                                                                ) : (
                                                                    <p className="arabic-text" style={{ fontSize: '1.1rem', opacity: 0.8 }}>أَعُوذُ بِٱللَّهِ مِنَ ٱلشَّيْطَانِ ٱلرَّجِيمِ</p>
                                                                )}
                                                            </div>
                                                        )}
                                                        <div className="verse-item" style={{ display: 'block', marginBottom: '0.5rem', textAlign: 'right' }}>
                                                            <span className="verse-ref" style={{ float: 'left', fontSize: '0.7rem' }}>{v.ayahId}</span>
                                                            <span className="arabic-text" style={{ fontSize: '1.2rem' }}>{v.text}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    <button className="btn btn-success btn-full" style={{ marginTop: '1.5rem' }} onClick={handleCompleteListening}><Check size={20} /> Complete</button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="toast-container" style={{
                position: 'fixed',
                top: '20px',
                right: '20px',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                pointerEvents: 'none',
                maxWidth: 'calc(100vw - 40px)'
            }}>
                {toasts.map((t) => (
                    <div key={t.id} className={`review-toast ${t.type}`} style={{
                        padding: '0.65rem 1rem',
                        borderRadius: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                        animation: 'slideInRight 0.3s ease-out',
                        background: t.type === 'success' ? 'var(--success)' :
                            t.type === 'postpone' ? 'var(--background-secondary)' : 'var(--danger)',
                        border: '1px solid var(--border)',
                        color: t.type === 'postpone' ? 'var(--foreground)' : 'white',
                        minWidth: '180px',
                        fontSize: '0.85rem',
                        pointerEvents: 'auto',
                        backdropFilter: 'blur(12px)',
                        opacity: 1
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {t.type === 'success' ? <Check size={18} /> :
                                t.type === 'postpone' ? <Brain size={18} /> : <X size={18} />}
                            <span style={{ fontWeight: 600 }}>{t.message}</span>
                            <button
                                onClick={handleUndo}
                                style={{
                                    background: 'rgba(255,255,255,0.2)',
                                    border: 'none',
                                    color: 'inherit',
                                    padding: '0.2rem 0.5rem',
                                    borderRadius: '4px',
                                    fontSize: '0.7rem',
                                    cursor: 'pointer',
                                    marginLeft: 'auto'
                                }}
                            >
                                Undo
                            </button>
                        </div>
                        {t.info && (
                            <div style={{
                                fontSize: '0.8rem',
                                opacity: 0.9,
                                paddingLeft: '28px'
                            }}>
                                {t.info}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Zoom Modal */}
            {zoomImage && (
                <ImageZoomModal
                    src={zoomImage}
                    onClose={() => setZoomImage(null)}
                />
            )}
        </div>
    );
}

function ImageZoomModal({ src, onClose }: { src: string; onClose: () => void }) {
    const [zoom, setZoom] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    const handleZoomIn = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setZoom(prev => Math.min(prev + 0.5, 4));
    };

    const handleZoomOut = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setZoom(prev => {
            const next = Math.max(prev - 0.5, 1);
            if (next === 1) setPosition({ x: 0, y: 0 });
            return next;
        });
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (zoom === 1) return;
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (zoom === 1) return;
        setIsDragging(true);
        const touch = e.touches[0];
        setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDragging) return;
        const touch = e.touches[0];
        setPosition({
            x: touch.clientX - dragStart.x,
            y: touch.clientY - dragStart.y
        });
    };

    return (
        <div
            className="zoom-modal-overlay"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.9)',
                zIndex: 2000,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                touchAction: 'none'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    position: 'absolute',
                    top: typeof window !== 'undefined' && window.innerWidth < 768 ? 15 : 20,
                    right: typeof window !== 'undefined' && window.innerWidth < 768 ? 15 : 20,
                    display: 'flex',
                    gap: typeof window !== 'undefined' && window.innerWidth < 768 ? 8 : 12,
                    zIndex: 2001
                }}
            >
                <button
                    onClick={handleZoomIn}
                    style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: typeof window !== 'undefined' && window.innerWidth < 768 ? 8 : 10, borderRadius: '50%', cursor: 'pointer' }}
                >
                    <ZoomIn size={typeof window !== 'undefined' && window.innerWidth < 768 ? 20 : 24} />
                </button>
                <button
                    onClick={handleZoomOut}
                    style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: typeof window !== 'undefined' && window.innerWidth < 768 ? 8 : 10, borderRadius: '50%', cursor: 'pointer' }}
                >
                    <ZoomOut size={typeof window !== 'undefined' && window.innerWidth < 768 ? 20 : 24} />
                </button>
                <button
                    onClick={onClose}
                    style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: typeof window !== 'undefined' && window.innerWidth < 768 ? 8 : 10, borderRadius: '50%', cursor: 'pointer' }}
                >
                    <X size={typeof window !== 'undefined' && window.innerWidth < 768 ? 20 : 24} />
                </button>
            </div>

            <div
                ref={containerRef}
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
                    position: 'relative'
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleMouseUp}
                onClick={(e) => e.stopPropagation()}
            >
                <Image
                    src={src}
                    alt="Zoomed mindmap"
                    fill
                    style={{
                        objectFit: 'contain',
                        transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                        transition: isDragging ? 'none' : 'transform 0.2s ease-out',
                        userSelect: 'none',
                    } as any}
                    draggable={false}
                />
            </div>

            {zoom > 1 && (
                <div
                    className="zoom-helper"
                    style={{
                        position: 'absolute',
                        bottom: typeof window !== 'undefined' && window.innerWidth < 768 ? 100 : 40,
                        color: 'white',
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        background: 'rgba(0,0,0,0.6)',
                        padding: '6px 14px',
                        borderRadius: 20,
                        zIndex: 2002
                    }}
                >
                    <Move size={14} /> Drag to move around
                </div>
            )}
        </div>
    );
}
