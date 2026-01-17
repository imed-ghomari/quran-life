'use client';

import { useContext } from 'react';
import { RefreshCw, Cloud, CloudOff, AlertTriangle, Check, Upload, Download } from 'lucide-react';
import { OnlineStatusContext } from './Providers';
import { useSyncState, SyncStatus as SyncStatusType } from '@/hooks/useSyncState';
import ThemeToggle from './ThemeToggle';

interface SyncStatusProps {
    variant: 'mobile' | 'desktop';
    onConflictClick?: () => void;
}

export default function SyncStatus({ variant, onConflictClick }: SyncStatusProps) {
    const isOnline = useContext(OnlineStatusContext);
    const { status, pendingChangesCount, lastSyncedAt, isAuthenticated, triggerSync, conflict } = useSyncState();

    // Determine display status based on context
    const displayStatus: SyncStatusType = !isOnline ? 'offline' : status;

    // Status text mapping
    const getStatusText = (): string => {
        switch (displayStatus) {
            case 'offline':
                return pendingChangesCount > 0
                    ? 'Offline • Pending changes'
                    : 'Offline';
            case 'syncing':
                return 'Syncing...';
            case 'synced':
                return pendingChangesCount > 0
                    ? 'Unsynced changes'
                    : 'Up to date';
            case 'conflict':
                return 'Conflict detected';
            case 'needs_push':
                return 'Unsynced changes';
            case 'needs_pull':
                return 'Update available';
            case 'error':
                return 'Sync failed';
            default:
                return isAuthenticated ? 'Up to date' : 'Sign in to sync';
        }
    };

    // Status icon
    const getStatusIcon = () => {
        const iconSize = variant === 'mobile' ? 18 : 16;

        switch (displayStatus) {
            case 'offline':
                return <CloudOff size={iconSize} />;
            case 'syncing':
                return <RefreshCw size={iconSize} className="sync-spinning" />;
            case 'synced':
                return <Check size={iconSize} />;
            case 'conflict':
                return <AlertTriangle size={iconSize} />;
            case 'needs_push':
                return <Upload size={iconSize} />;
            case 'needs_pull':
                return <Download size={iconSize} />;
            case 'error':
                return <AlertTriangle size={iconSize} />;
            default:
                return <Cloud size={iconSize} />;
        }
    };

    // Status color
    const getStatusColor = (): string => {
        switch (displayStatus) {
            case 'offline':
                return 'var(--foreground-secondary)';
            case 'synced':
                return 'var(--success)';
            case 'conflict':
            case 'error':
                return 'var(--danger)';
            case 'needs_push':
            case 'needs_pull':
                return 'var(--warning)';
            case 'syncing':
                return 'var(--accent)';
            default:
                return 'var(--foreground-secondary)';
        }
    };

    const handleClick = () => {
        if (displayStatus === 'conflict' && onConflictClick) {
            onConflictClick();
        } else if (!['offline', 'syncing'].includes(displayStatus) && isAuthenticated) {
            triggerSync();
        }
    };

    const isClickable = isAuthenticated && !['offline', 'syncing'].includes(displayStatus);

    if (variant === 'mobile') {
        return (
            <div
                className="sync-status-mobile"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 1rem',
                    background: 'var(--background-secondary)',
                    borderBottom: '1px solid var(--border)',
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    width: '100%',
                    zIndex: 100,
                }}
            >
                <ThemeToggle variant="mobile" />

                <button
                    onClick={handleClick}
                    disabled={!isClickable}
                    className="sync-btn"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        padding: '0.4rem 0.8rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: displayStatus === 'conflict' ? 'var(--danger)' : 'var(--background)',
                        color: displayStatus === 'conflict' ? 'white' : getStatusColor(),
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: isClickable ? 'pointer' : 'default',
                        opacity: isClickable ? 1 : 0.7,
                        transition: 'all 0.2s ease',
                    }}
                >
                    {getStatusIcon()}
                    <span>{getStatusText()}</span>
                </button>
            </div>
        );
    }

    // Desktop variant - compact for sidebar
    return (
        <button
            onClick={handleClick}
            disabled={!isClickable}
            className="sync-status-desktop nav-item"
            title={getStatusText()}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                padding: '0.65rem 0.5rem',
                width: '100%',
                color: getStatusColor(),
                border: 'none',
                background: 'transparent',
                cursor: isClickable ? 'pointer' : 'default',
                transition: 'all 0.2s ease',
                borderRadius: '12px',
            }}
        >
            <span className="nav-icon" style={{ position: 'relative' }}>
                {getStatusIcon()}
                {(displayStatus === 'conflict') && (
                    <span
                        className="nav-badge"
                        style={{
                            position: 'absolute',
                            top: '-4px',
                            right: '-8px',
                            background: 'var(--danger)',
                            color: 'white',
                            fontSize: '0.6rem',
                            fontWeight: 700,
                            padding: '1px 4px',
                            borderRadius: '6px',
                            minWidth: '14px',
                            textAlign: 'center',
                        }}
                    >
                        !
                    </span>
                )}
            </span>
            <span style={{
                fontSize: '0.6rem',
                fontWeight: 600,
                marginTop: '1px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '70px',
                opacity: 0.8
            }}>
                {displayStatus === 'syncing' ? 'Syncing' : (pendingChangesCount > 0 ? 'Unsynced' : (displayStatus === 'offline' ? 'Offline' : (isAuthenticated ? 'Up to date' : 'Sign In')))}
            </span>
        </button>
    );
}
