'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { PlaybackSpeed, getAudioPath } from '@/lib/types';

interface AudioPlayerProps {
    surahId: number;
    startVerse: number;
    endVerse: number;
    onTimeUpdate?: (seconds: number) => void;
    onComplete?: () => void;
}

const SPEED_OPTIONS: PlaybackSpeed[] = [0.75, 1, 1.25, 1.5, 2];

export default function AudioPlayer({
    surahId,
    startVerse,
    endVerse,
    onTimeUpdate,
    onComplete,
}: AudioPlayerProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentVerse, setCurrentVerse] = useState(startVerse);
    const [speed, setSpeed] = useState<PlaybackSpeed>(1);
    const [isLooping, setIsLooping] = useState(false);
    const [progress, setProgress] = useState(0);
    const [elapsedTime, setElapsedTime] = useState(0);

    const totalVerses = endVerse - startVerse + 1;
    const verseProgress = ((currentVerse - startVerse) / totalVerses) * 100;

    // Load audio source for current verse
    const loadCurrentVerse = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.src = getAudioPath(surahId, currentVerse);
            audioRef.current.playbackRate = speed;
            if (isPlaying) {
                audioRef.current.play().catch(console.error);
            }
        }
    }, [surahId, currentVerse, speed, isPlaying]);

    useEffect(() => {
        loadCurrentVerse();
    }, [loadCurrentVerse]);

    // Handle audio end - advance to next verse
    const handleEnded = useCallback(() => {
        if (currentVerse < endVerse) {
            setCurrentVerse(prev => prev + 1);
        } else if (isLooping) {
            setCurrentVerse(startVerse);
        } else {
            setIsPlaying(false);
            onComplete?.();
        }
    }, [currentVerse, endVerse, startVerse, isLooping, onComplete]);

    // Handle time updates
    const handleTimeUpdate = useCallback(() => {
        if (audioRef.current) {
            const duration = audioRef.current.duration || 0;
            const current = audioRef.current.currentTime || 0;
            setProgress(duration > 0 ? (current / duration) * 100 : 0);

            // Track total elapsed time
            setElapsedTime(prev => {
                const newTime = prev + 0.25; // Approximate update every 250ms
                onTimeUpdate?.(newTime);
                return newTime;
            });
        }
    }, [onTimeUpdate]);

    // Play/pause toggle
    const togglePlay = () => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
            } else {
                audioRef.current.play().catch(console.error);
            }
            setIsPlaying(!isPlaying);
        }
    };

    // Change playback speed
    const changeSpeed = () => {
        const currentIndex = SPEED_OPTIONS.indexOf(speed);
        const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
        const newSpeed = SPEED_OPTIONS[nextIndex];
        setSpeed(newSpeed);
        if (audioRef.current) {
            audioRef.current.playbackRate = newSpeed;
        }
    };

    // Skip to next verse
    const nextVerse = () => {
        if (currentVerse < endVerse) {
            setCurrentVerse(prev => prev + 1);
        }
    };

    // Skip to previous verse
    const prevVerse = () => {
        if (currentVerse > startVerse) {
            setCurrentVerse(prev => prev - 1);
        }
    };

    // Restart current segment
    const restart = () => {
        setCurrentVerse(startVerse);
        setElapsedTime(0);
        if (audioRef.current) {
            audioRef.current.currentTime = 0;
        }
    };

    // Format time as MM:SS
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="audio-player">
            <audio
                ref={audioRef}
                onEnded={handleEnded}
                onTimeUpdate={handleTimeUpdate}
                preload="auto"
            />

            {/* Progress bar */}
            <div className="player-progress">
                <div className="progress-bar">
                    <div
                        className="progress-fill"
                        style={{ width: `${verseProgress}%` }}
                    />
                </div>
                <div className="progress-info">
                    <span>Verse {currentVerse} of {endVerse}</span>
                    <span>{formatTime(elapsedTime)}</span>
                </div>
            </div>

            {/* Controls */}
            <div className="player-controls">
                <button
                    className="player-btn"
                    onClick={() => setIsLooping(!isLooping)}
                    title={isLooping ? 'Loop on' : 'Loop off'}
                >
                    <span style={{ opacity: isLooping ? 1 : 0.4 }}>🔁</span>
                </button>

                <button className="player-btn" onClick={prevVerse} disabled={currentVerse <= startVerse}>
                    ⏮️
                </button>

                <button className="player-btn player-btn-main" onClick={togglePlay}>
                    {isPlaying ? '⏸️' : '▶️'}
                </button>

                <button className="player-btn" onClick={nextVerse} disabled={currentVerse >= endVerse}>
                    ⏭️
                </button>

                <button className="player-btn" onClick={changeSpeed} title="Change speed">
                    {speed}x
                </button>
            </div>

            {/* Additional controls */}
            <div className="player-extra">
                <button className="player-btn-text" onClick={restart}>
                    Restart
                </button>
            </div>

            <style jsx>{`
        .audio-player {
          background: var(--background-secondary);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 1rem;
        }

        .player-progress {
          margin-bottom: 1rem;
        }

        .progress-bar {
          width: 100%;
          height: 6px;
          background: var(--border);
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 0.5rem;
        }

        .progress-fill {
          height: 100%;
          background: var(--accent);
          border-radius: 3px;
          transition: width 0.3s ease;
        }

        .progress-info {
          display: flex;
          justify-content: space-between;
          font-size: 0.8rem;
          color: var(--foreground-secondary);
        }

        .player-controls {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .player-btn {
          background: none;
          border: 1px solid var(--border);
          border-radius: 50%;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 1.25rem;
          transition: all 0.2s ease;
        }

        .player-btn:hover:not(:disabled) {
          background: var(--verse-bg);
          border-color: var(--accent);
        }

        .player-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .player-btn-main {
          width: 56px;
          height: 56px;
          font-size: 1.5rem;
          background: var(--accent);
          border-color: var(--accent);
        }

        .player-btn-main:hover {
          background: var(--accent-hover);
        }

        .player-extra {
          display: flex;
          justify-content: center;
          margin-top: 0.75rem;
        }

        .player-btn-text {
          background: none;
          border: none;
          color: var(--foreground-secondary);
          font-size: 0.85rem;
          cursor: pointer;
          padding: 0.25rem 0.5rem;
        }

        .player-btn-text:hover {
          color: var(--accent);
        }
      `}</style>
        </div>
    );
}
