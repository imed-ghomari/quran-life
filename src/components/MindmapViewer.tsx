'use client';

import { useCallback, useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { Maximize2, X } from 'lucide-react';
import Spinner from '@/components/ui/Spinner';
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
    height?: string | number;
}

export default function MindmapViewer({
    snapshot,
    templateUrl,
    imageUrl,
    imageUrlDark,
    isDark,
    title,
    height = '400px'
}: MindmapViewerProps) {
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [fetchedSnapshot, setFetchedSnapshot] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [editor, setEditor] = useState<any>(null);

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
                .then(res => res.json())
                .then(data => {
                    setFetchedSnapshot(data);
                    setIsLoading(false);
                })
                .catch(err => {
                    console.error('Failed to fetch template mindmap:', err);
                    setIsLoading(false);
                });
        }
    }, [templateUrl]);

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

    const displayUrl = isDark ? (imageUrlDark || imageUrl) : imageUrl;
    const hasImage = !!displayUrl;

    const components = useMemo(() => ({
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

    const handleMount = useCallback((editor: any) => {
        setEditor(editor);
        editor.updateInstanceState({ isReadonly: true });
        // Disable camera movement and other interactions
        // editor.setCameraOptions({ isLocked: true });
    }, []);

    // If we have an image URL, show that initially for performance
    // Only switch to Tldraw if user wants to interact or if it's the only option?
    // For now, let's keep the hybrid approach: Image -> Click -> Fullscreen Tldraw
    // OR just use Tldraw inline if no image.

    // If no snapshot and no template, return nothing or placeholder
    if (!snapshot && !templateUrl && !hasImage) return null;

    if (isLoading) {
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spinner text="Loading official mindmap..." />
            </div>
        );
    }

    const activeSnapshot = fetchedSnapshot || snapshot;

    // Inline view
    const renderInline = () => {
        if (hasImage) {
            return (
                <div 
                    className="relative w-full h-full group cursor-pointer overflow-hidden rounded-xl bg-[var(--background-secondary)]"
                    onClick={() => setIsFullScreen(true)}
                    style={{ minHeight: height }}
                >
                    <Image
                        src={displayUrl!}
                        alt={title || "Mindmap"}
                        fill
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
        if (activeSnapshot) {
            return (
                <div className="w-full h-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background-secondary)] relative" style={{ minHeight: height }}>
                    <div className="absolute top-3 right-3 z-10">
                         <button 
                            onClick={() => setIsFullScreen(true)}
                            className="p-2 bg-[var(--background)] hover:bg-[var(--background-secondary)] border border-[var(--border)] rounded-lg shadow-sm transition-colors"
                            title="Full Screen"
                        >
                            <Maximize2 size={18} className="text-[var(--foreground)]" />
                        </button>
                    </div>
                    <Tldraw
                        snapshot={activeSnapshot}
                        components={components}
                        onMount={handleMount}
                        hideUi
                    />
                </div>
            );
        }

        return null;
    };

    return (
        <>
            {renderInline()}

            {isFullScreen && createPortal(
                <div className="fixed inset-0 z-[9999] bg-[var(--background)] flex flex-col animate-in fade-in duration-200">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--background)] shadow-sm">
                        <h3 className="font-bold text-lg text-[var(--foreground)]">{title || "Mindmap Viewer"}</h3>
                        <button 
                            onClick={() => setIsFullScreen(false)}
                            className="p-2 hover:bg-[var(--background-secondary)] rounded-full transition-colors"
                        >
                            <X size={24} className="text-[var(--foreground)]" />
                        </button>
                    </div>
                    <div className="flex-1 relative bg-[var(--background-secondary)]">
                        {activeSnapshot ? (
                            <Tldraw
                                snapshot={activeSnapshot}
                                components={components}
                                onMount={handleMount}
                            />
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
