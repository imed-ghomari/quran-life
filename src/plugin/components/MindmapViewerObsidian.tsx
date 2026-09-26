'use client';
import React from 'react';
import { Tldraw } from 'tldraw';
import { useTheme } from '@/components/ThemeProvider';
import {
  attachMindmapSwipeGuard,
  fitMindmapCameraTight,
  observeTldrawWatermarkTitles,
} from '@/plugin/lib/mindmapObsidianGuards';

const { useCallback, useState, useEffect } = React;

interface Props {
  snapshot?: any;
  height?: string | number;
}

export default function MindmapViewerObsidian({ snapshot, height = '400px' }: Props) {
  const [editor, setEditor] = useState<any>(null);
  const [showBackToContent, setShowBackToContent] = useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const { theme } = useTheme();

  // Keep pan/zoom gestures inside the preview: stops Obsidian's sidebar
  // reveal + back/forward handlers from seeing them (bubble-phase guard —
  // tldraw handles the gesture first at target phase).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    return attachMindmapSwipeGuard(el);
  }, []);

  // Strip the tldraw watermark hover tooltip; watermark itself stays.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    return observeTldrawWatermarkTitles(el);
  }, []);

  const handleMount = useCallback((ed: any) => {
    setEditor(ed);
    ed.updateInstanceState({ isReadonly: true });
    ed.setCurrentTool('hand');
    const getObs = () => {
      if (typeof document === 'undefined') return null;
      if (document.body.classList.contains('theme-dark') || document.documentElement.classList.contains('theme-dark')) return 'dark';
      if (document.body.classList.contains('theme-light') || document.documentElement.classList.contains('theme-light')) return 'light';
      return null;
    };
    const obs = getObs();
    let resolved: 'light' | 'dark' = 'light';
    if (obs) resolved = obs;
    else if (theme === 'system') {
      const mqDark = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false;
      resolved = mqDark ? 'dark' : 'light';
    } else resolved = theme as 'light' | 'dark';
    try { ed.user.updateUserPreferences({ colorScheme: resolved }); } catch { /* theme sync is best-effort; ignore */ }
    // Aggressive Zoom-to-Fit strategy — ported from web MindmapViewer.tsx:480.
    // Uses a tight inset (default zoomToFit pads 128px, leaving the map
    // floating in blank space) so the mindmap fills the viewer.
    const fit = () => {
      try {
        const shapes = ed.getCurrentPageShapes?.();
        if (Array.isArray(shapes) ? shapes.length > 0 : true) {
          fitMindmapCameraTight(ed);
        }
      } catch { /* zoom-to-fit is best-effort; ignore */ }
    };
    fit();
    window.setTimeout(fit, 100);
    window.setTimeout(fit, 300);
    window.setTimeout(fit, 600);
  }, [theme]);

  // Ported from web src/components/MindmapViewer.tsx:314 — show "Back to content" when canvas is panned to blank area
  useEffect(() => {
    if (!editor || !snapshot) {
      setShowBackToContent(false);
      return;
    }
    const updateVisibility = () => {
      try {
        const shapeIds = editor.getCurrentPageShapeIds?.();
        const culledShapes = editor.getCulledShapes?.();
        const total = shapeIds?.size ?? 0;
        const culled = culledShapes?.size ?? 0;
        setShowBackToContent(total > 0 && total === culled);
      } catch {
        setShowBackToContent(false);
      }
    };
    updateVisibility();
    const intervalId = window.setInterval(updateVisibility, 200);
    window.addEventListener('resize', updateVisibility);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('resize', updateVisibility);
    };
  }, [editor, snapshot]);

  useEffect(() => {
    if (editor) {
      try { fitMindmapCameraTight(editor); } catch { /* zoom-to-fit is best-effort; ignore */ }
      // also keep theme in sync when theme changes after mount
      const getObs = () => {
        if (typeof document === 'undefined') return null;
        if (document.body.classList.contains('theme-dark') || document.documentElement.classList.contains('theme-dark')) return 'dark';
        if (document.body.classList.contains('theme-light') || document.documentElement.classList.contains('theme-light')) return 'light';
        return null;
      };
      const obs = getObs();
      let resolved: 'light' | 'dark' = 'light';
      if (obs) resolved = obs;
      else if (theme === 'system') {
        const mqDark = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false;
        resolved = mqDark ? 'dark' : 'light';
      } else resolved = theme as 'light' | 'dark';
      try { editor.user.updateUserPreferences({ colorScheme: resolved }); } catch { /* theme sync is best-effort; ignore */ }
    }
  }, [snapshot, editor, theme]);
  if (!snapshot) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.6, border: '1px solid var(--background-modifier-border)', borderRadius: 8 }}>No snapshot</div>;
  return (
    <div
      ref={containerRef}
      data-mindmap-swipe-guard="true"
      style={{ height, border: '1px solid var(--background-modifier-border)', borderRadius: 8, overflow: 'hidden', background: 'var(--background-secondary)', position: 'relative', overscrollBehavior: 'none' }}
    >
      {showBackToContent && (
        <button
          onClick={() => {
            try { fitMindmapCameraTight(editor); } catch { /* zoom-to-fit is best-effort; ignore */ }
          }}
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            zIndex: 10,
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid var(--background-modifier-border)',
            background: 'var(--background-primary)',
            color: 'var(--text-normal)',
            fontSize: '0.82em',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 1px 6px rgba(0,0,0,0.12)',
          }}
        >
          Back to content
        </button>
      )}
      <div style={{ position: 'absolute', inset: 0 }}>
        <Tldraw snapshot={snapshot} onMount={handleMount} hideUi />
      </div>
    </div>
  );
}
