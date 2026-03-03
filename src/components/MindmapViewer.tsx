'use client';

import { useCallback, useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Maximize2, X } from 'lucide-react';
import Spinner from '@/components/ui/Spinner';
import { getSurah } from '@/lib/quranData';
import 'tldraw/tldraw.css';

// Only load tldraw on the client
const Tldraw = dynamic(
    async () => {
        const { Tldraw } = await import('tldraw');
        return Tldraw;
    },
    { ssr: false }
);

interface MindmapViewerProps {
    snapshot?: any;
    templateUrl?: string | null;
    imageUrl?: string | null;
    imageUrlDark?: string | null;
    isDark: boolean;
    title?: string;
    contextLabel?: string;
    docLink?: string | null;
    showDocLink?: boolean;
    height?: string | number;
    className?: string;
    style?: React.CSSProperties;
}

const extractContextFromTitle = (value?: string | null): string | null => {
    if (!value) return null;
    const partMatch = value.match(/\bpart\s+(\d+)\b/i);
    if (partMatch) return `Part ${partMatch[1]}`;

    const surahNumberMatch = value.match(/\bsurah\s+(\d+)\b/i);
    if (surahNumberMatch) {
        const surahId = Number(surahNumberMatch[1]);
        const surah = Number.isFinite(surahId) ? getSurah(surahId) : null;
        return surah ? `Surah ${surah.id}. ${surah.name}` : `Surah ${surahId}`;
    }

    const surahNameMatch = value.match(/(.+?)\s+mindmap(?:\s+viewer)?$/i);
    if (!surahNameMatch) return null;
    const candidate = surahNameMatch[1]?.trim();
    if (!candidate) return null;
    const blocked = ['mindmap', 'preview', 'reference map', 'viewer', 'full screen'];
    if (blocked.some((token) => candidate.toLowerCase() === token)) return null;
    return candidate;
};

const extractContextFromTemplateUrl = (value?: string | null): string | null => {
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

const hasRenderableShapes = (value: any | null): boolean => {
    if (!value || !value.store || typeof value.store !== 'object') return false;
    return Object.keys(value.store).some((key) => key.startsWith('shape:'));
};

export default function MindmapViewer({
    snapshot,
    templateUrl,
    imageUrl,
    imageUrlDark,
    isDark,
    title,
    contextLabel,
    docLink,
    showDocLink = true,
    height = '400px',
    className,
    style
}: MindmapViewerProps) {
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [fetchedSnapshot, setFetchedSnapshot] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [imageFailed, setImageFailed] = useState(false);
    const [editor, setEditor] = useState<any>(null);
    const [inlineEditor, setInlineEditor] = useState<any>(null);
    const [showInlineBackToContent, setShowInlineBackToContent] = useState(false);
    const activeSnapshot = useMemo(
        () => normalizeSnapshot(fetchedSnapshot) || normalizeSnapshot(snapshot),
        [fetchedSnapshot, snapshot]
    );
    const hasSnapshot = !!activeSnapshot;
    const hasRenderableSnapshot = useMemo(() => hasRenderableShapes(activeSnapshot), [activeSnapshot]);
    const shouldFillParent = height === '100%';
    const viewerSizeStyle = useMemo<React.CSSProperties>(() => (
        shouldFillParent
            ? { flex: 1, minHeight: 0 }
            : { height, minHeight: height }
    ), [height, shouldFillParent]);
    const displayUrl = isDark ? (imageUrlDark || imageUrl) : (imageUrl || imageUrlDark);
    const hasImage = !!displayUrl && !hasSnapshot && !imageFailed;
    const currentContextLabel = useMemo(
        () => contextLabel || extractContextFromTemplateUrl(templateUrl) || extractContextFromTitle(title),
        [contextLabel, templateUrl, title]
    );
    const shouldShowContextLabel = useMemo(() => !!currentContextLabel, [currentContextLabel]);
    const resolvedDocLink = useMemo(() => {
        if (!showDocLink) return null;
        if (docLink) return docLink;
        if (!templateUrl) return null;

        const surahMatch = templateUrl.match(/surah-(\d+)/i);
        if (surahMatch) return `/docs/mindmaps/surah-${surahMatch[1]}`;

        const partMatch = templateUrl.match(/part-(\d+)/i);
        if (partMatch) return `/docs/mindmaps/part-${partMatch[1]}`;

        return null;
    }, [docLink, showDocLink, templateUrl]);

    useEffect(() => {
        if (editor?.user?.updateUserPreferences) {
            try {
                editor.user.updateUserPreferences({ colorScheme: isDark ? 'dark' : 'light' });
            } catch (e) {
                console.warn('Failed to update theme', e);
            }
        }
    }, [editor, isDark]);

    useEffect(() => {
        if (templateUrl) {
            setIsLoading(true);
            fetch(templateUrl)
                .then(res => {
                    if (!res.ok) {
                        // If 404, just return null so we stop loading
                        if (res.status === 404) {
                            return null;
                        }
                        throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
                    }
                    const contentType = res.headers.get("content-type");
                    if (!contentType || !contentType.includes("application/json")) {
                        throw new Error("Received non-JSON response");
                    }
                    return res.json();
                })
                .then(data => {
                    if (data) {
                        setFetchedSnapshot(data);
                    }
                    setIsLoading(false);
                })
                .catch(err => {
                    console.warn('Could not load mindmap template:', err.message);
                    setIsLoading(false);
                });
        }
    }, [templateUrl]);

    useEffect(() => {
        setImageFailed(false);
    }, [displayUrl]);

    useEffect(() => {
        if (isFullScreen) {
            document.body.setAttribute('data-mindmap-open', 'true');
            document.body.style.overflow = 'hidden';
        } else {
            document.body.removeAttribute('data-mindmap-open');
            document.body.style.overflow = '';
        }
        return () => {
            document.body.removeAttribute('data-mindmap-open');
            document.body.style.overflow = '';
        };
    }, [isFullScreen]);

    useEffect(() => {
        const handleWheel = (event: WheelEvent) => {
            const target = event.target;
            const targetElement =
                target instanceof Element
                    ? target
                    : target instanceof Node
                        ? target.parentElement
                        : null;

            if (!targetElement?.closest('[data-mindmap-swipe-guard="true"]')) {
                return;
            }

            if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
                event.preventDefault();
            }
        };

        window.addEventListener('wheel', handleWheel, { capture: true, passive: false });
        return () => window.removeEventListener('wheel', handleWheel, { capture: true });
    }, []);

    useEffect(() => {
        if (!inlineEditor || !activeSnapshot) {
            setShowInlineBackToContent(false);
            return;
        }

        const updateVisibility = () => {
            try {
                const shapeIds = inlineEditor.getCurrentPageShapeIds?.();
                const culledShapes = inlineEditor.getCulledShapes?.();
                const total = shapeIds?.size ?? 0;
                const culled = culledShapes?.size ?? 0;
                setShowInlineBackToContent(total > 0 && total === culled);
            } catch {
                setShowInlineBackToContent(false);
            }
        };

        updateVisibility();
        const intervalId = window.setInterval(updateVisibility, 200);
        window.addEventListener('resize', updateVisibility);

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener('resize', updateVisibility);
        };
    }, [inlineEditor, activeSnapshot]);

    const inlineComponents = useMemo(() => ({
        Toolbar: null,
        PageMenu: null,
        NavigationPanel: null,
        MainMenu: null,
        ContextMenu: null,
        ActionsMenu: null,
        DebugMenu: null,
        DebugPanel: null,
        SharePanel: null,
        HelpMenu: null,
        Minimap: null,
        ZoomMenu: null,
        StylePanel: null,
        PageMenuTrigger: null,
        Menu: null,
    }), []);

    const fullScreenComponents = useMemo(() => ({
        Toolbar: null,
        PageMenu: null,
        MainMenu: null,
        ContextMenu: null,
        ActionsMenu: null,
        DebugMenu: null,
        DebugPanel: null,
        SharePanel: null,
        HelpMenu: null,
        Minimap: null,
        ZoomMenu: null,
        StylePanel: null,
        PageMenuTrigger: null,
        Menu: null,
    }), []);

    const handleMount = useCallback((editor: any) => {
        setEditor(editor);
        editor.updateInstanceState({ isReadonly: true });
        editor.setCurrentTool('hand');
        // Disable camera movement and other interactions
        // editor.setCameraOptions({ isLocked: true });

        // Zoom to fit content immediately after mount
        editor.zoomToFit({ duration: 0 });
        
        // Do it again after a short delay to ensure all shapes are loaded and bounds are correct
        setTimeout(() => {
            editor.zoomToFit({ duration: 0 });
        }, 500);
    }, []);

    // If we have an image URL, show that initially for performance
    // Only switch to Tldraw if user wants to interact or if it's the only option?
    // For now, let's keep the hybrid approach: Image -> Click -> Fullscreen Tldraw
    // OR just use Tldraw inline if no image.

    // If no snapshot and no template, return nothing or placeholder
    if (!snapshot && !templateUrl && !displayUrl) return null;

    if (isLoading) {
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spinner text="Loading official mindmap..." />
            </div>
        );
    }

    // Inline view
    const renderInline = () => {
        if (hasImage) {
            return (
                <div 
                    className={`relative w-full h-full group cursor-pointer overflow-hidden rounded-xl bg-[var(--background-secondary)] ${className || ''}`}
                    onClick={() => setIsFullScreen(true)}
                    data-mindmap-swipe-guard="true"
                    style={{ ...viewerSizeStyle, ...style }}
                >
                    <Image
                        src={displayUrl!}
                        alt={title || "Mindmap"}
                        fill
                        onError={() => setImageFailed(true)}
                        className="object-contain p-4 transition-transform duration-300 group-hover:scale-[1.02]"
                        sizes="(max-width: 768px) 100vw, 50vw"
                        priority={false}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300 flex items-center justify-center">
                        <div className="bg-white/90 dark:bg-gray-800/90 p-3 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-4 group-hover:translate-y-0 backdrop-blur-sm">
                            <Maximize2 size={20} className="text-[var(--accent)]" />
                        </div>
                    </div>
                </div>
            );
        }

        // If no image, render Tldraw inline (might be heavy)
        if (hasSnapshot && activeSnapshot) {
            // We need a specific key for Tldraw to force re-render/re-mount when toggling fullscreen
            // but for inline view, we just want it to be reliable.
            // Using a separate handleMount for inline to ensure zoom happens correctly there too.
            const handleInlineMount = (editor: any) => {
                setInlineEditor(editor);
                setEditor(editor);
                editor.updateInstanceState({ isReadonly: true });
                editor.setCurrentTool('hand');
                
                // Aggressive Zoom-to-Fit strategy
                const fit = () => {
                    try {
                        // Check if we have shapes
                        const shapes = editor.getCurrentPageShapes();
                        if (shapes.length > 0) {
                            editor.zoomToFit({ duration: 0 });
                        }
                    } catch (e) {
                        console.warn('Zoom to fit failed', e);
                    }
                };

                // Immediate
                fit();
                
                // Staggered retries to handle layout/rendering delays
                setTimeout(fit, 100);
                setTimeout(fit, 300);
                setTimeout(fit, 600);
            };

            return (
                <div 
                    className={`w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background-secondary)] relative ${className || ''}`} 
                    data-mindmap-swipe-guard="true"
                    style={{ ...viewerSizeStyle, fontWeight: 400, ...style }}
                >
                    {showInlineBackToContent && (
                        <div className="absolute top-3 left-3 z-10">
                            <button
                                onClick={() => inlineEditor?.zoomToFit({ duration: 200 })}
                                className="btn btn-secondary std-normal-btn"
                            >
                                Back to content
                            </button>
                        </div>
                    )}
                    <div className="absolute top-3 right-3 z-10">
                         <button 
                            onClick={() => setIsFullScreen(true)}
                            className="p-2 bg-[var(--background)] hover:bg-[var(--background-secondary)] border border-[var(--border)] rounded-lg shadow-sm transition-colors"
                            title="Full Screen"
                        >
                            <Maximize2 size={18} className="text-[var(--foreground)]" />
                        </button>
                    </div>
                    <div className="absolute inset-0 w-full h-full" style={{ fontWeight: 400 }}>
                        <Tldraw
                            key="inline-preview"
                            snapshot={activeSnapshot}
                            components={inlineComponents}
                            onMount={handleInlineMount}
                            hideUi
                        />
                    </div>
                </div>
            );
        }

        return (
            <div
                className={`w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background-secondary)] ${className || ''}`}
                style={{ ...viewerSizeStyle, ...style }}
            >
                <div className="h-full w-full flex items-center justify-center text-[var(--foreground-secondary)] text-sm">
                    {imageFailed ? 'Mindmap image unavailable' : 'Mindmap preview unavailable'}
                </div>
            </div>
        );
    };

    return (
        <>
            {renderInline()}

            {isFullScreen && createPortal(
                <div className="fixed inset-0 z-[13000] bg-[var(--background)] flex flex-col animate-in fade-in duration-200" data-mindmap-swipe-guard="true">
                    <div
                        className="mindmap-viewer-header flex items-center border-b border-[var(--border)] bg-[var(--background)] shadow-sm"
                        style={{ height: '50px', padding: '0 1rem' }}
                    >
                        <div className="mindmap-header-main min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                            <h3 className="min-w-0 truncate font-semibold text-base sm:text-lg text-[var(--foreground)]">
                                Mindmap Viewer
                            </h3>
                            {shouldShowContextLabel && (
                                <span className="mindmap-header-context inline-flex max-w-[45vw] shrink-0 truncate rounded-full border border-[var(--border)] bg-[var(--background-secondary)] px-3 py-1 text-xs font-semibold text-[var(--foreground-secondary)]">
                                    {currentContextLabel}
                                </span>
                            )}
                            {resolvedDocLink && (
                                isInternalPath(resolvedDocLink) ? (
                                    <Link
                                        className="btn btn-secondary std-normal-btn mindmap-header-doclink"
                                        href={resolvedDocLink}
                                    >
                                        <span className="hidden md:inline">Back to Documentation</span>
                                        <span className="md:hidden">Back to Docs</span>
                                    </Link>
                                ) : (
                                    <a
                                        className="btn btn-secondary std-normal-btn mindmap-header-doclink"
                                        href={resolvedDocLink}
                                    >
                                        <span className="hidden md:inline">Back to Documentation</span>
                                        <span className="md:hidden">Back to Docs</span>
                                    </a>
                                )
                            )}
                        </div>
                        <button 
                            onClick={() => setIsFullScreen(false)}
                            className="mindmap-header-close ml-2 shrink-0 p-2 hover:bg-[var(--background-secondary)] rounded-full transition-colors"
                        >
                            <X size={24} className="text-[var(--foreground)]" />
                        </button>
                    </div>
                    <div className="flex-1 relative bg-[var(--background-secondary)]" style={{ overscrollBehaviorX: 'none', fontWeight: 400 }}>
                        {hasSnapshot && activeSnapshot ? (
                            <Tldraw
                                snapshot={activeSnapshot}
                                components={fullScreenComponents}
                                onMount={handleMount}
                            />
                        ) : hasImage ? (
                            <div className="absolute inset-0">
                                <Image
                                    src={displayUrl!}
                                    alt={title || "Mindmap"}
                                    fill
                                    className="object-contain p-6"
                                    sizes="100vw"
                                    priority={false}
                                />
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full text-[var(--foreground-secondary)]">
                                <div className="text-center">
                                    <p className="mb-2">Map data not available</p>
                                    <button 
                                        onClick={() => setIsFullScreen(false)}
                                        className="text-[var(--accent)] hover:underline"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
