'use client';

import React from 'react';
import { PlaybackSpeed, Verse } from '@/lib/types';
import { Reciter, getAudioPlayerReciters, loadRecitationData, getAudioInfoForVerse, resolveAudioUrl } from '@/lib/audio';
import { getOfflineAudioUrlIfAvailable } from '@/plugin/offlineAudio';
import { ChevronDown, Play, Pause, SkipBack, SkipForward, RotateCcw } from 'lucide-react';
import Spinner from '@/components/ui/Spinner';

// Use React's default export for the Obsidian bundle. Some Obsidian Mobile
// WebViews do not expose CommonJS named React imports consistently.
const { useState, useRef, useEffect, useCallback, useMemo } = React;

interface AudioPlayerLocalProps {
    verses: Verse[];
    currentVerseIndex: number;
    currentVerseWordCount?: number;
    onVerseChange: (index: number) => void;
    onPlayStateChange?: (isPlaying: boolean) => void;
    onWordIndexChange?: (index: number) => void;
    obsidianApp?: any;
}

const SPEED_OPTIONS: PlaybackSpeed[] = [0.75, 1, 1.25, 1.5, 2];
const SPEED_STORAGE_KEY = 'audio_playback_speed';
const RECITER_STORAGE_KEY = 'selected_reciter_id';
const PLAYBACK_STATE_KEY = 'audio_playback_state_v1';
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
        if (start <= safeStart && end >= safeEnd) return true;
    }
    return false;
};

function readStoredPlaybackState(): { reciterId?: string; surahId: number; ayahId: number; timestamp: number } | null {
    try {
        const raw = localStorage.getItem(PLAYBACK_STATE_KEY);
        if (!raw) return null;
        const p = JSON.parse(raw);
        if (!p || typeof p.surahId !== 'number' || typeof p.ayahId !== 'number') return null;
        return p;
    } catch { return null; }
}
function writeStoredPlaybackState(state: { reciterId?: string; surahId: number; ayahId: number; timestamp: number } | null) {
    try {
        if (!state) localStorage.removeItem(PLAYBACK_STATE_KEY);
        else localStorage.setItem(PLAYBACK_STATE_KEY, JSON.stringify(state));
    } catch {}
}

export default function AudioPlayerLocal({
    verses,
    currentVerseIndex,
    currentVerseWordCount,
    onVerseChange,
    onPlayStateChange,
    onWordIndexChange,
    obsidianApp,
}: AudioPlayerLocalProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [speed, setSpeed] = useState<PlaybackSpeed>(1);
    const speedRef = useRef<PlaybackSpeed>(1);
    const [reciters, setReciters] = useState<Reciter[]>([]);
    const [selectedReciter, setSelectedReciter] = useState<Reciter | null>(null);
    const [recitationData, setRecitationData] = useState<any>(null);
    const [recitationDataMap, setRecitationDataMap] = useState<Record<number, any>>({});
    const [isLoadingReciter, setIsLoadingReciter] = useState(false);
    const [isAudioPreparing, setIsAudioPreparing] = useState(true);
    const [isAudioReady, setIsAudioReady] = useState(false);
    const [verseEndTime, setVerseEndTime] = useState<number | null>(null);
    const [verseStartTime, setVerseStartTime] = useState(0);
    const [activeSegments, setActiveSegments] = useState<number[][] | null>(null);
    const lastWordIndexRef = useRef<number>(-1);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [isCompleted, setIsCompleted] = useState(false);
    const pendingSeekTimeRef = useRef<number | null>(null);
    const isPlayingRef = useRef(false);
    const prevIsPlayingRef = useRef(false);
    const hasHydratedPlaybackStateRef = useRef(false);
    const pendingResumeRef = useRef<{ reciterId?: string; surahId: number; ayahId: number; timestamp: number } | null>(null);
    const autoAdvanceStateRef = useRef<{ key: string; at: number; attempts: number }>({ key: '', at: 0, attempts: 0 });
    const stallCheckRef = useRef<{ t: number; wall: number }>({ t: 0, wall: 0 });
    const pendingTrackRef = useRef<{ key: string; targetTime: number; shouldAutoplay: boolean } | null>(null);
    const configuredTrackKeyRef = useRef('');
    const remoteFallbackUrlRef = useRef<string | null>(null);
    const onlineFallbackTriedRef = useRef(false);
    const lastStableTimeRef = useRef(0);
    const preloadAudioRef = useRef<HTMLAudioElement | null>(null);
    const preloadedTrackKeyRef = useRef('');
    const seamlessSurahAdvanceKeyRef = useRef('');
    const surahAdvanceGuardRef = useRef<{ verseKey: string; until: number }>({ verseKey: '', until: 0 });
    const basmalaAudioRef = useRef<HTMLAudioElement | null>(null);
    const basmalaPendingNextIndexRef = useRef<number | null>(null);
    const wasPlayingBeforeBasmalaRef = useRef(false);
    const isBasmalaPlayingRef = useRef(false);
    const [isBasmalaPlaying, setIsBasmalaPlaying] = useState(false);

    const currentVerse = verses[currentVerseIndex];
    const currentSurahId = currentVerse?.surahId ?? null;
    const currentAyahId = currentVerse?.ayahId ?? null;
    const currentVerseKey = currentSurahId !== null && currentAyahId !== null ? `${currentSurahId}:${currentAyahId}` : '';
    const selectedReciterId = selectedReciter?.id ?? '';
    const selectedReciterType = selectedReciter?.type ?? null;
    const selectedReciterPath = selectedReciter?.relativePath ?? '';
    const totalVerses = verses.length;
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

    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
    useEffect(() => { speedRef.current = speed; }, [speed]);
    useEffect(() => {
        autoAdvanceStateRef.current = { key: '', at: 0, attempts: 0 };
        stallCheckRef.current = { t: 0, wall: 0 };
    }, [currentVerse?.surahId, currentVerse?.ayahId, currentVerseIndex]);
    useEffect(() => {
        const currentVerseKeyForGuard = currentVerse?.surahId && currentVerse?.ayahId ? `${currentVerse.surahId}:${currentVerse.ayahId}` : '';
        if (surahAdvanceGuardRef.current.verseKey !== currentVerseKeyForGuard) {
            surahAdvanceGuardRef.current = { verseKey: '', until: 0 };
        }
    }, [currentVerse?.surahId, currentVerse?.ayahId]);

    const persistPlaybackState = useCallback((opts?: { timestamp?: number; verse?: Verse; reciterId?: string }) => {
        const verse = opts?.verse ?? currentVerse;
        const reciterId = opts?.reciterId ?? (selectedReciterId || undefined);
        if (!verse || !reciterId) return;
        const fallbackTimestamp = audioRef.current?.currentTime ?? verseStartTime;
        const timestamp = Number.isFinite(opts?.timestamp ?? NaN) ? Math.max(0, opts?.timestamp as number) : Math.max(0, fallbackTimestamp);
        writeStoredPlaybackState({ reciterId, surahId: verse.surahId, ayahId: verse.ayahId, timestamp });
    }, [currentVerse, selectedReciterId, verseStartTime]);

    // --- Basmala interstitial for surah transitions (Obsidian) ---
    const fetchBasmalaInfo = useCallback(async (): Promise<{ url: string; startTime?: number; endTime?: number; segments?: number[][] } | null> => {
        if (!selectedReciter) return null;
        try {
            if (selectedReciter.type === 'ayah-based') {
                const data = recitationData;
                const verseData = (data as any)?.verses?.['1:1'];
                if (verseData?.audio_url) return { url: verseData.audio_url, segments: verseData.segments };
                const fresh = await loadRecitationData({ id: selectedReciter.id, name: '', type: selectedReciter.type, relativePath: selectedReciter.relativePath }, 1, obsidianApp);
                const v = (fresh as any)?.verses?.['1:1'];
                if (v?.audio_url) return { url: v.audio_url, segments: v.segments };
                return null;
            } else {
                let surahOneData: any = recitationDataMap[1] || (recitationData?.surahId === 1 ? recitationData : null);
                if (!surahOneData) {
                    const loaded = await loadRecitationData({ id: selectedReciter.id, name: '', type: selectedReciter.type, relativePath: selectedReciter.relativePath }, 1, obsidianApp);
                    if (loaded) {
                        surahOneData = loaded;
                        // cache for next time without blocking render
                        setRecitationDataMap(prev => (prev[1] ? prev : { ...prev, 1: loaded }));
                    }
                }
                if (!surahOneData) return null;
                const info = getAudioInfoForVerse({ id: selectedReciter.id, name: '', type: selectedReciter.type, relativePath: selectedReciter.relativePath }, surahOneData, 1, 1);
                return info;
            }
        } catch { return null; }
    }, [selectedReciter, recitationData, recitationDataMap, obsidianApp]);

    const cancelBasmala = useCallback(() => {
        if (!isBasmalaPlayingRef.current) return;
        const a = basmalaAudioRef.current;
        if (a) { try { a.pause(); } catch {} a.removeAttribute('src'); try { a.load(); } catch {} }
        isBasmalaPlayingRef.current = false;
        setIsBasmalaPlaying(false);
        basmalaPendingNextIndexRef.current = null;
    }, []);

    const handleBasmalaEnded = useCallback(() => {
        if (!isBasmalaPlayingRef.current) return;
        const nextIdx = basmalaPendingNextIndexRef.current;
        const wasPlaying = wasPlayingBeforeBasmalaRef.current;
        const a = basmalaAudioRef.current;
        if (a) { try { a.pause(); } catch {} a.removeAttribute('src'); try { a.load(); } catch {} }
        isBasmalaPlayingRef.current = false;
        setIsBasmalaPlaying(false);
        basmalaPendingNextIndexRef.current = null;
        if (nextIdx !== null && nextIdx !== undefined && nextIdx >= 0 && nextIdx < verses.length) {
            onVerseChange(nextIdx);
            // Keep the original play state across the Basmala handoff so the
            // next surah is loaded with autoplay enabled.
            setIsPlaying(wasPlaying);
        }
    }, [onVerseChange, verses.length]);

    const handleBasmalaTimeUpdate = useCallback(() => {
        const a = basmalaAudioRef.current;
        if (!a || !isBasmalaPlayingRef.current) return;
        const end = (a as any)._basmalaEndTime as number | null;
        if (end !== null && end !== undefined && Number.isFinite(end) && a.currentTime >= end - 0.05) {
            handleBasmalaEnded();
        }
    }, [handleBasmalaEnded]);

    const handleBasmalaError = useCallback(() => {
        handleBasmalaEnded();
    }, [handleBasmalaEnded]);

    const playBasmalaThenAdvance = useCallback(async (nextIdx: number) => {
        const nextVerse = verses[nextIdx];
        if (!nextVerse) { onVerseChange(nextIdx); return; }
        const isNewSurah = nextVerse.surahId !== currentVerse?.surahId && nextVerse.surahId !== 1 && nextVerse.surahId !== 9 && nextVerse.ayahId === 1;
        if (!isNewSurah || isBasmalaPlayingRef.current) { onVerseChange(nextIdx); return; }
        const basmalaInfo = await fetchBasmalaInfo();
        if (!basmalaInfo?.url) { onVerseChange(nextIdx); return; }
        wasPlayingBeforeBasmalaRef.current = isPlayingRef.current;
        if (audioRef.current && !audioRef.current.paused) try { audioRef.current.pause(); } catch {}
        isBasmalaPlayingRef.current = true;
        setIsBasmalaPlaying(true);
        basmalaPendingNextIndexRef.current = nextIdx;
        const basmalaAudio = basmalaAudioRef.current;
        if (!basmalaAudio) { onVerseChange(nextIdx); isBasmalaPlayingRef.current = false; setIsBasmalaPlaying(false); return; }
        try {
            let url: string | null = null;
            try {
              const offlineBasmala = await getOfflineAudioUrlIfAvailable({ id: selectedReciter!.id, name: "", type: selectedReciter!.type, relativePath: selectedReciter!.relativePath } as Reciter, 1, 1, obsidianApp);
              if (offlineBasmala) url = offlineBasmala;
            } catch {}
            if (!url) url = await resolveAudioUrl(basmalaInfo.url, obsidianApp);
            const start = basmalaInfo.startTime || 0;
            const end = basmalaInfo.endTime ?? null;
            (basmalaAudio as any)._basmalaEndTime = end;
            (basmalaAudio as any)._basmalaStartTime = start;
            basmalaAudio.src = url;
            basmalaAudio.load();
            try { basmalaAudio.currentTime = start; } catch {}
            basmalaAudio.playbackRate = speedRef.current;
            const started = await basmalaAudio.play().then(() => true).catch(() => false);
            // Mobile WebViews can reject an automatic second-audio play because it
            // is no longer inside the original user gesture. Skip the interstitial
            // in that case so the daily portion keeps playing instead of getting
            // stuck on a paused Basmala player.
            if (!started) handleBasmalaEnded();
        } catch {
            isBasmalaPlayingRef.current = false;
            setIsBasmalaPlaying(false);
            basmalaPendingNextIndexRef.current = null;
            onVerseChange(nextIdx);
        }
    }, [verses, currentVerse, fetchBasmalaInfo, obsidianApp, onVerseChange]);

    useEffect(() => {
        if (basmalaAudioRef.current) basmalaAudioRef.current.playbackRate = speed;
    }, [speed]);

    useEffect(() => {
        // cancel basmala if verse changes manually while basmala pending and target differs
        if (isBasmalaPlayingRef.current && basmalaPendingNextIndexRef.current !== null && basmalaPendingNextIndexRef.current !== currentVerseIndex) {
            // if user manually navigated away, cancel pending basmala if new index is not the pending one
            // but if we are in basmala phase, currentVerseIndex is still old, so no cancel yet
        }
    }, [currentVerseIndex]);

    useEffect(() => {
        getAudioPlayerReciters().then(list => setReciters(list));
    }, []);

    useEffect(() => {
        if (reciters.length === 0) return;
        const savedId = typeof window !== 'undefined' ? localStorage.getItem(RECITER_STORAGE_KEY) || undefined : undefined;
        const preferred = reciters.find(r => r.id === savedId) || reciters[0];
        if (!preferred) return;
        if (selectedReciterId !== preferred.id) setSelectedReciter(preferred);
    }, [reciters, selectedReciterId]);

    useEffect(() => {
        let stored: PlaybackSpeed | undefined;
        try {
            const raw = localStorage.getItem(SPEED_STORAGE_KEY);
            if (raw) {
                const parsed = Number(raw) as PlaybackSpeed;
                if (SPEED_OPTIONS.includes(parsed)) stored = parsed;
            }
        } catch {}
        if (stored && stored !== speed) {
            setSpeed(stored);
            if (audioRef.current) audioRef.current.playbackRate = stored;
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (hasHydratedPlaybackStateRef.current) return;
        if (!selectedReciterId || verses.length === 0) return;
        const playbackState = readStoredPlaybackState();
        if (!playbackState) { hasHydratedPlaybackStateRef.current = true; return; }
        if (playbackState.reciterId && playbackState.reciterId !== selectedReciterId) { hasHydratedPlaybackStateRef.current = true; return; }
        const resumeIndex = verses.findIndex((v) => v.surahId === playbackState.surahId && v.ayahId === playbackState.ayahId);
        if (resumeIndex === -1) { hasHydratedPlaybackStateRef.current = true; return; }
        pendingResumeRef.current = { reciterId: selectedReciterId, surahId: playbackState.surahId, ayahId: playbackState.ayahId, timestamp: Math.max(0, playbackState.timestamp || 0) };
        if (resumeIndex !== currentVerseIndex) onVerseChange(resumeIndex);
        else {
            pendingSeekTimeRef.current = Math.max(0, playbackState.timestamp || 0);
            setElapsedTime(Math.max(0, playbackState.timestamp || 0));
        }
        hasHydratedPlaybackStateRef.current = true;
    }, [selectedReciterId, verses, currentVerseIndex, onVerseChange]);

    useEffect(() => {
        if (!selectedReciterId || !selectedReciterType || !selectedReciterPath || currentSurahId === null) return;
        let isActive = true;
        const reciterId = selectedReciterId;
        const requestedSurahId = currentSurahId;
        const reciterForLoad: Reciter = { id: selectedReciterId, name: '', type: selectedReciterType, relativePath: selectedReciterPath };
        const load = async () => {
            setIsLoadingReciter(true);
            const data = await loadRecitationData(reciterForLoad, requestedSurahId, obsidianApp);
            if (!isActive) return;
            if (reciterForLoad.id !== reciterId) return;
            if (reciterForLoad.type === 'surah-based' && data?.surahId !== requestedSurahId) return;
            setRecitationData(data);
            setIsLoadingReciter(false);
        };
        load();
        return () => { isActive = false; };
    }, [selectedReciterId, selectedReciterType, selectedReciterPath, currentSurahId, obsidianApp]);

    useEffect(() => {
        if (!selectedReciterId || selectedReciterType !== 'surah-based' || !selectedReciterPath || verses.length === 0) return;
        const surahIds = versesSurahIdsKey.length > 0 ? versesSurahIdsKey.split(',').map(Number).filter(Number.isFinite) : [];
        if (surahIds.length === 0) return;
        const reciterForLoad: Reciter = { id: selectedReciterId, name: '', type: selectedReciterType, relativePath: selectedReciterPath };
        let isActive = true;
        const loadAll = async () => {
            setIsLoadingReciter(true);
            const entries = await Promise.all(surahIds.map(async (surahId) => [surahId, await loadRecitationData(reciterForLoad, surahId, obsidianApp)] as const));
            if (!isActive) return;
            const nextMap: Record<number, any> = {};
            entries.forEach(([sid, data]) => { if (data) nextMap[sid] = data; });
            setRecitationDataMap(nextMap);
            setIsLoadingReciter(false);
        };
        loadAll();
        return () => { isActive = false; };
    }, [selectedReciterId, selectedReciterType, selectedReciterPath, versesSurahIdsKey, verses.length, obsidianApp]);

    useEffect(() => { if (currentVerseIndex < totalVerses - 1) setIsCompleted(false); }, [currentVerseIndex, totalVerses]);
    useEffect(() => { setIsCompleted(false); }, [verses]);

    const safePlay = useCallback(() => {
        if (!audioRef.current) return;
        audioRef.current.play().catch((err) => { if (err?.name !== 'AbortError') console.error(err); });
    }, []);

    const finalizePendingPlayback = useCallback(() => {
        const audio = audioRef.current;
        const pendingTrack = pendingTrackRef.current;
        if (!audio || !pendingTrack) return false;
        if (audio.seeking || audio.readyState === 0) return false;
        const targetTime = pendingTrack.targetTime;
        const isNearTarget = Math.abs(audio.currentTime - targetTime) <= SEEK_TOLERANCE_SEC;
        if (!isNearTarget) { try { audio.currentTime = targetTime; } catch { return false; } return false; }
        if (!isAudioBufferedAt(audio, targetTime)) return false;
        pendingTrackRef.current = null;
        pendingSeekTimeRef.current = null;
        setElapsedTime(targetTime);
        lastStableTimeRef.current = targetTime;
        setIsAudioPreparing(false);
        setIsAudioReady(true);
        if (pendingTrack.shouldAutoplay) safePlay();
        return true;
    }, [safePlay]);

    const preparePendingTrack = useCallback((track: { targetTime: number; shouldAutoplay: boolean }) => {
        pendingTrackRef.current = { key: `${Date.now()}-${track.targetTime}`, targetTime: track.targetTime, shouldAutoplay: track.shouldAutoplay };
        pendingSeekTimeRef.current = track.targetTime;
        setIsAudioPreparing(true);
        setIsAudioReady(false);
    }, []);

    const setPendingTrackWithoutLoader = useCallback((track: { targetTime: number; shouldAutoplay: boolean }) => {
        pendingTrackRef.current = { key: `${Date.now()}-${track.targetTime}`, targetTime: track.targetTime, shouldAutoplay: track.shouldAutoplay };
        pendingSeekTimeRef.current = track.targetTime;
        setIsAudioPreparing(false);
        setIsAudioReady(true);
    }, []);

    const pausePlaybackAt = useCallback((targetTime?: number) => {
        const audio = audioRef.current;
        if (!audio) return;
        const fallbackTime = Math.max(0, audio.currentTime || lastStableTimeRef.current || 0);
        const nextTarget = Number.isFinite(targetTime ?? NaN) ? Math.max(0, targetTime as number) : fallbackTime;
        if (!audio.paused) audio.pause();
        if (Math.abs(audio.currentTime - nextTarget) > SEEK_TOLERANCE_SEC) { try { audio.currentTime = nextTarget; } catch {} }
        lastStableTimeRef.current = nextTarget;
        setElapsedTime(nextTarget);
    }, []);

    const freezePlaybackAt = useCallback((targetTime?: number) => {
        const audio = audioRef.current;
        if (!audio) return;
        const fallbackTime = Math.max(0, audio.currentTime || lastStableTimeRef.current || 0);
        const nextTarget = Number.isFinite(targetTime ?? NaN) ? Math.max(0, targetTime as number) : fallbackTime;
        preparePendingTrack({ targetTime: nextTarget, shouldAutoplay: isPlayingRef.current });
        pausePlaybackAt(nextTarget);
    }, [preparePendingTrack, pausePlaybackAt]);

    useEffect(() => {
        if (!currentVerseKey || currentSurahId === null || currentAyahId === null || !selectedReciterId || !selectedReciterType || !selectedReciterPath) return;
        let cancelled = false;
        (async () => {
            const reciterForPlayback: Reciter = { id: selectedReciterId, name: '', type: selectedReciterType, relativePath: selectedReciterPath };

            // Always probe the vault first. This makes a downloaded track usable even
            // when the recitation metadata request is unavailable offline.
            let offlineUrl: string | null = null;
            try {
                offlineUrl = await getOfflineAudioUrlIfAvailable(reciterForPlayback, currentSurahId, currentAyahId, obsidianApp);
            } catch {}
            if (cancelled) return;

            const metadataInfo = getAudioInfoForVerse(reciterForPlayback, currentRecitationData, currentSurahId, currentAyahId);
            const info: ReturnType<typeof getAudioInfoForVerse> = metadataInfo
                ? { ...metadataInfo, url: offlineUrl ?? metadataInfo.url }
                : offlineUrl
                    ? { url: offlineUrl, startTime: undefined, endTime: undefined, segments: undefined }
                    : null;
            if (!info) {
                if (cancelled) return;
                // The metadata loaders may still be reading bundled/local JSON. Keep the
                // player in a loading state until that finishes instead of declaring the
                // track unavailable and disabling it prematurely.
                if (isLoadingReciter) {
                    setIsAudioPreparing(true);
                    setIsAudioReady(false);
                    return;
                }
                if (audioRef.current) { audioRef.current.pause(); audioRef.current.removeAttribute('src'); audioRef.current.load(); }
                remoteFallbackUrlRef.current = null;
                onlineFallbackTriedRef.current = false;
                setIsPlaying(false); setIsAudioPreparing(false); setIsAudioReady(false); setActiveSegments(null); setVerseEndTime(null); setVerseStartTime(0); setElapsedTime(0); onWordIndexChange?.(-1); lastWordIndexRef.current = -1; pendingTrackRef.current = null; pendingSeekTimeRef.current = null; configuredTrackKeyRef.current = ''; return;
            }
            const rawUrl = info.url;
            const startTime = info.startTime || 0;
            const endTime = info.endTime || null;
            const segments = sortSegmentsByStart(info.segments || null);
            if (rawUrl) {
                // `offlineUrl` was checked first above. Only resolve the remote URL when
                // no local file exists.
                const url = offlineUrl ?? (String(rawUrl).startsWith('blob:') ? rawUrl : await resolveAudioUrl(rawUrl, obsidianApp));
                if (cancelled) return;
                if (!audioRef.current) return;
                const currentInfo = getAudioInfoForVerse(reciterForPlayback, currentRecitationData, currentSurahId, currentAyahId);
                // An offline-only track has no metadata URL to compare against. When
                // metadata exists, still guard against a stale async load.
                if (metadataInfo && currentInfo?.url !== metadataInfo.url) return;
                remoteFallbackUrlRef.current = offlineUrl ? metadataInfo?.url ?? null : null;
                onlineFallbackTriedRef.current = false;
                let usedSeamlessSurahAdvance = false;
                const currentSrcPath = audioRef.current.src.split('?')[0];
                const newSrcPath = new URL(url, 'http://localhost').href.split('?')[0];
                let desiredStartTime = startTime;
                const pendingResume = pendingResumeRef.current;
                if (pendingResume && (!pendingResume.reciterId || pendingResume.reciterId === selectedReciterId) && pendingResume.surahId === currentSurahId && pendingResume.ayahId === currentAyahId) {
                    desiredStartTime = Math.max(startTime, pendingResume.timestamp || startTime);
                    pendingResumeRef.current = null;
                }
                const shouldAutoplay = isPlayingRef.current;
                pendingSeekTimeRef.current = desiredStartTime;
                if (endTime !== null) {
                    const clamped = Math.min(Math.max(desiredStartTime, startTime), Math.max(startTime, endTime - 0.05));
                    pendingSeekTimeRef.current = clamped;
                }
                const targetTime = pendingSeekTimeRef.current ?? desiredStartTime;
                const trackKey = `${selectedReciterId}:${currentVerseKey}:${rawUrl}:${targetTime}:${endTime ?? 'null'}`;
                if (configuredTrackKeyRef.current === trackKey) {
                    audioRef.current.playbackRate = speedRef.current;
                    setIsAudioPreparing(false); setIsAudioReady(true);
                    setVerseStartTime(startTime); setVerseEndTime(endTime); setActiveSegments(segments); return;
                }
                configuredTrackKeyRef.current = trackKey;
                const canContinueSeamlessly = selectedReciterType === 'surah-based' && seamlessSurahAdvanceKeyRef.current === currentVerseKey && currentSrcPath === newSrcPath && audioRef.current.readyState > 0 && audioRef.current.currentTime >= Math.max(0, startTime - VERSE_END_GRACE_SEC) && (endTime === null || audioRef.current.currentTime <= endTime + BUFFER_GUARD_SEC);
                if (canContinueSeamlessly) {
                    usedSeamlessSurahAdvance = true; seamlessSurahAdvanceKeyRef.current = ''; pendingTrackRef.current = null; pendingSeekTimeRef.current = null; setIsAudioPreparing(false); setIsAudioReady(true); setElapsedTime(audioRef.current.currentTime);
                } else if (currentSrcPath !== newSrcPath) {
                    seamlessSurahAdvanceKeyRef.current = ''; preparePendingTrack({ targetTime, shouldAutoplay }); audioRef.current.pause(); audioRef.current.src = url; audioRef.current.load();
                } else {
                    seamlessSurahAdvanceKeyRef.current = '';
                    const canSwitchInstantly = isAudioBufferedAt(audioRef.current, targetTime);
                    if (canSwitchInstantly) setPendingTrackWithoutLoader({ targetTime, shouldAutoplay }); else preparePendingTrack({ targetTime, shouldAutoplay });
                    audioRef.current.pause();
                    if (Math.abs(audioRef.current.currentTime - targetTime) > 0.08) audioRef.current.currentTime = targetTime;
                    if (Math.abs(audioRef.current.currentTime - targetTime) > 0.15) audioRef.current.currentTime = targetTime;
                }
                audioRef.current.playbackRate = speedRef.current;
                if (!canContinueSeamlessly) setElapsedTime(desiredStartTime);
                if (currentSrcPath === newSrcPath && !canContinueSeamlessly) void finalizePendingPlayback();
                setVerseStartTime(startTime); setVerseEndTime(endTime); setActiveSegments(segments);
                let initialIndex = -1;
                const shouldSkipInitialWordReset = usedSeamlessSurahAdvance;
                if (!shouldSkipInitialWordReset && onWordIndexChange && currentVerseWordCount && currentVerseWordCount > 0 && isPlayingRef.current) {
                    if (segments && segments.length > 0) {
                        const maxWordIndex = segments.reduce((max, s) => Math.max(max, s[0] ?? 0), 0);
                        const indexOffset = maxWordIndex === currentVerseWordCount ? -1 : 0;
                        const rawIndex = (segments[0]?.[0] ?? 0) + indexOffset;
                        initialIndex = rawIndex >= 0 && rawIndex < currentVerseWordCount ? rawIndex : 0;
                    } else initialIndex = 0;
                }
                if (initialIndex !== lastWordIndexRef.current) { onWordIndexChange?.(initialIndex); lastWordIndexRef.current = initialIndex; }
            }
        })();
        return () => { cancelled = true; };
    }, [currentVerseKey, currentSurahId, currentAyahId, selectedReciterId, selectedReciterType, selectedReciterPath, currentRecitationData, isLoadingReciter, currentVerseWordCount, finalizePendingPlayback, onWordIndexChange, preparePendingTrack, setPendingTrackWithoutLoader, obsidianApp]);

    useEffect(() => {
        if (!audioRef.current) return;
        if (isPlaying !== prevIsPlayingRef.current) {
            if (isPlaying) { if (isAudioReady) safePlay(); }
            else {
                pendingTrackRef.current = null; // avoid stale
                audioRef.current.pause();
                if (prevIsPlayingRef.current && selectedReciter && currentVerse) persistPlaybackState({ timestamp: audioRef.current.currentTime, verse: currentVerse, reciterId: selectedReciter.id });
            }
        }
        onPlayStateChange?.(isPlaying);
        prevIsPlayingRef.current = isPlaying;
    }, [isPlaying, isAudioReady, onPlayStateChange, selectedReciter, currentVerse, safePlay, persistPlaybackState]);

    useEffect(() => {
        if (!isPlaying) return;
        const id = window.setInterval(() => {
            const audio = audioRef.current;
            if (!audio || audio.paused || audio.ended) return;
            const now = Date.now();
            const current = audio.currentTime;
            const prev = stallCheckRef.current;
            if (Math.abs(current - prev.t) > 0.02) { stallCheckRef.current = { t: current, wall: now }; return; }
            if (prev.wall === 0) { stallCheckRef.current = { t: current, wall: now }; return; }
            if (now - prev.wall >= 1500) {
                if (audio.readyState >= MEDIA_READY_STATE_FUTURE_DATA) safePlay(); else freezePlaybackAt(audio.currentTime);
                stallCheckRef.current = { t: current, wall: now };
            }
        }, 500);
        return () => window.clearInterval(id);
    }, [isPlaying, safePlay, freezePlaybackAt]);

    useEffect(() => {
        const persistOnHide = () => persistPlaybackState();
        const handleVisibility = () => { if (document.visibilityState === 'hidden') persistOnHide(); };
        window.addEventListener('beforeunload', persistOnHide);
        document.addEventListener('visibilitychange', handleVisibility);
        return () => { window.removeEventListener('beforeunload', persistOnHide); document.removeEventListener('visibilitychange', handleVisibility); };
    }, [persistPlaybackState]);

    const getRecitationDataForVerse = useCallback((verse: Verse | undefined) => {
        if (!verse || !selectedReciterType) return null;
        if (selectedReciterType === 'surah-based') return recitationDataMap[verse.surahId] ?? (recitationData?.surahId === verse.surahId ? recitationData : null);
        return recitationData;
    }, [selectedReciterType, recitationDataMap, recitationData]);

    const getAudioInfoForVerseIndex = useCallback((verseIndex: number) => {
        if (verseIndex < 0 || verseIndex >= verses.length) return null;
        if (!selectedReciterId || !selectedReciterType || !selectedReciterPath) return null;
        const verse = verses[verseIndex];
        if (!verse) return null;
        const verseRecitationData = getRecitationDataForVerse(verse);
        if (!verseRecitationData) return null;
        return getAudioInfoForVerse({ id: selectedReciterId, name: '', type: selectedReciterType, relativePath: selectedReciterPath }, verseRecitationData, verse.surahId, verse.ayahId);
    }, [verses, selectedReciterId, selectedReciterType, selectedReciterPath, getRecitationDataForVerse]);

    const currentVerseAudioUrl = useMemo(() => getAudioInfoForVerseIndex(currentVerseIndex)?.url ?? '', [currentVerseIndex, getAudioInfoForVerseIndex]);
    const nextVerseInfo = useMemo(() => getAudioInfoForVerseIndex(currentVerseIndex + 1), [currentVerseIndex, getAudioInfoForVerseIndex]);
    const nextVerseStartTime = nextVerseInfo?.startTime ?? null;
    const nextVerseUsesCurrentSource = (nextVerseInfo?.url ?? '') !== '' && nextVerseInfo?.url === currentVerseAudioUrl;

    useEffect(() => {
        const nextUrl = nextVerseInfo?.url ?? '';
        if (!nextUrl || !selectedReciterId || nextUrl === currentVerseAudioUrl) {
            preloadedTrackKeyRef.current = '';
            if (preloadAudioRef.current) { preloadAudioRef.current.pause(); preloadAudioRef.current.removeAttribute('src'); preloadAudioRef.current.load(); preloadAudioRef.current = null; }
            return;
        }
        const preloadKey = `${selectedReciterId}:${currentVerseIndex + 1}:${nextUrl}`;
        if (preloadKey === preloadedTrackKeyRef.current) return;
        if (preloadAudioRef.current) { preloadAudioRef.current.pause(); preloadAudioRef.current.removeAttribute('src'); preloadAudioRef.current.load(); }
        const audio = new Audio(); audio.preload = 'auto'; audio.src = nextUrl; audio.load();
        preloadAudioRef.current = audio; preloadedTrackKeyRef.current = preloadKey;
    }, [currentVerseAudioUrl, currentVerseIndex, nextVerseInfo?.url, selectedReciterId]);

    useEffect(() => () => { if (preloadAudioRef.current) { preloadAudioRef.current.pause(); preloadAudioRef.current.removeAttribute('src'); preloadAudioRef.current.load(); preloadAudioRef.current = null; } }, []);

    const maybeAdvanceVerse = useCallback((currentTime: number) => {
        if (isBasmalaPlayingRef.current) return true;
        const verseKey = `${currentVerse?.surahId ?? 0}:${currentVerse?.ayahId ?? 0}:${currentVerseIndex}`;
        const nextVerse = currentVerseIndex < totalVerses - 1 ? verses[currentVerseIndex + 1] : null;
        const verseAfterNext = currentVerseIndex < totalVerses - 2 ? verses[currentVerseIndex + 2] : null;
        const nextVerseKey = nextVerse ? `${nextVerse.surahId}:${nextVerse.ayahId}` : '';
        if (verseEndTime === null) return false;
        const now = Date.now();
        if (selectedReciterType === 'surah-based' && surahAdvanceGuardRef.current.verseKey === verseKey && now < surahAdvanceGuardRef.current.until) return false;
        const nextVerseIsLastVisibleVerse = currentVerseIndex + 1 === totalVerses - 1;
        const nextVerseIsLastVerseInSurah = nextVerse !== null && (!verseAfterNext || verseAfterNext.surahId !== nextVerse.surahId);
        const shouldBiasEarlyForSameSourceHandoff = nextVerseIsLastVisibleVerse || nextVerseIsLastVerseInSurah;
        const surahAdvanceThreshold = selectedReciterType === 'surah-based' ? nextVerseUsesCurrentSource ? shouldBiasEarlyForSameSourceHandoff ? Math.max(0, Math.min(verseEndTime, nextVerseStartTime ?? verseEndTime) - SURAH_PREVIEW_ADVANCE_EPSILON_SEC) : Math.max(0, (nextVerseStartTime ?? verseEndTime) - SURAH_PREVIEW_ADVANCE_EPSILON_SEC) : verseEndTime + VERSE_END_GRACE_SEC : null;
        const boundaryReached = selectedReciterType === 'surah-based' ? currentTime >= (surahAdvanceThreshold ?? 0) : currentTime >= verseEndTime + VERSE_END_GRACE_SEC;
        if (!boundaryReached) return false;
        const state = autoAdvanceStateRef.current;
        if (state.key === verseKey && now - state.at < 700) return true;
        autoAdvanceStateRef.current = { key: verseKey, at: now, attempts: state.key === verseKey ? state.attempts + 1 : 1 };
        if (currentVerseIndex < totalVerses - 1) {
            const isSurahTransition = nextVerse ? (nextVerse.surahId !== currentVerse?.surahId && nextVerse.surahId !== 1 && nextVerse.surahId !== 9 && nextVerse.ayahId === 1) : false;
            if (isSurahTransition) {
                void playBasmalaThenAdvance(currentVerseIndex + 1);
                return true;
            }
            if (selectedReciterType === 'surah-based' && nextVerseKey) { seamlessSurahAdvanceKeyRef.current = nextVerseKey; surahAdvanceGuardRef.current = { verseKey: nextVerseKey, until: now + SURAH_ADVANCE_SETTLE_MS }; } else pausePlaybackAt(verseEndTime);
            onVerseChange(currentVerseIndex + 1);
        } else { seamlessSurahAdvanceKeyRef.current = ''; surahAdvanceGuardRef.current = { verseKey: '', until: 0 }; pausePlaybackAt(verseEndTime); setIsPlaying(false); setIsCompleted(true); }
        return true;
    }, [currentVerse?.surahId, currentVerse?.ayahId, currentVerseIndex, totalVerses, verses, verseEndTime, nextVerseStartTime, nextVerseUsesCurrentSource, selectedReciterType, pausePlaybackAt, onVerseChange, playBasmalaThenAdvance]);

    useEffect(() => {
        if (selectedReciterType !== 'surah-based' || !isPlaying || !isAudioReady || pendingTrackRef.current || verseEndTime === null) return;
        let frameId = 0;
        const tick = () => { const audio = audioRef.current; if (!audio || audio.paused || audio.ended) return; maybeAdvanceVerse(audio.currentTime); frameId = window.requestAnimationFrame(tick); };
        frameId = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(frameId);
    }, [selectedReciterType, isPlaying, isAudioReady, verseEndTime, maybeAdvanceVerse]);

    const handleTimeUpdate = useCallback(() => {
        if (audioRef.current) {
            const current = audioRef.current.currentTime;
            // Keep the visual progress moving even while the track is finalizing
            // a seek/buffer handoff (common with offline mobile Blob URLs).
            setElapsedTime(current);
            lastStableTimeRef.current = current;
            if (pendingTrackRef.current || isAudioPreparing || !isAudioReady) return;
            if (maybeAdvanceVerse(current)) return;
            let nextIndex: number | null = null;
            if (activeSegments && onWordIndexChange) {
                const timeMs = current * 1000;
                const maxEnd = activeSegments.reduce((max, s) => Math.max(max, s[2] ?? 0), 0);
                const segmentRangeMs = verseEndTime !== null ? Math.max(0, (verseEndTime - verseStartTime) * 1000) : 0;
                const segmentsAreRelative = verseStartTime > 0 && segmentRangeMs > 0 && maxEnd <= segmentRangeMs + 50;
                const maxWordIndex = activeSegments.reduce((max, s) => Math.max(max, s[0] ?? 0), 0);
                const indexOffset = (currentVerseWordCount && maxWordIndex === currentVerseWordCount) ? -1 : 0;
                const resolveSegmentIndex = (segment: number[], segmentIdx: number) => {
                    const rawIndex = segment[0] + indexOffset;
                    if (currentVerseWordCount && currentVerseWordCount > 0) {
                        if (rawIndex >= 0 && rawIndex < currentVerseWordCount) return rawIndex;
                        return Math.min(currentVerseWordCount - 1, Math.floor((segmentIdx / Math.max(1, activeSegments.length - 1)) * (currentVerseWordCount - 1)));
                    }
                    return Math.max(0, rawIndex);
                };
                const activeSegmentIdx = activeSegments.findIndex(s => {
                    const start = segmentsAreRelative ? s[1] + (verseStartTime * 1000) : s[1];
                    const end = segmentsAreRelative ? s[2] + (verseStartTime * 1000) : s[2];
                    return timeMs >= start && timeMs <= end;
                });
                if (activeSegmentIdx !== -1) nextIndex = resolveSegmentIndex(activeSegments[activeSegmentIdx], activeSegmentIdx);
                else {
                    let lastSeenIdx: number | null = null;
                    for (let i = 0; i < activeSegments.length; i++) { const s = activeSegments[i]; const start = segmentsAreRelative ? s[1] + (verseStartTime * 1000) : s[1]; if (timeMs >= start) lastSeenIdx = i; else break; }
                    if (lastSeenIdx !== null) nextIndex = resolveSegmentIndex(activeSegments[lastSeenIdx], lastSeenIdx);
                }
            }
            if (nextIndex === null && onWordIndexChange && currentVerseWordCount && currentVerseWordCount > 0) {
                const duration = verseEndTime !== null ? Math.max(0.001, verseEndTime - verseStartTime) : (Number.isFinite(audioRef.current?.duration ?? NaN) ? (audioRef.current?.duration || 0) : 0);
                if (duration > 0) {
                    const relative = Math.max(0, current - verseStartTime);
                    const ratio = Math.min(1, Math.max(0, relative / duration));
                    nextIndex = Math.min(currentVerseWordCount - 1, Math.floor(ratio * currentVerseWordCount));
                }
            }
            if (nextIndex !== null && nextIndex !== lastWordIndexRef.current) { lastWordIndexRef.current = nextIndex; onWordIndexChange?.(nextIndex); }
        }
    }, [verseEndTime, verseStartTime, activeSegments, onWordIndexChange, currentVerseWordCount, isAudioPreparing, isAudioReady, maybeAdvanceVerse]);

    const handleEnded = useCallback(() => {
        if (isBasmalaPlayingRef.current) return;
        if (pendingTrackRef.current || isAudioPreparing || !isAudioReady) return;
        if (currentVerseIndex < totalVerses - 1) {
            const nextVerse = verses[currentVerseIndex + 1];
            const isNewSurah = nextVerse ? (nextVerse.surahId !== currentVerse?.surahId && nextVerse.surahId !== 1 && nextVerse.surahId !== 9 && nextVerse.ayahId === 1) : false;
            if (isNewSurah) { void playBasmalaThenAdvance(currentVerseIndex + 1); return; }
            onVerseChange(currentVerseIndex + 1);
        }
        else { setIsPlaying(false); setIsCompleted(true); }
    }, [currentVerseIndex, totalVerses, verses, currentVerse, onVerseChange, isAudioPreparing, isAudioReady, playBasmalaThenAdvance]);

    const handleLoadedMetadata = useCallback(() => { void finalizePendingPlayback(); }, [finalizePendingPlayback]);
    const handleCanPlay = useCallback(() => { if (!pendingTrackRef.current) { setIsAudioPreparing(false); setIsAudioReady(true); return; } void finalizePendingPlayback(); }, [finalizePendingPlayback]);
    const handlePlaying = useCallback(() => { setIsAudioPreparing(false); setIsAudioReady(true); if (audioRef.current) { lastStableTimeRef.current = audioRef.current.currentTime; stallCheckRef.current = { t: audioRef.current.currentTime, wall: Date.now() }; } }, []);
    const handleError = useCallback(() => {
        const audio = audioRef.current;
        const fallbackUrl = remoteFallbackUrlRef.current;
        if (audio && fallbackUrl && !onlineFallbackTriedRef.current) {
            // A stale/corrupt local file should not permanently strand playback.
            // Retry the original remote source once, after the offline-first attempt.
            onlineFallbackTriedRef.current = true;
            const targetTime = Number.isFinite(audio.currentTime) && audio.currentTime > 0
                ? audio.currentTime
                : verseStartTime;
            const shouldAutoplay = isPlayingRef.current;
            void resolveAudioUrl(fallbackUrl, obsidianApp).then((url) => {
                if (!audioRef.current || audioRef.current !== audio) return;
                remoteFallbackUrlRef.current = null;
                configuredTrackKeyRef.current = '';
                preparePendingTrack({ targetTime, shouldAutoplay });
                audio.pause();
                audio.src = url;
                audio.playbackRate = speedRef.current;
                audio.load();
            }).catch(() => {
                setIsPlaying(false);
                setIsAudioPreparing(false);
                setIsAudioReady(false);
            });
            return;
        }
        setIsPlaying(false); setIsAudioPreparing(false); setIsAudioReady(false); onWordIndexChange?.(-1); lastWordIndexRef.current = -1; pendingTrackRef.current = null; pendingSeekTimeRef.current = null; configuredTrackKeyRef.current = '';
    }, [obsidianApp, onWordIndexChange, preparePendingTrack, verseStartTime]);
    const handleWaitingOrStalled = useCallback(() => { if (!isPlayingRef.current || !audioRef.current) return; freezePlaybackAt(audioRef.current.currentTime); }, [freezePlaybackAt]);

    const handleReciterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        const reciter = reciters.find(r => r.id === id);
        if (reciter) {
            cancelBasmala();
            remoteFallbackUrlRef.current = null;
            onlineFallbackTriedRef.current = false;
            audioRef.current?.pause(); seamlessSurahAdvanceKeyRef.current = ''; surahAdvanceGuardRef.current = { verseKey: '', until: 0 };
            setRecitationData(null); setRecitationDataMap({}); setActiveSegments(null); setVerseEndTime(null); setVerseStartTime(0); setElapsedTime(0); setIsAudioPreparing(true); setIsAudioReady(false); onWordIndexChange?.(-1); lastWordIndexRef.current = -1; pendingTrackRef.current = null; configuredTrackKeyRef.current = ''; setIsLoadingReciter(true);
            setSelectedReciter(reciter); localStorage.setItem(RECITER_STORAGE_KEY, id); setIsPlaying(false);
        }
    };

    const formatTime = (seconds: number): string => {
        const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
        const hrs = Math.floor(safeSeconds / 3600);
        const mins = Math.floor((safeSeconds % 3600) / 60);
        const secs = Math.floor(safeSeconds % 60);
        if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const togglePlay = () => {
        if (isBasmalaPlayingRef.current) {
            const a = basmalaAudioRef.current;
            if (a) {
                if (a.paused) {
                    wasPlayingBeforeBasmalaRef.current = true;
                    a.play().catch(() => {});
                } else {
                    wasPlayingBeforeBasmalaRef.current = false;
                    a.pause();
                    setIsPlaying(false);
                }
            }
            return;
        }
        if (isCompleted) return;
        const audio = audioRef.current;
        if (isPlaying) {
            audio?.pause();
            setIsPlaying(false);
            return;
        }

        // Start directly from the tap/click when possible. This is important on
        // iOS/Android WebViews, where a later effect-triggered play() can be
        // rejected as autoplay even though the user just pressed Play.
        setIsPlaying(true);
        if (audio && isAudioReady) {
            audio.play().catch((error) => {
                if (error?.name !== 'AbortError') setIsPlaying(false);
            });
        }
    };

    const restartDailyPortion = () => {
        if (!selectedReciter || verses.length === 0) return;
        setIsCompleted(false); seamlessSurahAdvanceKeyRef.current = ''; surahAdvanceGuardRef.current = { verseKey: '', until: 0 };
        const firstVerse = verses[0];
        const firstVerseData = selectedReciter.type === 'surah-based' ? (recitationDataMap[firstVerse.surahId] ?? (recitationData?.surahId === firstVerse.surahId ? recitationData : null)) : recitationData;
        const info = getAudioInfoForVerse(selectedReciter, firstVerseData, firstVerse.surahId, firstVerse.ayahId);
        const desiredStartTime = info?.startTime || 0;
        onVerseChange(0);
        if (audioRef.current && info?.url) {
            const currentSrcPath = audioRef.current.src.split('?')[0];
            const nextSrcPath = new URL(info.url, 'http://localhost').href.split('?')[0];
            const targetTime = Number.isFinite(desiredStartTime) ? desiredStartTime : 0;
            preparePendingTrack({ targetTime, shouldAutoplay: isPlayingRef.current });
            if (currentSrcPath !== nextSrcPath) { audioRef.current.pause(); audioRef.current.src = info.url; audioRef.current.load(); }
            else if (Math.abs(audioRef.current.currentTime - targetTime) > SEEK_TOLERANCE_SEC) { audioRef.current.pause(); audioRef.current.currentTime = targetTime; void finalizePendingPlayback(); } else void finalizePendingPlayback();
            setElapsedTime(desiredStartTime); onWordIndexChange?.(-1); lastWordIndexRef.current = -1;
        }
        persistPlaybackState({ timestamp: desiredStartTime, verse: firstVerse, reciterId: selectedReciter.id });
    };

    const changeSpeed = () => {
        const currentIndex = SPEED_OPTIONS.indexOf(speed);
        const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
        const newSpeed = SPEED_OPTIONS[nextIndex];
        setSpeed(newSpeed); if (audioRef.current) audioRef.current.playbackRate = newSpeed; localStorage.setItem(SPEED_STORAGE_KEY, newSpeed.toString());
    };

    const verseDurationsSec = useMemo(() => {
        if (!selectedReciter || verses.length === 0) return null;
        if (selectedReciter.type === 'ayah-based') {
            const versesMap = recitationData?.verses || {};
            return verses.map(v => {
                const key = `${v.surahId}:${v.ayahId}`; const info = versesMap[key];
                if (!info) return null;
                if (typeof info.duration === 'number' && Number.isFinite(info.duration)) return info.duration;
                if (Array.isArray(info.segments) && info.segments.length > 0) return (info.segments[info.segments.length - 1]?.[2] || 0) / 1000;
                return null;
            });
        }
        return verses.map(v => {
            const data = recitationDataMap[v.surahId]; const timing = data?.timings?.[`${v.surahId}:${v.ayahId}`];
            if (!timing) return null;
            if (typeof timing.timestamp_from === 'number' && typeof timing.timestamp_to === 'number') return Math.max(0, (timing.timestamp_to - timing.timestamp_from) / 1000);
            if (Array.isArray(timing.segments) && timing.segments.length > 0) return (timing.segments[timing.segments.length - 1]?.[2] || 0) / 1000;
            return null;
        });
    }, [selectedReciter, verses, recitationData, recitationDataMap]);

    const totalDurationSec = useMemo(() => { if (!verseDurationsSec) return null; if (verseDurationsSec.some(d => d === null)) return null; const sum = verseDurationsSec.reduce((sum, d) => sum + (d || 0), 0); const s = speed || 1; return sum / s; }, [verseDurationsSec, speed]);
    const elapsedTotalSec = useMemo(() => {
        if (!verseDurationsSec) return null;
        const prior = verseDurationsSec.slice(0, currentVerseIndex).reduce((sum, d) => sum + (d || 0), 0);
        const currentDuration = verseDurationsSec[currentVerseIndex] || 0;
        const currentElapsed = Math.min(elapsedTime, currentDuration || elapsedTime);
        const s = speed || 1;
        return (prior + currentElapsed) / s;
    }, [verseDurationsSec, currentVerseIndex, elapsedTime, speed]);

    // Progress bar now fills during playback (time-based), fallback to verse count if durations unavailable
    const verseProgress = useMemo(() => {
        if (isBasmalaPlaying) return totalVerses > 0 ? ((currentVerseIndex) / totalVerses) * 100 : 0;
        if (totalDurationSec !== null && elapsedTotalSec !== null && totalDurationSec > 0) {
            return Math.max(0, Math.min(100, (elapsedTotalSec / totalDurationSec) * 100));
        }
        // Offline-only playback can have audio but no timing metadata. Use the
        // actual HTMLAudioElement position so the bar still advances smoothly.
        const audioDuration = audioRef.current?.duration ?? 0;
        if (Number.isFinite(audioDuration) && audioDuration > 0 && totalVerses > 0) {
            const fraction = verseEndTime !== null && verseEndTime > verseStartTime
                ? (elapsedTime - verseStartTime) / (verseEndTime - verseStartTime)
                : (audioRef.current?.currentTime ?? elapsedTime) / audioDuration;
            const clampedFraction = Math.max(0, Math.min(1, fraction));
            return Math.max(0, Math.min(100, ((currentVerseIndex + clampedFraction) / totalVerses) * 100));
        }
        return totalVerses > 0 ? ((currentVerseIndex + 1) / totalVerses) * 100 : 0;
    }, [totalDurationSec, elapsedTotalSec, currentVerseIndex, totalVerses, isBasmalaPlaying, elapsedTime, verseStartTime, verseEndTime]);
    const safeVerseProgress = Number.isFinite(verseProgress) ? Math.max(0, Math.min(100, verseProgress)) : 0;

    // Metadata can be unavailable offline while the downloaded MP3 is ready.
    // Readiness is therefore determined by the audio element, not metadata alone.
    const isPlayButtonLoading = reciters.length === 0 || !selectedReciterId || isAudioPreparing;
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
                playsInline
            />
            <audio
                ref={basmalaAudioRef}
                onEnded={handleBasmalaEnded}
                onTimeUpdate={handleBasmalaTimeUpdate}
                onError={handleBasmalaError}
                preload="auto"
                playsInline
                style={{ display: 'none' }}
            />
            <div className="reciter-select-container">
                <select className="reciter-select" value={selectedReciter?.id || ''} onChange={handleReciterChange} disabled={reciters.length === 0}>
                    {reciters.length === 0 ? <option value="">Loading reciters...</option> : reciters.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
            </div>
            <div
                className="player-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={safeVerseProgress}
                style={{ width: '100%', height: 8, background: 'var(--border, var(--background-modifier-border))', borderRadius: 999, overflow: 'hidden' }}
            >
                <div
                    className="progress-fill"
                    data-progress={safeVerseProgress}
                    style={{ display: 'block', width: `${safeVerseProgress}%`, minWidth: safeVerseProgress > 0 ? 1 : 0, height: '100%', background: 'var(--accent, var(--interactive-accent))', transition: 'width 0.25s ease', borderRadius: 999 }}
                />
                </div>
            <div className="player-controls">
                <div className="time-display">{isBasmalaPlaying ? 'بِسْمِ ٱللَّهِ...' : elapsedTotalSec !== null && totalDurationSec !== null ? `${formatTime(elapsedTotalSec)} / ${formatTime(totalDurationSec)}` : `${currentVerseIndex + 1} / ${totalVerses}`}</div>
                <div className="control-buttons">
                    <button className="control-btn" onClick={() => { if (isBasmalaPlaying) cancelBasmala(); onVerseChange(Math.max(0, currentVerseIndex - 1)); }} disabled={currentVerseIndex === 0 && !isBasmalaPlaying}><SkipBack size={18} /></button>
                    <button className="play-btn" onClick={togglePlay} disabled={isPlayButtonDisabled && !isBasmalaPlaying}>{isPlayButtonLoading ? <Spinner size={16} /> : (isPlaying || isBasmalaPlaying) ? <Pause size={18} /> : <Play size={18} />}</button>
                    <button className="control-btn" onClick={() => { if (isBasmalaPlaying) cancelBasmala(); onVerseChange(Math.min(totalVerses - 1, currentVerseIndex + 1)); }} disabled={currentVerseIndex === totalVerses - 1 && !isBasmalaPlaying}><SkipForward size={18} /></button>
                </div>
                <div className="speed-control">
                    <button className="speed-btn" onClick={changeSpeed}>{speed}x</button>
                    {isCompleted && <button className="control-btn" onClick={restartDailyPortion}><RotateCcw size={16} /></button>}
                </div>
            </div>
        </div>
    );
}
