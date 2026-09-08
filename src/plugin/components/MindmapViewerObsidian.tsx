'use client';
import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { Tldraw } from 'tldraw';

interface Props {
  snapshot?: any;
  height?: string | number;
}

export default function MindmapViewerObsidian({ snapshot, height = '400px' }: Props) {
  const [editor, setEditor] = useState<any>(null);
  const handleMount = useCallback((ed: any) => {
    setEditor(ed);
    ed.updateInstanceState({ isReadonly: true });
    ed.setCurrentTool('hand');
    setTimeout(() => { try { ed.zoomToFit({ duration: 0 }); } catch {} }, 100);
  }, []);
  useEffect(() => {
    if (editor) {
      try { editor.zoomToFit({ duration: 0 }); } catch {}
    }
  }, [snapshot, editor]);
  if (!snapshot) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.6, border: '1px solid var(--background-modifier-border)', borderRadius: 8 }}>No snapshot</div>;
  return (
    <div style={{ height, border: '1px solid var(--background-modifier-border)', borderRadius: 8, overflow: 'hidden', background: 'var(--background-secondary)' }}>
      <Tldraw snapshot={snapshot} onMount={handleMount} hideUi />
    </div>
  );
}
