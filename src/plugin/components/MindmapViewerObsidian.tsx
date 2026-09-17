'use client';
import React from 'react';
import { Tldraw } from 'tldraw';
import { useTheme } from '@/components/ThemeProvider';

const { useCallback, useState, useEffect } = React;

interface Props {
  snapshot?: any;
  height?: string | number;
}

export default function MindmapViewerObsidian({ snapshot, height = '400px' }: Props) {
  const [editor, setEditor] = useState<any>(null);
  const [showBackToContent, setShowBackToContent] = useState(false);
  const { theme } = useTheme();
  const handleMount = useCallback((ed: any) => {
    setEditor(ed);
    ed.updateInstanceState({ isReadonly: true });
    ed.setCurrentTool('hand');
    const getObs = () => {
      if (typeof document === 'undefined') return null as 'light' | 'dark' | null;
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
    try { ed.user.updateUserPreferences({ colorScheme: resolved }); } catch {}
    // Aggressive Zoom-to-Fit strategy — ported from web MindmapViewer.tsx:480
    const fit = () => {
      try {
        const shapes = ed.getCurrentPageShapes?.();
        if (Array.isArray(shapes) ? shapes.length > 0 : true) {
          ed.zoomToFit({ duration: 0 });
        }
      } catch {}
    };
    fit();
    setTimeout(fit, 100);
    setTimeout(fit, 300);
    setTimeout(fit, 600);
  }, [theme]);

  // Ported from web src/components/MindmapViewer.tsx:314 — show "Back to content" when canvas is panned to blank area
  useEffect(() => {
    if (!editor || !snapshot) {
      setShowBackToContent(false);
      return;
    }
    const updateVisibility = () => {
      try {
        const shapeIds = (editor as any).getCurrentPageShapeIds?.();
        const culledShapes = (editor as any).getCulledShapes?.();
        const total = (shapeIds as any)?.size ?? 0;
        const culled = (culledShapes as any)?.size ?? 0;
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
      try { editor.zoomToFit({ duration: 0 }); } catch {}
      // also keep theme in sync when theme changes after mount
      const getObs = () => {
        if (typeof document === 'undefined') return null as 'light' | 'dark' | null;
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
      try { editor.user.updateUserPreferences({ colorScheme: resolved }); } catch {}
    }
  }, [snapshot, editor, theme]);
  if (!snapshot) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.6, border: '1px solid var(--background-modifier-border)', borderRadius: 8 }}>No snapshot</div>;
  return (
    <div style={{ height, border: '1px solid var(--background-modifier-border)', borderRadius: 8, overflow: 'hidden', background: 'var(--background-secondary)', position: 'relative' }}>
      {showBackToContent && (
        <button
          onClick={() => {
            try { (editor as any)?.zoomToFit({ duration: 200 }); } catch {}
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
