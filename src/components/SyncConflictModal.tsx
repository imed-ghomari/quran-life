'use client';

import { useState } from 'react';
import { AlertTriangle, Upload, Download, X, ChevronDown, ChevronRight } from 'lucide-react';
import { ConflictInfo, ChangeDetail } from '@/lib/sync';

interface SyncConflictModalProps {
    conflict: ConflictInfo;
    onResolve: (choice: 'local' | 'remote') => void;
    onCancel: () => void;
}

function ChangeDetailItem({ change, side }: { change: ChangeDetail; side: 'local' | 'remote' }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const hasItems = change.items && change.items.length > 0;

    return (
        <div
            className="conflict-change-item"
            style={{
                background: 'var(--background)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                marginBottom: '0.5rem',
                overflow: 'hidden',
            }}
        >
            <div
                onClick={() => hasItems && setIsExpanded(!isExpanded)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.6rem 0.75rem',
                    cursor: hasItems ? 'pointer' : 'default',
                    transition: 'background 0.2s',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {hasItems && (
                        isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                    )}
                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{change.category}</span>
                    <span
                        style={{
                            background: side === 'local' ? 'var(--accent)' : 'var(--success)',
                            color: 'white',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                        }}
                    >
                        {change.count}
                    </span>
                </div>
                <span style={{ color: 'var(--foreground-secondary)', fontSize: '0.8rem' }}>
                    {change.description}
                </span>
            </div>

            {hasItems && isExpanded && (
                <div
                    style={{
                        padding: '0.5rem 0.75rem',
                        paddingTop: 0,
                        borderTop: '1px solid var(--border)',
                        background: 'var(--verse-bg)',
                    }}
                >
                    <ul style={{
                        margin: 0,
                        padding: '0.5rem 0 0 1.25rem',
                        fontSize: '0.8rem',
                        color: 'var(--foreground-secondary)',
                        maxHeight: '150px',
                        overflowY: 'auto',
                    }}>
                        {change.items!.map((item, idx) => (
                            <li key={idx} style={{ marginBottom: '0.25rem' }}>{item}</li>
                        ))}
                        {change.items!.length < change.count && (
                            <li style={{ fontStyle: 'italic', opacity: 0.7 }}>
                                ...and {change.count - change.items!.length} more
                            </li>
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
}

export default function SyncConflictModal({ conflict, onResolve, onCancel }: SyncConflictModalProps) {
    const formatTime = (timestamp: string) => {
        return new Date(timestamp).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    };

    return (
        <div
            className="sync-conflict-overlay"
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.6)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
                padding: '1rem',
            }}
            onClick={(e) => e.target === e.currentTarget && onCancel()}
        >
            <div
                className="sync-conflict-modal"
                style={{
                    background: 'var(--background-secondary)',
                    borderRadius: '16px',
                    maxWidth: '500px',
                    width: '100%',
                    maxHeight: '90vh',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
                }}
            >
                {/* Header */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '1rem 1.25rem',
                        borderBottom: '1px solid var(--border)',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div
                            style={{
                                background: 'var(--warning)',
                                color: 'white',
                                width: '36px',
                                height: '36px',
                                borderRadius: '10px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <AlertTriangle size={20} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Sync Conflict</h2>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--foreground-secondary)' }}>
                                Choose which version to keep
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onCancel}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--foreground-secondary)',
                            cursor: 'pointer',
                            padding: '0.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '8px',
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div
                    style={{
                        padding: '1.25rem',
                        overflowY: 'auto',
                        flex: 1,
                    }}
                >
                    <p style={{
                        margin: '0 0 1rem 0',
                        color: 'var(--foreground)',
                        fontSize: '0.9rem',
                        lineHeight: 1.5,
                    }}>
                        There is a conflict between data on this device and the cloud.
                        Both have changed since your last sync. You must choose which version to keep.
                    </p>

                    {/* Local Changes */}
                    <div style={{ marginBottom: '1.25rem' }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            marginBottom: '0.5rem',
                        }}>
                            <Upload size={16} style={{ color: 'var(--accent)' }} />
                            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>This Device</span>
                            <span style={{
                                fontSize: '0.75rem',
                                color: 'var(--foreground-secondary)',
                                marginLeft: 'auto',
                            }}>
                                {formatTime(conflict.localTimestamp)}
                            </span>
                        </div>
                        {conflict.localChanges.map((change, idx) => (
                            <ChangeDetailItem key={idx} change={change} side="local" />
                        ))}
                    </div>

                    {/* Remote Changes */}
                    <div style={{ marginBottom: '1rem' }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            marginBottom: '0.5rem',
                        }}>
                            <Download size={16} style={{ color: 'var(--success)' }} />
                            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Cloud</span>
                            <span style={{
                                fontSize: '0.75rem',
                                color: 'var(--foreground-secondary)',
                                marginLeft: 'auto',
                            }}>
                                {formatTime(conflict.remoteTimestamp)}
                            </span>
                        </div>
                        {conflict.remoteChanges.map((change, idx) => (
                            <ChangeDetailItem key={idx} change={change} side="remote" />
                        ))}
                    </div>

                    {/* Explanations */}
                    <div
                        style={{
                            background: 'var(--verse-bg)',
                            border: '1px solid var(--border)',
                            borderRadius: '10px',
                            padding: '0.85rem',
                            fontSize: '0.8rem',
                            lineHeight: 1.6,
                        }}
                    >
                        <p style={{ margin: '0 0 0.5rem 0' }}>
                            <strong>• Upload to Cloud:</strong> Keep this device{'\''}s data and overwrite the cloud.
                            You will lose any changes made on other devices since your last sync.
                        </p>
                        <p style={{ margin: 0 }}>
                            <strong>• Download from Cloud:</strong> Replace this device{'\''}s data with the cloud version.
                            You will lose any changes you made on this device since your last sync.
                        </p>
                    </div>
                </div>

                {/* Footer - Actions */}
                <div
                    style={{
                        display: 'flex',
                        gap: '0.75rem',
                        padding: '1rem 1.25rem',
                        borderTop: '1px solid var(--border)',
                        background: 'var(--background)',
                    }}
                >
                    <button
                        onClick={() => onResolve('local')}
                        className="btn"
                        style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            padding: '0.85rem',
                            borderRadius: '10px',
                            background: 'var(--accent)',
                            color: 'white',
                            border: 'none',
                            fontWeight: 600,
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                        }}
                    >
                        <Upload size={16} />
                        Upload to Cloud
                    </button>
                    <button
                        onClick={() => onResolve('remote')}
                        className="btn"
                        style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            padding: '0.85rem',
                            borderRadius: '10px',
                            background: 'var(--success)',
                            color: 'white',
                            border: 'none',
                            fontWeight: 600,
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                        }}
                    >
                        <Download size={16} />
                        Download from Cloud
                    </button>
                </div>
            </div>
        </div>
    );
}
