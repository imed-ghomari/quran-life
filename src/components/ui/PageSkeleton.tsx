import React from 'react';
import ProgressLoader from './ProgressLoader';

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

    // For everything else, a centered linear progress bar with full-page container
    return (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-[var(--background)] z-[100] px-6">
            <div className="w-full max-w-sm space-y-6">
                <div className="progress-bar-linear">
                    <div className="progress-bar-linear-inner" />
                </div>
                <p className="text-xs font-bold text-[var(--foreground-secondary)] text-center tracking-[0.2em] uppercase opacity-80">
                    {loadingText}
                </p>
            </div>
        </div>
    );
}
