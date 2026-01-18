'use client';

import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import dynamic from 'next/dynamic';
import Spinner from '@/components/ui/Spinner';
import { appLogger } from '@/lib/logger';
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
    STROKE_SIZES
} from 'tldraw';
import { getStrokePoints, getSvgPathFromStrokePoints } from '@/utils/tldrawStroke';
import 'tldraw/tldraw.css';

// Mutation of stroke sizes as requested
STROKE_SIZES.s = 0.1;
STROKE_SIZES.m = 0.3;
STROKE_SIZES.l = 0.6;
STROKE_SIZES.xl = 1.2;

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
        const { x, y, z } = this.editor.inputs.currentPagePoint.toFixed();
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
        if (lassoPoints.length < 2) {
            this.editor.setCurrentTool('select');
            return;
        }
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
        if (lassoPoints.length < 2) return '';
        const [first, ...rest] = lassoPoints;
        const move = `M ${first.x} ${first.y}`;
        const lines = rest.map((p) => `L ${p.x} ${p.y}`).join(' ');
        return `${move} ${lines} Z`;
    }, [lassoPoints]);

    if (lassoPoints.length < 2) return null;

    return (
        <svg className="tl-overlays__item" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 999 }}>
            <path
                d={svgPath}
                fill="rgba(66, 153, 225, 0.1)"
                stroke="#4299e1"
                strokeWidth="calc(2px / var(--tl-zoom))"
                strokeDasharray="4 4"
            />
        </svg>
    );
};

// ============================================
// MindmapEditor Component
// ============================================

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
                            localStorage.clear();
                            window.location.reload();
                        }}
                        style={{ padding: '8px 16px', background: '#ff4444', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                    >
                        Hard Reset &amp; Reload
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

interface MindmapEditorProps {
    initialSnapshot?: any;
    onSave?: (snapshot: any, images?: { light?: Blob, dark?: Blob }) => Promise<void>;
    onClose: () => void;
    title?: string;
    docLink?: string | null;
}

function MindmapEditorContent({ initialSnapshot, onSave, onClose, title, docLink }: MindmapEditorProps) {
    const [editor, setEditor] = useState<any>(null);
    const editorRef = useRef<any>(null);

    useEffect(() => {
        try {
            DefaultDashStyle.setDefaultValue('solid');
            DefaultSizeStyle.setDefaultValue('m');
        } catch (e) {
            console.warn('Failed to set defaults', e);
        }
    }, []);

    const handleMount = useCallback((editorInstance: any) => {
        setEditor(editorInstance);
        editorRef.current = editorInstance;

        // --- Obsidian-style switching logic ---
        const pointingCanvasState = editorInstance.getStateDescendant('select.pointing_canvas');
        if (pointingCanvasState) {
            const originalOnEnter = pointingCanvasState.onEnter;
            pointingCanvasState.onEnter = function (info: any) {
                const selectedShapeIds = editorInstance.getSelectedShapeIds();
                const selectionBounds = editorInstance.getSelectionPageBounds();

                if (selectedShapeIds.length === 0 || (selectionBounds && !selectionBounds.containsPoint(info.point))) {
                    editorInstance.setCurrentTool('lasso-select');
                    return;
                }
                originalOnEnter?.call(this, info);
            };
        }

        if (initialSnapshot) {
            try {
                // Determine if we're loading a v4 snapshot or v3
                // Standard Tldraw (v2+) uses getSnapshot/loadSnapshot
                if (typeof editorInstance.loadSnapshot === 'function') {
                    editorInstance.loadSnapshot(initialSnapshot);
                } else {
                    editorInstance.store.loadSnapshot(initialSnapshot);
                }

                // Set initial tool if desired
                editorInstance.setCurrentTool('lasso-select');

                setTimeout(() => {
                    editorInstance.zoomToFit();
                }, 100);
            } catch (e) {
                console.warn('Failed to load snapshot', e);
            }
        } else {
            // Default to lasso tool on new drawings too
            editorInstance.setCurrentTool('lasso-select');
        }
    }, [initialSnapshot]);

    useEffect(() => {
        if (!editor) return;

        const handlePaste = (e: ClipboardEvent) => {
            const tldrawContent = e.clipboardData?.getData('application/tldraw');
            if (tldrawContent) {
                try {
                    const parsed = JSON.parse(tldrawContent);
                    // If it has a schema, it might be from a newer version (like Obsidian)
                    // We strip the schema to force tldraw to use the current environment's schema
                    if (parsed.data?.schema) {
                        e.preventDefault();
                        e.stopPropagation();

                        const sanitizedData = { ...parsed.data };
                        delete sanitizedData.schema;

                        editor.putExternalContent({
                            type: 'tldraw',
                            data: sanitizedData,
                            point: editor.inputs.currentPagePoint,
                        });
                    }
                } catch (err) {
                    console.warn('Failed to sanitize tldraw paste:', err);
                }
            }
        };

        window.addEventListener('paste', handlePaste, true);

        // --- Change Listener for Sync Timestamps ---
        // We listen to all changes. If a shape is updated/added by 'user',
        // we essentially "tag" it with a new updatedAt timestamp in its meta.
        // This allows our sync engine to perform granular Last-Write-Wins merging on shapes.
        const cleanupListener = editor.store.listen(
            (event: any) => {
                // appLogger.addLog(`[Editor] Store update source: ${event.source}`, 'info');
                if (event.source !== 'user') return;

                const changes = event.changes;
                const updates: any[] = [];
                const now = new Date().toISOString();

                // Helper to check if record is a shape
                const isShape = (rec: any) => rec.typeName === 'shape';

                // Handle updates
                Object.values(changes.updated || {}).forEach((update: any) => {
                    const [from, to] = update;
                    if (isShape(to)) {
                        // Avoid infinite loops: only update if updatedAt is NOT what we just set
                        if (to.meta?.updatedAt !== now) {
                            updates.push({
                                ...to, // <--- Vital: Spread the full record (x, y, props, etc)
                                meta: { ...to.meta, updatedAt: now }
                            });
                        }
                    }
                });

                if (Object.keys(changes.added || {}).length > 0) {
                    // appLogger.addLog(`[Editor] Added ${Object.keys(changes.added).length} items`, 'info');
                }

                // Handle additions
                Object.values(changes.added || {}).forEach((record: any) => {
                    if (isShape(record)) {
                        updates.push({
                            ...record, // <--- Vital: Spread the full record
                            meta: { ...record.meta, updatedAt: now }
                        });
                    }
                });

                if (updates.length > 0) {
                    // We use store.put to update directly without creating a new undo/redo entry
                    // and usually this triggers source: 'code' which avoids loop
                    appLogger.addLog(`[Editor] Injecting timestamps for ${updates.length} shapes`, 'info');
                    editor.store.put(updates);
                }
            },
            { scope: 'document', source: 'user' } // Only listen to user actions
        );

        return () => {
            cleanupListener();
            window.removeEventListener('paste', handlePaste, true);
        };
    }, [editor]);

    const handleClose = async () => {
        const editorInst = editorRef.current || editor;
        if (editorInst && onSave) {
            try {
                // Force store snapshot to ensure we get schema and full store
                const snapshot = editorInst.store.getSnapshot();

                // Debug: Check snapshot content size
                const storeKeys = Object.keys(snapshot?.store || {});
                const hasSchema = !!snapshot?.schema;
                appLogger.addLog(`[Editor] Saving Snapshot. Items: ${storeKeys.length}. Schema: ${hasSchema}`, 'info');

                if (storeKeys.length === 0) {
                    appLogger.addLog(`[Editor] Warning: Snapshot store appears empty.`, 'error');
                }

                // Export images for preview (both light and dark)
                let lightBlob: Blob | undefined;
                let darkBlob: Blob | undefined;
                try {
                    const shapeIds = Array.from(editor.getCurrentPageShapeIds());
                    if (shapeIds.length > 0) {
                        // Use lower pixelRatio and potentially smaller format to save space
                        // Light mode version
                        const lightResult = await editor.toImage(shapeIds, {
                            format: 'png',
                            quality: 0.8, // Slightly lower quality
                            pixelRatio: 1, // Reduced from 2 to save 4x space
                            padding: 10,
                            theme: 'light'
                        });
                        if (lightResult && lightResult.blob) {
                            lightBlob = lightResult.blob;
                        }

                        // Dark mode version
                        const darkResult = await editor.toImage(shapeIds, {
                            format: 'png',
                            quality: 0.8,
                            pixelRatio: 1,
                            padding: 10,
                            theme: 'dark'
                        });
                        if (darkResult && darkResult.blob) {
                            darkBlob = darkResult.blob;
                        }
                    }
                } catch (imgError) {
                    console.warn("Failed to generate preview images", imgError);
                }

                // Sanitize snapshot: remove non-document records to save space
                // (camera, pointer, transient state etc)
                const sanitizedSnapshot = { ...snapshot };
                if (sanitizedSnapshot.store) {
                    const documentTypes = ['shape', 'asset', 'binding', 'page'];
                    const filteredStore: any = {};
                    Object.entries(sanitizedSnapshot.store).forEach(([id, record]: [string, any]) => {
                        if (documentTypes.some(type => id.startsWith(type + ':'))) {
                            filteredStore[id] = record;
                        }
                    });
                    sanitizedSnapshot.store = filteredStore;
                }

                await onSave(sanitizedSnapshot, { light: lightBlob, dark: darkBlob });
            } catch (e) {
                console.error("Save failed", e);
            }
        }
        onClose();
    };

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
            <div style={{
                height: '50px',
                borderBottom: '1px solid #e5e5e5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 1rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button onClick={handleClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex' }}>
                        <X size={24} />
                    </button>
                    <span style={{ fontWeight: 600 }}>{title || 'Mindmap Editor'}</span>
                    {docLink && (
                        <a
                            href={docLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                fontSize: '0.75rem',
                                color: 'var(--accent)',
                                textDecoration: 'none',
                                padding: '4px 8px',
                                border: '1px solid var(--accent)',
                                borderRadius: '4px',
                                marginLeft: '0.5rem'
                            }}
                        >
                            Back to Documentation
                        </a>
                    )}
                </div>
                <span style={{ fontSize: '0.8rem', color: '#666' }}>Auto-saves on close</span>
            </div>

            <div className="tldraw-container" style={{ position: 'absolute', top: '50px', left: 0, right: 0, bottom: 0, background: '#f8f9fa' }}>
                <Tldraw
                    onMount={handleMount}
                    inferDarkMode={true}
                    tools={[LassoSelectTool]}
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
    loading: () => (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'var(--background)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spinner size={32} text="Loading Editor..." />
        </div>
    )
});
