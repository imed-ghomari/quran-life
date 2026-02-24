'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BookOpen, BarChart3, Settings, ListTodo, HelpCircle } from 'lucide-react';
import {
    useInstantSettings,
    useInstantNodes,
    useInstantMindMaps,
    useInstantMutashabihat,
    useInstantReviewErrors,
    useInstantListeningProgress
} from '@/hooks/useInstantData';
import { getMutashabihatForAbsolute, absoluteToSurahAyah } from '@/lib/mutashabihat';
import { SURAHS } from '@/lib/quranData';
import { filterReviewQueueNodes } from '@/lib/reviewQueue';
import { ALL_QURAN_PART, CORE_QURAN_PARTS, LEGACY_ALL_QURAN_PART } from '@/lib/types';

const NAV_PREFETCH_ROUTES = ['/dashboard', '/todo', '/statistics', '/docs', '/settings'] as const;

const getLocalDayKey = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

function NavigationContent() {
    const pathname = usePathname();
    const router = useRouter();
    const { settings } = useInstantSettings();
    const { dueNodes } = useInstantNodes();
    const { mindmaps, partMindMaps } = useInstantMindMaps();
    const { decisions, custom: customMutashabihat } = useInstantMutashabihat();
    const { errors } = useInstantReviewErrors();
    const { progress: listeningProgress } = useInstantListeningProgress();

    useEffect(() => {
        const prefetch = () => {
            NAV_PREFETCH_ROUTES.forEach((route) => router.prefetch(route));
        };

        const requestIdle = window.requestIdleCallback?.bind(window);
        const cancelIdle = window.cancelIdleCallback?.bind(window);

        if (requestIdle && cancelIdle) {
            const idleId = requestIdle(prefetch, { timeout: 1200 });
            return () => cancelIdle(idleId);
        }

        const timeoutId = window.setTimeout(prefetch, 250);
        return () => window.clearTimeout(timeoutId);
    }, [router]);

    const navMetrics = useMemo(() => {
        if (!settings) {
            return {
                pendingCount: 0,
                todayTasks: 0,
                isDailyPortionComplete: false,
            };
        }

        const activePart = settings.activePart;
        const skippedSurahs = new Set(settings.skippedSurahs || []);
        const activePartSize = activePart as number;
        const surahsInPart = SURAHS.filter(s => (activePartSize === ALL_QURAN_PART || s.part === activePartSize) && !skippedSurahs.has(s.id));
        const kanbanState = settings.kanbanColumns || {};

        const itemColumn = new Map<string, string>();
        Object.entries(kanbanState).forEach(([colId, itemIds]) => {
            (itemIds as string[]).forEach((itemId) => {
                itemColumn.set(itemId, colId);
            });
        });

        const mindmapBySurah = new Map<number, any>();
        (mindmaps as any[]).forEach((mindmap) => {
            const surahId = Number(mindmap?.surahId);
            if (Number.isFinite(surahId) && !mindmapBySurah.has(surahId)) {
                mindmapBySurah.set(surahId, mindmap);
            }
        });

        const partMindmapByPart = new Map<number, any>();
        (partMindMaps as any[]).forEach((mindmap) => {
            const partId = Number(mindmap?.partId);
            if (Number.isFinite(partId) && !partMindmapByPart.has(partId)) {
                partMindmapByPart.set(partId, mindmap);
            }
        });

        const surahItems = surahsInPart.map(s => {
            const id = `surah-${s.id}`;
            const mm = mindmapBySurah.get(s.id);
            const isComplete = mm?.isComplete && (!!mm?.imageUrl || !!mm?.tldrawSnapshot || !!mm?.imageUrlDark);
            return { id, column: itemColumn.get(id) ?? (isComplete ? 'complete' : 'backlog'), isComplete };
        });

        const partsToConsider = activePart === ALL_QURAN_PART ? Array.from(CORE_QURAN_PARTS) : [activePart as number];
        const partItems = partsToConsider.map((partId) => {
            const id = `part-${partId}`;
            const partMindmap = partMindmapByPart.get(partId);
            const isComplete = partMindmap?.isComplete && (!!partMindmap?.imageUrl || !!partMindmap?.tldrawSnapshot || !!partMindmap?.imageUrlDark);
            return { id, column: itemColumn.get(id) ?? (isComplete ? 'complete' : 'backlog'), isComplete };
        });

        const decisionsMap = new Map<string, any>();
        decisions.forEach((decision) => decisionsMap.set(decision.phraseId || decision.id, decision));

        const isPhraseResolved = (absolute: number, entry: any) => {
            const exact = decisionsMap.get(`${absolute}-${entry.phraseId}`);
            if (exact?.status === 'ignored' || !!exact?.confirmedAt) return true;

            const currentRef = absoluteToSurahAyah(absolute);
            const candidateAbs = Array.from(new Set<number>([
                absolute,
                ...(entry.sources || []),
                ...(entry.matches || []),
            ])).filter((absRef) => absoluteToSurahAyah(absRef).surahId === currentRef.surahId);

            return candidateAbs.some((absRef) => {
                const phraseDecision = decisionsMap.get(`${absRef}-${entry.phraseId}`);
                return phraseDecision?.status === 'ignored' || !!phraseDecision?.confirmedAt;
            });
        };

        const similaritySurahIds = new Set<number>();
        errors.forEach((error) => {
            if (error.type !== 'similarity' || !error.absoluteAyah) return;
            const absolute = error.absoluteAyah;
            const verseDecision = decisionsMap.get(absolute.toString());
            if (verseDecision?.status === 'ignored' || !!verseDecision?.confirmedAt) return;

            const muts = getMutashabihatForAbsolute(absolute, customMutashabihat);
            const unresolvedPhrases = muts.filter((entry: any) => !isPhraseResolved(absolute, entry));
            if (unresolvedPhrases.length === 0) return;

            similaritySurahIds.add(absoluteToSurahAyah(absolute).surahId);
        });

        const similarityItems = Array.from(similaritySurahIds).map((surahId) => {
            const id = `similarity-${surahId}`;
            return { id, column: itemColumn.get(id) ?? 'backlog' };
        });

        const pendingCount = [...surahItems, ...partItems, ...similarityItems]
            .filter(item => item.column === 'backlog' || item.column === 'in-progress')
            .length;

        const activeProgress = listeningProgress.find(progress => progress.partId === settings.activePart)
            ?? (settings.activePart === ALL_QURAN_PART && (settings.partSystemVersion ?? 1) < 2
                ? listeningProgress.find(progress => progress.partId === LEGACY_ALL_QURAN_PART)
                : undefined);
        const todayKey = getLocalDayKey(new Date());
        const progressDayKey = activeProgress?.updatedAt ? getLocalDayKey(new Date(activeProgress.updatedAt)) : null;
        const isDailyPortionComplete = !!progressDayKey && progressDayKey === todayKey;

        return {
            pendingCount,
            todayTasks: filterReviewQueueNodes(dueNodes, settings, mindmaps).length,
            isDailyPortionComplete,
        };
    }, [settings, dueNodes, mindmaps, partMindMaps, decisions, errors, customMutashabihat, listeningProgress]);

    const navItems = [
        { href: '/dashboard', icon: BookOpen, label: 'Today', badge: navMetrics.todayTasks, showStatusDot: !navMetrics.isDailyPortionComplete },
        { href: '/todo', icon: ListTodo, label: 'Todo', badge: navMetrics.pendingCount, showStatusDot: false },
        { href: '/statistics', icon: BarChart3, label: 'Statistics', showStatusDot: false },
        { href: '/docs', icon: HelpCircle, label: 'Docs', showStatusDot: false },
        { href: '/settings', icon: Settings, label: 'Settings', showStatusDot: false },
    ];

    return (
        <nav className="bottom-nav">
            {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href === '/docs' && pathname?.startsWith('/docs'));
                
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`nav-item ${isActive ? 'active' : ''}`}
                        onMouseEnter={() => router.prefetch(item.href)}
                        onFocus={() => router.prefetch(item.href)}
                    >
                        <div className="nav-icon">
                            {item.showStatusDot && (
                                <span className="nav-status-dot blue" />
                            )}
                            <Icon size={22} />
                            {item.badge !== undefined && item.badge > 0 && (
                                <span className="nav-badge">
                                    {item.badge}
                                </span>
                            )}
                        </div>
                        <span className="nav-label">{item.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}

export default function Navigation() {
    const pathname = usePathname();
    const isAuthOrHome = pathname === '/'
        || pathname === '/auth'
        || pathname === '/checkout'
        || pathname === '/terms'
        || pathname === '/privacy';

    if (isAuthOrHome) return null;

    return <NavigationContent />;
}
