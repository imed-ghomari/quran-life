'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
<<<<<<< HEAD
import { usePathname } from 'next/navigation';
import { X, Save, Share2, Maximize2, Minimize2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Tldraw, defaultEditorAssetUrls, DefaultDashStyle, DefaultSizeStyle } from 'tldraw';
import 'tldraw/tldraw.css';

=======
import { X } from 'lucide-react';
import dynamic from 'next/dynamic';
import {
    Tldraw,
    DefaultDashStyle,
    DefaultSizeStyle,
    atom,
    pointInPolygon,
    polygonsIntersect,
    StateNode,
    TLPointerEventInfo,
    TLShape,
    VecModel,
    DefaultToolbar,
    TldrawUiMenuGroup,
    TldrawUiMenuItem,
    TldrawOverlays,
    SelectToolbarItem,
    HandToolbarItem,
    DrawToolbarItem,
    HighlightToolbarItem,
    EraserToolbarItem,
    useTools,
    useIsToolSelected,
    useEditor,
    useValue,
    getStrokePoints,
    getSvgPathFromStrokePoints
} from 'tldraw';
import 'tldraw/tldraw.css';

// ============================================
// Lasso Select Tool Implementation
// ============================================

class IdleState extends StateNode {
    static override id = 'idle';
    override onPointerDown(info: TLPointerEventInfo) {
        this.editor.selectNone();
        this.parent.transition('lassoing', info);
    }
}

class LassoingState extends StateNode {
    static override id = 'lassoing';
    points = atom<VecModel[]>('lasso points', []);

    override onEnter() {
        this.points.set([]);
    }

    override onPointerMove(): void {
        const { x, y, z } = this.editor.inputs.currentPagePoint;
        this.points.set([...this.points.get(), { x, y, z }]);
    }

    override onPointerUp(): void {
        this.complete();
    }

    override onComplete() {
        this.complete();
    }

    private complete() {
        const shapes = this.editor.getCurrentPageRenderingShapesSorted();
        const lassoPoints = this.points.get();
        const selected = shapes.filter((shape) => {
            const geometry = this.editor.getShapeGeometry(shape);
            const pageTransform = this.editor.getShapePageTransform(shape);
            const vertices = pageTransform.applyToPoints(geometry.vertices);
            const allInside = vertices.every((v) => pointInPolygon(v, lassoPoints));
            if (!allInside) return false;
            if (geometry.isClosed && polygonsIntersect(vertices, lassoPoints)) return false;
            return true;
        });
        this.editor.setSelectedShapes(selected.map(s => s.id));
        this.editor.setCurrentTool('select');
    }
}

class LassoSelectTool extends StateNode {
    static override id = 'lasso-select';
    static override initial = 'idle';
    static override children() {
        return [IdleState, LassoingState];
    }
}

const LassoOverlay = () => {
    const editor = useEditor();
    const lassoPoints = useValue('lasso points', () => {
        if (!editor.isIn('lasso-select.lassoing')) return [];
        const lassoing = editor.getStateDescendant('lasso-select.lassoing') as LassoingState;
        return lassoing.points.get();
    }, [editor]);

    const svgPath = useMemo(() => {
        if (!lassoPoints.length) return '';
        const smoothedPoints = getStrokePoints(lassoPoints);
        return getSvgPathFromStrokePoints(smoothedPoints, true);
    }, [lassoPoints]);

    if (!lassoPoints.length) return null;

    return (
        <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 999 }}>
            <path
                d={svgPath}
                fill="rgba(0, 100, 255, 0.1)"
                stroke="rgba(0, 100, 255, 0.6)"
                strokeWidth={2}
            />
        </svg>
    );
};

// ============================================
// MindmapEditor Component
// ============================================

>>>>>>> 808af3561afb02764c6979aacc65af686b0c8874
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error: any) {
        return { hasError: true, error };
    }
    componentDidCatch(error: any, errorInfo: any) {
        console.error('ErrorBoundary caught error:', error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 20, color: 'red', background: 'white', overflow: 'auto', height: '100%' }}>
                    <h3>Editor Crashed</h3>
                    <p>{this.state.error?.message}</p>
                    <button
                        onClick={() => {
<<<<<<< HEAD
                            localStorage.clear(); // Clear all for safety or specific key
=======
                            localStorage.clear();
>>>>>>> 808af3561afb02764c6979aacc65af686b0c8874
                            window.location.reload();
                        }}
                        style={{ padding: '8px 16px', background: '#ff4444', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                    >
                        Hard Reset & Reload
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

interface MindmapEditorProps {
    initialSnapshot?: any;
    onSave?: (snapshot: any) => Promise<void>;
    onClose: () => void;
    title?: string;
}

function MindmapEditorContent({ initialSnapshot, onSave, onClose, title }: MindmapEditorProps) {
    const [editor, setEditor] = useState<any>(null);

<<<<<<< HEAD
    // Debug Effect
    const [debugInfo, setDebugInfo] = useState('');
    useEffect(() => {
        if (!editor) return;
        const interval = setInterval(() => {
            const shapes = editor.getCurrentPageShapeIds().size;
            const camera = editor.getCamera();
            const container = document.querySelector('.tldraw-container');
            const dim = container ? `${container.clientWidth}x${container.clientHeight}` : 'N/A';
            const htmlClass = document.documentElement.className;

            setDebugInfo(`Shps: ${shapes} | Snap: ${initialSnapshot ? 'YES' : 'NO'} | Assets: ${defaultEditorAssetUrls ? 'YES' : 'NO'} | Zoom: ${camera.z.toFixed(2)} | Dim: ${dim} | HTML: ${htmlClass}`);
        }, 1000);
        return () => clearInterval(interval);
    }, [editor, initialSnapshot]);

    // Set Defaults
=======
>>>>>>> 808af3561afb02764c6979aacc65af686b0c8874
    useEffect(() => {
        try {
            DefaultDashStyle.setDefaultValue('solid');
            DefaultSizeStyle.setDefaultValue('m');
        } catch (e) {
            console.warn('Failed to set defaults', e);
        }
    }, []);

    const handleMount = useCallback((editorInstance: any) => {
<<<<<<< HEAD
        console.log('Tldraw mounted');
        setEditor(editorInstance);

        // Restore snapshot loading
        if (initialSnapshot) {
            try {
                editorInstance.store.loadSnapshot(initialSnapshot);
                // Center content if shapes exist
=======
        setEditor(editorInstance);
        if (initialSnapshot) {
            try {
                editorInstance.store.loadSnapshot(initialSnapshot);
>>>>>>> 808af3561afb02764c6979aacc65af686b0c8874
                if (Object.keys(initialSnapshot.document.store).length > 0) {
                    editorInstance.zoomToFit();
                }
            } catch (e) {
                console.warn('Failed to load snapshot', e);
            }
        }
    }, [initialSnapshot]);

    const handleClose = async () => {
        if (editor && onSave) {
            try {
                const { document, session } = editor.store.getSnapshot();
                await onSave({ document, session });
            } catch (e) {
                console.error("Save failed", e);
            }
        }
        onClose();
    };

<<<<<<< HEAD
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'var(--background, white)', display: 'flex', flexDirection: 'column' }}>
            {/* Local CSS to ensure availability in production */}
            <link rel="stylesheet" href="/tldraw-local.css" />

            {/* Header */}
=======
    const uiOverrides = useMemo(() => ({
        tools(editorInst: any, tools: any) {
            tools['lasso-select'] = {
                id: 'lasso-select',
                icon: 'color',
                label: 'Lasso Select',
                kbd: 'w',
                onSelect: () => editorInst.setCurrentTool('lasso-select'),
            };
            return tools;
        },
    }), []);

    const components = useMemo(() => ({
        Toolbar: () => {
            const tools = useTools();
            const isLassoSelected = useIsToolSelected(tools['lasso-select']);
            return (
                <DefaultToolbar>
                    <TldrawUiMenuGroup id="mindmap-tools">
                        <TldrawUiMenuItem {...tools['lasso-select']} isSelected={isLassoSelected} />
                        <SelectToolbarItem />
                        <HandToolbarItem />
                        <DrawToolbarItem />
                        <HighlightToolbarItem />
                        <EraserToolbarItem />
                    </TldrawUiMenuGroup>
                </DefaultToolbar>
            );
        },
        Overlays: () => (
            <>
                <TldrawOverlays />
                <LassoOverlay />
            </>
        ),
        PageMenu: null,
        DebugMenu: null,
        DebugPanel: null,
        SharePanel: null,
    }), []);

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'var(--background, white)', display: 'flex', flexDirection: 'column' }}>
>>>>>>> 808af3561afb02764c6979aacc65af686b0c8874
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

<<<<<<< HEAD
            {/* Editor */}
            <div className="tldraw-container" style={{ position: 'absolute', top: '50px', left: 0, right: 0, bottom: 0, background: '#f8f9fa' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, zIndex: 9999, background: 'rgba(255,0,0,0.8)', color: 'white', pointerEvents: 'none', padding: 8, fontSize: 12, maxWidth: '100%' }}>
                    Debug: Mounted={editor ? 'Yes' : 'No'} <br />
                    {debugInfo || 'Waiting for update...'}
                </div>
                <Tldraw
                    onMount={handleMount}
                    inferDarkMode={true}
                    assetUrls={defaultEditorAssetUrls}
                // forceMobile={true} // Disabled for now to rule out layout issues
=======
            <div className="tldraw-container" style={{ position: 'absolute', top: '50px', left: 0, right: 0, bottom: 0, background: '#f8f9fa' }}>
                <Tldraw
                    onMount={handleMount}
                    inferDarkMode={true}
                    forceMobile={true}
                    tools={[LassoSelectTool]}
                    overrides={uiOverrides}
                    components={components}
>>>>>>> 808af3561afb02764c6979aacc65af686b0c8874
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

<<<<<<< HEAD
// Export dynamic to prevent SSR of the entire editor
=======
>>>>>>> 808af3561afb02764c6979aacc65af686b0c8874
export default dynamic(() => Promise.resolve(MindmapEditorInner), {
    ssr: false,
    loading: () => <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'white' }}>Loading Editor (Dynamic)...</div>
});
<<<<<<< HEAD
=======

>>>>>>> 808af3561afb02764c6979aacc65af686b0c8874
