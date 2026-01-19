'use client';

import React, { useEffect, useState } from 'react';
import { getMindMap, getPartMindMap } from '@/lib/storage';
import MindmapViewer from '@/components/MindmapViewer';
import { QuranPart } from '@/lib/types';
import { useTheme } from '@/components/ThemeProvider';

interface MindmapDocHeaderProps {
    slug: string;
}

export default function MindmapDocHeader({ slug }: MindmapDocHeaderProps) {
    const [mindmapData, setMindmapData] = useState<any>(null);
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

    useEffect(() => {
        if (slug.startsWith('mindmaps/surah-')) {
            const surahId = parseInt(slug.replace('mindmaps/surah-', ''));
            if (!isNaN(surahId)) {
                setMindmapData({ 
                    type: 'surah', 
                    id: surahId, 
                    data: getMindMap(surahId),
                    templateUrl: `/assets/premade-mindmaps/surah-${surahId}.tldraw`
                });
            }
        } else if (slug.startsWith('mindmaps/part-')) {
            const partId = parseInt(slug.replace('mindmaps/part-', '')) as QuranPart;
            if (!isNaN(partId)) {
                setMindmapData({ 
                    type: 'part', 
                    id: partId, 
                    data: getPartMindMap(partId),
                    templateUrl: `/assets/premade-mindmaps/part-${partId}.tldraw`
                });
            }
        }
    }, [slug]);

    if (!mindmapData) {
        return null;
    }

    const hasContent = mindmapData.templateUrl || 
                      (mindmapData.data && (mindmapData.data.imageUrl || mindmapData.data.tldrawSnapshot));

    if (!hasContent) {
        return null;
    }

    return (
        <MindmapViewer
            snapshot={mindmapData.data?.tldrawSnapshot}
            templateUrl={mindmapData.templateUrl}
            imageUrl={mindmapData.data?.imageUrl}
            imageUrlDark={mindmapData.data?.imageUrlDark}
            isDark={isDark}
            title={mindmapData.type === 'surah' ? `Surah ${mindmapData.id} Mindmap` : `Part ${mindmapData.id} Mindmap`}
            height={400}
            style={{ marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}
        />
    );
}
