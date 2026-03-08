'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
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

const getLocalDayKey = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const routeMatchesNavItem = (pathname: string | null, href: string) => {
    if (!pathname) return false;
    if (href === '/docs') return pathname.startsWith('/docs');
    return pathname === href;
};

type NavigationContentProps = {
    pendingHref: string | null;
    onNavigateStart: (href: string) => void;
};

function NavigationContent({ pendingHref, onNavigateStart }: NavigationContentProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { settings, isLoading: settingsLoading } = useInstantSettings();
    const { dueNodes, isLoading: nodesLoading } = useInstantNodes();
    const { mindmaps, partMindMaps, isLoading: mindmapsLoading } = useInstantMindMaps();
    const { decisions, custom: customMutashabihat } = useInstantMutashabihat();
    const { errors, isLoading: reviewErrorsLoading } = useInstantReviewErrors();
    const { progress: listeningProgress, isLoading: listeningProgressLoading } = useInstantListeningProgress();
    const [hasHydratedNavMetrics, setHasHydratedNavMetrics] = useState(false);
    const navDataLoading = settingsLoading || nodesLoading || mindmapsLoading || reviewErrorsLoading || listeningProgressLoading;

    useEffect(() => {
        if (navDataLoading) return;
        setHasHydratedNavMetrics(true);
    }, [navDataLoading]);

    const navMetrics = useMemo(() => {
        if (!settings || !hasHydratedNavMetrics) {
            return {
                pendingCount: 0,
                todayTasks: 0,
                isDailyPortionComplete: false,
                hideBadges: true,
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
            hideBadges: false,
        };
    }, [settings, dueNodes, mindmaps, partMindMaps, decisions, errors, customMutashabihat, listeningProgress, hasHydratedNavMetrics]);

    const navItems = [
        { href: '/dashboard', icon: BookOpen, label: 'Today', badge: navMetrics.hideBadges ? undefined : navMetrics.todayTasks, showStatusDot: !navMetrics.isDailyPortionComplete },
        { href: '/todo', icon: ListTodo, label: 'Todo', badge: navMetrics.hideBadges ? undefined : navMetrics.pendingCount, showStatusDot: false },
        { href: '/statistics', icon: BarChart3, label: 'Statistics', showStatusDot: false },
        { href: '/docs', icon: HelpCircle, label: 'Docs', showStatusDot: false },
        { href: '/settings', icon: Settings, label: 'Settings', showStatusDot: false },
    ];
    const effectivePathname = pendingHref ?? pathname;

    return (
        <nav className="bottom-nav">
            {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = routeMatchesNavItem(effectivePathname, item.href);
                const isCurrentPath = routeMatchesNavItem(pathname, item.href);
                
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`nav-item ${isActive ? 'active' : ''}`}
                        onClick={(event) => {
                            if (
                                event.defaultPrevented
                                || event.button !== 0
                                || event.metaKey
                                || event.ctrlKey
                                || event.shiftKey
                                || event.altKey
                            ) {
                                return;
                            }
                            event.preventDefault();
                            if (isCurrentPath) return;
                            onNavigateStart(item.href);
                            router.push(item.href);
                        }}
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

type NavigationProps = {
    pendingHref: string | null;
    onNavigateStart: (href: string) => void;
};

export default function Navigation({ pendingHref, onNavigateStart }: NavigationProps) {
    const pathname = usePathname();
    const isAuthOrHome = pathname === '/'
        || pathname === '/auth'
        || pathname === '/checkout'
        || pathname === '/terms'
        || pathname === '/privacy';

    if (isAuthOrHome) return null;

    return <NavigationContent pendingHref={pendingHref} onNavigateStart={onNavigateStart} />;
}
