"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import ConfirmationModal from './todo/ConfirmationModal';

export interface ConfirmOptions {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    isDestructive?: boolean;
}

export interface AlertOptions {
    title?: string;
    message: string;
    confirmLabel?: string;
}

type DialogState =
    | (ConfirmOptions & { type: 'confirm'; resolve: (value: boolean) => void })
    | (AlertOptions & { type: 'alert'; resolve: () => void });

interface ConfirmDialogContextValue {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
    alert: (options: AlertOptions) => Promise<void>;
}

const ConfirmDialogContext = createContext<ConfirmDialogContextValue | null>(null);

export function useConfirmDialog(): ConfirmDialogContextValue {
    const ctx = useContext(ConfirmDialogContext);
    if (!ctx) {
        throw new Error('useConfirmDialog must be used within ConfirmDialogProvider');
    }
    return ctx;
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
    const [dialog, setDialog] = useState<DialogState | null>(null);

    const confirm = useCallback((options: ConfirmOptions) => {
        return new Promise<boolean>((resolve) => {
            setDialog({ type: 'confirm', ...options, resolve });
        });
    }, []);

    const alert = useCallback((options: AlertOptions) => {
        return new Promise<void>((resolve) => {
            setDialog({ type: 'alert', ...options, resolve });
        });
    }, []);

    const value = useMemo(() => ({ confirm, alert }), [confirm, alert]);

    const handleConfirm = () => {
        if (!dialog) return;
        if (dialog.type === 'confirm') {
            dialog.resolve(true);
        } else {
            dialog.resolve();
        }
        setDialog(null);
    };

    const handleCancel = () => {
        if (!dialog) return;
        if (dialog.type === 'confirm') {
            dialog.resolve(false);
        } else {
            dialog.resolve();
        }
        setDialog(null);
    };

    return (
        <ConfirmDialogContext.Provider value={value}>
            {children}
            {dialog && (
                <ConfirmationModal
                    isOpen={!!dialog}
                    title={dialog.title ?? 'Notice'}
                    message={dialog.message}
                    confirmLabel={dialog.confirmLabel ?? (dialog.type === 'confirm' ? 'Confirm' : 'OK')}
                    cancelLabel={dialog.type === 'confirm' ? dialog.cancelLabel ?? 'Cancel' : undefined}
                    showCancel={dialog.type === 'confirm'}
                    isDestructive={dialog.type === 'confirm' ? dialog.isDestructive : false}
                    onConfirm={handleConfirm}
                    onCancel={handleCancel}
                />
            )}
        </ConfirmDialogContext.Provider>
    );
}
