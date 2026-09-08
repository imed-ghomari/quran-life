'use client';

import { useEffect, useState } from 'react';
import { marked } from 'marked';
import { BookOpen, ChevronRight } from 'lucide-react';

type DocItem = { slug: string; title: string; href: string };

const FALLBACK_ITEMS: DocItem[] = [
  { slug: 'index', title: 'Introduction', href: '/docs' },
  { slug: 'philosophy/getting-started', title: 'Getting Started', href: '/docs/philosophy/getting-started' },
  { slug: 'philosophy/practice-hub', title: 'Active Practice Hub', href: '/docs/philosophy/practice-hub' },
  { slug: 'philosophy/mindmap-strategy', title: 'Mindmap Strategy', href: '/docs/philosophy/mindmap-strategy' },
  { slug: 'philosophy/spaced-repetition', title: 'Spaced Repetition', href: '/docs/philosophy/spaced-repetition' },
  { slug: 'philosophy/mutashabihat', title: 'Mutashabihat', href: '/docs/philosophy/mutashabihat' },
  { slug: 'philosophy/re-learning', title: 'Re-Learning', href: '/docs/philosophy/re-learning' },
  { slug: 'philosophy/statistics', title: 'Statistics', href: '/docs/philosophy/statistics' },
  { slug: 'philosophy/settings', title: 'Settings', href: '/docs/philosophy/settings' },
];

export default function DocumentationTab() {
  const [items, setItems] = useState<DocItem[]>(FALLBACK_ITEMS);
  const [activeSlug, setActiveSlug] = useState<string>('philosophy/getting-started');
  const [source, setSource] = useState<string>('');
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/docs-list')
      .then(r => r.json())
      .then(d => {
        if (d?.items?.length) setItems(d.items);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/docs-content?slug=${encodeURIComponent(activeSlug)}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        setSource(d.source || '');
        try {
          const parsed = marked.parse(d.source || '', { async: false }) as string;
          setHtml(parsed);
        } catch {
          setHtml(`<pre>${(d.source || '').replace(/</g, '&lt;')}</pre>`);
        }
      })
      .catch(() => {
        if (!cancelled) setSource('Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeSlug]);

  return (
    <div className="card !p-0 overflow-hidden flex flex-col" style={{ height: '75vh' }}>
      <div className="p-3 border-b border-[var(--border)] bg-[var(--background-secondary)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-[var(--accent)]" />
          <h2 className="font-semibold text-sm">Documentation</h2>
        </div>
        <span className="text-xs text-[var(--foreground-secondary)] hidden md:block">Guides to help you memorize</span>
      </div>
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[240px] md:w-[260px] border-r border-[var(--border)] bg-[var(--background-secondary)] hidden md:flex flex-col">
          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            <div className="space-y-1">
              {items.map(item => (
                <button
                  key={item.slug}
                  onClick={() => setActiveSlug(item.slug)}
                  className={`btn btn-secondary std-normal-btn w-full !justify-between !px-3 !py-2 text-sm ${activeSlug === item.slug ? 'adv-seg-active' : ''}`}
                >
                  <span className="truncate text-left">{item.title}</span>
                  {activeSlug === item.slug && <ChevronRight size={14} />}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Mobile select */}
        <div className="md:hidden p-2 border-b border-[var(--border)] bg-[var(--background-secondary)] w-full absolute top-[57px] left-0 right-0 z-10">
          <select value={activeSlug} onChange={e => setActiveSlug(e.target.value)} className="w-full p-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm">
            {items.map(i => <option key={i.slug} value={i.slug}>{i.title}</option>)}
          </select>
        </div>

        {/* Content */}
        <main className="flex-1 overflow-y-auto bg-[var(--background)] custom-scrollbar">
          <div className="max-w-3xl mx-auto p-4 md:p-6 pt-12 md:pt-6">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-sm text-[var(--foreground-secondary)]">Loading...</div>
            ) : (
              <article
                className="prose prose-slate dark:prose-invert max-w-none prose-headings:text-[var(--foreground)] prose-p:text-[var(--foreground)] prose-a:text-[var(--accent)] prose-strong:text-[var(--foreground)] prose-li:text-[var(--foreground)] prose-blockquote:border-[var(--accent)] prose-blockquote:text-[var(--foreground-secondary)] prose-hr:border-[var(--border)] prose-code:bg-[var(--verse-bg)] prose-code:px-1 prose-code:py-0.5 prose-code:rounded"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
