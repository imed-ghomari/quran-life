'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { X, Save, Share2, Maximize2, Minimize2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Tldraw, DefaultDashStyle, DefaultSizeStyle } from 'tldraw';
import 'tldraw/tldraw.css';

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
                            localStorage.clear(); // Clear all for safety or specific key
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

    // Set Defaults
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

        if (initialSnapshot) {
            try {
                editorInstance.store.loadSnapshot(initialSnapshot);
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
            <div className="tldraw-container" style={{ position: 'absolute', top: '50px', left: 0, right: 0, bottom: 0, background: '#f8f9fa' }}>
                <Tldraw
                    onMount={handleMount}
                    inferDarkMode={true}
                    forceMobile={true}
                    components={{
                        PageMenu: null,
                        DebugMenu: null,
                        DebugPanel: null,
                        SharePanel: null,
                        MainMenu: null,
                    }}
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

// Export dynamic to prevent SSR of the entire editor
export default dynamic(() => Promise.resolve(MindmapEditorInner), {
    ssr: false,
    loading: () => <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'white' }}>Loading Editor (Dynamic)...</div>
});
