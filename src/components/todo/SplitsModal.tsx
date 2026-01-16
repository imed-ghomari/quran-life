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
            <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true">
                {/* Backdrop */}
                <div
                    className={`fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
                    onClick={onClose}
                    aria-hidden="true"
                />

                {/* Mobile SlideOver Panel - Right Side */}
                <div
                    className={`relative w-[90%] max-w-sm h-full bg-[var(--background)] border-l border-[var(--border)] shadow-2xl transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
                >
                    <div className="flex flex-col h-full">
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
                            <h2 className="text-lg font-bold tracking-tight">Edit Splits</h2>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-full hover:bg-[var(--background-secondary)] transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content Scrollable */}
                        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
                            {/* Wrapper to ensure content fits properly */}
                            <div className="min-h-full pb-10">
                                <MobileAnchorBuilder
                                    surahId={surahId}
                                    verseCount={verseCount}
                                    builderState={builderState}
                                    mindmapImageUrl={mindmapImageUrl || null}
                                    onAddBreak={onAddBreak}
                                    onRemoveBreak={onRemoveBreak}
                                    onSave={() => { onSave(); onClose(); }}
                                    hasReviewedHistory={hasReviewedHistory}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Desktop: Breathable Centered Modal
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-8" role="dialog" aria-modal="true">
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Modal */}
            <div
                className={`
                    relative w-full max-w-4xl max-h-[85vh] 
                    bg-[var(--background)] border border-[var(--border)] 
                    rounded-2xl shadow-2xl transform transition-all duration-300 
                    ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
                `}
            >
                <div className="flex flex-col h-full max-h-[85vh]">
                    {/* Header */}
                    <div className="flex items-center justify-between px-10 py-6 border-b border-[var(--border)]">
                        <div>
                            <h2 className="text-xl font-bold tracking-tight">Splits Configuration</h2>
                            <p className="text-sm text-[var(--foreground-secondary)] mt-1">Adjust anchor points for optimal memorization</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-[var(--background-secondary)] transition-colors"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    {/* Content - Breathable Padding */}
                    <div className="flex-1 overflow-y-auto p-10 flex flex-col gap-6">
                        {/* Mindmap Preview - Only if available */}
                        {(mindmapImageUrl || snapshot) && (
                            <div className="border border-[var(--border)] rounded-lg overflow-hidden h-[300px] shrink-0 relative bg-[var(--background-secondary)]">
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
                            onSave={() => { onSave(); onClose(); }}
                            hasReviewedHistory={hasReviewedHistory}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
