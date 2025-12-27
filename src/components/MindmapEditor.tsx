'use client';

import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import dynamic from 'next/dynamic';

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
                        <h3>Something went wrong with the editor.</h3>
                        <p>Detailed error logged to console.</p>
                        <button onClick={() => this.setState({ hasError: false })} style={{ marginTop: 10, padding: '8px 16px' }}>
                            Try Again
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

// Inner component content
function MindmapEditorContent({ initialSnapshot, onSave, onClose, title }: MindmapEditorProps) {
    const [editor, setEditor] = useState<any>(null);
    const [TldrawModule, setTldrawModule] = useState<any>(null);
    const [LassoTool, setLassoTool] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Dynamically import Tldraw and create lasso tool on client side only
    useEffect(() => {
        let mounted = true;

        const loadTldraw = async () => {
            try {
                const mod = await import('tldraw');

                if (!mounted) return;

                // Set default styles for solid stroke, medium size
                mod.DefaultDashStyle.setDefaultValue('solid');
                mod.DefaultSizeStyle.setDefaultValue('m');

                // Create Lasso Select Tool classes dynamically
                const { StateNode, atom, pointInPolygon, polygonsIntersect } = mod;

                class IdleState extends StateNode {
                    static override id = 'idle';
                    override onPointerDown(info: any) {
                        this.editor.selectNone();
                        this.parent.transition('lassoing', info);
                    }
                }

                class LassoingState extends StateNode {
                    static override id = 'lassoing';
                    info = {} as any;
                    markId = null as null | string;
                    points = atom<any[]>('lasso points', []);

                    override onEnter(info: any) {
                        this.points.set([]);
                        this.markId = null;
                        this.info = info;
                        this.markId = this.editor.markHistoryStoppingPoint('lasso start');
                    }

                    override onPointerMove(): void {
                        const { inputs } = this.editor;
                        const { x, y, z } = inputs.currentPagePoint.toFixed();
                        this.points.set([...this.points.get(), { x, y, z }]);
                    }

                    private getShapesInLasso() {
                        const shapes = this.editor.getCurrentPageRenderingShapesSorted();
                        const lassoPoints = this.points.get();
                        return shapes.filter((shape: any) => {
                            const geometry = this.editor.getShapeGeometry(shape);
                            const pageTransform = this.editor.getShapePageTransform(shape);
                            const shapeVertices = pageTransform.applyToPoints(geometry.vertices);
                            const allInside = shapeVertices.every((v: any) => pointInPolygon(v, lassoPoints));
                            if (!allInside) return false;
                            if (geometry.isClosed && polygonsIntersect(shapeVertices, lassoPoints)) return false;
                            return true;
                        });
                    }

                    override onPointerUp(): void {
                        const shapesInLasso = this.getShapesInLasso();
                        this.editor.setSelectedShapes(shapesInLasso);
                        this.editor.setCurrentTool('select');
                    }

                    override onComplete() {
                        this.onPointerUp();
                    }
                }

                class LassoSelectTool extends StateNode {
                    static override id = 'lasso-select';
                    static override children() {
                        return [IdleState, LassoingState];
                    }
                    static override initial = 'idle';
                }

                setTldrawModule(mod);
                setLassoTool({ LassoSelectTool, LassoingState });
                setIsLoading(false);
            } catch (err) {
                console.error('Failed to load tldraw:', err);
                if (mounted) setIsLoading(false);
            }
        };

        loadTldraw();

        return () => {
            mounted = false;
        };
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

    // UI overrides for lasso select tool
    const uiOverrides = useMemo(() => {
        if (!TldrawModule || !LassoTool) return undefined;

        return {
            tools(editorInst: any, tools: any) {
                tools['lasso-select'] = {
                    id: 'lasso-select',
                    icon: 'color',
                    label: 'Lasso Select',
                    kbd: 'w',
                    onSelect: () => {
                        editorInst.setCurrentTool('lasso-select');
                    },
                };
                return tools;
            },
        };
    }, [TldrawModule, LassoTool]);

    // Lasso overlay component
    const LassoSelectSvgComponent = useMemo(() => {
        if (!TldrawModule || !LassoTool) return null;

        const { useEditor: useTldrawEditor, useValue, getStrokePoints, getSvgPathFromStrokePoints } = TldrawModule;
        const { LassoingState } = LassoTool;

        return function LassoOverlay() {
            const editorInst = useTldrawEditor();

            const lassoPoints = useValue(
                'lasso points',
                () => {
                    if (!editorInst.isIn('lasso-select.lassoing')) return [];
                    const lassoing = editorInst.getStateDescendant('lasso-select.lassoing') as typeof LassoingState;
                    return lassoing?.points?.get() || [];
                },
                [editorInst]
            );

            const svgPath = useMemo(() => {
                if (!lassoPoints || lassoPoints.length === 0) return '';
                const smoothedPoints = getStrokePoints(lassoPoints);
                return getSvgPathFromStrokePoints(smoothedPoints, true);
            }, [lassoPoints]);

            if (!lassoPoints || lassoPoints.length === 0) return null;

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
    }, [TldrawModule, LassoTool]);

    // Custom components for toolbar
    const components = useMemo(() => {
        if (!TldrawModule || !LassoTool) return undefined;

        const {
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
        } = TldrawModule;

        return {
            Toolbar: () => {
                const tools = useTools();
                const isLassoSelected = useIsToolSelected(tools['lasso-select']);
                return (
                    <DefaultToolbar>
                        <TldrawUiMenuGroup id="mindmap-tools">
                            {/* Lasso Select first */}
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
            // Hide these
            PageMenu: null,
            DebugMenu: null,
            DebugPanel: null,
            // Custom overlays for lasso
            Overlays: LassoSelectSvgComponent ? () => (
                <>
                    <TldrawOverlays />
                    <LassoSelectSvgComponent />
                </>
            ) : TldrawOverlays,
        };
    }, [TldrawModule, LassoTool, LassoSelectSvgComponent]);

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
                    persistenceKey="mindmap-editor-persistence"
                    onMount={handleMount}
                    forceMobile={true}
                    inferDarkMode={true}
                    tools={LassoTool ? [LassoTool.LassoSelectTool] : []}
                    overrides={uiOverrides}
                    components={components}
                />
            </div>
        </div>
    );
}

// Wrapper to include ErrorBoundary
function MindmapEditorInner(props: MindmapEditorProps) {
    return (
        <ErrorBoundary>
            <MindmapEditorContent {...props} />
        </ErrorBoundary>
    );
}

// Export a dynamically loaded version with SSR disabled
const MindmapEditor = dynamic(() => Promise.resolve(MindmapEditorInner), {
    ssr: false,
    loading: () => (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            Loading editor...
        </div>
    ),
});

export default MindmapEditor;
