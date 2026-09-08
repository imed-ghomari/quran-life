'use client';

import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import Spinner from '@/components/ui/Spinner';
import { useTheme } from '@/components/ThemeProvider';
import { getSurah } from '@/lib/quranData';
import { useMindMapSnapshot } from '@/hooks/useInstantData';
import { useMindmapBackGestureGuard } from '@/hooks/useMindmapBackGestureGuard';
import type { VaultStore } from '@/plugin/storage/vaultAdapter';
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
            this.parent.transition('idle');
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
        if (selected.length > 0) {
            this.editor.setCurrentTool('select');
            return;
        }
        this.parent.transition('idle');
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
                <div style={{ padding: 20, color: 'var(--text-error)', background: 'var(--background-primary)', overflow: 'auto', height: '100%' }}>
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
    surahId?: number;
    partId?: number;
    onSave?: (snapshot: any, images?: { light?: Blob, dark?: Blob }, shouldClose?: boolean) => Promise<void>;
    onClose: () => void;
    title?: string;
    docLink?: string | null;
    contextLabel?: string;
    vaultStore?: VaultStore;
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

const isInternalPath = (href: string) => href.startsWith('/') && !href.startsWith('//');
const MINDMAP_DRAFT_STORAGE_PREFIX = 'mindmap-editor-draft:v1:';
const SAVE_DRAIN_TIMEOUT_MS = 15000;
const SAVE_DRAIN_POLL_MS = 50;

const normalizeSnapshot = (value: unknown): any | null => {
    if (!value) return null;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch {
            return null;
        }
    }
    if (typeof value === 'object') return value;
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

function MindmapEditorContent({
    initialSnapshot,
    surahId,
    partId,
    onSave,
    onClose,
    title,
    docLink,
    contextLabel,
    vaultStore
}: MindmapEditorProps) {
    const { snapshot: fetchedDbSnapshot, isLoading: isLoadingDb } = useMindMapSnapshot({
        surahId: initialSnapshot || vaultStore ? undefined : surahId,
        partId: initialSnapshot || vaultStore ? undefined : partId
    });
    const [vaultSnapshot, setVaultSnapshot] = useState<any>(null);
    const [isVaultLoading, setIsVaultLoading] = useState(!!vaultStore && !initialSnapshot);
    useEffect(() => {
        if (!vaultStore || initialSnapshot) { setIsVaultLoading(false); return; }
        let cancelled = false;
        (async () => {
            setIsVaultLoading(true);
            const key = surahId ? `surah-${surahId}` : partId !== undefined ? (partId === 0 ? 'meta-0' : `part-${partId}`) : null;
            if (!key) { if (!cancelled) setIsVaultLoading(false); return; }
            const data = await vaultStore.loadMindmap(key);
            if (!cancelled) {
                setVaultSnapshot(data?.snapshot || null);
                setIsVaultLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [vaultStore, surahId, partId, initialSnapshot]);

    const activeInitialSnapshot = useMemo(
        () => normalizeSnapshot(initialSnapshot) || normalizeSnapshot(vaultSnapshot) || normalizeSnapshot(fetchedDbSnapshot),
        [initialSnapshot, vaultSnapshot, fetchedDbSnapshot]
    );
    const isActuallyLoading = !activeInitialSnapshot && (isLoadingDb || isVaultLoading);

    const router = { push: (href: string) => { window.location.hash = href; } } as any;
    const [editor, setEditor] = useState<any>(null);
    const [isExitActionPending, setIsExitActionPending] = useState(false);
    const editorRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const pendingShapeTimestampUpdatesRef = useRef<Map<string, any>>(new Map());
    const timestampFlushTimerRef = useRef<NodeJS.Timeout | null>(null);
    const localDraftTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isDirty = useRef<boolean>(false);
    const isSavingRef = useRef<boolean>(false);
    const queuedSaveRef = useRef<boolean>(false);
    const queuedSaveWithImagesRef = useRef<boolean>(false);
    const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
    const maxWaitTimer = useRef<NodeJS.Timeout | null>(null);
    const isMountedRef = useRef(true);
    const isExitActionInProgressRef = useRef(false);
    const isRestoringHistoryRef = useRef(false);
    const allowNextBackRef = useRef(false);
    const { theme } = useTheme();
    const localDraftKey = useMemo(() => {
        const draftScope = (docLink || contextLabel || title || 'default')
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9_-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        return `${MINDMAP_DRAFT_STORAGE_PREFIX}${draftScope || 'default'}`;
    }, [docLink, contextLabel, title]);
    const currentContextLabel = useMemo(
        () => contextLabel || extractContextFromDocLink(docLink) || extractContextFromTitle(title),
        [contextLabel, docLink, title]
    );
    const shouldShowContextLabel = useMemo(() => !!currentContextLabel, [currentContextLabel]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const clearLocalDraft = useCallback(() => {
        try {
            localStorage.removeItem(localDraftKey);
        } catch (error) {
            console.warn('Failed to clear local mindmap draft', error);
        }
    }, [localDraftKey]);

    const persistLocalDraft = useCallback((snapshotOverride?: any) => {
        try {
            const snapshot = snapshotOverride || editorRef.current?.store?.getSnapshot?.();
            const sanitizedSnapshot = sanitizeMindmapSnapshot(snapshot) || snapshot;
            const storeSize = Object.keys(sanitizedSnapshot?.store || {}).length;

            if (!storeSize) {
                localStorage.removeItem(localDraftKey);
                return;
            }

            localStorage.setItem(localDraftKey, JSON.stringify({
                updatedAt: new Date().toISOString(),
                snapshot: sanitizedSnapshot,
            }));
        } catch (error) {
            console.warn('Failed to persist local mindmap draft', error);
        }
    }, [localDraftKey]);

    const scheduleLocalDraftPersist = useCallback(() => {
        if (localDraftTimerRef.current) {
            clearTimeout(localDraftTimerRef.current);
        }
        localDraftTimerRef.current = setTimeout(() => {
            localDraftTimerRef.current = null;
            persistLocalDraft();
        }, 400);
    }, [persistLocalDraft]);

    const loadLocalDraftSnapshot = useCallback(() => {
        try {
            const raw = localStorage.getItem(localDraftKey);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object' || !parsed.snapshot) return null;
            return normalizeSnapshot(parsed.snapshot);
        } catch (error) {
            console.warn('Failed to load local mindmap draft', error);
            return null;
        }
    }, [localDraftKey]);

    const flushPendingShapeTimestampUpdates = useCallback(() => {
        if (timestampFlushTimerRef.current) {
            clearTimeout(timestampFlushTimerRef.current);
            timestampFlushTimerRef.current = null;
        }

        const editorInst = editorRef.current;
        if (!editorInst) return;

        const pendingRecords = Array.from(pendingShapeTimestampUpdatesRef.current.values());
        pendingShapeTimestampUpdatesRef.current.clear();
        if (pendingRecords.length === 0) return;

        const now = new Date().toISOString();
        const updates = pendingRecords.map((record) => ({
            ...record,
            meta: { ...record.meta, updatedAt: now }
        }));

        editorInst.store.put(updates);
    }, []);

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

        const localDraftSnapshot = loadLocalDraftSnapshot();
        const snapshotToLoad = localDraftSnapshot || activeInitialSnapshot;

        if (snapshotToLoad) {
            try {
                const sanitizedInitialSnapshot = sanitizeMindmapSnapshot(snapshotToLoad) || snapshotToLoad;
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

                if (localDraftSnapshot) {
                    isDirty.current = true;
                }
            } catch (e) {
                console.warn('Failed to load snapshot', e);
            }
        } else {
            // Default to lasso tool on new drawings too
            editorInstance.setCurrentTool('lasso-select');
        }
    }, [activeInitialSnapshot, loadLocalDraftSnapshot]);

    // Update snapshot if it arrives late
    useEffect(() => {
        const editorInst = editorRef.current;
        if (editorInst && activeInitialSnapshot && !editorInst.getCurrentPageRenderingShapesSorted().length) {
            try {
                const sanitized = sanitizeMindmapSnapshot(activeInitialSnapshot) || activeInitialSnapshot;
                if (typeof editorInst.loadSnapshot === 'function') {
                    editorInst.loadSnapshot(sanitized);
                } else {
                    editorInst.store.loadSnapshot(sanitized);
                }
                setTimeout(() => editorInst.zoomToFit(), 100);
            } catch (e) {
                console.warn('Failed to load late snapshot', e);
            }
        }
    }, [activeInitialSnapshot]);

    useMindmapBackGestureGuard(true);

    useEffect(() => {
        document.body.setAttribute('data-mindmap-open', 'true');
        return () => {
            document.body.removeAttribute('data-mindmap-open');
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
        const getObsidianTheme = () => {
            if (typeof document === 'undefined') return null as 'light' | 'dark' | null;
            if (document.body.classList.contains('theme-dark') || document.documentElement.classList.contains('theme-dark')) return 'dark';
            if (document.body.classList.contains('theme-light') || document.documentElement.classList.contains('theme-light')) return 'light';
            return null;
        };
        const apply = () => {
            const obs = getObsidianTheme();
            let resolved: 'light' | 'dark' | 'system';
            if (obs) resolved = obs;
            else if (theme === 'system') {
                const mqDark = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false;
                resolved = mqDark ? 'dark' : 'light';
            } else resolved = theme as 'light' | 'dark';
            // Always force explicit light/dark, not system, when Obsidian theme is known
            editor.user.updateUserPreferences({ colorScheme: resolved });
        };
        apply();
        const observer = new MutationObserver(apply);
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        let mq: MediaQueryList | null = null;
        let mqHandler: (() => void) | null = null;
        if (!getObsidianTheme() && theme === 'system' && typeof window !== 'undefined' && window.matchMedia) {
            mq = window.matchMedia('(prefers-color-scheme: dark)');
            mqHandler = () => apply();
            if (mq.addEventListener) mq.addEventListener('change', mqHandler);
            else mq.addListener(mqHandler);
        }
        return () => {
            observer.disconnect();
            if (mq && mqHandler) {
                if (mq.removeEventListener) mq.removeEventListener('change', mqHandler);
                else mq.removeListener(mqHandler);
            }
        };
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

        const isShapeRecord = (rec: any) => rec?.typeName === 'shape' && typeof rec?.id === 'string';

        const scheduleShapeTimestampFlush = () => {
            if (timestampFlushTimerRef.current) return;
            // Batch frequent pointer updates to avoid write amplification while drawing.
            timestampFlushTimerRef.current = setTimeout(flushPendingShapeTimestampUpdates, 700);
        };

        // --- Change Listener for Sync Timestamps ---
        // Tag shape records with updatedAt, but batch writes to keep drawing responsive.
        const cleanupListener = editor.store.listen(
            (event: any) => {
                if (event.source !== 'user') return;

                const changes = event.changes;

                // Handle updates
                Object.values(changes.updated || {}).forEach((update: any) => {
                    const [, to] = update;
                    if (isShapeRecord(to)) {
                        pendingShapeTimestampUpdatesRef.current.set(to.id, to);
                    }
                });

                // Handle additions
                Object.values(changes.added || {}).forEach((record: any) => {
                    if (isShapeRecord(record)) {
                        pendingShapeTimestampUpdatesRef.current.set(record.id, record);
                    }
                });

                // If a shape was removed before batch flush, drop any pending write for it.
                Object.values(changes.removed || {}).forEach((record: any) => {
                    if (isShapeRecord(record)) {
                        pendingShapeTimestampUpdatesRef.current.delete(record.id);
                    }
                });

                if (pendingShapeTimestampUpdatesRef.current.size > 0) {
                    scheduleShapeTimestampFlush();
                }
            },
            { scope: 'document', source: 'user' } // Only listen to user actions
        );

        return () => {
            cleanupListener();
            if (timestampFlushTimerRef.current) {
                clearTimeout(timestampFlushTimerRef.current);
                timestampFlushTimerRef.current = null;
            }
            pendingShapeTimestampUpdatesRef.current.clear();
            window.removeEventListener('paste', handlePaste, true);
            window.removeEventListener('dragover', handleDragOver, true);
            window.removeEventListener('drop', handleDrop, true);
        };
    }, [editor, flushPendingShapeTimestampUpdates]);

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

        if (isSavingRef.current) {
            queuedSaveRef.current = true;
            queuedSaveWithImagesRef.current = queuedSaveWithImagesRef.current || withImages;
            return;
        }

        const editorInst = editorRef.current;
        if (!editorInst) return;
        if (!onSave) {
            persistLocalDraft();
            return;
        }

        isSavingRef.current = true;
        try {
                // Ensure all pending shape-level updatedAt tags are present before persisting snapshot.
                flushPendingShapeTimestampUpdates();

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
                persistLocalDraft(sanitizedSnapshot);

                await onSave(sanitizedSnapshot, withImages ? { light: lightBlob, dark: darkBlob } : undefined, withImages);
                isDirty.current = false;
                clearLocalDraft();
                
                if (!withImages) {
                    // appLogger.addLog('[Editor] Auto-saved successfully', 'info');
                }
            } catch (e) {
                console.error("Save failed", e);
            } finally {
                isSavingRef.current = false;

                if (queuedSaveRef.current) {
                    const nextSaveWithImages = queuedSaveWithImagesRef.current;
                    queuedSaveRef.current = false;
                    queuedSaveWithImagesRef.current = false;
                    void saveContent(nextSaveWithImages);
                }
            }
    }, [onSave, flushPendingShapeTimestampUpdates, persistLocalDraft, clearLocalDraft]);

    const waitForSaveQueueToDrain = useCallback(async () => {
        const startedAt = Date.now();
        while (isSavingRef.current || queuedSaveRef.current) {
            if (Date.now() - startedAt >= SAVE_DRAIN_TIMEOUT_MS) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, SAVE_DRAIN_POLL_MS));
        }
    }, []);

    const ensureSavedBeforeExit = useCallback(async () => {
        if (autoSaveTimer.current) {
            clearTimeout(autoSaveTimer.current);
            autoSaveTimer.current = null;
        }
        if (maxWaitTimer.current) {
            clearTimeout(maxWaitTimer.current);
            maxWaitTimer.current = null;
        }

        flushPendingShapeTimestampUpdates();
        persistLocalDraft();

        if (isDirty.current || isSavingRef.current || queuedSaveRef.current) {
            await saveContent(false);
            await waitForSaveQueueToDrain();
        }

        if (!isDirty.current) {
            clearLocalDraft();
            return true;
        }

        persistLocalDraft();
        console.error('Mindmap editor exit prevented because latest save did not complete.');
        return false;
    }, [clearLocalDraft, flushPendingShapeTimestampUpdates, persistLocalDraft, saveContent, waitForSaveQueueToDrain]);

    const runExitAction = useCallback(async (action: () => void | Promise<void>) => {
        if (isExitActionInProgressRef.current) return;

        isExitActionInProgressRef.current = true;
        if (isMountedRef.current) {
            setIsExitActionPending(true);
        }

        try {
            const canExit = await ensureSavedBeforeExit();
            if (!canExit) return;
            await action();
        } finally {
            isExitActionInProgressRef.current = false;
            if (isMountedRef.current) {
                setIsExitActionPending(false);
            }
        }
    }, [ensureSavedBeforeExit]);

    const handleClose = useCallback(async () => {
        await runExitAction(async () => {
            onClose();
        });
    }, [onClose, runExitAction]);

    const handleDocNavigation = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        if (!docLink) return;
        if (isExitActionPending) return;

        void runExitAction(async () => {
            if (isInternalPath(docLink)) {
                window.location.hash = docLink;
                return;
            }
            window.location.assign(docLink);
        });
    }, [docLink, isExitActionPending, router, runExitAction]);

    // Auto-save logic
    useEffect(() => {
        if (!editor) return;

        const handleChange = () => {
            isDirty.current = true;
            scheduleLocalDraftPersist();
            
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
            if (localDraftTimerRef.current) {
                clearTimeout(localDraftTimerRef.current);
                localDraftTimerRef.current = null;
            }
        };
    }, [editor, saveContent, scheduleLocalDraftPersist]);

    useEffect(() => {
        const persistDraftOnLifecycleExit = () => {
            if (isDirty.current || isSavingRef.current || queuedSaveRef.current) {
                persistLocalDraft();
            }
        };

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (!isDirty.current && !isSavingRef.current && !queuedSaveRef.current) return;

            persistDraftOnLifecycleExit();
            void saveContent(false);
            e.preventDefault();
            e.returnValue = '';
            return '';
        };

        const handlePageHide = () => {
            persistDraftOnLifecycleExit();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                persistDraftOnLifecycleExit();
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('pagehide', handlePageHide);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('pagehide', handlePageHide);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [persistLocalDraft, saveContent]);

    useEffect(() => {
        const handlePopState = () => {
            if (allowNextBackRef.current) {
                allowNextBackRef.current = false;
                return;
            }

            if (isRestoringHistoryRef.current) {
                isRestoringHistoryRef.current = false;
                return;
            }

            isRestoringHistoryRef.current = true;
            window.history.go(1);
            setTimeout(() => {
                isRestoringHistoryRef.current = false;
            }, 0);

            void runExitAction(async () => {
                allowNextBackRef.current = true;
                window.history.back();
            });
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [runExitAction]);

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

    if (isActuallyLoading) {
        return (
            <div style={{ position: 'fixed', inset: 0, zIndex: 12000, background: 'var(--background-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spinner size={32} text="Loading Mindmap..." />
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            data-mindmap-swipe-guard="true"
            style={{ position: 'fixed', inset: 0, zIndex: 12000, background: 'var(--background-primary)', display: 'flex', flexDirection: 'column' }}
        >
            <div
                className="mindmap-editor-header"
                style={{
                height: '50px',
                borderBottom: '1px solid var(--background-modifier-border)',
                background: 'var(--background-primary)',
                color: 'var(--text-normal)',
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
                        isInternalPath(docLink) ? (
                            <a
                                className="btn btn-secondary std-normal-btn mindmap-header-doclink"
                                href={docLink}
                                onClick={handleDocNavigation}
                                aria-disabled={isExitActionPending}
                            >
                                <span className="hidden md:inline">Back to Documentation</span>
                                <span className="md:hidden">Back to Docs</span>
                            </a>
                        ) : (
                            <a
                                className="btn btn-secondary std-normal-btn mindmap-header-doclink"
                                href={docLink}
                                onClick={handleDocNavigation}
                                aria-disabled={isExitActionPending}
                            >
                                <span className="hidden md:inline">Back to Documentation</span>
                                <span className="md:hidden">Back to Docs</span>
                            </a>
                        )
                    )}
                </div>
                <button
                    onClick={() => { void handleClose(); }}
                    className="mindmap-header-close ml-2 shrink-0 p-2 hover:bg-[var(--background-secondary)] rounded-full transition-colors"
                    aria-label="Close editor"
                    disabled={isExitActionPending}
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
                background: 'var(--background-primary)',
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

export default MindmapEditorInner;
