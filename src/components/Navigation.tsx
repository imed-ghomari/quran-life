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
    useInstantListeningStats
} from '@/hooks/useInstantData';
import { getMutashabihatForAbsolute, surahAyahToAbsolute } from '@/lib/mutashabihat';
import { SURAHS } from '@/lib/quranData';

function NavigationContent() {
    const pathname = usePathname();
    const { settings } = useInstantSettings();
    const { nodes } = useInstantNodes();
    const { mindmaps, partMindMaps } = useInstantMindMaps();
    const { decisions, custom: customMutashabihat } = useInstantMutashabihat();
    const { errors } = useInstantReviewErrors();
    const { stats } = useInstantListeningStats();

    const [pendingCount, setPendingCount] = useState(0);
    const [todayReviews, setTodayReviews] = useState(0);
    const [isPortionComplete, setIsPortionComplete] = useState(false);

    useEffect(() => {
        if (!settings) return;

        const activePart = settings.activePart;
        const skippedSurahs = new Set(settings.skippedSurahs || []);

        const surahsInPart = SURAHS.filter(s => (activePart === 5 || s.part === activePart) && !skippedSurahs.has(s.id));

        const incompleteSurahMaps = surahsInPart.filter(s => {
            const mm = (mindmaps as any[]).find(m => m.surahId === s.id);
            return !mm || !mm.imageUrl || !mm.isComplete;
        }).length;

        let incompletePartMaps = 0;
        if (activePart === 5) {
            incompletePartMaps = [1, 2, 3, 4].filter(p => {
                const pmm = (partMindMaps as any[]).find(m => m.partId === p);
                return !pmm || !pmm.imageUrl || !pmm.isComplete;
            }).length;
        } else {
            const pmm = (partMindMaps as any[]).find(m => m.partId === activePart);
            if (!pmm || !pmm.imageUrl || !pmm.isComplete) {
                incompletePartMaps = 1;
            }
        }

        // Count pending mutashabihat
        let pendingMuts = 0;
        const mutsMap = new Map();
        decisions.forEach(d => mutsMap.set(d.id, d));

        surahsInPart.forEach(s => {
            for (let a = 1; a <= s.verseCount; a++) {
                const abs = surahAyahToAbsolute(s.id, a);
                const muts = getMutashabihatForAbsolute(abs, customMutashabihat);
                muts.forEach(m => {
                    const d = mutsMap.get(`${abs}-${m.phraseId}`);
                    if (!d || d.status === 'pending') {
                        pendingMuts++;
                    }
                });
            }
        });

        const activeErrors = errors.filter(e => e.absoluteAyah).length;

        setPendingCount(incompleteSurahMaps + incompletePartMaps + pendingMuts + activeErrors);

        // Today's reviews
        const today = new Date().toISOString().split('T')[0];
        const dueToday = nodes.filter(n => {
            const due = (n.scheduler as any).due;
            return due && due.split('T')[0] <= today;
        }).length;
        setTodayReviews(dueToday);

        // Portion complete
        const todayStat = stats.find(s => s.date === today);
        setIsPortionComplete(!!todayStat?.isComplete);

    }, [settings, nodes, mindmaps, partMindMaps, decisions, errors, stats]);

    const navItems = [
        { href: '/dashboard', icon: BookOpen, label: 'Today', badge: todayReviews, status: !isPortionComplete },
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
                                <span className={`badge ${item.status ? 'status-alert' : ''}`}>
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
