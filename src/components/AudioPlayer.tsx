'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSharedInstantSettings } from '@/components/InstantDataProvider';
import { PlaybackSpeed, Verse } from '@/lib/types';
import { Reciter, getReciters, loadRecitationData, getAudioInfoForVerse } from '@/lib/audio';
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
const MEDIA_READY_STATE_FUTURE_DATA = 3;
const SEEK_TOLERANCE_SEC = 0.08;
const BUFFER_GUARD_SEC = 0.18;
const VERSE_END_GRACE_SEC = 0.12;
const SURAH_PREVIEW_ADVANCE_EPSILON_SEC = 0.01;
const SURAH_ADVANCE_SETTLE_MS = 180;

const sortSegmentsByStart = (segments: number[][] | null): number[][] | null => {
    if (!segments || segments.length === 0) return segments;
    return [...segments].sort((a, b) => (a?.[1] ?? 0) - (b?.[1] ?? 0));
};

const isAudioBufferedAt = (audio: HTMLAudioElement, targetTime: number) => {
    if (audio.readyState >= MEDIA_READY_STATE_FUTURE_DATA) return true;
    if (!Number.isFinite(targetTime)) return false;

    const buffered = audio.buffered;
    const safeStart = Math.max(0, targetTime - SEEK_TOLERANCE_SEC);
    const safeEnd = Number.isFinite(audio.duration)
        ? Math.min(audio.duration, targetTime + BUFFER_GUARD_SEC)
        : targetTime + BUFFER_GUARD_SEC;

    for (let i = 0; i < buffered.length; i += 1) {
        const start = buffered.start(i);
        const end = buffered.end(i);
        if (start <= safeStart && end >= safeEnd) {
            return true;
        }
    }

    return false;
};

export default function AudioPlayer({
    verses,
    currentVerseIndex,
    currentVerseWordCount,
    onVerseChange,
    onPlayStateChange,
    onWordIndexChange
}: AudioPlayerProps) {
    const { settings, saveSettings } = useSharedInstantSettings();
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [speed, setSpeed] = useState<PlaybackSpeed>(1);
    const speedRef = useRef<PlaybackSpeed>(1);
    
    // Reciter state
    const [reciters, setReciters] = useState<Reciter[]>([]);
    const [selectedReciter, setSelectedReciter] = useState<Reciter | null>(null);
    const [recitationData, setRecitationData] = useState<any>(null);
    const [recitationDataMap, setRecitationDataMap] = useState<Record<number, any>>({});
    const [isLoadingReciter, setIsLoadingReciter] = useState(false);
    const [isAudioPreparing, setIsAudioPreparing] = useState(true);
    const [isAudioReady, setIsAudioReady] = useState(false);

    // Audio State
    const [verseEndTime, setVerseEndTime] = useState<number | null>(null);
    const [verseStartTime, setVerseStartTime] = useState(0);
    const [activeSegments, setActiveSegments] = useState<number[][] | null>(null);
    const lastWordIndexRef = useRef<number>(-1);
    
    // Progress
    const [elapsedTime, setElapsedTime] = useState(0);
    const [isCompleted, setIsCompleted] = useState(false);
    const pendingSeekTimeRef = useRef<number | null>(null);
    const pendingAutoplayRef = useRef(false);
    const isPlayingRef = useRef(false);
    const prevIsPlayingRef = useRef(false);
    const hasHydratedPlaybackStateRef = useRef(false);
    const pendingResumeRef = useRef<{ reciterId?: string; surahId: number; ayahId: number; timestamp: number } | null>(null);
    const autoAdvanceStateRef = useRef<{ key: string; at: number; attempts: number }>({ key: '', at: 0, attempts: 0 });
    const stallCheckRef = useRef<{ t: number; wall: number }>({ t: 0, wall: 0 });
    const pendingTrackRef = useRef<{ key: string; targetTime: number; shouldAutoplay: boolean } | null>(null);
    const configuredTrackKeyRef = useRef('');
    const lastStableTimeRef = useRef(0);
    const settingsWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
    const lastQueuedAudioSettingsKeyRef = useRef('');
    const preloadAudioRef = useRef<HTMLAudioElement | null>(null);
    const preloadedTrackKeyRef = useRef('');
    const seamlessSurahAdvanceKeyRef = useRef('');
    const surahAdvanceGuardRef = useRef<{ verseKey: string; until: number }>({ verseKey: '', until: 0 });

    const currentVerse = verses[currentVerseIndex];
    const currentSurahId = currentVerse?.surahId ?? null;
    const currentAyahId = currentVerse?.ayahId ?? null;
    const currentVerseKey = currentSurahId !== null && currentAyahId !== null
        ? `${currentSurahId}:${currentAyahId}`
        : '';
    const selectedReciterId = selectedReciter?.id ?? '';
    const selectedReciterType = selectedReciter?.type ?? null;
    const selectedReciterPath = selectedReciter?.relativePath ?? '';
    const totalVerses = verses.length;
    const verseProgress = ((currentVerseIndex + 1) / totalVerses) * 100;
    const savedSelectedReciterId = settings?.audioSettings?.selectedReciterId;
    const savedPlaybackSpeed = settings?.audioSettings?.playbackSpeed;
    const savedPlaybackState = settings?.audioSettings?.playbackState;
    const versesSurahIdsKey = useMemo(() => {
        const surahIds = Array.from(new Set(verses.map((verse) => verse.surahId)));
        return surahIds.join(',');
    }, [verses]);
    const currentRecitationData = useMemo(() => {
        if (!selectedReciterType || currentSurahId === null) return null;
        if (selectedReciterType === 'surah-based') {
            const fromMap = recitationDataMap[currentSurahId];
            if (fromMap) return fromMap;
            if (recitationData?.surahId === currentSurahId) return recitationData;
            return null;
        }
        return recitationData;
    }, [selectedReciterType, currentSurahId, recitationDataMap, recitationData]);

    useEffect(() => {
        isPlayingRef.current = isPlaying;
    }, [isPlaying]);

    useEffect(() => {
        speedRef.current = speed;
    }, [speed]);

    useEffect(() => {
        autoAdvanceStateRef.current = { key: '', at: 0, attempts: 0 };
        stallCheckRef.current = { t: 0, wall: 0 };
    }, [currentVerse?.surahId, currentVerse?.ayahId, currentVerseIndex]);

    useEffect(() => {
        const currentVerseKeyForGuard = currentVerse?.surahId && currentVerse?.ayahId
            ? `${currentVerse.surahId}:${currentVerse.ayahId}`
            : '';
        if (surahAdvanceGuardRef.current.verseKey !== currentVerseKeyForGuard) {
            surahAdvanceGuardRef.current = { verseKey: '', until: 0 };
        }
    }, [currentVerse?.surahId, currentVerse?.ayahId]);

    const queueAudioSettingsPersist = useCallback((payload: {
        reciterId?: string;
        playbackSpeed?: PlaybackSpeed;
        playbackState?: {
            reciterId?: string;
            surahId: number;
            ayahId: number;
            timestamp: number;
        };
    }) => {
        const reciterId = payload.reciterId ?? selectedReciterId;
        if (!reciterId) return Promise.resolve();

        const nextPayload = {
            selectedReciterId: reciterId,
            playbackSpeed: payload.playbackSpeed ?? speedRef.current,
            updatedAt: new Date().toISOString(),
            ...(payload.playbackState ? { playbackState: payload.playbackState } : {})
        };
        const dedupeKey = JSON.stringify({
            selectedReciterId: nextPayload.selectedReciterId,
            playbackSpeed: nextPayload.playbackSpeed,
            playbackState: nextPayload.playbackState ?? null
        });

        if (dedupeKey === lastQueuedAudioSettingsKeyRef.current) {
            return settingsWriteQueueRef.current;
        }

        lastQueuedAudioSettingsKeyRef.current = dedupeKey;
        const queued = settingsWriteQueueRef.current.then(async () => {
            try {
                await saveSettings({
                    audioSettings: nextPayload
                });
            } catch (err) {
                if (lastQueuedAudioSettingsKeyRef.current === dedupeKey) {
                    lastQueuedAudioSettingsKeyRef.current = '';
                }
                console.error('Failed to persist audio settings', err);
            }
        });
        settingsWriteQueueRef.current = queued;
        return queued;
    }, [saveSettings, selectedReciterId]);

    const persistPlaybackState = useCallback((opts?: {
        timestamp?: number;
        verse?: Verse;
        reciterId?: string;
    }) => {
        const verse = opts?.verse ?? currentVerse;
        const reciterId = opts?.reciterId ?? (selectedReciterId || undefined);
        if (!verse || !reciterId) return;

        const fallbackTimestamp = audioRef.current?.currentTime ?? verseStartTime;
        const timestamp = Number.isFinite(opts?.timestamp ?? NaN)
            ? Math.max(0, opts?.timestamp as number)
            : Math.max(0, fallbackTimestamp);

        void queueAudioSettingsPersist({
            reciterId,
            playbackSpeed: speedRef.current,
            playbackState: {
                reciterId,
                surahId: verse.surahId,
                ayahId: verse.ayahId,
                timestamp
            }
        });
    }, [currentVerse, selectedReciterId, queueAudioSettingsPersist, verseStartTime]);

    // Initialize reciters list once.
    useEffect(() => {
        getReciters().then(list => {
            setReciters(list);
        });
    }, []);

    // Sync selected reciter from saved preference without reacting to unrelated audioSettings writes.
    useEffect(() => {
        if (reciters.length === 0) return;

        let savedId = savedSelectedReciterId;
        if (!savedId) {
            savedId = localStorage.getItem('selected_reciter_id') || undefined;
        }

        const preferred = reciters.find(r => r.id === savedId) || reciters[0];
        if (!preferred) return;

        if (selectedReciterId !== preferred.id) {
            setSelectedReciter(preferred);
        }
    }, [reciters, savedSelectedReciterId, selectedReciterId]);

    useEffect(() => {
        const stored = savedPlaybackSpeed ?? (() => {
            const raw = localStorage.getItem(SPEED_STORAGE_KEY);
            if (!raw) return undefined;
            const parsed = Number(raw) as PlaybackSpeed;
            return SPEED_OPTIONS.includes(parsed) ? parsed : undefined;
        })();

        if (stored && stored !== speed) {
            setSpeed(stored);
            if (audioRef.current) audioRef.current.playbackRate = stored;
        }
    }, [savedPlaybackSpeed, speed]);

    useEffect(() => {
        if (hasHydratedPlaybackStateRef.current) return;
        if (!selectedReciterId || verses.length === 0) return;

        const playbackState = savedPlaybackState;
        if (!playbackState) {
            hasHydratedPlaybackStateRef.current = true;
            return;
        }

        if (playbackState.reciterId && playbackState.reciterId !== selectedReciterId) {
            hasHydratedPlaybackStateRef.current = true;
            return;
        }

        const resumeIndex = verses.findIndex(
            (v) => v.surahId === playbackState.surahId && v.ayahId === playbackState.ayahId
        );
        if (resumeIndex === -1) {
            hasHydratedPlaybackStateRef.current = true;
            return;
        }

        pendingResumeRef.current = {
            reciterId: selectedReciterId,
            surahId: playbackState.surahId,
            ayahId: playbackState.ayahId,
            timestamp: Math.max(0, playbackState.timestamp || 0)
        };

        if (resumeIndex !== currentVerseIndex) {
            onVerseChange(resumeIndex);
        } else {
            pendingSeekTimeRef.current = Math.max(0, playbackState.timestamp || 0);
            setElapsedTime(Math.max(0, playbackState.timestamp || 0));
        }

        hasHydratedPlaybackStateRef.current = true;
    }, [savedPlaybackState, selectedReciterId, verses, currentVerseIndex, onVerseChange]);

    // Load Recitation Data when Reciter or Surah changes
    useEffect(() => {
        if (!selectedReciterId || !selectedReciterType || !selectedReciterPath || currentSurahId === null) return;

        let isActive = true;
        const reciterId = selectedReciterId;
        const requestedSurahId = currentSurahId;
        const reciterForLoad: Reciter = {
            id: selectedReciterId,
            name: '',
            type: selectedReciterType,
            relativePath: selectedReciterPath
        };

        const load = async () => {
            setIsLoadingReciter(true);
            const data = await loadRecitationData(reciterForLoad, requestedSurahId);
            if (!isActive) return;
            // Guard against stale resolves when reciter changes mid-load
            if (reciterForLoad.id !== reciterId) return;
            if (reciterForLoad.type === 'surah-based' && data?.surahId !== requestedSurahId) return;
            setRecitationData(data);
            setIsLoadingReciter(false);
        };

        load();
        return () => {
            isActive = false;
        };
    }, [selectedReciterId, selectedReciterType, selectedReciterPath, currentSurahId]);

    useEffect(() => {
        if (!selectedReciterId || selectedReciterType !== 'surah-based' || !selectedReciterPath || verses.length === 0) return;
        const surahIds = versesSurahIdsKey.length > 0
            ? versesSurahIdsKey.split(',').map(Number).filter(Number.isFinite)
            : [];
        if (surahIds.length === 0) return;
        const reciterForLoad: Reciter = {
            id: selectedReciterId,
            name: '',
            type: selectedReciterType,
            relativePath: selectedReciterPath
        };

        let isActive = true;
        const loadAll = async () => {
            setIsLoadingReciter(true);
            const entries = await Promise.all(
                surahIds.map(async (surahId) => {
                    const data = await loadRecitationData(reciterForLoad, surahId);
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
    }, [selectedReciterId, selectedReciterType, selectedReciterPath, versesSurahIdsKey, verses.length]);

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

    const finalizePendingPlayback = useCallback(() => {
        const audio = audioRef.current;
        const pendingTrack = pendingTrackRef.current;
        if (!audio || !pendingTrack) return false;
        if (audio.seeking || audio.readyState === 0) return false;

        const targetTime = pendingTrack.targetTime;
        const isNearTarget = Math.abs(audio.currentTime - targetTime) <= SEEK_TOLERANCE_SEC;
        if (!isNearTarget) {
            try {
                audio.currentTime = targetTime;
            } catch {
                return false;
            }
            return false;
        }

        if (!isAudioBufferedAt(audio, targetTime)) {
            return false;
        }

        pendingTrackRef.current = null;
        pendingSeekTimeRef.current = null;
        pendingAutoplayRef.current = false;
        setElapsedTime(targetTime);
        lastStableTimeRef.current = targetTime;
        setIsAudioPreparing(false);
        setIsAudioReady(true);

        if (pendingTrack.shouldAutoplay) {
            safePlay();
        }

        return true;
    }, [safePlay]);

    const preparePendingTrack = useCallback((track: { targetTime: number; shouldAutoplay: boolean }) => {
        pendingTrackRef.current = {
            key: `${Date.now()}-${track.targetTime}`,
            targetTime: track.targetTime,
            shouldAutoplay: track.shouldAutoplay
        };
        pendingSeekTimeRef.current = track.targetTime;
        pendingAutoplayRef.current = track.shouldAutoplay;
        setIsAudioPreparing(true);
        setIsAudioReady(false);
    }, []);

    const setPendingTrackWithoutLoader = useCallback((track: { targetTime: number; shouldAutoplay: boolean }) => {
        pendingTrackRef.current = {
            key: `${Date.now()}-${track.targetTime}`,
            targetTime: track.targetTime,
            shouldAutoplay: track.shouldAutoplay
        };
        pendingSeekTimeRef.current = track.targetTime;
        pendingAutoplayRef.current = track.shouldAutoplay;
        setIsAudioPreparing(false);
        setIsAudioReady(true);
    }, []);

    const pausePlaybackAt = useCallback((targetTime?: number) => {
        const audio = audioRef.current;
        if (!audio) return;

        const fallbackTime = Math.max(0, audio.currentTime || lastStableTimeRef.current || 0);
        const nextTarget = Number.isFinite(targetTime ?? NaN)
            ? Math.max(0, targetTime as number)
            : fallbackTime;

        if (!audio.paused) {
            audio.pause();
        }

        if (Math.abs(audio.currentTime - nextTarget) > SEEK_TOLERANCE_SEC) {
            try {
                audio.currentTime = nextTarget;
            } catch {
                // Ignore browsers that reject seeks while transitioning sources.
            }
        }

        lastStableTimeRef.current = nextTarget;
        setElapsedTime(nextTarget);
    }, []);

    const freezePlaybackAt = useCallback((targetTime?: number) => {
        const audio = audioRef.current;
        if (!audio) return;

        const fallbackTime = Math.max(0, audio.currentTime || lastStableTimeRef.current || 0);
        const nextTarget = Number.isFinite(targetTime ?? NaN)
            ? Math.max(0, targetTime as number)
            : fallbackTime;

        preparePendingTrack({
            targetTime: nextTarget,
            shouldAutoplay: isPlayingRef.current
        });

        pausePlaybackAt(nextTarget);
    }, [preparePendingTrack, pausePlaybackAt]);

    // Main Audio Loading Logic
    useEffect(() => {
        if (!currentVerseKey || currentSurahId === null || currentAyahId === null || !selectedReciterId || !selectedReciterType || !selectedReciterPath) return;
        if (isLoadingReciter && !currentRecitationData) {
            setIsAudioPreparing(true);
            setIsAudioReady(false);
            return;
        }
        const reciterForPlayback: Reciter = {
            id: selectedReciterId,
            name: '',
            type: selectedReciterType,
            relativePath: selectedReciterPath
        };

        const info = getAudioInfoForVerse(reciterForPlayback, currentRecitationData, currentSurahId, currentAyahId);

        if (!info) {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.removeAttribute('src');
                audioRef.current.load();
            }
            setIsPlaying(false);
            setIsAudioPreparing(false);
            setIsAudioReady(false);
            setActiveSegments(null);
            setVerseEndTime(null);
            setVerseStartTime(0);
            setElapsedTime(0);
            onWordIndexChange?.(-1);
            lastWordIndexRef.current = -1;
            pendingTrackRef.current = null;
            pendingSeekTimeRef.current = null;
            pendingAutoplayRef.current = false;
            configuredTrackKeyRef.current = '';
            return;
        }

        const url = info.url;
        const startTime = info.startTime || 0;
        const endTime = info.endTime || null;
        const segments = sortSegmentsByStart(info.segments || null);

        if (url) {
            let usedSeamlessSurahAdvance = false;
            if (audioRef.current) {
                const currentSrcPath = audioRef.current.src.split('?')[0]; // basic check
                const newSrcPath = new URL(url, 'http://localhost').href.split('?')[0];

                let desiredStartTime = startTime;
                const pendingResume = pendingResumeRef.current;
                if (
                    pendingResume &&
                    (!pendingResume.reciterId || pendingResume.reciterId === selectedReciterId) &&
                    pendingResume.surahId === currentSurahId &&
                    pendingResume.ayahId === currentAyahId
                ) {
                    desiredStartTime = Math.max(startTime, pendingResume.timestamp || startTime);
                    pendingResumeRef.current = null;
                }

                const shouldAutoplay = isPlayingRef.current;
                pendingSeekTimeRef.current = desiredStartTime;
                pendingAutoplayRef.current = shouldAutoplay;

                if (endTime !== null) {
                    const clamped = Math.min(Math.max(desiredStartTime, startTime), Math.max(startTime, endTime - 0.05));
                    pendingSeekTimeRef.current = clamped;
                }

                const targetTime = pendingSeekTimeRef.current ?? desiredStartTime;
                const trackKey = `${selectedReciterId}:${currentVerseKey}:${url}:${targetTime}:${endTime ?? 'null'}`;
                if (configuredTrackKeyRef.current === trackKey) {
                    audioRef.current.playbackRate = speedRef.current;
                    setVerseStartTime(startTime);
                    setVerseEndTime(endTime);
                    setActiveSegments(segments);
                    return;
                }

                configuredTrackKeyRef.current = trackKey;
                const canContinueSeamlessly = selectedReciterType === 'surah-based'
                    && seamlessSurahAdvanceKeyRef.current === currentVerseKey
                    && currentSrcPath === newSrcPath
                    && audioRef.current.readyState > 0
                    && audioRef.current.currentTime >= Math.max(0, startTime - VERSE_END_GRACE_SEC)
                    && (endTime === null || audioRef.current.currentTime <= endTime + BUFFER_GUARD_SEC);

                if (canContinueSeamlessly) {
                    usedSeamlessSurahAdvance = true;
                    seamlessSurahAdvanceKeyRef.current = '';
                    pendingTrackRef.current = null;
                    pendingSeekTimeRef.current = null;
                    pendingAutoplayRef.current = false;
                    setIsAudioPreparing(false);
                    setIsAudioReady(true);
                    setElapsedTime(audioRef.current.currentTime);
                } else if (currentSrcPath !== newSrcPath) {
                    seamlessSurahAdvanceKeyRef.current = '';
                    preparePendingTrack({
                        targetTime,
                        shouldAutoplay
                    });
                    audioRef.current.pause();
                    audioRef.current.src = url;
                    audioRef.current.load();
                } else {
                    seamlessSurahAdvanceKeyRef.current = '';
                    const canSwitchInstantly = isAudioBufferedAt(audioRef.current, targetTime);
                    if (canSwitchInstantly) {
                        setPendingTrackWithoutLoader({
                            targetTime,
                            shouldAutoplay
                        });
                    } else {
                        preparePendingTrack({
                            targetTime,
                            shouldAutoplay
                        });
                    }

                    // Same src (Surah mode), just seek
                    audioRef.current.pause();
                    if (Math.abs(audioRef.current.currentTime - targetTime) > 0.08) {
                        audioRef.current.currentTime = targetTime;
                    }
                    // If browser deferred the seek, force-apply once.
                    if (Math.abs(audioRef.current.currentTime - targetTime) > 0.15) {
                        audioRef.current.currentTime = targetTime;
                    }
                }
                
                audioRef.current.playbackRate = speedRef.current;
                if (!canContinueSeamlessly) {
                    setElapsedTime(desiredStartTime);
                }
                
                if (currentSrcPath === newSrcPath && !canContinueSeamlessly) {
                    void finalizePendingPlayback();
                }
            }
            setVerseStartTime(startTime);
            setVerseEndTime(endTime);
            setActiveSegments(segments);

            let initialIndex = -1;
            const shouldSkipInitialWordReset = usedSeamlessSurahAdvance;
            if (!shouldSkipInitialWordReset && onWordIndexChange && currentVerseWordCount && currentVerseWordCount > 0 && isPlayingRef.current) {
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
    }, [currentVerseKey, currentSurahId, currentAyahId, selectedReciterId, selectedReciterType, selectedReciterPath, currentRecitationData, isLoadingReciter, currentVerseWordCount, finalizePendingPlayback, onWordIndexChange, preparePendingTrack, setPendingTrackWithoutLoader]); 

    // Handle Play/Pause effect
    useEffect(() => {
        if (!audioRef.current) return;

        if (isPlaying !== prevIsPlayingRef.current) {
            if (isPlaying) {
                if (isAudioReady) {
                    safePlay();
                }
            } else {
                pendingAutoplayRef.current = false;
                audioRef.current.pause();
                
                // Save playback state only on actual play -> pause transitions.
                if (prevIsPlayingRef.current && selectedReciter && currentVerse) {
                    persistPlaybackState({
                        timestamp: audioRef.current.currentTime,
                        verse: currentVerse,
                        reciterId: selectedReciter.id
                    });
                }
            }
        }

        onPlayStateChange?.(isPlaying);
        prevIsPlayingRef.current = isPlaying;
    }, [isPlaying, isAudioReady, onPlayStateChange, selectedReciter, currentVerse, safePlay, persistPlaybackState]);

    useEffect(() => {
        if (!isPlaying) return;

        const id = window.setInterval(() => {
            const audio = audioRef.current;
            if (!audio) return;
            if (audio.paused || audio.ended) return;

            const now = Date.now();
            const current = audio.currentTime;
            const prev = stallCheckRef.current;

            if (Math.abs(current - prev.t) > 0.02) {
                stallCheckRef.current = { t: current, wall: now };
                return;
            }

            if (prev.wall === 0) {
                stallCheckRef.current = { t: current, wall: now };
                return;
            }

            if (now - prev.wall >= 1500) {
                if (audio.readyState >= MEDIA_READY_STATE_FUTURE_DATA) {
                    safePlay();
                } else {
                    freezePlaybackAt(audio.currentTime);
                }
                stallCheckRef.current = { t: current, wall: now };
            }
        }, 500);

        return () => window.clearInterval(id);
    }, [isPlaying, safePlay, freezePlaybackAt]);

    useEffect(() => {
        const persistOnHide = () => {
            persistPlaybackState();
        };

        const handleVisibility = () => {
            if (document.visibilityState === 'hidden') persistOnHide();
        };

        window.addEventListener('beforeunload', persistOnHide);
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            window.removeEventListener('beforeunload', persistOnHide);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [persistPlaybackState]);

    const getRecitationDataForVerse = useCallback((verse: Verse | undefined) => {
        if (!verse || !selectedReciterType) return null;
        if (selectedReciterType === 'surah-based') {
            return recitationDataMap[verse.surahId] ?? (recitationData?.surahId === verse.surahId ? recitationData : null);
        }
        return recitationData;
    }, [selectedReciterType, recitationDataMap, recitationData]);

    const getAudioInfoForVerseIndex = useCallback((verseIndex: number) => {
        if (verseIndex < 0 || verseIndex >= verses.length) return null;
        if (!selectedReciterId || !selectedReciterType || !selectedReciterPath) return null;

        const verse = verses[verseIndex];
        if (!verse) return null;

        const verseRecitationData = getRecitationDataForVerse(verse);
        if (!verseRecitationData) return null;

        return getAudioInfoForVerse({
            id: selectedReciterId,
            name: '',
            type: selectedReciterType,
            relativePath: selectedReciterPath
        }, verseRecitationData, verse.surahId, verse.ayahId);
    }, [verses, selectedReciterId, selectedReciterType, selectedReciterPath, getRecitationDataForVerse]);

    const currentVerseAudioUrl = useMemo(() => {
        return getAudioInfoForVerseIndex(currentVerseIndex)?.url ?? '';
    }, [currentVerseIndex, getAudioInfoForVerseIndex]);

    const nextVerseInfo = useMemo(() => {
        return getAudioInfoForVerseIndex(currentVerseIndex + 1);
    }, [currentVerseIndex, getAudioInfoForVerseIndex]);

    useEffect(() => {
        const nextUrl = nextVerseInfo?.url ?? '';
        if (!nextUrl || !selectedReciterId || nextUrl === currentVerseAudioUrl) {
            preloadedTrackKeyRef.current = '';
            if (preloadAudioRef.current) {
                preloadAudioRef.current.pause();
                preloadAudioRef.current.removeAttribute('src');
                preloadAudioRef.current.load();
                preloadAudioRef.current = null;
            }
            return;
        }

        const preloadKey = `${selectedReciterId}:${currentVerseIndex + 1}:${nextUrl}`;
        if (preloadKey === preloadedTrackKeyRef.current) return;

        if (preloadAudioRef.current) {
            preloadAudioRef.current.pause();
            preloadAudioRef.current.removeAttribute('src');
            preloadAudioRef.current.load();
        }

        const audio = new Audio();
        audio.preload = 'auto';
        audio.src = nextUrl;
        audio.load();

        preloadAudioRef.current = audio;
        preloadedTrackKeyRef.current = preloadKey;
    }, [currentVerseAudioUrl, currentVerseIndex, nextVerseInfo?.url, selectedReciterId]);

    useEffect(() => {
        return () => {
            if (!preloadAudioRef.current) return;
            preloadAudioRef.current.pause();
            preloadAudioRef.current.removeAttribute('src');
            preloadAudioRef.current.load();
            preloadAudioRef.current = null;
        };
    }, []);

    const maybeAdvanceVerse = useCallback((currentTime: number) => {
        const verseKey = `${currentVerse?.surahId ?? 0}:${currentVerse?.ayahId ?? 0}:${currentVerseIndex}`;
        const nextVerse = currentVerseIndex < totalVerses - 1 ? verses[currentVerseIndex + 1] : null;
        const nextVerseKey = nextVerse ? `${nextVerse.surahId}:${nextVerse.ayahId}` : '';

        if (verseEndTime === null) return false;

        const now = Date.now();
        if (
            selectedReciterType === 'surah-based'
            && surahAdvanceGuardRef.current.verseKey === verseKey
            && now < surahAdvanceGuardRef.current.until
        ) {
            return false;
        }

        const boundaryReached = selectedReciterType === 'surah-based'
            ? currentTime >= Math.max(0, verseEndTime - SURAH_PREVIEW_ADVANCE_EPSILON_SEC)
            : currentTime >= verseEndTime + VERSE_END_GRACE_SEC;

        if (!boundaryReached) return false;

        const state = autoAdvanceStateRef.current;
        if (state.key === verseKey && now - state.at < 700) {
            return true;
        }

        autoAdvanceStateRef.current = {
            key: verseKey,
            at: now,
            attempts: state.key === verseKey ? state.attempts + 1 : 1
        };

        if (currentVerseIndex < totalVerses - 1) {
            if (selectedReciterType === 'surah-based' && nextVerseKey) {
                seamlessSurahAdvanceKeyRef.current = nextVerseKey;
                surahAdvanceGuardRef.current = {
                    verseKey: nextVerseKey,
                    until: now + SURAH_ADVANCE_SETTLE_MS
                };
            } else {
                pausePlaybackAt(verseEndTime);
            }
            onVerseChange(currentVerseIndex + 1);
        } else {
            seamlessSurahAdvanceKeyRef.current = '';
            surahAdvanceGuardRef.current = { verseKey: '', until: 0 };
            pausePlaybackAt(verseEndTime);
            setIsPlaying(false);
            setIsCompleted(true);
        }

        return true;
    }, [currentVerse?.surahId, currentVerse?.ayahId, currentVerseIndex, totalVerses, verses, verseEndTime, selectedReciterType, pausePlaybackAt, onVerseChange]);

    useEffect(() => {
        if (selectedReciterType !== 'surah-based' || !isPlaying || !isAudioReady || pendingTrackRef.current || verseEndTime === null) {
            return;
        }

        let frameId = 0;
        const tick = () => {
            const audio = audioRef.current;
            if (!audio || audio.paused || audio.ended) return;
            maybeAdvanceVerse(audio.currentTime);
            frameId = window.requestAnimationFrame(tick);
        };

        frameId = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(frameId);
    }, [selectedReciterType, isPlaying, isAudioReady, verseEndTime, maybeAdvanceVerse]);


    const handleTimeUpdate = useCallback(() => {
        if (audioRef.current) {
            if (pendingTrackRef.current || isAudioPreparing || !isAudioReady) {
                return;
            }

            const current = audioRef.current.currentTime;
            
            if (maybeAdvanceVerse(current)) {
                return;
            }

            lastStableTimeRef.current = current;
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
    }, [verseEndTime, verseStartTime, activeSegments, onWordIndexChange, currentVerseWordCount, isAudioPreparing, isAudioReady, maybeAdvanceVerse]);

    const handleEnded = useCallback(() => {
        if (pendingTrackRef.current || isAudioPreparing || !isAudioReady) {
            return;
        }

        // This triggers for Ayah-mode files (end of file)
        if (currentVerseIndex < totalVerses - 1) {
            onVerseChange(currentVerseIndex + 1);
        } else {
            setIsPlaying(false);
            setIsCompleted(true);
        }
    }, [currentVerseIndex, totalVerses, onVerseChange, isAudioPreparing, isAudioReady]);

    const handleLoadedMetadata = useCallback(() => {
        void finalizePendingPlayback();
    }, [finalizePendingPlayback]);

    const handleCanPlay = useCallback(() => {
        if (!pendingTrackRef.current) {
            setIsAudioPreparing(false);
            setIsAudioReady(true);
            return;
        }

        void finalizePendingPlayback();
    }, [finalizePendingPlayback]);

    const handlePlaying = useCallback(() => {
        setIsAudioPreparing(false);
        setIsAudioReady(true);
        if (audioRef.current) {
            lastStableTimeRef.current = audioRef.current.currentTime;
            stallCheckRef.current = { t: audioRef.current.currentTime, wall: Date.now() };
        }
    }, []);

    const handleError = useCallback(() => {
        setIsPlaying(false);
        setIsAudioPreparing(false);
        setIsAudioReady(false);
        onWordIndexChange?.(-1);
        lastWordIndexRef.current = -1;
        pendingTrackRef.current = null;
        pendingSeekTimeRef.current = null;
        pendingAutoplayRef.current = false;
        configuredTrackKeyRef.current = '';
    }, [onWordIndexChange]);

    const handleWaitingOrStalled = useCallback(() => {
        if (!isPlayingRef.current || !audioRef.current) return;
        freezePlaybackAt(audioRef.current.currentTime);
    }, [freezePlaybackAt]);

    const handleReciterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        const reciter = reciters.find(r => r.id === id);
        if (reciter) {
            audioRef.current?.pause();
            seamlessSurahAdvanceKeyRef.current = '';
            surahAdvanceGuardRef.current = { verseKey: '', until: 0 };
            setRecitationData(null);
            setRecitationDataMap({});
            setActiveSegments(null);
            setVerseEndTime(null);
            setVerseStartTime(0);
            setElapsedTime(0);
            setIsAudioPreparing(true);
            setIsAudioReady(false);
            onWordIndexChange?.(-1);
            lastWordIndexRef.current = -1;
            pendingTrackRef.current = null;
            configuredTrackKeyRef.current = '';
            setIsLoadingReciter(true);
            setSelectedReciter(reciter);
            localStorage.setItem('selected_reciter_id', id);
            
            // Save to synced settings
            void queueAudioSettingsPersist({
                reciterId: id,
                playbackSpeed: speedRef.current
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
        setIsPlaying(prev => !prev);
    };

    const restartDailyPortion = () => {
        if (!selectedReciter || verses.length === 0) return;
        setIsCompleted(false);
        seamlessSurahAdvanceKeyRef.current = '';
        surahAdvanceGuardRef.current = { verseKey: '', until: 0 };

        const firstVerse = verses[0];
        const firstVerseData = selectedReciter.type === 'surah-based'
            ? (recitationDataMap[firstVerse.surahId] ?? (recitationData?.surahId === firstVerse.surahId ? recitationData : null))
            : recitationData;
        const info = getAudioInfoForVerse(selectedReciter, firstVerseData, firstVerse.surahId, firstVerse.ayahId);
        const desiredStartTime = info?.startTime || 0;

        onVerseChange(0);

        if (audioRef.current && info?.url) {
            const currentSrcPath = audioRef.current.src.split('?')[0];
            const nextSrcPath = new URL(info.url, 'http://localhost').href.split('?')[0];
            const targetTime = Number.isFinite(desiredStartTime) ? desiredStartTime : 0;

            preparePendingTrack({
                targetTime,
                shouldAutoplay: isPlayingRef.current
            });

            if (currentSrcPath !== nextSrcPath) {
                audioRef.current.pause();
                audioRef.current.src = info.url;
                audioRef.current.load();
            } else if (Math.abs(audioRef.current.currentTime - targetTime) > SEEK_TOLERANCE_SEC) {
                audioRef.current.pause();
                audioRef.current.currentTime = targetTime;
                void finalizePendingPlayback();
            } else {
                void finalizePendingPlayback();
            }

            setElapsedTime(desiredStartTime);
            onWordIndexChange?.(-1);
            lastWordIndexRef.current = -1;
        }

        persistPlaybackState({
            timestamp: desiredStartTime,
            verse: firstVerse,
            reciterId: selectedReciter.id
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
            void queueAudioSettingsPersist({
                reciterId: selectedReciter.id,
                playbackSpeed: newSpeed
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

    const isPlayButtonLoading = reciters.length === 0 || !selectedReciterId || (!currentRecitationData && Boolean(currentVerse)) || isAudioPreparing;
    const isPlayButtonDisabled = isCompleted || verses.length === 0 || !currentVerse || isPlayButtonLoading || !isAudioReady;

    return (
        <div className="audio-player">
            <audio
                ref={audioRef}
                onEnded={handleEnded}
                onTimeUpdate={handleTimeUpdate}
                onError={handleError}
                onWaiting={handleWaitingOrStalled}
                onStalled={handleWaitingOrStalled}
                onLoadedMetadata={handleLoadedMetadata}
                onLoadedData={handleCanPlay}
                onCanPlay={handleCanPlay}
                onSeeked={handleCanPlay}
                onPlaying={handlePlaying}
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
                    {reciters.length === 0 ? (
                        <option value="">Loading reciters...</option>
                    ) : (
                        reciters.map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                        ))
                    )}
                </select>
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
                    onClick={() => {
                        const nextIndex = Math.max(0, currentVerseIndex - 1);
                        const nextVerse = verses[nextIndex];
                        seamlessSurahAdvanceKeyRef.current = '';
                        surahAdvanceGuardRef.current = { verseKey: '', until: 0 };
                        onVerseChange(nextIndex);
                        if (!isPlaying && nextVerse && selectedReciter) {
                            persistPlaybackState({
                                timestamp: 0,
                                verse: nextVerse,
                                reciterId: selectedReciter.id
                            });
                        }
                    }} 
                    disabled={currentVerseIndex <= 0}
                >
                    <SkipBack size={20} />
                </button>

                <button
                    className="player-btn player-btn-main"
                    onClick={togglePlay}
                    disabled={isPlayButtonDisabled}
                    aria-busy={isPlayButtonLoading}
                    title={isPlayButtonLoading ? 'Loading audio...' : isPlaying ? 'Pause' : 'Play'}
                >
                    {isPlayButtonLoading ? (
                        <Spinner size={18} />
                    ) : isPlaying ? (
                        <Pause size={24} fill="currentColor" />
                    ) : (
                        <Play size={24} fill="currentColor" />
                    )}
                </button>

                <button 
                    className="player-btn" 
                    onClick={() => {
                        const nextIndex = Math.min(totalVerses - 1, currentVerseIndex + 1);
                        const nextVerse = verses[nextIndex];
                        seamlessSurahAdvanceKeyRef.current = '';
                        surahAdvanceGuardRef.current = { verseKey: '', until: 0 };
                        onVerseChange(nextIndex);
                        if (!isPlaying && nextVerse && selectedReciter) {
                            persistPlaybackState({
                                timestamp: 0,
                                verse: nextVerse,
                                reciterId: selectedReciter.id
                            });
                        }
                    }} 
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
