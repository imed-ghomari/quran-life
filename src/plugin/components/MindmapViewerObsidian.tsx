'use client';
import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { Tldraw } from 'tldraw';
import { useTheme } from '@/components/ThemeProvider';

interface Props {
  snapshot?: any;
  height?: string | number;
}

export default function MindmapViewerObsidian({ snapshot, height = '400px' }: Props) {
  const [editor, setEditor] = useState<any>(null);
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
    setTimeout(() => { try { ed.zoomToFit({ duration: 0 }); } catch {} }, 100);
  }, [theme]);
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
    <div style={{ height, border: '1px solid var(--background-modifier-border)', borderRadius: 8, overflow: 'hidden', background: 'var(--background-secondary)' }}>
      <Tldraw snapshot={snapshot} onMount={handleMount} hideUi />
    </div>
  );
}
