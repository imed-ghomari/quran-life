'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useInstantMindMaps } from '@/hooks/useInstantData';
import MindmapViewer from '@/components/MindmapViewer';
import { QuranPart } from '@/lib/types';
import { useTheme } from '@/components/ThemeProvider';
import { getSurah } from '@/lib/quranData';

interface MindmapDocHeaderProps {
    slug: string;
}

export default function MindmapDocHeader({ slug }: MindmapDocHeaderProps) {
    const { mindmaps, partMindMaps } = useInstantMindMaps();
    const { theme } = useTheme();
    const [systemIsDark, setSystemIsDark] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        setSystemIsDark(mq.matches);
        const handler = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    const isDark = theme === 'system' ? systemIsDark : theme === 'dark';

    const mindmapData = useMemo(() => {
        if (slug.startsWith('mindmaps/surah-')) {
            const surahId = parseInt(slug.replace('mindmaps/surah-', ''));
            if (!isNaN(surahId)) {
                const mm = mindmaps.find((m: any) => m.surahId === surahId);
                return { 
                    type: 'surah' as const, 
                    id: surahId, 
                    data: mm,
                    templateUrl: `/assets/premade-mindmaps/surah-${surahId}.tldraw`
                };
            }
        } else if (slug.startsWith('mindmaps/part-')) {
            const partId = parseInt(slug.replace('mindmaps/part-', '')) as QuranPart;
            if (!isNaN(partId)) {
                const pmm = partMindMaps.find((m: any) => m.partId === partId);
                return { 
                    type: 'part' as const, 
                    id: partId, 
                    data: pmm,
                    templateUrl: `/assets/premade-mindmaps/part-${partId}.tldraw`
                };
            }
        }
        return null;
    }, [slug, mindmaps, partMindMaps]);

    if (!mindmapData) {
        return null;
    }

    const hasContent = mindmapData.templateUrl || 
                      (mindmapData.data && (mindmapData.data.imageUrl || mindmapData.data.tldrawSnapshot));

    if (!hasContent) {
        return null;
    }

    const surahName = mindmapData.type === 'surah' ? getSurah(mindmapData.id)?.name : undefined;

    return (
        <MindmapViewer
            snapshot={mindmapData.data?.tldrawSnapshot}
            templateUrl={mindmapData.templateUrl}
            imageUrl={mindmapData.data?.imageUrl}
            imageUrlDark={mindmapData.data?.imageUrlDark}
            isDark={isDark}
            title={mindmapData.type === 'surah'
                ? `Surah ${mindmapData.id}${surahName ? `. ${surahName}` : ''} Mindmap`
                : `Part ${mindmapData.id} Mindmap`}
            contextLabel={mindmapData.type === 'surah'
                ? `Surah ${mindmapData.id}${surahName ? `. ${surahName}` : ''}`
                : `Part ${mindmapData.id}`}
            showDocLink={false}
            height={400}
            style={{ marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}
        />
    );
}
