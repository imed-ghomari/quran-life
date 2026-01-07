'use client';

import React, { useCallback, useState, useMemo, useEffect } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { Maximize2, X } from 'lucide-react';
import type { TldrawProps } from 'tldraw';

// Only load tldraw on the client
const Tldraw = dynamic(
    async () => {
        const { Tldraw } = await import('tldraw');
        return Tldraw;
    },
    { ssr: false }
);

import 'tldraw/tldraw.css';

interface MindmapViewerProps {
    snapshot?: any;
    templateUrl?: string | null;
    imageUrl?: string | null;
    imageUrlDark?: string | null;
    isDark: boolean;
    title?: string;
    height?: string | number;
}

export default function MindmapViewer({
    snapshot,
    templateUrl,
    imageUrl,
    imageUrlDark,
    isDark,
    title,
    height = '400px'
}: MindmapViewerProps) {
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [fetchedSnapshot, setFetchedSnapshot] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (templateUrl) {
            setIsLoading(true);
            fetch(templateUrl)
                .then(res => res.json())
                .then(data => {
                    setFetchedSnapshot(data);
                    setIsLoading(false);
                })
                .catch(err => {
                    console.error('Failed to fetch template mindmap:', err);
                    setIsLoading(false);
                });
        }
    }, [templateUrl]);

    useEffect(() => {
        if (isFullScreen) {
            document.body.setAttribute('data-mindmap-open', 'true');
            document.body.style.overflow = 'hidden';
        } else {
            document.body.removeAttribute('data-mindmap-open');
            document.body.style.overflow = '';
        }
        return () => {
            document.body.removeAttribute('data-mindmap-open');
            document.body.style.overflow = '';
        };
    }, [isFullScreen]);

    const displayUrl = isDark ? (imageUrlDark || imageUrl) : imageUrl;
    const hasImage = !!displayUrl;
    const hasSnapshot = !!snapshot;

    const components = useMemo(() => ({
        Toolbar: null,
        PageMenu: null,
        NavigationPanel: null,
        MainMenu: null,
        ContextMenu: null,
        ActionsMenu: null,
        DebugMenu: null,
        DebugPanel: null,
        SharePanel: null,
        TopPanel: null,
    }), []);

    const handleMount = useCallback((editor: any) => {
        const activeSnapshot = fetchedSnapshot || snapshot;
        if (activeSnapshot) {
            try {
                if (typeof editor.loadSnapshot === 'function') {
                    editor.loadSnapshot(activeSnapshot);
                } else {
                    editor.store.loadSnapshot(activeSnapshot);
                }
                editor.updateInstanceState({ isReadonly: true });
                setTimeout(() => {
                    editor.zoomToFit();
                }, 100);
            } catch (e) {
                console.warn('Failed to load snapshot in viewer', e);
            }
        }
    }, [snapshot, fetchedSnapshot]);

    const renderContent = (isFS: boolean) => {
        const activeSnapshot = fetchedSnapshot || snapshot;

        if (isLoading) {
            return (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--foreground-secondary)' }}>
                    Loading official mindmap...
                </div>
            );
        }

        if (activeSnapshot) {
            return (
                <div style={{ width: '100%', height: '100%', position: 'relative', background: isDark ? '#1e1e1e' : '#f5f5f5' }}>
                    <div style={{ width: '100%', height: '100%', pointerEvents: isFS ? 'auto' : 'none' }}>
                        <Tldraw
                            onMount={handleMount}
                            inferDarkMode={true}
                            components={components}
                        />
                    </div>
                    {!isFS && (
                        <>
                            {/* Overlay to catch clicks but let scrolls pass through to page */}
                            <div
                                onClick={() => setIsFullScreen(true)}
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    zIndex: 10,
                                    cursor: 'pointer'
                                }}
                            />
                            <button
                                onClick={() => setIsFullScreen(true)}
                                style={{
                                    position: 'absolute',
                                    bottom: '12px',
                                    left: '12px', // Moved to left to avoid watermark
                                    background: 'rgba(0,0,0,0.6)',
                                    color: 'white',
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    fontSize: '0.75rem',
                                    zIndex: 100,
                                    backdropFilter: 'blur(4px)'
                                }}
                            >
                                <Maximize2 size={14} /> Full Screen
                            </button>
                        </>
                    )}
                </div>
            );
        }

        if (hasImage) {
            return (
                <div
                    style={{ width: '100%', height: '100%', position: 'relative', cursor: 'pointer', background: isDark ? '#1e1e1e' : '#f5f5f5' }}
                    onClick={() => setIsFullScreen(true)}
                >
                    <Image
                        src={displayUrl!}
                        alt={title || "Mindmap preview"}
                        fill
                        style={{
                            objectFit: 'contain',
                            filter: isDark && !imageUrlDark && imageUrl ? 'invert(0.9) hue-rotate(180deg)' : 'none'
                        }}
                    />
                    {!isFS && (
                        <div style={{
                            position: 'absolute',
                            bottom: '12px',
                            left: '12px', // Moved to left to avoid common watermark areas
                            background: 'rgba(0,0,0,0.6)',
                            color: 'white',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            backdropFilter: 'blur(4px)'
                        }}>
                            <Maximize2 size={14} /> Tap to Zoom
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background-secondary)', border: '1px dashed var(--border)', borderRadius: '8px' }}>
                <p style={{ color: 'var(--foreground-secondary)', fontSize: '0.9rem' }}>No mindmap content available</p>
            </div>
        );
    };

    return (
        <>
            <div style={{
                position: 'relative',
                width: '100%',
                height: typeof height === 'number' ? `${height}px` : height,
                borderRadius: '8px',
                overflow: 'hidden',
                border: '1px solid var(--border)'
            }}>
                {renderContent(false)}
            </div>

            {isFullScreen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9999,
                    background: 'var(--background)',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <div style={{
                        height: '50px',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 1rem'
                    }}>
                        <span style={{ fontWeight: 600 }}>{title || 'Mindmap Preview'}</span>
                        <button
                            onClick={() => setIsFullScreen(false)}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--foreground)' }}
                        >
                            <X size={24} />
                        </button>
                    </div>
                    <div style={{ flex: 1, position: 'relative' }}>
                        {renderContent(true)}
                    </div>
                </div>
            )}
        </>
    );
}
