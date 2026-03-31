'use client';

import React, { useEffect, useState, useMemo } from 'react';
import MindmapViewer from '@/components/MindmapViewer';
import { QuranPart } from '@/lib/types';
import { useTheme } from '@/components/ThemeProvider';
import { getSurah } from '@/lib/quranData';

interface MindmapDocHeaderProps {
    slug: string;
}

export default function MindmapDocHeader({ slug }: MindmapDocHeaderProps) {
    const { theme } = useTheme();
    const [systemIsDark, setSystemIsDark] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        setSystemIsDark(mq.matches);
        const handler = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
        if (mq.addEventListener) {
            mq.addEventListener('change', handler);
            return () => mq.removeEventListener('change', handler);
        }
        mq.addListener(handler);
        return () => mq.removeListener(handler);
    }, []);

    const isDark = theme === 'system' ? systemIsDark : theme === 'dark';

    const mindmapData = useMemo(() => {
        if (slug.startsWith('mindmaps/surah-')) {
            const surahId = parseInt(slug.replace('mindmaps/surah-', ''));
            if (!isNaN(surahId)) {
                return { 
                    type: 'surah' as const, 
                    id: surahId, 
                    templateUrl: `/api/premade-mindmaps/surah-${surahId}.tldraw`
                };
            }
        } else if (slug.startsWith('mindmaps/part-')) {
            const partId = parseInt(slug.replace('mindmaps/part-', '')) as QuranPart;
            if (!isNaN(partId)) {
                return { 
                    type: 'part' as const, 
                    id: partId, 
                    templateUrl: `/api/premade-mindmaps/part-${partId}.tldraw`
                };
            }
        }
        return null;
    }, [slug]);

    if (!mindmapData) {
        return null;
    }

    const hasContent = !!mindmapData.templateUrl;

    if (!hasContent) {
        return null;
    }

    const surahName = mindmapData.type === 'surah' ? getSurah(mindmapData.id)?.name : undefined;

    return (
        <MindmapViewer
            templateUrl={mindmapData.templateUrl}
            isDark={isDark}
            officialOnly
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
