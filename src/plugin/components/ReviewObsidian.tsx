'use client';
import React, { useEffect, useState, useMemo } from 'react';
import type { VaultStore } from '@/plugin/storage/vaultAdapter';
import { getSurah } from '@/lib/quranData';

interface ReviewNode {
  id: string;
  type: string;
  surahId?: number;
  due?: string;
  scheduler?: any;
}

export default function ReviewObsidian({ vaultStore }: { vaultStore: VaultStore }) {
  const [nodes, setNodes] = useState<ReviewNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      // Load nodes sharded: QuranLife/nodes/*.json — each file is MemoryNode[] for a surah/part
      const all: ReviewNode[] = [];
      // Try to load all nodes via vaultStore custom path: we stored per surah in vaultAdapter nodesDir
      // For now, also try legacy single file at QuranLife/nodes.json or plugin data
      const app: any = (vaultStore as any).app;
      const tryPaths = [
        'QuranLife/nodes',
        'QuranLife/meta/nodes.json',
      ];
      for (const dirPath of tryPaths) {
        const abstract = app?.vault?.getAbstractFileByPath?.(dirPath);
        if (!abstract) continue;
        // If folder, iterate children
        if (abstract.children) {
          for (const child of abstract.children) {
            if (child.extension !== 'json') continue;
            try {
              const raw = await app.vault.read(child);
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) all.push(...parsed);
              else if (parsed && typeof parsed === 'object') all.push(parsed);
            } catch {}
          }
        } else if (abstract instanceof app.vault.getAbstractFileByPath.constructor) {
          // ignore
        }
      }
      // Fallback: try to load from plugin loadData (vaultStore.settings may contain nodes map)
      // For now, if still empty, show empty state
      if (!cancelled) {
        setNodes(all);
        setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [vaultStore]);

  const dueNodes = useMemo(() => {
    const now = Date.now();
    return nodes.filter(n => {
      const dueStr = n.due || n.scheduler?.due || n.scheduler?.dueDate;
      if (!dueStr) return true; // no due = due now
      if (!dueStr.includes('T')) {
        const m = dueStr.match(/\d{4}-\d{2}-\d{2}/);
        if (!m) return false;
        const today = new Date().toISOString().slice(0,10);
        return m[0] <= today;
      }
      const ms = Date.parse(dueStr);
      return Number.isFinite(ms) ? ms <= now : false;
    });
  }, [nodes]);

  if (isLoading) return <div style={{ padding: 12, opacity: 0.6 }}>Loading reviews from QuranLife/nodes/*.json (split, not giant JSON)…</div>;
  if (nodes.length === 0) return (
    <div style={{ padding: 12 }}>
      <h4>Reviews</h4>
      <p style={{ opacity: 0.7, fontSize: '0.9em' }}>No review nodes yet. Create verse splits and mindmaps in Anki Deck, then study. Reviews are stored per surah in QuranLife/nodes/surah-*.json — Resilio syncs per file.</p>
      <p style={{ fontSize: '0.8em', opacity: 0.6 }}>FSRS scheduling is local; each review updates only its surah's node file via Vault.process() for safety.</p>
    </div>
  );

  return (
    <div style={{ padding: 12 }}>
      <h4>Reviews — {dueNodes.length} due / {nodes.length} total</h4>
      <p style={{ fontSize: '0.8em', opacity: 0.6 }}>Nodes sharded by surah/part under QuranLife/nodes/ — each due check touches only its file.</p>
      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
        {dueNodes.slice(0, 20).map(n => {
          const surah = n.surahId ? getSurah(n.surahId) : null;
          return (
            <div key={n.id} style={{ padding: 8, border: '1px solid var(--background-modifier-border)', borderRadius: 8, background: 'var(--background-secondary)' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9em' }}>{n.type} {surah ? `— ${surah.arabicName}` : ''}</div>
              <div style={{ fontSize: '0.8em', opacity: 0.7 }}>{n.id} · due: {n.due || n.scheduler?.due || 'now'}</div>
            </div>
          );
        })}
      </div>
      {dueNodes.length === 0 && <p style={{ opacity: 0.6, fontSize: '0.9em', marginTop: 12 }}>All caught up! Due cards will appear here when scheduler time arrives (Vault files are Resilio-synced).</p>}
    </div>
  );
}
