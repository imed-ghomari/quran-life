'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BookOpen, BarChart3, Settings, ListTodo } from 'lucide-react';
import {
    getSettings,
    getMindMaps,
    getPartMindMaps,
    getSuspendedAnchors,
    getMutashabihatDecisions,
    getReviewErrors,
    isSurahSkipped,
    getDueNodes,
    getListeningCompletedToday,
} from '@/lib/storage';
import { getMutashabihatForAbsolute, absoluteToSurahAyah } from '@/lib/mutashabihat';
import { SURAHS } from '@/lib/quranData';

export default function Navigation() {
    const pathname = usePathname();
    const [pendingCount, setPendingCount] = useState(0);
    const [todayReviews, setTodayReviews] = useState(0);
    const [isPortionComplete, setIsPortionComplete] = useState(false);
    const settings = useMemo(() => getSettings(), []);

    useEffect(() => {
        const compute = () => {
            const activePart = getSettings().activePart;
            const mindmaps = getMindMaps();
            const partMindmaps = getPartMindMaps();
            const decisions = getMutashabihatDecisions();
            const errors = getReviewErrors().filter(e => e.absoluteAyah);
            const suspended = getSuspendedAnchors();

            const surahsInPart = SURAHS.filter(s => s.part === activePart && !isSurahSkipped(s.id));

            const incompleteSurahMaps = surahsInPart.filter(s => {
                const mm = mindmaps[s.id];
                return !mm || !mm.imageUrl || !mm.isComplete;
            }).length;

            const partMap = partMindmaps[activePart];
            const incompletePartMap = partMap && partMap.imageUrl && partMap.isComplete ? 0 : 1;

            const suspendedInPart = suspended.filter(issue => {
                const surahMeta = SURAHS.find(s => s.id === issue.surahId);
                return surahMeta?.part === activePart;
            }).length;

            const similarityChecks = errors.filter(err => {
                const abs = err.absoluteAyah!;
                const muts = getMutashabihatForAbsolute(abs);
                if (!muts.length) return false;
                if (decisions[abs]) return false;
                const ref = absoluteToSurahAyah(abs);
                const surahMeta = SURAHS.find(s => s.id === ref.surahId);
                return surahMeta?.part === activePart;
            }).length;

            const due = getDueNodes().length;
            const listeningComplete = getListeningCompletedToday();

            setPendingCount(incompleteSurahMaps + incompletePartMap + suspendedInPart + similarityChecks);
            setTodayReviews(due);
            setIsPortionComplete(listeningComplete);
        };

        compute();
        const interval = setInterval(compute, 2000);
        window.addEventListener('storage', compute);
        return () => {
            clearInterval(interval);
            window.removeEventListener('storage', compute);
        };
    }, []);

    const navItems = [
        { href: '/', icon: BookOpen, label: 'Today', badge: todayReviews, status: !isPortionComplete },
        { href: '/todo', icon: ListTodo, label: 'Todo', badge: pendingCount },
        { href: '/statistics', icon: BarChart3, label: 'Statistics' },
        { href: '/settings', icon: Settings, label: 'Settings' },
    ];

    return (
        <nav className="bottom-nav">
            {navItems.map(item => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`nav-item ${isActive ? 'active' : ''}`}
                    >
                        <span className="nav-icon">
                            <Icon size={24} />
                            {item.badge !== undefined && item.badge > 0 ? (
                                <span className="nav-badge pulse">{item.badge}</span>
                            ) : null}
                            {item.status && (
                                <span className="nav-status-dot pulse-blue"></span>
                            )}
                        </span>
                        <span>{item.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
