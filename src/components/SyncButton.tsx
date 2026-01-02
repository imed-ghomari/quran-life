'use client';

import React, { useState } from 'react';
import { Cloud, RefreshCw } from 'lucide-react';
import { syncWithCloud, SyncResult } from '@/lib/sync';

interface SyncButtonProps {
    className?: string;
    showLabel?: boolean;
    onSyncComplete?: () => void;
}

export default function SyncButton({ className, showLabel = true, onSyncComplete }: SyncButtonProps) {
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
    const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');

    const handleSync = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (isSyncing) return;

        setIsSyncing(true);
        setSyncStatus('idle');
        try {
            const result = await syncWithCloud();
            setSyncResult(result);
            setSyncStatus(result.status === 'success' ? 'success' : 'error');

            if (result.status === 'success') {
                window.dispatchEvent(new Event('storage'));
                if (onSyncComplete) onSyncComplete();
            }
        } catch (e) {
            console.error('Manual sync failed', e);
            setSyncStatus('error');
        } finally {
            setIsSyncing(false);
            setTimeout(() => {
                if (syncStatus !== 'error') setSyncStatus('idle');
            }, 3000);
        }
    };

    return (
        <button
            onClick={handleSync}
            disabled={isSyncing}
            className={className}
            title={syncStatus === 'error' ? (syncResult?.message || 'Sync Failed') : 'Sync Data'}
            style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: syncStatus === 'error' ? '#ef4444' : (syncStatus === 'success' ? '#10b981' : 'inherit'),
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: 0
            }}
        >
            <span className="nav-icon" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Cloud
                    size={24}
                    style={{
                        display: isSyncing ? 'none' : 'block',
                        color: syncStatus === 'success' ? '#10b981' : 'currentColor'
                    }}
                />
                <RefreshCw
                    size={24}
                    style={{
                        display: isSyncing ? 'block' : 'none',
                        animation: 'spin 1s linear infinite',
                        color: 'var(--accent)'
                    }}
                />
                {syncStatus === 'error' && (
                    <span className="nav-status-dot" style={{ background: '#ef4444', position: 'absolute', top: 0, right: 0, width: 8, height: 8, borderRadius: '50%' }}></span>
                )}
            </span>
            {showLabel && <span>{isSyncing ? 'Syncing' : 'Sync'}</span>}
        </button>
    );
}

// Ensure global animation keyframes exist (idempotent injection)
if (typeof document !== 'undefined') {
    const styleId = 'spin-animation-style';
    if (!document.getElementById(styleId)) {
        const styleSheet = document.createElement("style");
        styleSheet.id = styleId;
        styleSheet.innerText = `
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(styleSheet);
    }
}
