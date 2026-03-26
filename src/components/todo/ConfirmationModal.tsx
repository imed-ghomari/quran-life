import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
    disabled?: boolean;
    children?: React.ReactNode;
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
    disabled = false,
    children,
    onConfirm,
    onCancel
}: ConfirmationModalProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const previousBodyOverflow = useRef<string>('');

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (!isMounted) return;
        if (isOpen) {
            setIsVisible(true);
            previousBodyOverflow.current = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
        } else {
            const timer = setTimeout(() => setIsVisible(false), 300);
            document.body.style.overflow = previousBodyOverflow.current;
            return () => clearTimeout(timer);
        }
        return () => { document.body.style.overflow = previousBodyOverflow.current; };
    }, [isMounted, isOpen]);

    if (!isMounted || (!isVisible && !isOpen)) return null;

    const showcontent = isOpen;

    const modal = (
        <div
            className={`fixed inset-0 z-[30000] flex items-center justify-center p-4 transition-all duration-300 ${showcontent ? 'opacity-100' : 'opacity-0'}`}
            role="dialog"
            aria-modal="true"
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
                onClick={!isProcessing ? onCancel : undefined}
            />

            {/* Modal Content */}
            <div
                className={`
                    confirm-dialog relative w-full max-w-[560px]
                    bg-[var(--background)] 
                    border border-[var(--border)] 
                    rounded-2xl shadow-2xl 
                    overflow-hidden 
                    flex flex-col
                    transform transition-all duration-300 
                    ${showcontent ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}
                `}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="confirm-dialog-header flex items-center px-7 py-5 sm:px-8 sm:py-6 border-b border-[var(--border)]">
                    <div className="confirm-dialog-title-wrap flex items-center">
                        <div
                            className={`
                                confirm-dialog-icon shrink-0 rounded-full flex items-center justify-center
                                ${isDestructive
                                    ? 'bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400'
                                    : 'bg-[var(--accent)]/10 text-[var(--accent)]'}
                            `}
                        >
                            <AlertTriangle size={22} strokeWidth={2} />
                        </div>
                        <h3 className="text-lg font-bold text-[var(--foreground)]">
                            {title}
                        </h3>
                    </div>
                </div>

                {/* Body */}
                <div className="confirm-dialog-body px-7 py-7 sm:px-8 sm:py-8">
                    <p className="confirm-dialog-message whitespace-pre-line text-[var(--foreground-secondary)] text-base sm:text-[1.02rem] leading-relaxed pt-1 pr-1">
                        {message}
                    </p>
                    {children ? (
                        <div className="mt-5">
                            {children}
                        </div>
                    ) : null}
                </div>

                {/* Footer */}
                <div className="confirm-dialog-footer flex items-center justify-end px-7 py-5 sm:px-8 sm:py-6 gap-3 sm:gap-4 bg-[var(--background-secondary)] border-t border-[var(--border)]">
                    {showCancel && (
                        <button
                            onClick={onCancel}
                            disabled={isProcessing}
                            className="btn std-normal-btn"
                        >
                            {cancelLabel}
                        </button>
                    )}
                    <button
                        onClick={onConfirm}
                        disabled={disabled || isProcessing}
                        className={`
                            btn std-normal-btn
                            ${isDestructive ? 'std-normal-danger' : 'btn-primary'}
                        `}
                    >
                        {isProcessing ? 'Processing...' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modal, document.body);
}
