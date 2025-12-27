'use client';

import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import dynamic from 'next/dynamic';

// Import Tldraw CSS - moved to layout.tsx
// import 'tldraw/tldraw.css';

interface MindmapEditorProps {
    initialSnapshot?: any;
    onSave: (snapshot: any, imageBlob: Blob) => void;
    onClose: () => void;
    title?: string;
}

// Simple Error Boundary
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: any) {
        return { hasError: true };
    }

    componentDidCatch(error: any, errorInfo: any) {
        console.error("Tldraw crashed:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center' }}>
                    <div>
                        <h3>Editor crashed.</h3>
                        <p>Check console for details.</p>
                        <button onClick={() => this.setState({ hasError: false })} style={{ marginTop: 10, padding: '8px 16px' }}>
                            Reload
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

function MindmapEditorContent({ initialSnapshot, onSave, onClose, title }: MindmapEditorProps) {
    const [editor, setEditor] = useState<any>(null);
    const [TldrawModule, setTldrawModule] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Dynamic import of Tldraw
    useEffect(() => {
        let mounted = true;
        import('tldraw').then((mod) => {
            if (!mounted) return;

            // Set defaults
            mod.DefaultDashStyle.setDefaultValue('solid');
            mod.DefaultSizeStyle.setDefaultValue('m');

            /**
             * NOTE: Custom Lasso Tool logic is preserved below but disabled to prevent production crashes.
             * See system design document for full implementation details.
             * To restore:
             * 1. Uncomment Lasso tool class definitions here.
             * 2. Pass tool classes to valid state.
             * 3. Uncomment uiOverrides and components overrides.
             */
            /*
           const { StateNode, atom, pointInPolygon, polygonsIntersect } = mod;
           class LassoingState extends StateNode { ... }
           class LassoSelectTool extends StateNode { ... }
           */

            setTldrawModule(mod);
            setIsLoading(false);
        }).catch(err => {
            console.error('Failed to load tldraw module', err);
            if (mounted) setIsLoading(false);
        });

        return () => { mounted = false; };
    }, []);

    const handleMount = useCallback((editorInstance: any) => {
        setEditor(editorInstance);

        // Restore snapshot loading
        if (initialSnapshot && TldrawModule) {
            try {
                TldrawModule.loadSnapshot(editorInstance.store, initialSnapshot);
            } catch (e) {
                console.warn('Failed to load snapshot', e);
            }
        }
    }, [initialSnapshot, TldrawModule]);

    const handleClose = async () => {
        if (!editor || !TldrawModule) {
            onClose();
            return;
        }
        try {
            const snapshot = TldrawModule.getSnapshot(editor.store);
            const shapeIds = editor.getCurrentPageShapeIds();

            if (shapeIds.size === 0) {
                onSave(snapshot, new Blob());
                return;
            }

            try {
                const { blob } = await editor.toImage([...shapeIds], { format: 'png', background: true });
                onSave(snapshot, blob);
            } catch (e: any) {
                console.warn('toImage failed', e);
                // Fallback to SVG
                const svg = await editor.getSvg([...shapeIds], { background: true });
                if (svg) {
                    const svgString = new XMLSerializer().serializeToString(svg);
                    onSave(snapshot, new Blob([svgString], { type: 'image/svg+xml' }));
                } else {
                    onSave(snapshot, new Blob());
                }
            }
        } catch (e) {
            console.error('Error saving', e);
            onClose();
        }
    };

    // Use default tools for stability
    const components = useMemo(() => {
        if (!TldrawModule) return undefined;
        return {
            PageMenu: null,
            DebugMenu: null,
            DebugPanel: null,
        };
    }, [TldrawModule]);

    if (isLoading || !TldrawModule) {
        return (
            <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Loading Editor...
            </div>
        );
    }

    const { Tldraw, defaultEditorAssetUrls } = TldrawModule;

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'var(--background, white)', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{
                height: '50px',
                borderBottom: '1px solid #e5e5e5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 1rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button onClick={handleClose} style={{ border: 'none', background: 'transparent' }}>
                        <X size={24} />
                    </button>
                    <span style={{ fontWeight: 600 }}>{title || 'Mindmap Editor'}</span>
                </div>
                <span style={{ fontSize: '0.8rem', color: '#666' }}>Auto-saves on close</span>
            </div>

            {/* Editor */}
            <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%', minHeight: '0', background: '#f8f9fa' }}>
                <Tldraw
                    onMount={handleMount}
                    forceMobile={true}
                    inferDarkMode={true}
                    assetUrls={defaultEditorAssetUrls}
                    components={components}
                />
            </div>
        </div>
    );
}

function MindmapEditorInner(props: MindmapEditorProps) {
    return (
        <ErrorBoundary>
            <MindmapEditorContent {...props} />
        </ErrorBoundary>
    );
}

export default dynamic(() => Promise.resolve(MindmapEditorInner), {
    ssr: false,
    loading: () => <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'white' }}>Loading...</div>
});
