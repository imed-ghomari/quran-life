import React from 'react';

interface ModalWindowProps {
    isOpen: boolean;
    onClose?: () => void;
    closeOnBackdropClick?: boolean;
    maxWidthClassName?: string;
    header?: React.ReactNode;
    body?: React.ReactNode;
    footer?: React.ReactNode;
    children?: React.ReactNode;
}

export default function ModalWindow({
    isOpen,
    onClose,
    closeOnBackdropClick = true,
    maxWidthClassName = 'max-w-[500px]',
    header,
    body,
    footer,
    children,
}: ModalWindowProps) {
    if (!isOpen) return null;

    const handleBackdropClick = () => {
        if (!closeOnBackdropClick) return;
        onClose?.();
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[4px] [padding-bottom:calc(1rem+env(safe-area-inset-bottom))]">
            <div className="absolute inset-0" onClick={handleBackdropClick} />
            <div
                className={`relative flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)] shadow-[0_10px_25px_rgba(0,0,0,0.2)] max-[480px]:max-h-[calc(100vh-1.5rem)] max-[480px]:max-w-[95%] ${maxWidthClassName}`}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                {header ? (
                    <div className="border-b border-[var(--border)] px-6 py-4 max-[480px]:px-4 max-[480px]:py-3">
                        {header}
                    </div>
                ) : null}
                {body ? (
                    <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-6 py-6 max-[480px]:gap-4 max-[480px]:px-4 max-[480px]:py-4">
                        {body}
                    </div>
                ) : null}
                {footer ? (
                    <div className="flex justify-end gap-3 border-t border-[var(--border)] bg-[var(--background-secondary)] px-6 py-4 max-[480px]:px-4 max-[480px]:py-3">
                        {footer}
                    </div>
                ) : null}
                {children}
            </div>
        </div>
    );
}
