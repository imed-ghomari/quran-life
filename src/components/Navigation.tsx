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
    const { nodes } = useInstantNodes();
    const { mindmaps, partMindMaps } = useInstantMindMaps();
    const { decisions, custom: customMutashabihat } = useInstantMutashabihat();
    const { errors } = useInstantReviewErrors();
    const { progress: listeningProgress } = useInstantListeningProgress();

    const [pendingCount, setPendingCount] = useState(0);
    const [todayTasks, setTodayTasks] = useState(0);
    const [isPortionComplete, setIsPortionComplete] = useState(false);

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
            return { id, column };
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
            return { id, column };
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

        // Today's reviews
        const today = new Date().toISOString().split('T')[0];
        const dueToday = nodes.filter(n => {
            if (!n.scheduler) return false;
            const due = (n.scheduler as any).due || (n.scheduler as any).dueDate;
            return due && due.split('T')[0] <= today;
        }).length;
        // Portion complete
        const partProgress = listeningProgress.find(p => p.partId === activePart);
        let portionDone = false;
        if (partProgress?.updatedAt) {
            const lastUpdate = new Date(partProgress.updatedAt);
            const now = new Date();
            portionDone = lastUpdate.toDateString() === now.toDateString();
        }
        setIsPortionComplete(portionDone);

        setTodayTasks(dueToday + (portionDone ? 0 : 1));

    }, [settings, nodes, mindmaps, partMindMaps, decisions, errors, listeningProgress]);

    const navItems = [
        { href: '/dashboard', icon: BookOpen, label: 'Today', badge: todayTasks, status: !isPortionComplete },
        { href: '/todo', icon: ListTodo, label: 'Todo', badge: pendingCount },
        { href: '/statistics', icon: BarChart3, label: 'Statistics' },
        { href: '/docs', icon: HelpCircle, label: 'Docs' },
        { href: '/settings', icon: Settings, label: 'Settings' },
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
                            <Icon size={22} />
                            {item.badge !== undefined && item.badge > 0 && (
                                <span className={`nav-badge ${item.status ? 'status-alert' : ''}`}>
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
    const isAuthOrHome = pathname === '/' || pathname === '/auth';

    if (isAuthOrHome) return null;

    return <NavigationContent />;
}
