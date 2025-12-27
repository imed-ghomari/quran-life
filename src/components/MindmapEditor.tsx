'use client';

import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';

// Import Tldraw CSS - this is required for proper styling
import 'tldraw/tldraw.css';

// ============================================
// MindmapEditor Component
// ============================================

interface MindmapEditorProps {
    initialSnapshot?: any;
    onSave: (snapshot: any, imageBlob: Blob) => void;
    onClose: () => void;
    title?: string;
}

export default function MindmapEditor({ initialSnapshot, onSave, onClose, title }: MindmapEditorProps) {
    const [editor, setEditor] = useState<any>(null);
    const [TldrawModule, setTldrawModule] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Dynamically import Tldraw on client side only
    useEffect(() => {
        import('tldraw').then((mod) => {
            // Set default styles for solid stroke, medium size
            mod.DefaultDashStyle.setDefaultValue('solid');
            mod.DefaultSizeStyle.setDefaultValue('m');

            setTldrawModule(mod);
            setIsLoading(false);
        }).catch((err) => {
            console.error('Failed to load tldraw:', err);
            setIsLoading(false);
        });
    }, []);

    const handleMount = useCallback((editorInstance: any) => {
        setEditor(editorInstance);

        // Load snapshot if provided using the correct API
        if (initialSnapshot && TldrawModule) {
            try {
                TldrawModule.loadSnapshot(editorInstance.store, initialSnapshot);
            } catch (e) {
                console.warn('Failed to load snapshot', e);
            }
        }
    }, [initialSnapshot, TldrawModule]);

    // Auto-save on close using correct tldraw APIs
    const handleClose = async () => {
        if (!editor || !TldrawModule) {
            onClose();
            return;
        }

        try {
            // Get snapshot using correct API: getSnapshot(editor.store)
            const snapshot = TldrawModule.getSnapshot(editor.store);
            const shapeIds = editor.getCurrentPageShapeIds();

            if (shapeIds.size === 0) {
                // No shapes - just save empty snapshot
                onSave(snapshot, new Blob());
                return;
            }

            // Export image using correct API: editor.toImage()
            try {
                const { blob } = await editor.toImage([...shapeIds], {
                    format: 'png',
                    background: true
                });
                onSave(snapshot, blob);
            } catch (e) {
                console.warn('toImage failed, trying SVG export...', e);
                // Fallback to SVG if PNG export fails
                try {
                    const svg = await editor.getSvg([...shapeIds], { background: true });
                    if (svg) {
                        const svgString = new XMLSerializer().serializeToString(svg);
                        const blob = new Blob([svgString], { type: 'image/svg+xml' });
                        onSave(snapshot, blob);
                    } else {
                        onSave(snapshot, new Blob());
                    }
                } catch (e2) {
                    console.warn('SVG export also failed', e2);
                    onSave(snapshot, new Blob());
                }
            }
        } catch (e) {
            console.error('Error saving on close', e);
            onClose();
        }
    };

    // Custom components to hide unnecessary UI elements
    const components = useMemo(() => {
        if (!TldrawModule) return undefined;

        const { DefaultToolbar, TldrawOverlays } = TldrawModule;

        return {
            // Use default toolbar
            Toolbar: DefaultToolbar,
            // Hide these
            PageMenu: null,
            DebugMenu: null,
            DebugPanel: null,
        };
    }, [TldrawModule]);

    if (isLoading || !TldrawModule) {
        return (
            <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'white', display: 'flex', flexDirection: 'column' }}>
                <div style={{
                    height: '50px',
                    minHeight: '50px',
                    borderBottom: '1px solid #e5e5e5',
                    background: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 1rem'
                }}>
                    <span style={{ fontWeight: 600, fontSize: '1rem' }}>{title || 'Mindmap Editor'}</span>
                </div>
                <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#666'
                }}>
                    Loading editor...
                </div>
            </div>
        );
    }

    const { Tldraw } = TldrawModule;

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'var(--background, white)', display: 'flex', flexDirection: 'column' }}>
            {/* Custom Header - just close button (auto-saves) */}
            <div style={{
                height: '50px',
                minHeight: '50px',
                borderBottom: '1px solid var(--border, #e5e5e5)',
                background: 'var(--background, white)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 1rem',
                zIndex: 10
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                        onClick={handleClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '8px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--foreground, #000)'
                        }}
                        title="Close (auto-saves)"
                    >
                        <X size={24} />
                    </button>
                    <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--foreground, #000)' }}>{title || 'Mindmap Editor'}</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--foreground-secondary, #888)' }}>Auto-saves on close</span>
            </div>

            {/* Tldraw Container */}
            <div style={{ flex: 1, position: 'relative' }}>
                <Tldraw
                    onMount={handleMount}
                    forceMobile={true}
                    inferDarkMode={true}
                    components={components}
                />
            </div>
        </div>
    );
}
