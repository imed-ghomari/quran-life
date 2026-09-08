'use client';
import React, { useEffect, useState, useCallback } from 'react';
import type { VaultStore } from '@/plugin/storage/vaultAdapter';
import MindmapEditorObsidian from '@/plugin/components/MindmapEditorObsidian';
import MindmapViewer from '@/plugin/components/MindmapViewerObsidian';
import { SURAHS } from '@/lib/quranData';

export default function MindmapViewObsidian({ vaultStore }: { vaultStore: VaultStore }) {
  const [selectedKey, setSelectedKey] = useState('surah-2');
  const [snapshot, setSnapshot] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [docText, setDocText] = useState('');
  const surahId = selectedKey.startsWith('surah-') ? Number(selectedKey.replace('surah-','')) : undefined;
  const partId = selectedKey.startsWith('part-') ? Number(selectedKey.replace('part-','')) : selectedKey === 'meta-0' ? 0 : undefined;

  const load = useCallback(async (key: string) => {
    setIsLoading(true);
    const data = await vaultStore.loadMindmap(key);
    setSnapshot(data?.snapshot || null);
    const doc = await vaultStore.loadDoc(key);
    setDocText(typeof doc === 'string' ? doc : '');
    setIsLoading(false);
  }, [vaultStore]);

  useEffect(() => { void load(selectedKey); }, [selectedKey, load]);

  const handleSave = useCallback(async (snap: any) => {
    await vaultStore.saveMindmap(selectedKey, { key: selectedKey, snapshot: snap, isComplete: true, updatedAt: new Date().toISOString() });
    setSnapshot(snap);
    setIsEditing(false);
  }, [vaultStore, selectedKey]);

  const handleDocSave = useCallback(async () => {
    await vaultStore.saveDoc(selectedKey, docText);
  }, [vaultStore, selectedKey, docText]);

  if (isEditing) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <MindmapEditorObsidian
          initialSnapshot={snapshot}
          surahId={surahId}
          partId={partId}
          onSave={handleSave}
          onClose={() => setIsEditing(false)}
          title={selectedKey}
          vaultStore={vaultStore}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: 12, height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={selectedKey} onChange={e=>setSelectedKey(e.target.value)} style={{ flex: 1, minWidth: 180, padding: 6, borderRadius: 8, border: '1px solid var(--background-modifier-border)' }}>
          <optgroup label="Surahs">{SURAHS.map(s=> <option key={`surah-${s.id}`} value={`surah-${s.id}`}>{s.id}. {s.arabicName}</option>)}</optgroup>
          <optgroup label="Parts & Meta"><option value="meta-0">Meta - Overview</option><option value="part-1">Part 1 - 1-5</option><option value="part-2">Part 2 - 6-9</option><option value="part-3">Part 3 - 10-24</option><option value="part-4">Part 4 - 25-33</option><option value="part-5">Part 5 - 34-49</option><option value="part-6">Part 6 - 50-66</option><option value="part-7">Part 7 - 67-114</option></optgroup>
        </select>
        <button onClick={()=>setIsEditing(true)} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--interactive-accent)', color: 'white' }}>{snapshot ? 'Edit' : 'Create'} Mindmap</button>
        <button onClick={()=>void load(selectedKey)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--background-modifier-border)' }}>Reload</button>
      </div>

      <div style={{ border: '1px solid var(--background-modifier-border)', borderRadius: 8, height: 360, overflow: 'hidden', background: 'var(--background-secondary)' }}>
        {isLoading ? <div style={{ padding: 20, opacity: 0.6 }}>Loading {selectedKey} from QuranLife/mindmaps/{selectedKey}.json …</div>
        : snapshot ? <MindmapViewer snapshot={snapshot} height="360px" />
        : <div style={{ padding: 20, opacity: 0.6 }}>No mindmap for {selectedKey}. Create one — it will save to QuranLife/mindmaps/{selectedKey}.json and sync via Resilio (split file, not giant JSON).</div>}
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={{ fontSize: '0.8em', fontWeight: 600 }}>Notes (QuranLife/docs/{selectedKey}.md — markdown, editable in Obsidian)</label>
        <textarea value={docText} onChange={e=>setDocText(e.target.value)} onBlur={handleDocSave} placeholder="Write mindmap notes — they will be included as Anki card field" style={{ width: '100%', minHeight: 90, padding: 8, borderRadius: 8, border: '1px solid var(--background-modifier-border)', marginTop: 4 }} />
        <p style={{ fontSize: '0.75em', opacity: 0.6 }}>Each doc is a separate .md file — Resilio merges per file, avoids giant JSON conflict. Vault.process() ensures atomic saves.</p>
      </div>

      <p style={{ fontSize: '0.75em', opacity: 0.6, marginTop: 12 }}>Storage: QuranLife/mindmaps/*.json (tldraw snapshots ≈20KB-2MB each, debounced 700ms writes via VaultStore). No iframe — tldraw mounted via React createRoot in ItemView containerEl.</p>
    </div>
  );
}
