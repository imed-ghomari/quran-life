'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { PlaybackSpeed, Verse } from '@/lib/types';
import { Reciter, getReciters, loadRecitationData, getAudioInfoForVerse } from '@/lib/audio';
import { useInstantSettings } from '@/hooks/useInstantData';
import { ChevronDown, Play, Pause, SkipBack, SkipForward, RotateCcw } from 'lucide-react';
import Spinner from '@/components/ui/Spinner';

interface AudioPlayerProps {
    verses: Verse[];
    currentVerseIndex: number;
    currentVerseWordCount?: number;
    onVerseChange: (index: number) => void;
    onPlayStateChange?: (isPlaying: boolean) => void;
    onWordIndexChange?: (index: number) => void;
}

const SPEED_OPTIONS: PlaybackSpeed[] = [0.75, 1, 1.25, 1.5, 2];
const SPEED_STORAGE_KEY = 'audio_playback_speed';

export default function AudioPlayer({
    verses,
    currentVerseIndex,
    currentVerseWordCount,
    onVerseChange,
    onPlayStateChange,
    onWordIndexChange
}: AudioPlayerProps) {
    const { settings, saveSettings } = useInstantSettings();
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [speed, setSpeed] = useState<PlaybackSpeed>(1);
    
    // Reciter state
    const [reciters, setReciters] = useState<Reciter[]>([]);
    const [selectedReciter, setSelectedReciter] = useState<Reciter | null>(null);
    const [recitationData, setRecitationData] = useState<any>(null);
    const [recitationDataMap, setRecitationDataMap] = useState<Record<number, any>>({});
    const [isLoadingReciter, setIsLoadingReciter] = useState(false);

    // Audio State
    const [verseEndTime, setVerseEndTime] = useState<number | null>(null);
    const [verseStartTime, setVerseStartTime] = useState(0);
    const [activeSegments, setActiveSegments] = useState<number[][] | null>(null);
    const [showIsti3atah, setShowIsti3atah] = useState(false);
    const lastWordIndexRef = useRef<number>(-1);
    
    // Progress
    const [progress, setProgress] = useState(0);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [isCompleted, setIsCompleted] = useState(false);
    const pendingSeekTimeRef = useRef<number | null>(null);
    const pendingAutoplayRef = useRef(false);
    const isPlayingRef = useRef(false);
    const prevIsPlayingRef = useRef(false);

    const currentVerse = verses[currentVerseIndex];
    const totalVerses = verses.length;
    const verseProgress = ((currentVerseIndex + 1) / totalVerses) * 100;

    // Manage Isti'aatha visibility
    useEffect(() => {
        if (isPlaying && currentVerseIndex === 0 && currentVerse && currentVerse.ayahId !== 1) {
            setShowIsti3atah(true);
            const timer = setTimeout(() => {
                setShowIsti3atah(false);
            }, 3000); // Show for 3 seconds
            return () => clearTimeout(timer);
        } else if (!isPlaying) {
             // Optional logic
        }
    }, [isPlaying, currentVerseIndex, currentVerse]);

    // Hide Isti'aatha on verse change
    useEffect(() => {
        if (currentVerseIndex !== 0) {
            setShowIsti3atah(false);
        }
    }, [currentVerseIndex]);

    useEffect(() => {
        isPlayingRef.current = isPlaying;
    }, [isPlaying]);

    // Initialize reciters list once.
    useEffect(() => {
        getReciters().then(list => {
            const filtered = list.filter(r => r.hasSegments);
            setReciters(filtered);
        });
    }, []);

    // Sync selected reciter from saved preference without reacting to unrelated audioSettings writes.
    useEffect(() => {
        if (reciters.length === 0) return;

        let savedId = settings?.audioSettings?.selectedReciterId;
        if (!savedId) {
            savedId = localStorage.getItem('selected_reciter_id') || undefined;
        }

        const preferred = reciters.find(r => r.id === savedId) || reciters[0];
        if (!preferred) return;

        if (!selectedReciter || selectedReciter.id !== preferred.id) {
            setSelectedReciter(preferred);
        }
    }, [reciters, settings?.audioSettings?.selectedReciterId, selectedReciter?.id]);

    useEffect(() => {
        const stored = settings?.audioSettings?.playbackSpeed ?? (() => {
            const raw = localStorage.getItem(SPEED_STORAGE_KEY);
            if (!raw) return undefined;
            const parsed = Number(raw) as PlaybackSpeed;
            return SPEED_OPTIONS.includes(parsed) ? parsed : undefined;
        })();

        if (stored && stored !== speed) {
            setSpeed(stored);
            if (audioRef.current) audioRef.current.playbackRate = stored;
        }
    }, [settings?.audioSettings?.playbackSpeed, speed]);

    // Load Recitation Data when Reciter or Surah changes
    useEffect(() => {
        if (!selectedReciter || !currentVerse) return;

        let isActive = true;
        const reciterId = selectedReciter.id;

        const load = async () => {
            setIsLoadingReciter(true);
            const data = await loadRecitationData(selectedReciter, currentVerse.surahId);
            if (!isActive) return;
            // Guard against stale resolves when reciter changes mid-load
            if (selectedReciter.id !== reciterId) return;
            setRecitationData(data);
            setIsLoadingReciter(false);
        };

        load();
        return () => {
            isActive = false;
        };
    }, [selectedReciter, currentVerse?.surahId]);

    useEffect(() => {
        if (!selectedReciter || selectedReciter.type !== 'surah-based' || verses.length === 0) return;
        const surahIds = Array.from(new Set(verses.map(v => v.surahId)));

        let isActive = true;
        const loadAll = async () => {
            setIsLoadingReciter(true);
            const entries = await Promise.all(
                surahIds.map(async (surahId) => {
                    const data = await loadRecitationData(selectedReciter, surahId);
                    return [surahId, data] as const;
                })
            );
            if (!isActive) return;
            const nextMap: Record<number, any> = {};
            entries.forEach(([surahId, data]) => {
                if (data) nextMap[surahId] = data;
            });
            setRecitationDataMap(nextMap);
            setIsLoadingReciter(false);
        };

        loadAll();
        return () => {
            isActive = false;
        };
    }, [selectedReciter, verses]);

    useEffect(() => {
        if (currentVerseIndex < totalVerses - 1) {
            setIsCompleted(false);
        }
    }, [currentVerseIndex, totalVerses]);

    useEffect(() => {
        setIsCompleted(false);
    }, [verses]);

    const safePlay = useCallback(() => {
        if (!audioRef.current) return;
        audioRef.current.play().catch((err) => {
            if (err?.name !== 'AbortError') {
                console.error(err);
            }
        });
    }, []);

    // Main Audio Loading Logic
    useEffect(() => {
        if (!currentVerse || !selectedReciter) return;
        if (isLoadingReciter && !recitationData) return;

        const info = getAudioInfoForVerse(selectedReciter, recitationData, currentVerse.surahId, currentVerse.ayahId);

        if (!info) {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.removeAttribute('src');
                audioRef.current.load();
            }
            setIsPlaying(false);
            setActiveSegments(null);
            setVerseEndTime(null);
            setVerseStartTime(0);
            setElapsedTime(0);
            onWordIndexChange?.(-1);
            lastWordIndexRef.current = -1;
            return;
        }

        const url = info.url;
        const startTime = info.startTime || 0;
        const endTime = info.endTime || null;
        const segments = info.segments || null;

        if (url) {
            if (audioRef.current) {
                const currentSrcPath = audioRef.current.src.split('?')[0]; // basic check
                const newSrcPath = new URL(url, 'http://localhost').href.split('?')[0];

                const desiredStartTime = startTime;
                const shouldAutoplay = isPlayingRef.current;
                pendingSeekTimeRef.current = desiredStartTime;
                pendingAutoplayRef.current = shouldAutoplay;

                if (endTime !== null) {
                    const clamped = Math.min(Math.max(desiredStartTime, startTime), Math.max(startTime, endTime - 0.05));
                    pendingSeekTimeRef.current = clamped;
                }

                if (currentSrcPath !== newSrcPath) {
                    audioRef.current.pause();
                    audioRef.current.src = url;
                    audioRef.current.load();
                } else {
                    // Same src (Surah mode), just seek
                    // Only seek if significantly different (to avoid jitter)
                    if (Math.abs(audioRef.current.currentTime - (pendingSeekTimeRef.current ?? desiredStartTime)) > 0.15) {
                        audioRef.current.currentTime = pendingSeekTimeRef.current ?? desiredStartTime;
                    }
                    pendingSeekTimeRef.current = null;
                }
                
                audioRef.current.playbackRate = speed;
                setElapsedTime(desiredStartTime);
                
                if (shouldAutoplay && currentSrcPath === newSrcPath) {
                    safePlay();
                }
            }
            setVerseStartTime(startTime);
            setVerseEndTime(endTime);
            setActiveSegments(segments);

            let initialIndex = -1;
            if (onWordIndexChange && currentVerseWordCount && currentVerseWordCount > 0 && isPlaying) {
                if (segments && segments.length > 0) {
                    const maxWordIndex = segments.reduce((max, s) => Math.max(max, s[0] ?? 0), 0);
                    const indexOffset = maxWordIndex === currentVerseWordCount ? -1 : 0;
                    const rawIndex = (segments[0]?.[0] ?? 0) + indexOffset;
                    initialIndex = rawIndex >= 0 && rawIndex < currentVerseWordCount ? rawIndex : 0;
                } else {
                    initialIndex = 0;
                }
            }

            if (initialIndex !== lastWordIndexRef.current) {
                onWordIndexChange?.(initialIndex);
                lastWordIndexRef.current = initialIndex;
            }
        }
    }, [currentVerse, selectedReciter, recitationData, speed, isLoadingReciter, currentVerseWordCount, safePlay, onWordIndexChange]); 

    // Handle Play/Pause effect
    useEffect(() => {
        if (audioRef.current) {
            if (isPlaying) {
                safePlay();
            } else {
                audioRef.current.pause();
                
                // Save playback state only on actual play -> pause transitions.
                if (prevIsPlayingRef.current && selectedReciter && currentVerse) {
                    saveSettings({
                        audioSettings: {
                            selectedReciterId: selectedReciter.id,
                            playbackSpeed: speed,
                            updatedAt: new Date().toISOString(),
                            playbackState: {
                                reciterId: selectedReciter.id,
                                surahId: currentVerse.surahId,
                                ayahId: currentVerse.ayahId,
                                timestamp: audioRef.current.currentTime
                            }
                        }
                    });
                }
            }
        }
        onPlayStateChange?.(isPlaying);
        prevIsPlayingRef.current = isPlaying;
    }, [isPlaying, onPlayStateChange, selectedReciter, currentVerse, saveSettings, speed, safePlay]);


    const handleTimeUpdate = useCallback(() => {
        if (audioRef.current) {
            const current = audioRef.current.currentTime;
            
            // Check for verse end in Surah mode
            if (verseEndTime !== null && current >= verseEndTime) {
                // Determine what to do
                if (currentVerseIndex < totalVerses - 1) {
                    onVerseChange(currentVerseIndex + 1);
                } else {
                    setIsPlaying(false);
                    setIsCompleted(true);
                }
                return;
            }

            setElapsedTime(current);

            // Word Highlighting
            let nextIndex: number | null = null;
            if (activeSegments && onWordIndexChange) {
                const timeMs = current * 1000;
                const maxEnd = activeSegments.reduce((max, s) => Math.max(max, s[2] ?? 0), 0);
                const segmentRangeMs = verseEndTime !== null
                    ? Math.max(0, (verseEndTime - verseStartTime) * 1000)
                    : 0;
                const segmentsAreRelative = verseStartTime > 0 && segmentRangeMs > 0 && maxEnd <= segmentRangeMs + 50;

                const maxWordIndex = activeSegments.reduce((max, s) => Math.max(max, s[0] ?? 0), 0);
                const indexOffset = (currentVerseWordCount && maxWordIndex === currentVerseWordCount)
                    ? -1
                    : 0;

                const resolveSegmentIndex = (segment: number[], segmentIdx: number) => {
                    const rawIndex = segment[0] + indexOffset;
                    if (currentVerseWordCount && currentVerseWordCount > 0) {
                        if (rawIndex >= 0 && rawIndex < currentVerseWordCount) return rawIndex;
                        // Fallback mapping by segment order if indexes don't align with text split
                        return Math.min(currentVerseWordCount - 1, Math.floor((segmentIdx / Math.max(1, activeSegments.length - 1)) * (currentVerseWordCount - 1)));
                    }
                    return Math.max(0, rawIndex);
                };

                // Find active segment
                const activeSegmentIdx = activeSegments.findIndex(s => {
                    const start = segmentsAreRelative ? s[1] + (verseStartTime * 1000) : s[1];
                    const end = segmentsAreRelative ? s[2] + (verseStartTime * 1000) : s[2];
                    return timeMs >= start && timeMs <= end;
                });
                if (activeSegmentIdx !== -1) {
                    nextIndex = resolveSegmentIndex(activeSegments[activeSegmentIdx], activeSegmentIdx);
                } else {
                    // If no exact match, keep the closest previous segment so highlight doesn't disappear
                    let lastSeenIdx: number | null = null;
                    for (let i = 0; i < activeSegments.length; i++) {
                        const s = activeSegments[i];
                        const start = segmentsAreRelative ? s[1] + (verseStartTime * 1000) : s[1];
                        if (timeMs >= start) {
                            lastSeenIdx = i;
                        } else {
                            break;
                        }
                    }
                    if (lastSeenIdx !== null) {
                        nextIndex = resolveSegmentIndex(activeSegments[lastSeenIdx], lastSeenIdx);
                    }
                }
            }

            // Fallback highlighting when no segment matches
            if (nextIndex === null && onWordIndexChange && currentVerseWordCount && currentVerseWordCount > 0) {
                const duration = verseEndTime !== null
                    ? Math.max(0.001, verseEndTime - verseStartTime)
                    : (Number.isFinite(audioRef.current?.duration ?? NaN) ? (audioRef.current?.duration || 0) : 0);
                if (duration > 0) {
                    const relative = Math.max(0, current - verseStartTime);
                    const ratio = Math.min(1, Math.max(0, relative / duration));
                    nextIndex = Math.min(currentVerseWordCount - 1, Math.floor(ratio * currentVerseWordCount));
                }
            }

            if (nextIndex !== null && nextIndex !== lastWordIndexRef.current) {
                lastWordIndexRef.current = nextIndex;
                onWordIndexChange?.(nextIndex);
            }
        }
    }, [verseEndTime, verseStartTime, currentVerseIndex, totalVerses, onVerseChange, activeSegments, onWordIndexChange, currentVerseWordCount]);

    const handleEnded = useCallback(() => {
        // This triggers for Ayah-mode files (end of file)
        if (currentVerseIndex < totalVerses - 1) {
            onVerseChange(currentVerseIndex + 1);
        } else {
            setIsPlaying(false);
            setIsCompleted(true);
        }
    }, [currentVerseIndex, totalVerses, onVerseChange]);

    const handleLoadedMetadata = useCallback(() => {
        if (!audioRef.current) return;

        if (pendingSeekTimeRef.current !== null) {
            audioRef.current.currentTime = pendingSeekTimeRef.current;
            setElapsedTime(pendingSeekTimeRef.current);
            pendingSeekTimeRef.current = null;
        }

        if (pendingAutoplayRef.current) {
            pendingAutoplayRef.current = false;
            safePlay();
        }
    }, [safePlay]);

    const handleError = useCallback(() => {
        setIsPlaying(false);
        onWordIndexChange?.(-1);
        lastWordIndexRef.current = -1;
    }, [onWordIndexChange]);

    const handleReciterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        const reciter = reciters.find(r => r.id === id);
        if (reciter) {
            audioRef.current?.pause();
            setRecitationData(null);
            setRecitationDataMap({});
            setActiveSegments(null);
            setVerseEndTime(null);
            setVerseStartTime(0);
            setElapsedTime(0);
            onWordIndexChange?.(-1);
            lastWordIndexRef.current = -1;
            setIsLoadingReciter(true);
            setSelectedReciter(reciter);
            localStorage.setItem('selected_reciter_id', id);
            
            // Save to synced settings
            saveSettings({
                audioSettings: {
                    selectedReciterId: id,
                    playbackSpeed: speed,
                    updatedAt: new Date().toISOString()
                }
            });
            
            setIsPlaying(false); // Stop on change
        }
    };

    // Format time as MM:SS
    const formatTime = (seconds: number): string => {
        const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
        const hrs = Math.floor(safeSeconds / 3600);
        const mins = Math.floor((safeSeconds % 3600) / 60);
        const secs = Math.floor(safeSeconds % 60);
        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const togglePlay = () => {
        if (isCompleted) return;
        setIsPlaying(!isPlaying);
    };

    const restartDailyPortion = () => {
        if (!selectedReciter || verses.length === 0) return;
        setIsCompleted(false);

        const firstVerse = verses[0];
        const info = getAudioInfoForVerse(selectedReciter, recitationData, firstVerse.surahId, firstVerse.ayahId);
        const desiredStartTime = info?.startTime || 0;

        onVerseChange(0);

        if (audioRef.current) {
            if (Number.isFinite(desiredStartTime)) {
                audioRef.current.currentTime = desiredStartTime;
            }
            setElapsedTime(desiredStartTime);
            onWordIndexChange?.(-1);
            lastWordIndexRef.current = -1;
            if (isPlaying) {
                safePlay();
            }
        }

        saveSettings({
            audioSettings: {
                selectedReciterId: selectedReciter.id,
                playbackSpeed: speed,
                updatedAt: new Date().toISOString(),
                playbackState: {
                    reciterId: selectedReciter.id,
                    surahId: firstVerse.surahId,
                    ayahId: firstVerse.ayahId,
                    timestamp: desiredStartTime
                }
            }
        });
    };
    
    const changeSpeed = () => {
        const currentIndex = SPEED_OPTIONS.indexOf(speed);
        const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
        const newSpeed = SPEED_OPTIONS[nextIndex];
        setSpeed(newSpeed);
        if (audioRef.current) audioRef.current.playbackRate = newSpeed;
        localStorage.setItem(SPEED_STORAGE_KEY, newSpeed.toString());

        if (selectedReciter) {
            saveSettings({
                audioSettings: {
                    selectedReciterId: selectedReciter.id,
                    playbackSpeed: newSpeed,
                    updatedAt: new Date().toISOString()
                }
            });
        }
    };

    const verseDurationsSec = useMemo(() => {
        if (!selectedReciter || verses.length === 0) return null;

        if (selectedReciter.type === 'ayah-based') {
            const versesMap = recitationData?.verses || {};
            return verses.map(v => {
                const key = `${v.surahId}:${v.ayahId}`;
                const info = versesMap[key];
                if (!info) return null;
                if (typeof info.duration === 'number' && Number.isFinite(info.duration)) {
                    return info.duration;
                }
                if (Array.isArray(info.segments) && info.segments.length > 0) {
                    const last = info.segments[info.segments.length - 1];
                    return (last?.[2] || 0) / 1000;
                }
                return null;
            });
        }

        return verses.map(v => {
            const data = recitationDataMap[v.surahId];
            const timing = data?.timings?.[`${v.surahId}:${v.ayahId}`];
            if (!timing) return null;
            if (typeof timing.timestamp_from === 'number' && typeof timing.timestamp_to === 'number') {
                return Math.max(0, (timing.timestamp_to - timing.timestamp_from) / 1000);
            }
            if (Array.isArray(timing.segments) && timing.segments.length > 0) {
                const last = timing.segments[timing.segments.length - 1];
                return (last?.[2] || 0) / 1000;
            }
            return null;
        });
    }, [selectedReciter, verses, recitationData, recitationDataMap]);

    const totalDurationSec = useMemo(() => {
        if (!verseDurationsSec) return null;
        if (verseDurationsSec.some(d => d === null)) return null;
        return verseDurationsSec.reduce((sum, d) => sum + (d || 0), 0);
    }, [verseDurationsSec]);

    const elapsedTotalSec = useMemo(() => {
        if (!verseDurationsSec) return null;
        const prior = verseDurationsSec.slice(0, currentVerseIndex).reduce((sum, d) => sum + (d || 0), 0);
        const currentDuration = verseDurationsSec[currentVerseIndex] || 0;
        const currentElapsed = Math.min(elapsedTime, currentDuration || elapsedTime);
        return prior + currentElapsed;
    }, [verseDurationsSec, currentVerseIndex, elapsedTime]);

    return (
        <div className="audio-player">
            <audio
                ref={audioRef}
                onEnded={handleEnded}
                onTimeUpdate={handleTimeUpdate}
                onError={handleError}
                onLoadedMetadata={handleLoadedMetadata}
                preload="auto"
            />

            {/* Reciter Selector */}
            <div className="reciter-select-container">
                <select 
                    className="reciter-select" 
                    value={selectedReciter?.id || ''} 
                    onChange={handleReciterChange}
                    disabled={reciters.length === 0}
                >
                    {reciters.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                </select>
                {isLoadingReciter && <Spinner size={16} />}
            </div>

            {/* Progress bar */}
            <div className="player-progress">
                <div className="progress-bar">
                    <div
                        className="progress-fill"
                        style={{ width: `${verseProgress}%` }}
                    />
                </div>
                <div className="progress-info">
                    <span>Verse {currentVerseIndex + 1} of {totalVerses}</span>
                    {showIsti3atah && (
                        <span className="text-xs text-gray-500 animate-pulse">
                            (Isti'aatha)
                        </span>
                    )}
                    <span>
                        {totalDurationSec !== null && elapsedTotalSec !== null
                            ? `${formatTime(elapsedTotalSec)} / ${formatTime(totalDurationSec)}`
                            : formatTime(elapsedTime)}
                    </span>
                </div>
            </div>

            {/* Controls */}
            <div className="player-controls">
                <button
                    className="player-btn"
                    onClick={restartDailyPortion}
                    title="Restart daily portion"
                    disabled={verses.length === 0}
                >
                    <RotateCcw size={18} />
                </button>

                <button 
                    className="player-btn" 
                    onClick={() => onVerseChange(Math.max(0, currentVerseIndex - 1))} 
                    disabled={currentVerseIndex <= 0}
                >
                    <SkipBack size={20} />
                </button>

                <button className="player-btn player-btn-main" onClick={togglePlay} disabled={isCompleted}>
                    {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                </button>

                <button 
                    className="player-btn" 
                    onClick={() => onVerseChange(Math.min(totalVerses - 1, currentVerseIndex + 1))} 
                    disabled={currentVerseIndex >= totalVerses - 1}
                >
                    <SkipForward size={20} />
                </button>

                <button className="player-btn font-bold" onClick={changeSpeed} title="Change speed" style={{ width: '40px', fontSize: '0.8rem' }}>
                    {speed}x
                </button>
            </div>

            <style jsx>{`
        .audio-player {
          background: var(--background-secondary);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 0.75rem;
        }

        .reciter-select-container {
            margin-bottom: 0.75rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .reciter-select {
            width: 100%;
            padding: 0.35rem 0.5rem;
            border-radius: 6px;
            border: 1px solid var(--border);
            background: var(--background);
            color: var(--foreground);
            font-size: 0.85rem;
        }

        .player-progress {
            margin-bottom: 0.75rem;
        }

        .progress-bar {
            height: 4px;
            background: var(--border);
            border-radius: 2px;
            overflow: hidden;
            margin-bottom: 0.25rem;
        }

        .progress-fill {
            height: 100%;
            background: var(--accent);
            transition: width 0.3s ease;
        }

        .progress-info {
            display: flex;
            justify-content: space-between;
            font-size: 0.75rem;
            color: var(--foreground-secondary);
        }

        .player-controls {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.5rem;
        }

        .player-btn {
            background: none;
            border: none;
            color: var(--foreground);
            cursor: pointer;
            padding: 0.4rem;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }

        .player-btn:hover:not(:disabled) {
            background: var(--background);
            color: var(--accent);
        }

        .player-btn:disabled {
            opacity: 0.3;
            cursor: not-allowed;
        }

        .player-btn-main {
            background: var(--accent);
            color: white;
            width: 48px;
            height: 48px;
            box-shadow: 0 4px 12px var(--shadow-color);
        }

        .player-btn-main:hover:not(:disabled) {
            transform: scale(1.05);
            background: var(--accent);
            color: white;
        }
      `}</style>
        </div>
    );
}
