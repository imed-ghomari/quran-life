'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { X, Save, Share2, Maximize2, Minimize2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import dynamic from 'next/dynamic';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Static import (relying on ssr: false wrapper)
import { Tldraw, defaultEditorAssetUrls, DefaultDashStyle, DefaultSizeStyle } from 'tldraw';
import 'tldraw/tldraw.css';

interface MindmapEditorProps {
    initialSnapshot?: any;
    onSave?: (snapshot: any) => Promise<void>;
    onClose: () => void;
    title?: string;
}

function MindmapEditorContent({ initialSnapshot, onSave, onClose, title }: MindmapEditorProps) {
    const [editor, setEditor] = useState<any>(null);

    // Debug Effect
    const [debugInfo, setDebugInfo] = useState('');
    useEffect(() => {
        if (!editor) return;
        const interval = setInterval(() => {
            const shapes = editor.getCurrentPageShapeIds().size;
            const camera = editor.getCamera();
            const container = document.querySelector('.tldraw-container');
            const dim = container ? `${container.clientWidth}x${container.clientHeight}` : 'N/A';
            const htmlClass = document.documentElement.className;

            setDebugInfo(`Shps: ${shapes} | Snap: ${initialSnapshot ? 'YES' : 'NO'} | Assets: ${defaultEditorAssetUrls ? 'YES' : 'NO'} | Zoom: ${camera.z.toFixed(2)} | Dim: ${dim} | HTML: ${htmlClass}`);
        }, 1000);
        return () => clearInterval(interval);
    }, [editor, initialSnapshot]);

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
        console.log('Tldraw mounted');
        setEditor(editorInstance);

        // Restore snapshot loading
        if (initialSnapshot) {
            try {
                editorInstance.store.loadSnapshot(initialSnapshot);
                // Center content if shapes exist
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
            {/* Forced CDN CSS for safety */}
            <link rel="stylesheet" href="https://unpkg.com/tldraw/tldraw.css" />

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
                <div style={{ position: 'absolute', top: 0, left: 0, zIndex: 9999, background: 'rgba(255,0,0,0.8)', color: 'white', pointerEvents: 'none', padding: 8, fontSize: 12, maxWidth: '100%' }}>
                    Debug: Mounted={editor ? 'Yes' : 'No'} <br />
                    {debugInfo || 'Waiting for update...'}
                </div>
                <Tldraw
                    onMount={handleMount}
                    inferDarkMode={true}
                    assetUrls={defaultEditorAssetUrls}
                // forceMobile={true} // Disabled for now to rule out layout issues
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
