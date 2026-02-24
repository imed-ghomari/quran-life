'use client';

import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import dynamic from 'next/dynamic';
import Spinner from '@/components/ui/Spinner';
import { appLogger } from '@/lib/logger';
import { useTheme } from '@/components/ThemeProvider';
import { getSurah } from '@/lib/quranData';
import {
    clipboardHasBlockedMedia,
    dataTransferHasBlockedMedia,
    sanitizeMindmapSnapshot,
} from '@/lib/mindmapSnapshot';
import {
    Tldraw,
    Editor,
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
    ArrowToolbarItem,
    TextToolbarItem,
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
    onSave?: (snapshot: any, images?: { light?: Blob, dark?: Blob }, shouldClose?: boolean) => Promise<void>;
    onClose: () => void;
    title?: string;
    docLink?: string | null;
    contextLabel?: string;
}

const extractContextFromTitle = (value?: string | null): string | null => {
    if (!value) return null;
    const partMatch = value.match(/\bpart\s+(\d+)\b/i);
    if (partMatch) return `Part ${partMatch[1]}`;

    const surahNameMatch = value.match(/(?:edit\s+)?(.+?)\s+mindmap(?:\s+editor)?$/i);
    if (!surahNameMatch) return null;
    const candidate = surahNameMatch[1]?.trim();
    if (!candidate) return null;
    const blocked = ['mindmap', 'preview', 'reference map', 'viewer'];
    if (blocked.some((token) => candidate.toLowerCase() === token)) return null;
    return candidate;
};

const extractContextFromDocLink = (value?: string | null): string | null => {
    if (!value) return null;
    const surahMatch = value.match(/surah-(\d+)/i);
    if (surahMatch) {
        const surahId = Number(surahMatch[1]);
        const surah = Number.isFinite(surahId) ? getSurah(surahId) : null;
        return surah ? `Surah ${surah.id}. ${surah.name}` : `Surah ${surahId}`;
    }
    const partMatch = value.match(/part-(\d+)/i);
    if (partMatch) return `Part ${partMatch[1]}`;
    return null;
};

/**
 * Prevents tldraw from getting stuck in pen mode when using pen/tablet devices.
 * If a non-pen pointer event arrives while pen mode is active, force pen mode off.
 */
function usePenModeUnstick(editor: Editor | null) {
    useEffect(() => {
        if (!editor) return;

        editor.updateInstanceState({ isPenMode: false });

        const container = editor.getContainer();
        if (!container) return;

        const handlePointerDown = (e: PointerEvent) => {
            const isNonPen = e.pointerType === 'mouse' || e.pointerType === 'touch';
            if (isNonPen && editor.getInstanceState().isPenMode) {
                editor.updateInstanceState({ isPenMode: false });
            }
        };

        container.addEventListener('pointerdown', handlePointerDown, true);

        return () => {
            container.removeEventListener('pointerdown', handlePointerDown, true);
        };
    }, [editor]);
}

function MindmapEditorContent({ initialSnapshot, onSave, onClose, title, docLink, contextLabel }: MindmapEditorProps) {
    const [editor, setEditor] = useState<any>(null);
    const editorRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const { theme } = useTheme();
    const currentContextLabel = useMemo(
        () => contextLabel || extractContextFromDocLink(docLink) || extractContextFromTitle(title),
        [contextLabel, docLink, title]
    );
    const shouldShowContextLabel = useMemo(() => !!currentContextLabel, [currentContextLabel]);

    useEffect(() => {
        try {
            DefaultDashStyle.setDefaultValue('solid');
            DefaultSizeStyle.setDefaultValue('m');
        } catch (e) {
            console.warn('Failed to set defaults', e);
        }
    }, []);

    usePenModeUnstick(editor);

    const handleMount = useCallback((editorInstance: any) => {
        setEditor(editorInstance);
        editorRef.current = editorInstance;

        // --- Obsidian-style switching logic ---
        const pointingCanvasState = editorInstance.getStateDescendant('select.pointing_canvas') as {
            onEnter?: (...args: any[]) => void;
        } | null;
        if (pointingCanvasState) {
            const originalOnEnter = pointingCanvasState.onEnter;
            pointingCanvasState.onEnter = function (...args: any[]) {
                const info = args[0];
                const selectedShapeIds = editorInstance.getSelectedShapeIds();
                const selectionBounds = editorInstance.getSelectionPageBounds();

                if (selectedShapeIds.length === 0 || (selectionBounds && !selectionBounds.containsPoint(info.point))) {
                    editorInstance.setCurrentTool('lasso-select');
                    return;
                }
                originalOnEnter?.apply(this, args);
            };
        }

        if (initialSnapshot) {
            try {
                const sanitizedInitialSnapshot = sanitizeMindmapSnapshot(initialSnapshot) || initialSnapshot;
                // Determine if we're loading a v4 snapshot or v3
                // Standard Tldraw (v2+) uses getSnapshot/loadSnapshot
                if (typeof editorInstance.loadSnapshot === 'function') {
                    editorInstance.loadSnapshot(sanitizedInitialSnapshot);
                } else {
                    editorInstance.store.loadSnapshot(sanitizedInitialSnapshot);
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
        // Prevent browser back gesture globally while editor is open
        const originalBodyOverscroll = document.body.style.overscrollBehaviorX;
        const originalHtmlOverscroll = document.documentElement.style.overscrollBehaviorX;
        
        document.body.style.overscrollBehaviorX = 'none';
        document.documentElement.style.overscrollBehaviorX = 'none';
        
        return () => {
            document.body.style.overscrollBehaviorX = originalBodyOverscroll;
            document.documentElement.style.overscrollBehaviorX = originalHtmlOverscroll;
        };
    }, []);

    useEffect(() => {
        const handleWheel = (event: WheelEvent) => {
            const container = containerRef.current;
            if (!container) return;

            const target = event.target;
            const targetNode = target instanceof Node ? target : null;
            if (!targetNode || !container.contains(targetNode)) return;

            if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
                event.preventDefault();
            }
        };

        window.addEventListener('wheel', handleWheel, { capture: true, passive: false });
        return () => window.removeEventListener('wheel', handleWheel, { capture: true });
    }, []);

    useEffect(() => {
        if (!editor) return;
        const colorScheme = theme === 'system' ? 'system' : theme;
        editor.user.updateUserPreferences({ colorScheme });
    }, [editor, theme]);

    useEffect(() => {
        if (!editor) return;

        const handlePaste = (e: ClipboardEvent) => {
            if (clipboardHasBlockedMedia(e)) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            const tldrawContent = e.clipboardData?.getData('application/tldraw');
            if (tldrawContent) {
                try {
                    const parsed = JSON.parse(tldrawContent);
                    // If it has a schema, it might be from a newer version (like Obsidian)
                    // We strip the schema to force tldraw to use the current environment's schema
                    if (parsed.data?.schema) {
                        e.preventDefault();
                        e.stopPropagation();

                        const sanitizedData = sanitizeMindmapSnapshot({
                            ...parsed.data,
                            schema: undefined,
                        }) || { ...parsed.data };
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

        const handleDragOver = (e: DragEvent) => {
            const container = containerRef.current;
            if (!container) return;
            const target = e.target;
            const targetNode = target instanceof Node ? target : null;
            if (!targetNode || !container.contains(targetNode)) return;
            if (!dataTransferHasBlockedMedia(e.dataTransfer)) return;
            e.preventDefault();
            e.stopPropagation();
        };

        const handleDrop = (e: DragEvent) => {
            const container = containerRef.current;
            if (!container) return;
            const target = e.target;
            const targetNode = target instanceof Node ? target : null;
            if (!targetNode || !container.contains(targetNode)) return;
            if (!dataTransferHasBlockedMedia(e.dataTransfer)) return;
            e.preventDefault();
            e.stopPropagation();
        };

        window.addEventListener('paste', handlePaste, true);
        window.addEventListener('dragover', handleDragOver, true);
        window.addEventListener('drop', handleDrop, true);

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
            window.removeEventListener('dragover', handleDragOver, true);
            window.removeEventListener('drop', handleDrop, true);
        };
    }, [editor]);

    // Track last save time to avoid too frequent saves
    const lastSaveTime = useRef<number>(Date.now());
    const isDirty = useRef<boolean>(false);
    const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
    const maxWaitTimer = useRef<NodeJS.Timeout | null>(null);

    const saveContent = useCallback(async (withImages: boolean = false) => {
        // Clear timers to prevent double save
        if (autoSaveTimer.current) {
            clearTimeout(autoSaveTimer.current);
            autoSaveTimer.current = null;
        }
        if (maxWaitTimer.current) {
            clearTimeout(maxWaitTimer.current);
            maxWaitTimer.current = null;
        }

        const editorInst = editorRef.current;
        if (editorInst && onSave) {
            try {
                // Force store snapshot to ensure we get schema and full store
                const snapshot = editorInst.store.getSnapshot();

                // Debug: Check snapshot content size
                const storeKeys = Object.keys(snapshot?.store || {});
                
                if (storeKeys.length === 0) {
                    // Skip saving empty state if we haven't drawn anything
                    return;
                }

                // Export images only if requested (currently disabled to save storage)
        let lightBlob: Blob | undefined;
        let darkBlob: Blob | undefined;
        
        if (withImages && false) { // Force disabled
            try {
                        const shapeIds = Array.from(editorInst.getCurrentPageShapeIds() as Set<string>);
                        if (shapeIds.length > 0) {
                            // Use lower pixelRatio and potentially smaller format to save space
                            // Light mode version
                            const lightResult = await editorInst.toImage(shapeIds, {
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
                            const darkResult = await editorInst.toImage(shapeIds, {
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
                }

                // Keep the persisted snapshot text-only and strip any media/file-backed records.
                const sanitizedSnapshot = sanitizeMindmapSnapshot(snapshot) || snapshot;

                await onSave(sanitizedSnapshot, withImages ? { light: lightBlob, dark: darkBlob } : undefined, withImages);
                isDirty.current = false;
                lastSaveTime.current = Date.now();
                
                if (!withImages) {
                    // appLogger.addLog('[Editor] Auto-saved successfully', 'info');
                }
            } catch (e) {
                console.error("Save failed", e);
            }
        }
    }, [onSave]);

    const handleClose = async () => {
        // Clear any pending auto-save
        if (autoSaveTimer.current) {
            clearTimeout(autoSaveTimer.current);
        }
        if (maxWaitTimer.current) {
            clearTimeout(maxWaitTimer.current);
        }
        // Save only if user actually changed something
        if (isDirty.current) {
            await saveContent(false);
            if (isDirty.current) {
                console.error('Mindmap editor close prevented because latest save did not complete.');
                return;
            }
        }
        onClose();
    };

    // Auto-save logic
    useEffect(() => {
        if (!editor) return;

        const handleChange = () => {
            isDirty.current = true;
            
            // Clear existing debounce timer
            if (autoSaveTimer.current) {
                clearTimeout(autoSaveTimer.current);
            }

            // Set new debounce timer (2s)
            autoSaveTimer.current = setTimeout(() => {
                if (isDirty.current) {
                    saveContent(false); // Auto-save without images
                }
            }, 2000);

            // Throttle: Ensure we save at least every 10 seconds if continuously editing
            if (!maxWaitTimer.current) {
                maxWaitTimer.current = setTimeout(() => {
                    if (isDirty.current) {
                        saveContent(false);
                    }
                }, 10000);
            }
        };

        // Listen to store changes
        const cleanup = editor.store.listen((entry: any) => {
            if (entry.source === 'user') {
                handleChange();
            }
        }, { scope: 'document', source: 'user' });

        return () => {
            cleanup();
            if (autoSaveTimer.current) {
                clearTimeout(autoSaveTimer.current);
            }
            if (maxWaitTimer.current) {
                clearTimeout(maxWaitTimer.current);
            }
        };
    }, [editor, saveContent]);

    // Handle beforeunload to warn/save
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty.current) {
                // Try to trigger a save (async, might not complete)
                saveContent(false);
                
                // Show confirmation dialog
                e.preventDefault();
                e.returnValue = '';
                return '';
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [saveContent]);

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
                        <ArrowToolbarItem />
                        <TextToolbarItem />
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
        MainMenu: null,
    }), []);

    return (
        <div
            ref={containerRef}
            data-mindmap-swipe-guard="true"
            style={{ position: 'fixed', inset: 0, zIndex: 12000, background: 'var(--background, white)', display: 'flex', flexDirection: 'column' }}
        >
            <div
                className="mindmap-editor-header"
                style={{
                height: '50px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 1rem'
            }}>
                <div className="mindmap-editor-header-left mindmap-header-main" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', minWidth: 0 }}>
                    <span className="mindmap-editor-title" style={{ fontWeight: 600 }}>Mindmap Editor</span>
                    {shouldShowContextLabel && (
                        <span
                            className="mindmap-header-context"
                        >
                            {currentContextLabel}
                        </span>
                    )}
                    {docLink && (
                        <a
                            className="btn btn-secondary std-normal-btn mindmap-header-doclink"
                            href={docLink}
                        >
                            Back to Documentation
                        </a>
                    )}
                </div>
                <button
                    onClick={handleClose}
                    className="mindmap-header-close ml-2 shrink-0 p-2 hover:bg-[var(--background-secondary)] rounded-full transition-colors"
                    aria-label="Close editor"
                >
                    <X size={24} />
                </button>
            </div>

            <div className="tldraw-container" style={{ 
                position: 'absolute', 
                top: '50px', 
                left: 0, 
                right: 0, 
                bottom: 0, 
                background: '#f8f9fa',
                overscrollBehaviorX: 'none' // Prevent browser back navigation gesture
            }}>
                <Tldraw
                    onMount={handleMount}
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
        <div style={{ position: 'fixed', inset: 0, zIndex: 12000, background: 'var(--background)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spinner size={32} text="Loading Editor..." />
        </div>
    )
});
