import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmationModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    showCancel?: boolean;
    isDestructive?: boolean;
    isProcessing?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmationModal({
    isOpen,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    showCancel = true,
    isDestructive = false,
    isProcessing = false,
    onConfirm,
    onCancel
}: ConfirmationModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6 sm:px-8">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                onClick={!isProcessing ? onCancel : undefined}
            />
            
            {/* Modal */}
            <div className="relative w-full max-w-5xl bg-[var(--background)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="px-8 pt-7 pb-4 sm:px-10 sm:pt-8 sm:pb-5">
                    <div className="flex gap-5 sm:gap-6 items-start">
                        <div className={`shrink-0 w-16 h-16 rounded-3xl flex items-center justify-center ${isDestructive ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-[var(--accent)]/10 text-[var(--accent)]'}`}>
                            {isProcessing ? (
                                <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <AlertTriangle size={28} />
                            )}
                        </div>
                        <h3 className="text-xl font-bold text-[var(--foreground)] mt-2">{title}</h3>
                    </div>
                </div>
                <div className="px-8 pb-8 sm:px-10 sm:pb-9">
                    <p className="text-base text-[var(--foreground-secondary)] leading-8">
                        {message}
                    </p>
                </div>

                <div className="bg-[var(--background-secondary)] px-8 py-5 sm:px-10 sm:py-6 flex flex-wrap justify-end gap-4 border-t border-[var(--border)]">
                    {showCancel && (
                        <button 
                            onClick={onCancel}
                            disabled={isProcessing}
                            className="btn std-normal-btn"
                            style={{ padding: '0.55rem 1.15rem', fontSize: '0.85rem', minWidth: '8.5rem' }}
                        >
                            {cancelLabel}
                        </button>
                    )}
                    <button 
                        onClick={onConfirm}
                        disabled={isProcessing}
                        className={`btn std-normal-btn ${isDestructive ? 'std-normal-danger' : ''}`}
                        style={{ padding: '0.6rem 1.2rem', fontSize: '0.85rem', minWidth: '8.5rem' }}
                    >
                        {isProcessing && <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                        {isProcessing ? 'Processing...' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
