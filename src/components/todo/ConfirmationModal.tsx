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
            maxWidthClassName="max-w-[980px]"
            headerClassName="px-8 py-6 sm:px-10 sm:py-7"
            bodyClassName="px-8 py-7 sm:px-10 sm:py-8"
            footerClassName="gap-4 px-8 py-5 sm:px-10 sm:py-6"
            header={
                <div className="flex items-start gap-5 sm:gap-6">
                    <div className={`shrink-0 flex h-16 w-16 items-center justify-center rounded-3xl ${isDestructive ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-[var(--accent)]/10 text-[var(--accent)]'}`}>
                        {isProcessing ? (
                            <div className="h-6 w-6 rounded-full border-2 border-current border-t-transparent animate-spin" />
                        ) : (
                            <AlertTriangle size={28} />
                        )}
                    </div>
                    <h3 className="mt-2 text-xl font-bold text-[var(--foreground)]">{title}</h3>
                </div>
            }
            body={
                <div className="min-h-[7.5rem] sm:min-h-[8.5rem]">
                    <p className="whitespace-pre-line text-base leading-8 text-[var(--foreground-secondary)]">
                        {message}
                    </p>
                </div>
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
