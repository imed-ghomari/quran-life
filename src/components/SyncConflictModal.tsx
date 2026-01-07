'use client';

import { useState, useMemo } from 'react';
import { AlertTriangle, Upload, Download, X, ChevronDown, ChevronRight, Settings2, CheckCircle2, RotateCcw } from 'lucide-react';
import { ConflictInfo, ChangeDetail } from '@/lib/sync';
import { PART_NAMES } from '@/lib/types';

const CATEGORY_MAP: Record<string, string> = {
    'nodes review': 'Review Progress',
    'nodes module': 'Module Content',
    'surahs': 'Surah Status',
    'settings': 'App Settings',
    'anchors': 'Verse Splits',
};

function getHumanReadableCategory(category: string): string {
    return CATEGORY_MAP[category] || category;
}

interface SyncConflictModalProps {
    conflict: ConflictInfo;
    onResolve: (choice: 'local' | 'remote' | 'manual', manualChoices?: Record<string, 'local' | 'remote'>) => void;
    onCancel: () => void;
}

function ChangeDetailItem({
    change,
    side,
    isManualChoice = false,
    onChoice,
    currentChoice
}: {
    change: ChangeDetail;
    side: 'local' | 'remote' | 'both';
    isManualChoice?: boolean;
    onChoice?: (itemId: string, choice: 'local' | 'remote') => void;
    currentChoice?: Record<string, 'local' | 'remote'>;
}) {
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
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
            }}
        >
            <div
                onClick={() => hasItems && !isManualChoice && setIsExpanded(!isExpanded)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.6rem 0.75rem',
                    cursor: hasItems && !isManualChoice ? 'pointer' : 'default',
                    transition: 'background 0.2s',
                    background: side === 'both' ? 'var(--verse-bg)' : 'transparent',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {hasItems && !isManualChoice && (
                        isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                    )}
                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{getHumanReadableCategory(change.category)}</span>
                    <span
                        style={{
                            background: side === 'local' ? 'var(--accent)' : side === 'remote' ? 'var(--success)' : 'var(--warning)',
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
                {!isManualChoice && (
                    <span style={{ color: 'var(--foreground-secondary)', fontSize: '0.8rem' }}>
                        {change.description}
                    </span>
                )}
            </div>

            {isManualChoice && (
                <div style={{ padding: '0 0.75rem 0.75rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {change.itemIds.map((itemId, idx) => {
                        const itemName = change.items && change.items[idx] ? change.items[idx] : itemId;
                        const choice = currentChoice?.[itemId] || 'remote';

                        return (
                            <div key={itemId} style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: 'var(--background)',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '8px',
                                border: '1px solid var(--border)',
                            }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--foreground)' }}>{itemName}</span>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                        onClick={() => onChoice?.(itemId, 'local')}
                                        style={{
                                            background: choice === 'local' ? 'var(--accent)' : 'var(--background-secondary)',
                                            color: choice === 'local' ? 'white' : 'var(--foreground-secondary)',
                                            border: '1px solid ' + (choice === 'local' ? 'var(--accent)' : 'var(--border)'),
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            fontSize: '0.7rem',
                                            cursor: 'pointer',
                                            fontWeight: 600,
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        Device
                                    </button>
                                    <button
                                        onClick={() => onChoice?.(itemId, 'remote')}
                                        style={{
                                            background: choice === 'remote' ? 'var(--success)' : 'var(--background-secondary)',
                                            color: choice === 'remote' ? 'white' : 'var(--foreground-secondary)',
                                            border: '1px solid ' + (choice === 'remote' ? 'var(--success)' : 'var(--border)'),
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            fontSize: '0.7rem',
                                            cursor: 'pointer',
                                            fontWeight: 600,
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        Cloud
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {hasItems && isExpanded && !isManualChoice && (
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
                    </ul>
                </div>
            )}
        </div>
    );
}

export default function SyncConflictModal({ conflict, onResolve, onCancel }: SyncConflictModalProps) {
    const [mode, setMode] = useState<'simple' | 'manual'>('simple');
    const [manualChoices, setManualChoices] = useState<Record<string, 'local' | 'remote'>>({});

    // Initialize manual choices with cloud version as default for safety
    useMemo(() => {
        const initial: Record<string, 'local' | 'remote'> = {};
        conflict.conflictingItemIds.forEach(id => {
            initial[id] = 'remote';
        });
        setManualChoices(initial);
    }, [conflict.conflictingItemIds]);

    const formatTime = (timestamp: string) => {
        return new Date(timestamp).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    };

    const handleManualChoice = (itemId: string, choice: 'local' | 'remote') => {
        setManualChoices(prev => ({ ...prev, [itemId]: choice }));
    };

    // Group local and remote changes by category for manual mode
    const manualCategories = useMemo(() => {
        const categories: Record<string, ChangeDetail> = {};

        // We look at local changes to get the category and item names
        conflict.localChanges.forEach(c => {
            if (!categories[c.category]) {
                categories[c.category] = { ...c, itemIds: [], items: [] };
            }
            c.itemIds.forEach((id, idx) => {
                if (conflict.conflictingItemIds.includes(id)) {
                    categories[c.category].itemIds.push(id);
                    if (c.items?.[idx]) categories[c.category].items?.push(c.items[idx]);
                }
            });
        });

        return Object.values(categories).filter(c => c.itemIds.length > 0);
    }, [conflict]);

    const handleBulkChoice = (choice: 'local' | 'remote') => {
        const newChoices: Record<string, 'local' | 'remote'> = {};
        conflict.conflictingItemIds.forEach(id => {
            newChoices[id] = choice;
        });
        setManualChoices(newChoices);
    };

    return (
        <div
            className="sync-conflict-overlay"
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.7)',
                backdropFilter: 'blur(8px)',
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
                    borderRadius: '24px',
                    maxWidth: '520px',
                    width: '100%',
                    maxHeight: '90vh',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                    border: '1px solid var(--border)',
                }}
            >
                {/* Header */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '1.25rem 1.5rem',
                        borderBottom: '1px solid var(--border)',
                        background: 'var(--background)',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div
                            style={{
                                background: 'var(--warning)',
                                color: 'white',
                                width: '42px',
                                height: '42px',
                                borderRadius: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
                            }}
                        >
                            <AlertTriangle size={24} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--foreground)' }}>
                                {mode === 'simple' ? 'Sync Conflict' : 'Manual Selection'}
                            </h2>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--foreground-secondary)' }}>
                                {mode === 'simple' ? 'Overlapping changes found' : 'Resolve items one by one'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onCancel}
                        style={{
                            background: 'var(--background-secondary)',
                            border: '1px solid var(--border)',
                            color: 'var(--foreground-secondary)',
                            cursor: 'pointer',
                            padding: '0.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '10px',
                            transition: 'all 0.2s',
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div
                    style={{
                        padding: '1.5rem',
                        overflowY: 'auto',
                        flex: 1,
                        background: 'var(--background-secondary)',
                    }}
                >
                    {mode === 'simple' ? (
                        <>
                            <div style={{
                                background: 'var(--verse-bg)',
                                border: '1px solid var(--border)',
                                borderRadius: '12px',
                                padding: '1rem',
                                marginBottom: '1.5rem',
                                fontSize: '0.9rem',
                                color: 'var(--foreground)',
                                lineHeight: 1.6,
                            }}>
                                Both this device and the cloud have changed the <strong>same items</strong> since your last sync.
                                To prevent data loss, please choose which version to prioritize.
                                Changes that don{'\''}t overlap will be merged automatically.
                            </div>

                            {/* Local Changes */}
                            <div style={{ marginBottom: '1.5rem' }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    marginBottom: '0.75rem',
                                    padding: '0 0.25rem',
                                }}>
                                    <Upload size={18} style={{ color: 'var(--accent)' }} />
                                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--foreground)' }}>This Device</span>
                                    <span style={{
                                        fontSize: '0.8rem',
                                        color: 'var(--foreground-secondary)',
                                        marginLeft: 'auto',
                                        fontWeight: 500,
                                    }}>
                                        {formatTime(conflict.localTimestamp)}
                                    </span>
                                </div>
                                {conflict.localChanges.map((change, idx) => (
                                    <ChangeDetailItem key={idx} change={change} side="local" />
                                ))}
                            </div>

                            {/* Remote Changes */}
                            <div style={{ marginBottom: '1.5rem' }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    marginBottom: '0.75rem',
                                    padding: '0 0.25rem',
                                }}>
                                    <Download size={18} style={{ color: 'var(--success)' }} />
                                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--foreground)' }}>Cloud</span>
                                    <span style={{
                                        fontSize: '0.8rem',
                                        color: 'var(--foreground-secondary)',
                                        marginLeft: 'auto',
                                        fontWeight: 500,
                                    }}>
                                        {formatTime(conflict.remoteTimestamp)}
                                    </span>
                                </div>
                                {conflict.remoteChanges.map((change, idx) => (
                                    <ChangeDetailItem key={idx} change={change} side="remote" />
                                ))}
                            </div>

                            {/* Manual Mode Trigger */}
                            <button
                                onClick={() => setMode('manual')}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.6rem',
                                    padding: '1rem',
                                    borderRadius: '12px',
                                    background: 'var(--background)',
                                    color: 'var(--foreground)',
                                    border: '1px solid var(--border)',
                                    fontWeight: 700,
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    marginBottom: '0.5rem',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                }}
                            >
                                <Settings2 size={18} style={{ color: 'var(--accent)' }} />
                                Manual Selection (Advanced)
                            </button>
                        </>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <p style={{
                                fontSize: '0.9rem',
                                color: 'var(--foreground-secondary)',
                                margin: 0,
                                lineHeight: 1.5,
                                padding: '0 0.25rem',
                            }}>
                                Toggle between your current device and cloud versions for each item below.
                                Unresolved items will default to the Cloud version.
                            </p>

                            <div style={{ display: 'flex', gap: '0.75rem', padding: '0 0.25rem' }}>
                                <button
                                    onClick={() => handleBulkChoice('local')}
                                    style={{
                                        flex: 1,
                                        padding: '0.5rem',
                                        borderRadius: '8px',
                                        background: 'rgba(91, 143, 185, 0.1)',
                                        border: '1px solid var(--accent)',
                                        color: 'var(--accent)',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Select All Device
                                </button>
                                <button
                                    onClick={() => handleBulkChoice('remote')}
                                    style={{
                                        flex: 1,
                                        padding: '0.5rem',
                                        borderRadius: '8px',
                                        background: 'rgba(34, 197, 94, 0.1)',
                                        border: '1px solid var(--success)',
                                        color: 'var(--success)',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Select All Cloud
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {manualCategories.map((cat, idx) => (
                                    <ChangeDetailItem
                                        key={idx}
                                        change={cat}
                                        side="both"
                                        isManualChoice={true}
                                        onChoice={handleManualChoice}
                                        currentChoice={manualChoices}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer - Actions */}
                <div
                    style={{
                        display: 'flex',
                        gap: '1rem',
                        padding: '1.25rem 1.5rem',
                        borderTop: '1px solid var(--border)',
                        background: 'var(--background)',
                    }}
                >
                    {mode === 'simple' ? (
                        <>
                            <button
                                onClick={() => onResolve('local')}
                                style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.6rem',
                                    padding: '1rem',
                                    borderRadius: '14px',
                                    background: 'var(--accent)',
                                    color: 'white',
                                    border: 'none',
                                    fontWeight: 700,
                                    fontSize: '0.95rem',
                                    cursor: 'pointer',
                                    transition: 'transform 0.1s active',
                                    boxShadow: '0 4px 12px rgba(var(--accent-rgb, 0, 112, 243), 0.3)',
                                }}
                            >
                                <Upload size={18} />
                                Keep Device
                            </button>
                            <button
                                onClick={() => onResolve('remote')}
                                style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.6rem',
                                    padding: '1rem',
                                    borderRadius: '14px',
                                    background: 'var(--success)',
                                    color: 'white',
                                    border: 'none',
                                    fontWeight: 700,
                                    fontSize: '0.95rem',
                                    cursor: 'pointer',
                                    transition: 'transform 0.1s active',
                                    boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)',
                                }}
                            >
                                <Download size={18} />
                                Keep Cloud
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={() => setMode('simple')}
                                style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    padding: '1rem',
                                    borderRadius: '14px',
                                    background: 'var(--background-secondary)',
                                    color: 'var(--foreground)',
                                    border: '1px solid var(--border)',
                                    fontWeight: 700,
                                    fontSize: '0.95rem',
                                    cursor: 'pointer',
                                }}
                            >
                                <RotateCcw size={18} />
                                Back
                            </button>
                            <button
                                onClick={() => onResolve('manual', manualChoices)}
                                style={{
                                    flex: 2,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.6rem',
                                    padding: '1rem',
                                    borderRadius: '14px',
                                    background: 'var(--accent)',
                                    color: 'white',
                                    border: 'none',
                                    fontWeight: 800,
                                    fontSize: '0.95rem',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(var(--accent-rgb, 0, 112, 243), 0.3)',
                                }}
                            >
                                <CheckCircle2 size={18} />
                                Confirm Selection
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
