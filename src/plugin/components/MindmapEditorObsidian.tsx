'use client';

import React from 'react';
import { X, Check, Loader2, Pencil, TriangleAlert, Minus } from 'lucide-react';
import Spinner from '@/components/ui/Spinner';
import { useTheme } from '@/components/ThemeProvider';
import { getSurah } from '@/lib/quranData';
import { useMindmapBackGestureGuard } from '@/hooks/useMindmapBackGestureGuard';
import type { VaultStore } from '@/plugin/storage/vaultAdapter';
import { readStoredJson, writeStoredJson, removeStored } from '@/lib/pluginStorage';
import {
    clipboardHasBlockedMedia,
    dataTransferHasBlockedMedia,
    sanitizeMindmapSnapshot,
} from '@/lib/mindmapSnapshot';
import {
    Tldraw,
    DefaultDashStyle,
    DefaultSizeStyle,
    atom,
    pointInPolygon,
    polygonsIntersect,
    StateNode,
    TLPointerEventInfo,
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
import {
    attachMindmapSwipeGuard,
    observeObsidianBottomBar,
    observeTldrawWatermarkTitles,
} from '@/plugin/lib/mindmapObsidianGuards';
import type { Editor, TLContent, TLRecord, TLShape, TLStoreEventInfo, TLStoreSnapshot, TLUiOverrides } from 'tldraw';
import type { MindmapSnapshot } from '@/lib/mindmapSnapshot';

const { useCallback, useEffect, useState, useMemo, useRef } = React;

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
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }
    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
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
    initialSnapshot?: MindmapSnapshot | null;
    surahId?: number;
    partId?: number;
    onSave?: (snapshot: MindmapSnapshot, images?: { light?: Blob, dark?: Blob }, shouldClose?: boolean) => Promise<void>;
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

const normalizeSnapshot = (value: unknown): MindmapSnapshot | null => {
    if (!value) return null;
    if (typeof value === 'string') {
        try {
            const parsed: unknown = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? (parsed as MindmapSnapshot) : null;
        } catch {
            return null;
        }
    }
    if (typeof value === 'object') return value as MindmapSnapshot;
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
    // Obsidian uses VaultStore exclusively. Do not import the web app's
    // InstantDB hook here: it is unavailable in Obsidian Mobile and this
    // editor is always opened with a vault-backed store.
    const fetchedDbSnapshot = null;
    const isLoadingDb = false;
    const [vaultSnapshot, setVaultSnapshot] = useState<MindmapSnapshot | null>(null);
    const [isVaultLoading, setIsVaultLoading] = useState(!!vaultStore && !initialSnapshot);
    useEffect(() => {
        if (!vaultStore || initialSnapshot) { setIsVaultLoading(false); return; }
        let cancelled = false;
        void (async () => {
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

    const router: { push: (href: string) => void } = { push: (href: string) => { window.location.hash = href; } };
    const [editor, setEditor] = useState<Editor | null>(null);
    const [isExitActionPending, setIsExitActionPending] = useState(false);
    const editorRef = useRef<Editor | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const pendingShapeTimestampUpdatesRef = useRef<Map<string, TLShape>>(new Map());
    const timestampFlushTimerRef = useRef<number | null>(null);
    const localDraftTimerRef = useRef<number | null>(null);
    const isDirty = useRef<boolean>(false);
    const isSavingRef = useRef<boolean>(false);
    const queuedSaveRef = useRef<boolean>(false);
    const queuedSaveWithImagesRef = useRef<boolean>(false);
    const autoSaveTimer = useRef<number | null>(null);
    const maxWaitTimer = useRef<number | null>(null);
    const isMountedRef = useRef(true);
    const isExitActionInProgressRef = useRef(false);
    const isRestoringHistoryRef = useRef(false);
    const allowNextBackRef = useRef(false);
    const { theme } = useTheme();
    // Silent save-state for top-bar multi-icon indicator. Never triggers
    // banners/toasts/navigation — autosave must not interrupt the user.
    type MindmapSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
    const [saveState, setSaveState] = useState<MindmapSaveState>('idle');
    const saveStateRef = useRef<MindmapSaveState>('idle');
    const setSaveStateBoth = useCallback((next: MindmapSaveState) => {
        saveStateRef.current = next;
        setSaveState(next);
    }, []);
    const localDraftKey = useMemo(() => {
        const keyScope = surahId ? `surah-${surahId}` : partId !== undefined ? (partId === 0 ? 'meta-0' : `part-${partId}`) : null;
        const draftScope = (keyScope || docLink || contextLabel || title || 'default')
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9_-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        return `${MINDMAP_DRAFT_STORAGE_PREFIX}${draftScope || 'default'}`;
    }, [surahId, partId, docLink, contextLabel, title]);
    const currentContextLabel = useMemo(() => {
        const trimmedContext = contextLabel?.trim();
        if (trimmedContext) return trimmedContext;
        if (typeof surahId === 'number' && Number.isFinite(surahId)) {
            const s = getSurah(surahId);
            if (s) return `${s.arabicName} • Surah ${s.id}`;
            return `Surah ${surahId}`;
        }
        if (typeof partId === 'number' && Number.isFinite(partId)) {
            if (partId === 0) return 'Meta Overview';
            return `Part ${partId}`;
        }
        const fromDoc = extractContextFromDocLink(docLink);
        if (fromDoc) return fromDoc;
        const fromTitle = extractContextFromTitle(title);
        if (fromTitle) return fromTitle;
        const trimmedTitle = title?.trim();
        if (trimmedTitle && trimmedTitle.toLowerCase() !== 'mindmap editor') return trimmedTitle;
        return null;
    }, [contextLabel, surahId, partId, docLink, title]);
    const shouldShowContextLabel = useMemo(() => !!currentContextLabel, [currentContextLabel]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const clearLocalDraft = useCallback(() => {
        try {
            // Vault-scoped storage (preferred over window.localStorage).
            removeStored(localDraftKey);
        } catch (error) {
            console.warn('Failed to clear local mindmap draft', error);
        }
    }, [localDraftKey]);

    const persistLocalDraft = useCallback((snapshotOverride?: MindmapSnapshot | null) => {
        try {
            const snapshot: unknown = snapshotOverride || editorRef.current?.store?.getSnapshot?.();
            const sanitizedSnapshot = sanitizeMindmapSnapshot(snapshot) || (snapshot as MindmapSnapshot | undefined);
            const storeSize = Object.keys(sanitizedSnapshot?.store || {}).length;

            if (!storeSize) {
                removeStored(localDraftKey);
                return;
            }

            writeStoredJson(localDraftKey, {
                updatedAt: new Date().toISOString(),
                snapshot: sanitizedSnapshot,
            });
        } catch (error) {
            console.warn('Failed to persist local mindmap draft', error);
        }
    }, [localDraftKey]);

    const scheduleLocalDraftPersist = useCallback(() => {
        if (localDraftTimerRef.current) {
            window.clearTimeout(localDraftTimerRef.current);
        }
        localDraftTimerRef.current = window.setTimeout(() => {
            localDraftTimerRef.current = null;
            persistLocalDraft();
        }, 400);
    }, [persistLocalDraft]);

    const loadLocalDraftSnapshot = useCallback(() => {
        try {
            const parsed = readStoredJson<{ snapshot?: unknown }>(localDraftKey);
            if (!parsed || typeof parsed !== 'object' || !parsed.snapshot) return null;
            return normalizeSnapshot(parsed.snapshot);
        } catch (error) {
            console.warn('Failed to load local mindmap draft', error);
            return null;
        }
    }, [localDraftKey]);

    const flushPendingShapeTimestampUpdates = useCallback(() => {
        if (timestampFlushTimerRef.current) {
            window.clearTimeout(timestampFlushTimerRef.current);
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

    const handleMount = useCallback((editorInstance: Editor) => {
        setEditor(editorInstance);
        editorRef.current = editorInstance;

        // --- Obsidian-style switching logic ---
        const pointingCanvasState = editorInstance.getStateDescendant('select.pointing_canvas') as {
            onEnter?: (info: TLPointerEventInfo, from: string) => void;
        } | null;
        if (pointingCanvasState) {
            const originalOnEnter = pointingCanvasState.onEnter;
            pointingCanvasState.onEnter = function (info, from) {
                const selectedShapeIds = editorInstance.getSelectedShapeIds();
                const selectionBounds = editorInstance.getSelectionPageBounds();

                if (selectedShapeIds.length === 0 || (selectionBounds && !selectionBounds.containsPoint(info.point))) {
                    editorInstance.setCurrentTool('lasso-select');
                    return;
                }
                originalOnEnter?.call(this, info, from);
            };
        }

        const localDraftSnapshot = loadLocalDraftSnapshot();
        const snapshotToLoad = localDraftSnapshot || activeInitialSnapshot;

        if (snapshotToLoad) {
            try {
                const sanitizedInitialSnapshot = (sanitizeMindmapSnapshot(snapshotToLoad) || snapshotToLoad) as unknown as TLStoreSnapshot;
                // Determine if we're loading a v4 snapshot or v3
                // Standard Tldraw (v2+) uses getSnapshot/loadSnapshot
                if (typeof editorInstance.loadSnapshot === 'function') {
                    editorInstance.loadSnapshot(sanitizedInitialSnapshot);
                } else {
                    editorInstance.store.loadSnapshot(sanitizedInitialSnapshot);
                }

                // Set initial tool if desired
                editorInstance.setCurrentTool('lasso-select');

                window.setTimeout(() => {
                    editorInstance.zoomToFit();
                }, 100);

                if (localDraftSnapshot) {
                    isDirty.current = true;
                    setSaveStateBoth('dirty');
                }
            } catch (e) {
                console.warn('Failed to load snapshot', e);
            }
        } else {
            // Default to lasso tool on new drawings too
            editorInstance.setCurrentTool('lasso-select');
        }
    }, [activeInitialSnapshot, loadLocalDraftSnapshot, setSaveStateBoth]);

    // Update snapshot if it arrives late
    useEffect(() => {
        const editorInst = editorRef.current;
        if (editorInst && activeInitialSnapshot && !editorInst.getCurrentPageRenderingShapesSorted().length) {
            try {
                const sanitized = (sanitizeMindmapSnapshot(activeInitialSnapshot) || activeInitialSnapshot) as unknown as TLStoreSnapshot;
                if (typeof editorInst.loadSnapshot === 'function') {
                    editorInst.loadSnapshot(sanitized);
                } else {
                    editorInst.store.loadSnapshot(sanitized);
                }
                window.setTimeout(() => editorInst.zoomToFit(), 100);
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
        // Keep pan/zoom gestures inside the canvas: bubble-phase guard on the
        // container stops touch/wheel gestures from reaching Obsidian's
        // sidebar-reveal and back/forward handlers (tldraw still gets them
        // first at target phase). Replaces the old window-level wheel trap,
        // which could not stop Obsidian's document-level listeners.
        const container = containerRef.current;
        if (!container) return;
        return attachMindmapSwipeGuard(container);
    }, []);

    useEffect(() => {
        // Strip the tldraw watermark hover tooltip ("made with tldraw").
        // The watermark itself stays visible (license); only the native
        // title popup is removed.
        const container = containerRef.current;
        if (!container) return;
        return observeTldrawWatermarkTitles(container);
    }, []);

    useEffect(() => {
        // Measure Obsidian's own bottom bar (phones) and lift tldraw's
        // toolbar only by that amount. Tablets have no such bar, so the
        // offset stays 0 there and no dead gap appears.
        const container = containerRef.current;
        if (!container) return;
        return observeObsidianBottomBar(container);
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
            mq.addEventListener('change', mqHandler);
        }
        return () => {
            observer.disconnect();
            if (mq && mqHandler) {
                mq.removeEventListener('change', mqHandler);
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
                    const parsed: unknown = JSON.parse(tldrawContent);
                    const parsedData = (parsed as { data?: Record<string, unknown> } | null)?.data;
                    // If it has a schema, it might be from a newer version (like Obsidian)
                    // We strip the schema to force tldraw to use the current environment's schema
                    if (parsedData?.schema) {
                        e.preventDefault();
                        e.stopPropagation();

                        const sanitizedData = sanitizeMindmapSnapshot({
                            ...parsedData,
                            schema: undefined,
                        }) || { ...parsedData };
                        delete sanitizedData.schema;

                        // tldraw's external-content handler reads `content`
                        // (TLContent), which is what makes the paste land.
                        editor.putExternalContent({
                            type: 'tldraw',
                            content: sanitizedData as unknown as TLContent,
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

        const isShapeRecord = (rec: TLRecord | null | undefined): rec is TLShape => rec?.typeName === 'shape' && typeof rec?.id === 'string';

        const scheduleShapeTimestampFlush = () => {
            if (timestampFlushTimerRef.current) return;
            // Batch frequent pointer updates to avoid write amplification while drawing.
            timestampFlushTimerRef.current = window.setTimeout(flushPendingShapeTimestampUpdates, 700);
        };

        // --- Change Listener for Sync Timestamps ---
        // Tag shape records with updatedAt, but batch writes to keep drawing responsive.
        const cleanupListener = editor.store.listen(
            (event: TLStoreEventInfo) => {
                if (event.source !== 'user') return;

                const changes = event.changes;
                const { added = {}, updated = {}, removed = {} } = changes;

                // Handle updates
                Object.values(updated).forEach((update) => {
                    const [, to] = update;
                    if (isShapeRecord(to)) {
                        pendingShapeTimestampUpdatesRef.current.set(to.id, to);
                    }
                });

                // Handle additions
                Object.values(added).forEach((record) => {
                    if (isShapeRecord(record)) {
                        pendingShapeTimestampUpdatesRef.current.set(record.id, record);
                    }
                });

                // If a shape was removed before batch flush, drop its pending write.
                Object.values(removed).forEach((record) => {
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
                window.clearTimeout(timestampFlushTimerRef.current);
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
            window.clearTimeout(autoSaveTimer.current);
            autoSaveTimer.current = null;
        }
        if (maxWaitTimer.current) {
            window.clearTimeout(maxWaitTimer.current);
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
        // Silent indicator only — no banner/toast/focus change. Autosave must not interrupt.
        setSaveStateBoth('saving');
        try {
                // Ensure all pending shape-level updatedAt tags are present before persisting snapshot.
                flushPendingShapeTimestampUpdates();

                // Force store snapshot to ensure we get schema and full store
                const snapshot = editorInst.store.getSnapshot();

                // Debug: Check snapshot content size
                const storeKeys = Object.keys(snapshot?.store || {});

                if (storeKeys.length === 0) {
                    // Skip saving empty state if we haven't drawn anything
                    if (isDirty.current) setSaveStateBoth('dirty');
                    else if (saveStateRef.current === 'saving') setSaveStateBoth('idle');
                    return;
                }

                // Export images only if requested (currently disabled to save storage)
        let lightBlob: Blob | undefined;
        let darkBlob: Blob | undefined;

                // Keep the persisted snapshot text-only and strip all media/file-backed records.
                const sanitizedSnapshot = sanitizeMindmapSnapshot(snapshot) || (snapshot as unknown as MindmapSnapshot);
                persistLocalDraft(sanitizedSnapshot);

                // NOTE: onSave is a silent vault persist only. It must never close
                // the editor, toast, or steal focus — autosave stays invisible
                // except for the top-bar indicator.
                await onSave(sanitizedSnapshot, withImages ? { light: lightBlob, dark: darkBlob } : undefined, withImages);
                isDirty.current = false;
                clearLocalDraft();
                setSaveStateBoth('saved');
            } catch (e) {
                console.error("Save failed", e);
                // Silent error state via indicator only — no banner, no dialog.
                setSaveStateBoth('error');
            } finally {
                isSavingRef.current = false;

                if (queuedSaveRef.current) {
                    const nextSaveWithImages = queuedSaveWithImagesRef.current;
                    queuedSaveRef.current = false;
                    queuedSaveWithImagesRef.current = false;
                    void saveContent(nextSaveWithImages);
                } else if (isDirty.current && saveStateRef.current === 'saved') {
                    // Edits landed while saving — reflect unsaved state without banner.
                    setSaveStateBoth('dirty');
                }
            }
    }, [onSave, flushPendingShapeTimestampUpdates, persistLocalDraft, clearLocalDraft, setSaveStateBoth]);

    const waitForSaveQueueToDrain = useCallback(async () => {
        const startedAt = Date.now();
        while (isSavingRef.current || queuedSaveRef.current) {
            if (Date.now() - startedAt >= SAVE_DRAIN_TIMEOUT_MS) {
                break;
            }
            await new Promise(resolve => window.setTimeout(resolve, SAVE_DRAIN_POLL_MS));
        }
    }, []);

    const ensureSavedBeforeExit = useCallback(async () => {
        if (autoSaveTimer.current) {
            window.clearTimeout(autoSaveTimer.current);
            autoSaveTimer.current = null;
        }
        if (maxWaitTimer.current) {
            window.clearTimeout(maxWaitTimer.current);
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
            // Silent indicator transition only — no banner/toast/focus change.
            if (saveStateRef.current !== 'saving') setSaveStateBoth('dirty');
            scheduleLocalDraftPersist();
            
            // Clear existing debounce timer
            if (autoSaveTimer.current) {
                window.clearTimeout(autoSaveTimer.current);
            }

            // Set new debounce timer (2s)
            autoSaveTimer.current = window.setTimeout(() => {
                if (isDirty.current) {
                    void saveContent(false); // Auto-save without images
                }
            }, 2000);

            // Throttle: Ensure we save at least every 10 seconds if continuously editing
            if (!maxWaitTimer.current) {
                maxWaitTimer.current = window.setTimeout(() => {
                    if (isDirty.current) {
                        void saveContent(false);
                    }
                }, 10000);
            }
        };

        // Listen to store changes
        const cleanup = editor.store.listen((entry: TLStoreEventInfo) => {
            if (entry.source === 'user') {
                handleChange();
            }
        }, { scope: 'document', source: 'user' });

        return () => {
            cleanup();
            if (autoSaveTimer.current) {
                window.clearTimeout(autoSaveTimer.current);
            }
            if (maxWaitTimer.current) {
                window.clearTimeout(maxWaitTimer.current);
            }
            if (localDraftTimerRef.current) {
                window.clearTimeout(localDraftTimerRef.current);
                localDraftTimerRef.current = null;
            }
        };
    }, [editor, saveContent, scheduleLocalDraftPersist, setSaveStateBoth]);

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
            window.setTimeout(() => {
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

    const uiOverrides: TLUiOverrides = useMemo(() => ({
        tools(editorInst, tools) {
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
            <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '400px', flex: 1, background: 'var(--background-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spinner size={32} text="Loading Mindmap..." />
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            data-mindmap-swipe-guard="true"
            style={{ position: 'relative', width: '100%', height: '100%', flex: 1, minHeight: '500px', background: 'var(--background-primary)', display: 'flex', flexDirection: 'column', overflow: 'hidden', margin: 0, padding: 0, paddingBottom: 'env(safe-area-inset-bottom, 0px)', gap: 0 }}
        >
            <div
                className="mindmap-editor-header"
                style={{
                minHeight: '50px',
                flexShrink: 0,
                margin: 0,
                borderBottom: '1px solid var(--background-modifier-border)',
                background: 'var(--background-primary)',
                color: 'var(--text-normal)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'calc(env(safe-area-inset-top, 0px)) 1rem 0',
                boxSizing: 'border-box'
            }}>
                <div className="mindmap-editor-header-left mindmap-header-main" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', minWidth: 0 }}>
                    <span className="mindmap-editor-title" style={{ fontWeight: 600, color: 'var(--text-normal)' }}>Mindmap Editor</span>
                    {shouldShowContextLabel && (
                        <span
                            className="mindmap-header-context"
                            title={currentContextLabel || undefined}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                maxWidth: '45vw',
                                border: '1px solid var(--background-modifier-border)',
                                borderRadius: 999,
                                background: 'var(--background-secondary)',
                                color: 'var(--text-muted)',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                lineHeight: 1.2,
                                padding: '3px 10px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                        >
                            {currentContextLabel}
                        </span>
                    )}
                    {(() => {
                        const config = (() => {
                            switch (saveState) {
                                case 'dirty':
                                    return { Icon: Pencil, label: 'Unsaved', color: 'var(--text-warning)', spin: false, hint: 'Unsaved changes — autosave pending' };
                                case 'saving':
                                    return { Icon: Loader2, label: 'Saving…', color: 'var(--interactive-accent)', spin: true, hint: 'Autosaving — keep editing, no interruption' };
                                case 'saved':
                                    return { Icon: Check, label: 'Saved', color: 'var(--interactive-accent)', spin: false, hint: 'All changes saved' };
                                case 'error':
                                    return { Icon: TriangleAlert, label: 'Save failed', color: 'var(--text-error)', spin: false, hint: 'Last autosave failed — keep editing, will retry' };
                                default:
                                    return { Icon: Minus, label: 'Ready', color: 'var(--text-faint)', spin: false, hint: 'No unsaved changes' };
                            }
                        })();
                        const { Icon } = config;
                        return (
                            <span
                                className="mindmap-editor-save-state"
                                title={config.hint}
                                aria-live="off"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    maxWidth: '40vw',
                                    border: '1px solid var(--background-modifier-border)',
                                    borderRadius: 999,
                                    background: 'var(--background-secondary)',
                                    color: config.color,
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    lineHeight: 1.2,
                                    padding: '3px 8px',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}
                            >
                                <Icon size={12} style={config.spin ? { animation: 'mindmap-spin 1s linear infinite' } : undefined} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{config.label}</span>
                            </span>
                        );
                    })()}
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
                    className="mindmap-header-close"
                    aria-label="Close editor"
                    disabled={isExitActionPending}
                    style={{
                        marginLeft: 8,
                        flexShrink: 0,
                        padding: 8,
                        borderRadius: 999,
                        border: '1px solid transparent',
                        background: 'transparent',
                        color: 'var(--text-muted)',
                        cursor: isExitActionPending ? 'wait' : 'pointer',
                        opacity: isExitActionPending ? 0.6 : 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <X size={20} />
                </button>
            </div>

            <div className="tldraw-container" style={{
                position: 'relative',
                flex: 1,
                minHeight: 0,
                minWidth: 0,
                overflow: 'hidden',
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
            <style>{`@keyframes mindmap-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
              .mindmap-header-close:hover { background: var(--background-secondary); }
              /* Keep tldraw UI clear of Obsidian's own floating bottom bar.
                 --ql-obsidian-bottom-offset is measured at runtime (phones);
                 it is 0 on tablets/desktop where no such bar exists, so no
                 dead gap appears there. tldraw already adds the OS safe-area
                 itself via --sab. */
              [data-mindmap-swipe-guard] .tlui-toolbar {
                padding-bottom: calc(var(--space-3) + env(safe-area-inset-bottom, 0px) + var(--ql-obsidian-bottom-offset, 0px)) !important;
              }
              [data-mindmap-swipe-guard] .tlui-navigation-panel {
                bottom: var(--ql-obsidian-bottom-offset, 0px) !important;
              }
              body.is-mobile [data-mindmap-swipe-guard] .tlui-layout__top,
              body.is-phone [data-mindmap-swipe-guard] .tlui-layout__top {
                padding-top: calc(env(safe-area-inset-top, 0px) + 4px);
              }
              body.is-mobile .mindmap-editor-header,
              body.is-phone .mindmap-editor-header {
                min-height: calc(50px + env(safe-area-inset-top, 0px)) !important;
              }
            `}</style>
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
