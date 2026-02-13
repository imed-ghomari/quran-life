import React from 'react';
import { AlertTriangle } from 'lucide-react';
import ModalWindow from '@/components/ui/ModalWindow';

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
    return (
        <ModalWindow
            isOpen={isOpen}
            onClose={onCancel}
            closeOnBackdropClick={!isProcessing}
            maxWidthClassName="max-w-[500px]"
            header={
                <div className="flex items-start gap-5">
                    <div className={`shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center ${isDestructive ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-[var(--accent)]/10 text-[var(--accent)]'}`}>
                        {isProcessing ? (
                            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <AlertTriangle size={22} />
                        )}
                    </div>
                    <h3 className="text-[1.1rem] font-semibold text-[var(--foreground)] leading-7 mt-1">{title}</h3>
                </div>
            }
            body={
                <p className="text-[0.95rem] text-[var(--foreground-secondary)] leading-7">
                    {message}
                </p>
            }
            footer={
                <>
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
                </>
            }
        />
    );
}
