import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface SlideOverProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    rootClassName?: string;
    panelClassName?: string;
    headerClassName?: string;
    titleClassName?: string;
    closeClassName?: string;
    contentClassName?: string;
}

export default function SlideOver({
    isOpen,
    onClose,
    title,
    children,
    rootClassName,
    panelClassName,
    headerClassName,
    titleClassName,
    closeClassName,
    contentClassName
}: SlideOverProps) {
    const [visible, setVisible] = useState(isOpen);

    useEffect(() => {
        if (isOpen) {
            setVisible(true);
            document.body.style.overflow = 'hidden';
        } else {
            const timer = setTimeout(() => setVisible(false), 300); // Wait for transition
            document.body.style.overflow = 'unset';
            return () => clearTimeout(timer);
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [isOpen]);

    if (!visible && !isOpen) return null;

    return (
        <div className={`fixed inset-0 z-50 flex justify-end ${rootClassName ?? ''}`.trim()} role="dialog" aria-modal="true">
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Panel */}
            <div
                className={`relative w-full max-w-2xl h-full bg-[var(--background)] border-l border-[var(--border)] shadow-2xl transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'} ${panelClassName ?? ''}`.trim()}
            >
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className={`flex items-center justify-between px-10 py-6 border-b border-[var(--border)] ${headerClassName ?? ''}`.trim()}>
                        <h2 className={`text-xl font-bold tracking-tight ${titleClassName ?? ''}`.trim()}>{title}</h2>
                        <button
                            onClick={onClose}
                            className={`p-2 rounded-full hover:bg-[var(--background-secondary)] transition-colors ${closeClassName ?? ''}`.trim()}
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Content */}
                    <div
                        className={`flex-1 overflow-y-auto px-10 py-8 ${contentClassName ?? ''}`.trim()}
                        style={{ paddingBottom: 'calc(2rem + var(--mobile-bottom-toolbar-offset, 0px))' }}
                    >
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
