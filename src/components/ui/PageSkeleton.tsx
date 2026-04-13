import React from 'react';
import ProgressLoader from './ProgressLoader';
import Spinner from './Spinner';

interface PageSkeletonProps {
    type?: 'mindmap' | 'generic';
    text?: string;
}

export default function PageSkeleton({ type = 'generic', text }: PageSkeletonProps) {
    // Unified minimalist progress loader for all page types
    const loadingText = text || (
        type === 'mindmap' ? 'Loading mindmap...' : 'Loading...'
    );

    // For mindmap, a circular one is better as it's usually inside a card
    if (type === 'mindmap') {
        return (
            <div className="w-full h-full min-h-[400px] flex items-center justify-center bg-[var(--background-secondary)]/5 rounded-2xl border border-[var(--border)]/30">
                <ProgressLoader type="circular" size={32} text={loadingText} />
            </div>
        );
    }

    // For everything else, use the same spinner treatment as route transitions.
    return (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-[var(--background)] z-[100] px-6">
            <Spinner size={24} text={loadingText} />
        </div>
    );
}
