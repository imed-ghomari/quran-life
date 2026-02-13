'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BookOpen, BarChart3, Settings, ListTodo, HelpCircle } from 'lucide-react';
import SyncStatus from './SyncStatus';
import ThemeToggle from './ThemeToggle';
import {
    useInstantSettings,
    useInstantNodes,
    useInstantMindMaps,
    useInstantMutashabihat,
    useInstantReviewErrors,
    useInstantListeningProgress
} from '@/hooks/useInstantData';
import { getMutashabihatForAbsolute, surahAyahToAbsolute, absoluteToSurahAyah } from '@/lib/mutashabihat';
import { SURAHS } from '@/lib/quranData';

function NavigationContent() {
    const pathname = usePathname();
    const { settings } = useInstantSettings();
    const { dueNodes } = useInstantNodes();
    const { mindmaps, partMindMaps } = useInstantMindMaps();
    const { decisions, custom: customMutashabihat } = useInstantMutashabihat();
    const { errors } = useInstantReviewErrors();
    const { progress: listeningProgress } = useInstantListeningProgress();

    const [pendingCount, setPendingCount] = useState(0);
    const [todayTasks, setTodayTasks] = useState(0);
    const [isPortionComplete, setIsPortionComplete] = useState(false);
    const [isDailyPortionComplete, setIsDailyPortionComplete] = useState(false);

    useEffect(() => {
        if (!settings) return;

        const activePart = settings.activePart;
        const skippedSurahs = new Set(settings.skippedSurahs || []);
        const activePartSize = activePart as number;
        const surahsInPart = SURAHS.filter(s => (activePartSize === 5 || s.part === activePartSize) && !skippedSurahs.has(s.id));

        // --- KANBAN BASED LOGIC ---
        const kanbanState = settings.kanbanColumns || {};

        // 1. Surah Items
        const surahItems = surahsInPart.map(s => {
            const id = `surah-${s.id}`;
            const mm = (mindmaps as any[]).find(m => m.surahId === s.id);
            const isComplete = mm?.isComplete && (!!mm?.imageUrl || !!mm?.tldrawSnapshot || !!mm?.imageUrlDark);

            let column = isComplete ? 'complete' : 'backlog';
            for (const [colId, itemIds] of Object.entries(kanbanState)) {
                if ((itemIds as string[]).includes(id)) {
                    column = colId;
                    break;
                }
            }
            return { id, column, isComplete };
        });

        // 2. Part Items
        const partsToConsider = activePart === 5 ? [1, 2, 3, 4] : [activePart as number];
        const partItems = partsToConsider.map(p => {
            const id = `part-${p}`;
            const pmm = (partMindMaps as any[]).find(m => m.partId === p);
            const isComplete = pmm?.isComplete && (!!pmm?.imageUrl || !!pmm?.tldrawSnapshot || !!pmm?.imageUrlDark);

            let column = isComplete ? 'complete' : 'backlog';
            for (const [colId, itemIds] of Object.entries(kanbanState)) {
                if ((itemIds as string[]).includes(id)) {
                    column = colId;
                    break;
                }
            }
            return { id, column, isComplete };
        });

        // 3. Similarity Items
        const decisionsMap = new Map();
        decisions.forEach(d => decisionsMap.set(d.phraseId || d.id, d));

        const similarityItems = errors
            .filter(e => e.type === 'similarity' && e.absoluteAyah)
            .filter(err => {
                const absolute = err.absoluteAyah!;
                const verseDecision = decisionsMap.get(absolute.toString());
                if (verseDecision?.status === 'ignored' || !!verseDecision?.confirmedAt) return false;

                const muts = getMutashabihatForAbsolute(absolute, customMutashabihat);
                const anyPhraseConfirmed = muts.some((m: any) => {
                    const phraseDecision = decisionsMap.get(`${absolute}-${m.phraseId}`);
                    return !!phraseDecision?.confirmedAt;
                });

                return !anyPhraseConfirmed;
            });

        const similaritySurahIds = new Set<number>();
        similarityItems.forEach(item => {
            const ref = absoluteToSurahAyah(item.absoluteAyah!);
            similaritySurahIds.add(ref.surahId);
        });

        const similarityItemsFinal = Array.from(similaritySurahIds).map(surahId => {
            const id = `similarity-${surahId}`;
            let column = 'backlog';
            for (const [colId, itemIds] of Object.entries(kanbanState)) {
                if ((itemIds as string[]).includes(id)) {
                    column = colId;
                    break;
                }
            }
            return { id, column };
        });

        const totalPending = [...surahItems, ...partItems, ...similarityItemsFinal]
            .filter(item => item.column === 'backlog' || item.column === 'in-progress')
            .length;

        setPendingCount(totalPending);

        // Calculate if portion is complete (all surahs and parts are complete)
        const allSurahsComplete = surahItems.every(item => item.isComplete);
        const allPartsComplete = partItems.every(item => item.isComplete);
        const hasWorkItems = surahItems.length > 0 || partItems.length > 0;
        
        // Portion is complete when there are items and all are complete, OR no pending items exist
        const portionComplete = hasWorkItems && allSurahsComplete && allPartsComplete && similarityItemsFinal.length === 0;
        setIsPortionComplete(portionComplete);

        // Daily portion completion (listening progress updated today)
        const activeProgress = listeningProgress.find(p => p.partId === settings.activePart);
        const lastUpdate = activeProgress?.updatedAt ? new Date(activeProgress.updatedAt) : null;
        const todayDate = new Date();
        const dailyComplete = !!lastUpdate && lastUpdate.toDateString() === todayDate.toDateString();
        setIsDailyPortionComplete(dailyComplete);

        // Match Today badge count with the exact queue filter used by the review section.
        const hasKanbanState = !!settings.kanbanColumns && Object.keys(settings.kanbanColumns).length > 0;
        const completeIds = new Set<string>(hasKanbanState ? (settings.kanbanColumns?.complete || []) : []);

        const hasAnchorForNode = (node: (typeof dueNodes)[number]) => {
            if (node.type !== 'verse_segment' || !node.surahId) return true;
            const mm = mindmaps.find(m => m.surahId === node.surahId);
            const anchors = mm?.anchors || [];
            if (anchors.length === 0) return false;
            return anchors.some(a => a.startVerse === node.startVerse && a.endVerse === node.endVerse);
        };

        const todayCount = dueNodes
            .filter(node => {
                if (!hasKanbanState) return true;
                if (node.type === 'mindmap') return completeIds.has(`surah-${node.surahId}`);
                if (node.type === 'part_mindmap') return completeIds.has(`part-${node.partId}`);
                return true;
            })
            .filter(hasAnchorForNode)
            .length;

        setTodayTasks(todayCount);

    }, [settings, dueNodes, mindmaps, partMindMaps, decisions, errors, listeningProgress]);

    const navItems = [
        { href: '/dashboard', icon: BookOpen, label: 'Today', badge: todayTasks, showStatusDot: !isDailyPortionComplete },
        { href: '/todo', icon: ListTodo, label: 'Todo', badge: pendingCount, showStatusDot: false },
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
