'use client';

import React, { useEffect, useState } from 'react';
import { getMindMap, getPartMindMap } from '@/lib/storage';
import MindmapViewer from '@/components/MindmapViewer';
import { QuranPart } from '@/lib/types';

interface MindmapDocHeaderProps {
    slug: string;
}

export default function MindmapDocHeader({ slug }: MindmapDocHeaderProps) {
    const [mindmapData, setMindmapData] = useState<any>(null);
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        setIsDark(mq.matches);
        const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    useEffect(() => {
        if (slug.startsWith('mindmaps/surah-')) {
            const surahId = parseInt(slug.replace('mindmaps/surah-', ''));
            if (!isNaN(surahId)) {
                setMindmapData({ type: 'surah', id: surahId, data: getMindMap(surahId) });
            }
        } else if (slug.startsWith('mindmaps/part-')) {
            const partId = parseInt(slug.replace('mindmaps/part-', '')) as QuranPart;
            if (!isNaN(partId)) {
                setMindmapData({ type: 'part', id: partId, data: getPartMindMap(partId) });
            }
        }
    }, [slug]);

    if (!mindmapData || !mindmapData.data || (!mindmapData.data.imageUrl && !mindmapData.data.tldrawSnapshot)) {
        return null;
    }

    return (
        <div style={{ marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
            <MindmapViewer
                snapshot={mindmapData.data.tldrawSnapshot}
                imageUrl={mindmapData.data.imageUrl}
                imageUrlDark={mindmapData.data.imageUrlDark}
                isDark={isDark}
                title={mindmapData.type === 'surah' ? `Surah ${mindmapData.id} Mindmap` : `Part ${mindmapData.id} Mindmap`}
                height={400}
            />
        </div>
    );
}
