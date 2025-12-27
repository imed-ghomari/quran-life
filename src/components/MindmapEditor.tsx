'use client';

import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import dynamic from 'next/dynamic';

// Import Tldraw CSS
import 'tldraw/tldraw.css';

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
    const [LassoTool, setLassoTool] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Dynamic import of Tldraw and custom tools
    useEffect(() => {
        let mounted = true;
        import('tldraw').then((mod) => {
            if (!mounted) return;

            try {
                // Set defaults
                mod.DefaultDashStyle.setDefaultValue('solid');
                mod.DefaultSizeStyle.setDefaultValue('m');

                // Create Lasso Tool
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

                setLassoTool({ LassoSelectTool, LassoingState });
            } catch (err) {
                console.error('Failed to initialize custom tools, falling back to default', err);
            }

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
                    <path d={svgPath} fill="rgba(0, 100, 255, 0.1)" stroke="rgba(0, 100, 255, 0.6)" strokeWidth={2} />
                </svg>
            );
        };
    }, [TldrawModule, LassoTool]);

    // Custom toolbar
    const components = useMemo(() => {
        if (!TldrawModule) return undefined;

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

        // If Lasso tool isn't available, use default toolbar behavior (hide lasso)
        const Toolbar = LassoTool ? () => {
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
        } : DefaultToolbar;

        // Overlay needs check too
        const Overlays = (LassoTool && LassoSelectSvgComponent) ? () => (
            <>
                <TldrawOverlays />
                <LassoSelectSvgComponent />
            </>
        ) : TldrawOverlays;

        return {
            Toolbar,
            Overlays,
            PageMenu: null,
            DebugMenu: null,
            DebugPanel: null,
        };
    }, [TldrawModule, LassoTool, LassoSelectSvgComponent]);

    if (isLoading || !TldrawModule) {
        return (
            <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Loading...
            </div>
        );
    }

    const { Tldraw } = TldrawModule;

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
            <div style={{ flex: 1, position: 'relative' }}>
                <Tldraw
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
