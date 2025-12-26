'use client';

import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';

// Import Tldraw CSS globally
import 'tldraw/tldraw.css';

// ============================================
// Lasso Select Tool (from tldraw examples)
// ============================================

import {
    atom,
    pointInPolygon,
    polygonsIntersect,
    StateNode,
    TLPointerEventInfo,
    TLShape,
    VecModel,
} from 'tldraw';

export class LassoSelectTool extends StateNode {
    static override id = 'lasso-select';
    static override children() {
        return [IdleState, LassoingState];
    }
    static override initial = 'idle';
}

class IdleState extends StateNode {
    static override id = 'idle';

    override onPointerDown(info: TLPointerEventInfo) {
        const { editor } = this;
        editor.selectNone();
        this.parent.transition('lassoing', info);
    }
}

export class LassoingState extends StateNode {
    static override id = 'lassoing';

    info = {} as TLPointerEventInfo;
    markId = null as null | string;
    points = atom<VecModel[]>('lasso points', []);

    override onEnter(info: TLPointerEventInfo) {
        this.points.set([]);
        this.markId = null;
        this.info = info;
        this.startLasso();
    }

    private startLasso() {
        this.markId = this.editor.markHistoryStoppingPoint('lasso start');
    }

    override onPointerMove(): void {
        this.addPointToLasso();
    }

    private addPointToLasso() {
        const { inputs } = this.editor;
        const { x, y, z } = inputs.currentPagePoint.toFixed();
        const newPoint = { x, y, z };
        this.points.set([...this.points.get(), newPoint]);
    }

    private getShapesInLasso() {
        const { editor } = this;
        const shapes = editor.getCurrentPageRenderingShapesSorted();
        const lassoPoints = this.points.get();
        const shapesInLasso = shapes.filter((shape) => {
            return this.doesLassoFullyContainShape(lassoPoints, shape);
        });
        return shapesInLasso;
    }

    private doesLassoFullyContainShape(lassoPoints: VecModel[], shape: TLShape): boolean {
        const { editor } = this;
        const geometry = editor.getShapeGeometry(shape);
        const pageTransform = editor.getShapePageTransform(shape);
        const shapeVertices = pageTransform.applyToPoints(geometry.vertices);

        const allVerticesInside = shapeVertices.every((vertex) => {
            return pointInPolygon(vertex, lassoPoints);
        });

        if (!allVerticesInside) {
            return false;
        }

        if (geometry.isClosed) {
            if (polygonsIntersect(shapeVertices, lassoPoints)) {
                return false;
            }
        }

        return true;
    }

    override onPointerUp(): void {
        this.complete();
    }

    override onComplete() {
        this.complete();
    }

    complete() {
        const { editor } = this;
        const shapesInLasso = this.getShapesInLasso();
        editor.setSelectedShapes(shapesInLasso);
        editor.setCurrentTool('select');
    }
}

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

    // UI overrides for lasso select tool
    const uiOverrides = useMemo(() => {
        if (!TldrawModule) return undefined;

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
    }, [TldrawModule]);

    // Lasso overlay component
    const LassoSelectSvgComponent = useMemo(() => {
        if (!TldrawModule) return null;

        const { useEditor: useTldrawEditor, useValue, getStrokePoints, getSvgPathFromStrokePoints } = TldrawModule;

        return function LassoOverlay() {
            const editorInst = useTldrawEditor();

            const lassoPoints = useValue(
                'lasso points',
                () => {
                    if (!editorInst.isIn('lasso-select.lassoing')) return [];
                    const lassoing = editorInst.getStateDescendant('lasso-select.lassoing') as LassoingState;
                    return lassoing.points.get();
                },
                [editorInst]
            );

            const svgPath = useMemo(() => {
                const smoothedPoints = getStrokePoints(lassoPoints);
                const svgPathStr = getSvgPathFromStrokePoints(smoothedPoints, true);
                return svgPathStr;
            }, [lassoPoints]);

            return (
                <>
                    {lassoPoints.length > 0 && (
                        <svg className="tl-overlays__item" aria-hidden="true">
                            <path
                                d={svgPath}
                                fill="var(--color-selection-fill)"
                                opacity={0.5}
                                stroke="var(--color-selection-stroke)"
                                strokeWidth="calc(2px / var(--tl-zoom))"
                            />
                        </svg>
                    )}
                </>
            );
        };
    }, [TldrawModule]);

    // Custom components with lasso first, then other tools
    const components = useMemo(() => {
        if (!TldrawModule || !LassoSelectSvgComponent) return undefined;

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
            // Keep MainMenu for import functionality (not overridden)
            // Hide these
            PageMenu: null,
            DebugMenu: null,
            DebugPanel: null,
            // Custom overlays for lasso
            Overlays: () => (
                <>
                    <TldrawOverlays />
                    <LassoSelectSvgComponent />
                </>
            ),
        };
    }, [TldrawModule, LassoSelectSvgComponent]);

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
                    tools={[LassoSelectTool]}
                    overrides={uiOverrides}
                    components={components}
                />
            </div>
        </div>
    );
}
