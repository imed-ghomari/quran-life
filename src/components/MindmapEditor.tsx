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
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: any) {
        return { hasError: true, error };
    }

    componentDidCatch(error: any, errorInfo: any) {
        console.error("Tldraw crashed:", error, errorInfo);
    }

    async handleHardReset() {
        try {
            console.log('Clearing storage...');
            // Clear local storage
            localStorage.clear();

            // Clear IndexedDB
            if (window.indexedDB && window.indexedDB.databases) {
                const dbs = await window.indexedDB.databases();
                for (const db of dbs) {
                    if (db.name) {
                        window.indexedDB.deleteDatabase(db.name);
                        console.log('Deleted DB:', db.name);
                    }
                }
            }
        } catch (e) {
            console.error('Failed to clear storage:', e);
        }
        window.location.reload();
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center', color: 'red' }}>
                    <div>
                        <h3>Editor crashed.</h3>
                        <p>{this.state.error?.message || 'Unknown error'}</p>
                        <pre style={{ maxWidth: '100%', overflow: 'auto', textAlign: 'left', background: '#f0f0f0', padding: 10, fontSize: '0.8em', maxHeight: '200px' }}>
                            {this.state.error?.stack}
                        </pre>
                        <div style={{ display: 'flex', gap: '10px', marginTop: 10, justifyContent: 'center' }}>
                            <button onClick={() => this.setState({ hasError: false, error: null })} style={{ padding: '8px 16px' }}>
                                Try Reload
                            </button>
                            <button onClick={() => this.handleHardReset()} style={{ padding: '8px 16px', background: 'red', color: 'white', border: 'none', borderRadius: '4px' }}>
                                Hard Reset (Clear Data)
                            </button>
                        </div>
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

    // Debug Effect to track editor state
    const [debugInfo, setDebugInfo] = useState('');
    useEffect(() => {
        if (!editor) return;
        const interval = setInterval(() => {
            const shapes = editor.getCurrentPageShapeIds().size;
            const camera = editor.getCamera();
            const container = document.querySelector('.tldraw-container');
            const dim = container ? `${container.clientWidth}x${container.clientHeight}` : 'N/A';
            const htmlClass = document.documentElement.className;

            setDebugInfo(`Shps: ${shapes} | Snap: ${initialSnapshot ? 'YES' : 'NO'} | Assets: ${defaultEditorAssetUrls ? 'YES' : 'NO'} | Zoom: ${camera.z.toFixed(2)} | Pos: ${camera.x.toFixed(0)},${camera.y.toFixed(0)} | Dim: ${dim} | Theme: ${editor.user.getIsDarkMode() ? 'Dark' : 'Light'} | HTML: ${htmlClass}`);
        }, 1000);
        return () => clearInterval(interval);
    }, [editor]);

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
            <div className="tldraw-container" style={{ flex: 1, position: 'relative', width: '100%', height: '100%', minHeight: '0', background: '#f8f9fa' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, zIndex: 9999, background: 'rgba(255,0,0,0.8)', color: 'white', pointerEvents: 'none', padding: 8, fontSize: 12, maxWidth: '100%' }}>
                    Debug: Mounted={editor ? 'Yes' : 'No'} <br />
                    {debugInfo || 'Waiting for update...'}
                </div>
                <Tldraw
                    onMount={handleMount}
                    forceMobile={true}
                    inferDarkMode={true}
                    assetUrls={defaultEditorAssetUrls}
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
