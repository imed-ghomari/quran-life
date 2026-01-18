import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmationModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
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
    isDestructive = false,
    isProcessing = false,
    onConfirm,
    onCancel
}: ConfirmationModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                onClick={!isProcessing ? onCancel : undefined}
            />
            
            {/* Modal */}
            <div className="relative w-full max-w-md bg-[var(--background)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="p-6">
                    <div className="flex gap-4">
                        <div className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${isDestructive ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-[var(--accent)]/10 text-[var(--accent)]'}`}>
                            {isProcessing ? (
                                <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <AlertTriangle size={24} />
                            )}
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-bold text-[var(--foreground)] mb-2">{title}</h3>
                            <p className="text-sm text-[var(--foreground-secondary)] leading-relaxed">
                                {message}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="bg-[var(--background-secondary)] px-6 py-4 flex justify-end gap-3 border-t border-[var(--border)]">
                    <button 
                        onClick={onCancel}
                        disabled={isProcessing}
                        className="px-4 py-2 text-sm font-medium text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {cancelLabel}
                    </button>
                    <button 
                        onClick={onConfirm}
                        disabled={isProcessing}
                        className={`px-4 py-2 text-sm font-bold text-white rounded-lg shadow-sm transition-all flex items-center gap-2 ${
                            isDestructive 
                                ? 'bg-[var(--danger)] hover:bg-red-600' 
                                : 'bg-[var(--accent)] hover:brightness-110'
                        } disabled:opacity-70 disabled:cursor-not-allowed`}
                    >
                        {isProcessing && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        {isProcessing ? 'Processing...' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
