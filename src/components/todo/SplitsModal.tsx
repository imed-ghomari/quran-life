'use client';

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { DesktopAnchorBuilder, MobileAnchorBuilder, AnchorBuilderState } from './AnchorBuilders';
import SlideOver from '../SlideOver'; // Using generic SlideOver for behavior consistency? Or replicating styles?
import MindmapViewer from '../MindmapViewer';

interface SplitsModalProps {
    isOpen: boolean;
    onClose: () => void;
    isMobile: boolean;
    surahId: number;
    verseCount: number;
    builderState: AnchorBuilderState;
    mindmapImageUrl?: string | null;
    mindmapImageUrlDark?: string | null;
    snapshot?: any;
    isDark?: boolean;
    onAddBreak: (val: number) => void;
    onRemoveBreak: (val: number) => void;
    onSave: () => void;
    hasReviewedHistory: boolean;
}

export default function SplitsModal({
    isOpen,
    onClose,
    isMobile,
    surahId,
    verseCount,
    builderState,
    mindmapImageUrl,
    mindmapImageUrlDark,
    snapshot,
    isDark,
    onAddBreak,
    onRemoveBreak,
    onSave,
    hasReviewedHistory
}: SplitsModalProps) {
    const [visible, setVisible] = useState(isOpen);

    useEffect(() => {
        if (isOpen) {
            setVisible(true);
            document.body.style.overflow = 'hidden';
        } else {
            const timer = setTimeout(() => setVisible(false), 300);
            document.body.style.overflow = 'unset';
            return () => clearTimeout(timer);
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [isOpen]);

    if (!visible && !isOpen) return null;

    // Mobile: Full SlideOver Presentation
    if (isMobile) {
        return (
            <SlideOver
                isOpen={isOpen}
                onClose={onClose}
                title="Splits Configuration"
                headerClassName="px-5 py-4"
                contentClassName="px-4 py-4 overflow-x-hidden"
            >
                <div className="min-h-full pb-10">
                    <MobileAnchorBuilder
                        surahId={surahId}
                        verseCount={verseCount}
                        builderState={builderState}
                        mindmapImageUrl={mindmapImageUrl || null}
                        mindmapImageUrlDark={mindmapImageUrlDark || null}
                        snapshot={snapshot}
                        isDark={isDark}
                        showMindmapPreview={true}
                        onAddBreak={onAddBreak}
                        onRemoveBreak={onRemoveBreak}
                        onSave={() => { onSave(); onClose(); }}
                        hasReviewedHistory={hasReviewedHistory}
                    />
                </div>
            </SlideOver>
        );
    }
return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
        {/* Backdrop */}
        <div
            className={`fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'
                }`}
            onClick={onClose}
            aria-hidden="true"
        />

        {/* Modal */}
        <div
            className={`
                relative w-2xl 
                max-h-[calc(100vh-4rem)]
                mx-auto
                bg-[var(--background)]
                border border-[var(--border)]
                rounded-2xl
                shadow-2xl
                overflow-hidden
                flex flex-col
                transform transition-all duration-300
                ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
            `}
        >
           
            {/* Header */}
<div className="flex items-start justify-between px-6 pt-5 pb-4 gap-4" style={{ paddingLeft: '16px', paddingRight: '14px', paddingTop: '17px' }}>
    <div className="flex-1">
        <h2 className="text-xl font-bold tracking-tight text-[var(--foreground)]">
            Splits Configuration
        </h2>
        <p className="text-sm text-[var(--foreground-secondary)] mt-1 !mb-3">
            Adjust split points for optimal memorization
        </p>
    </div>

    <button
        onClick={onClose}
        className="p-2 rounded-lg hover:bg-[var(--background-secondary)] transition-colors flex-shrink-0 ml-4 cursor-pointer"
    >
        <X size={22} />
    </button>
</div>
 <br></br>
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col ">
                {(mindmapImageUrl || snapshot) && (
                    <div className="border border-[var(--border)] rounded-lg overflow-hidden h-[280px] bg-[var(--background-secondary)]">
                        <MindmapViewer
                            snapshot={snapshot}
                            imageUrl={mindmapImageUrl}
                            imageUrlDark={mindmapImageUrlDark}
                            isDark={isDark || false}
                            title="Reference Map"
                            height="100%"
                        />
                    </div>
                )}

                <DesktopAnchorBuilder
                    surahId={surahId}
                    verseCount={verseCount}
                    builderState={builderState}
                    onAddBreak={onAddBreak}
                    onRemoveBreak={onRemoveBreak}
                    onSave={() => {
                        onSave();
                        onClose();
                    }}
                    hasReviewedHistory={hasReviewedHistory}
                />
            </div>
        </div>
    </div>
);
}
