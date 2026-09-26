'use client';

const LS_DOCS_KEY = 'quran-life:anki:mindmapDocs:v1';

type DocsStored = Record<string, string>; // key like "surah-2" or "part-3" or "meta-0" or "cluster-1"

export function loadMindmapDocs(): DocsStored {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LS_DOCS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const out: DocsStored = {};
    Object.entries(parsed).forEach(([k, v]) => {
      if (typeof v === 'string') out[k] = v;
    });
    return out;
  } catch {
    return {};
  }
}

export function saveMindmapDoc(key: string, content: string) {
  const all = loadMindmapDocs();
  all[key] = content;
  try {
    localStorage.setItem(LS_DOCS_KEY, JSON.stringify(all));
  } catch {}
  return all;
}

export function getMindmapDoc(key: string): string | undefined {
  return loadMindmapDocs()[key];
}

export function deleteMindmapDoc(key: string) {
  const all = loadMindmapDocs();
  delete all[key];
  try { localStorage.setItem(LS_DOCS_KEY, JSON.stringify(all)); } catch {}
  return all;
}
