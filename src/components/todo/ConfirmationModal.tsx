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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                onClick={!isProcessing ? onCancel : undefined}
            />
            
            {/* Modal */}
            <div className="relative w-full max-w-2xl bg-[var(--background)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="px-8 pt-7 pb-3">
                    <div className="flex gap-6 items-start">
                        <div className={`shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center ${isDestructive ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-[var(--accent)]/10 text-[var(--accent)]'}`}>
                            {isProcessing ? (
                                <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <AlertTriangle size={26} />
                            )}
                        </div>
                        <h3 className="text-lg font-bold text-[var(--foreground)] mt-1">{title}</h3>
                    </div>
                </div>
                <div className="px-8 pb-7">
                    <p className="text-sm text-[var(--foreground-secondary)] leading-relaxed">
                        {message}
                    </p>
                </div>

                <div className="bg-[var(--background-secondary)] px-8 py-5 flex flex-wrap justify-end gap-4 border-t border-[var(--border)]">
                    {showCancel && (
                        <button 
                            onClick={onCancel}
                            disabled={isProcessing}
                            className="btn btn-secondary"
                            style={{ padding: '0.55rem 1rem', fontSize: '0.85rem' }}
                        >
                            {cancelLabel}
                        </button>
                    )}
                    <button 
                        onClick={onConfirm}
                        disabled={isProcessing}
                        className={`btn ${isDestructive ? 'btn-danger' : 'btn-primary'}`}
                        style={{ padding: '0.6rem 1.05rem', fontSize: '0.85rem' }}
                    >
                        {isProcessing && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        {isProcessing ? 'Processing...' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
