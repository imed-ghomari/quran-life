'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BookOpen, BarChart3, Settings, ListTodo, HelpCircle } from 'lucide-react';
import {
    useSharedInstantListeningProgress,
    useSharedInstantMindMaps,
    useSharedInstantNodes,
    useSharedInstantReviewErrors,
    useSharedInstantSettings,
} from '@/components/InstantDataProvider';
import { deriveSuspendedVerseGroupKeys, filterReviewQueueNodes } from '@/lib/reviewQueue';
import { ALL_QURAN_PART, LEGACY_ALL_QURAN_PART } from '@/lib/types';

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
    const { settings, isLoading: settingsLoading } = useSharedInstantSettings();
    const { dueNodes, isLoading: nodesLoading } = useSharedInstantNodes();
    const { mindmaps, isLoading: mindmapsLoading } = useSharedInstantMindMaps();
    const { errors, isLoading: reviewErrorsLoading } = useSharedInstantReviewErrors();
    const { progress: listeningProgress, isLoading: listeningProgressLoading } = useSharedInstantListeningProgress();
    const [hasHydratedNavMetrics, setHasHydratedNavMetrics] = useState(false);
    const navDataLoading = settingsLoading || nodesLoading || mindmapsLoading || reviewErrorsLoading || listeningProgressLoading;

    useEffect(() => {
        if (navDataLoading) return;
        setHasHydratedNavMetrics(true);
    }, [navDataLoading]);

    const navMetrics = useMemo(() => {
        if (!settings || !hasHydratedNavMetrics) {
            return {
                todayTasks: 0,
                isDailyPortionComplete: false,
                hideBadges: true,
            };
        }

        const activeProgress = listeningProgress.find(progress => progress.partId === settings.activePart)
            ?? (settings.activePart === ALL_QURAN_PART && (settings.partSystemVersion ?? 1) < 2
                ? listeningProgress.find(progress => progress.partId === LEGACY_ALL_QURAN_PART)
                : undefined);
        const todayKey = getLocalDayKey(new Date());
        const progressDayKey = activeProgress?.updatedAt ? getLocalDayKey(new Date(activeProgress.updatedAt)) : null;
        const isDailyPortionComplete = !!progressDayKey && progressDayKey === todayKey;

        const suspendedVerseGroupKeys = deriveSuspendedVerseGroupKeys(
            errors,
            3,
            settings?.suspendedVerseGroupsAcknowledged
        );

        return {
            todayTasks: filterReviewQueueNodes(dueNodes, settings, mindmaps, suspendedVerseGroupKeys).length,
            isDailyPortionComplete,
            hideBadges: false,
        };
    }, [settings, dueNodes, mindmaps, errors, listeningProgress, hasHydratedNavMetrics]);

    const navItems = [
        { href: '/dashboard', icon: BookOpen, label: 'Today', badge: navMetrics.hideBadges ? undefined : navMetrics.todayTasks, showStatusDot: !navMetrics.isDailyPortionComplete },
        { href: '/todo', icon: ListTodo, label: 'Todo', showStatusDot: false },
        { href: '/statistics', icon: BarChart3, label: 'Statistics', showStatusDot: false },
        { href: '/docs', icon: HelpCircle, label: 'Docs', showStatusDot: false },
        { href: '/settings', icon: Settings, label: 'Settings', showStatusDot: false },
    ];
    const effectivePathname = pendingHref ?? pathname;

    return (
        <nav
            className="bottom-nav"
            aria-busy={pendingHref ? 'true' : 'false'}
            style={pendingHref ? { pointerEvents: 'none' } : undefined}
        >
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
                            if (pendingHref) return;
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
