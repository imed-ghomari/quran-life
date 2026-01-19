'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { PlaybackSpeed, getAudioPath, Verse } from '@/lib/types';
import { Reciter, getReciters, loadRecitationData, getAudioInfoForVerse } from '@/lib/audio';
import { getAudioSettings, saveAudioSettings } from '@/lib/storage';
import { ChevronDown, Loader2, Play, Pause, SkipBack, SkipForward } from 'lucide-react';

interface AudioPlayerProps {
    verses: Verse[];
    currentVerseIndex: number;
    onVerseChange: (index: number) => void;
    onPlayStateChange?: (isPlaying: boolean) => void;
    onWordIndexChange?: (index: number) => void;
}

const SPEED_OPTIONS: PlaybackSpeed[] = [0.75, 1, 1.25, 1.5, 2];

export default function AudioPlayer({
    verses,
    currentVerseIndex,
    onVerseChange,
    onPlayStateChange,
    onWordIndexChange
}: AudioPlayerProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [speed, setSpeed] = useState<PlaybackSpeed>(1);
    
    // Reciter state
    const [reciters, setReciters] = useState<Reciter[]>([]);
    const [selectedReciter, setSelectedReciter] = useState<Reciter | null>(null);
    const [recitationData, setRecitationData] = useState<any>(null);
    const [isLoadingReciter, setIsLoadingReciter] = useState(false);

    // Audio State
    const [useFallback, setUseFallback] = useState(false);
    const [verseEndTime, setVerseEndTime] = useState<number | null>(null);
    const [activeSegments, setActiveSegments] = useState<number[][] | null>(null);
    const [showIsti3atah, setShowIsti3atah] = useState(false);
    
    // Progress
    const [progress, setProgress] = useState(0);
    const [elapsedTime, setElapsedTime] = useState(0);

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

    // Initialize Reciters
    useEffect(() => {
        getReciters().then(list => {
            setReciters(list);
            
            // Try to load from synced settings first, then localStorage
            const settings = getAudioSettings();
            let savedId = settings?.selectedReciterId;
            
            if (!savedId) {
                savedId = localStorage.getItem('selected_reciter_id') || undefined;
            }
            
            const defaultReciter = list.find(r => r.id === savedId) || list[0];
            setSelectedReciter(defaultReciter);

            // Restore playback position if available and applicable
            if (settings?.playbackState && verses.length > 0) {
                const { surahId, ayahId } = settings.playbackState;
                // Find if this verse exists in current portion
                const index = verses.findIndex(v => v.surahId === surahId && v.ayahId === ayahId);
                if (index !== -1 && index !== currentVerseIndex) {
                    onVerseChange(index);
                }
            }
        });
    }, [verses]); // Add verses dependency to ensure we can find the index

    // Load Recitation Data when Reciter or Surah changes
    useEffect(() => {
        if (!selectedReciter || !currentVerse) return;

        const load = async () => {
            setIsLoadingReciter(true);
            const data = await loadRecitationData(selectedReciter, currentVerse.surahId);
            setRecitationData(data);
            setIsLoadingReciter(false);
        };

        load();
    }, [selectedReciter, currentVerse?.surahId]);

    // Reset fallback on verse/reciter change
    useEffect(() => {
        setUseFallback(false);
    }, [currentVerse, selectedReciter]);

    // Main Audio Loading Logic
    useEffect(() => {
        if (!currentVerse || !selectedReciter) return;

        let url = '';
        let startTime = 0;
        let endTime: number | null = null;
        let segments: number[][] | null = null;

        // Try to get from selected reciter
        const info = getAudioInfoForVerse(selectedReciter, recitationData, currentVerse.surahId, currentVerse.ayahId);
        
        if (info && !useFallback) {
            url = info.url;
            startTime = info.startTime || 0;
            endTime = info.endTime || null;
            segments = info.segments || null;
        } else {
            // Fallback to local
            url = getAudioPath(currentVerse.surahId, currentVerse.ayahId);
        }

        if (url) {
            if (audioRef.current) {
                const currentSrcPath = audioRef.current.src.split('?')[0]; // basic check
                const newSrcPath = new URL(url, 'http://localhost').href.split('?')[0];

                if (currentSrcPath !== newSrcPath) {
                    audioRef.current.src = url;
                    audioRef.current.currentTime = startTime;
                } else {
                    // Same src (Surah mode), just seek
                    // Only seek if significantly different (to avoid jitter)
                    if (Math.abs(audioRef.current.currentTime - startTime) > 0.5) {
                        audioRef.current.currentTime = startTime;
                    }
                }
                
                audioRef.current.playbackRate = speed;
                
                if (isPlaying) {
                    audioRef.current.play().catch(console.error);
                }
            }
            setVerseEndTime(endTime);
            setActiveSegments(segments);
            onWordIndexChange?.(-1);
        }
    }, [currentVerse, selectedReciter, recitationData, speed, useFallback]); 

    // Handle Play/Pause effect
    useEffect(() => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.play().catch(console.error);
            } else {
                audioRef.current.pause();
                
                // Save playback state when paused
                if (selectedReciter && currentVerse) {
                    const currentSettings = getAudioSettings() || {
                        selectedReciterId: selectedReciter.id,
                        updatedAt: new Date().toISOString()
                    };
                    
                    saveAudioSettings({
                        ...currentSettings,
                        playbackState: {
                            surahId: currentVerse.surahId,
                            ayahId: currentVerse.ayahId,
                            timestamp: audioRef.current.currentTime
                        }
                    });
                }
            }
        }
        onPlayStateChange?.(isPlaying);
    }, [isPlaying, onPlayStateChange, selectedReciter, currentVerse]);


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
                }
                return;
            }

            setElapsedTime(current);

            // Word Highlighting
            if (activeSegments && onWordIndexChange) {
                const timeMs = current * 1000;
                // Find active segment
                const activeSegment = activeSegments.find(s => timeMs >= s[1] && timeMs <= s[2]);
                if (activeSegment) {
                    onWordIndexChange(activeSegment[0] - 1);
                }
            }
        }
    }, [verseEndTime, currentVerseIndex, totalVerses, onVerseChange, activeSegments, onWordIndexChange]);

    const handleEnded = useCallback(() => {
        // This triggers for Ayah-mode files (end of file)
        if (currentVerseIndex < totalVerses - 1) {
            onVerseChange(currentVerseIndex + 1);
        } else {
            setIsPlaying(false);
        }
    }, [currentVerseIndex, totalVerses, onVerseChange]);

    const handleError = () => {
        if (!useFallback) {
            console.warn('Audio load error, switching to fallback');
            setUseFallback(true);
        }
    };

    const handleReciterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        const reciter = reciters.find(r => r.id === id);
        if (reciter) {
            setSelectedReciter(reciter);
            localStorage.setItem('selected_reciter_id', id);
            
            // Save to synced settings
            const currentSettings = getAudioSettings() || {
                selectedReciterId: id,
                updatedAt: new Date().toISOString()
            };
            
            saveAudioSettings({
                ...currentSettings,
                selectedReciterId: id
            });
            
            setIsPlaying(false); // Stop on change
        }
    };

    // Format time as MM:SS
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const togglePlay = () => setIsPlaying(!isPlaying);
    
    const changeSpeed = () => {
        const currentIndex = SPEED_OPTIONS.indexOf(speed);
        const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
        const newSpeed = SPEED_OPTIONS[nextIndex];
        setSpeed(newSpeed);
        if (audioRef.current) audioRef.current.playbackRate = newSpeed;
    };

    return (
        <div className="audio-player">
            <audio
                ref={audioRef}
                onEnded={handleEnded}
                onTimeUpdate={handleTimeUpdate}
                onError={handleError}
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
                {isLoadingReciter && <Loader2 className="animate-spin w-4 h-4 text-gray-500" />}
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
                    <span>{formatTime(elapsedTime)}</span>
                </div>
            </div>

            {/* Controls */}
            <div className="player-controls">
                <button 
                    className="player-btn" 
                    onClick={() => onVerseChange(Math.max(0, currentVerseIndex - 1))} 
                    disabled={currentVerseIndex <= 0}
                >
                    <SkipBack size={20} />
                </button>

                <button className="player-btn player-btn-main" onClick={togglePlay}>
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
