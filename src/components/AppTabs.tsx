'use client';

import { useState } from 'react';
import DailyPortion from '@/components/DailyPortion';
import AnkiDeckTab from '@/components/AnkiDeckTab';
import DocumentationTab from '@/components/DocumentationTab';
import { BookOpen, Layers, FileText } from 'lucide-react';

type TabId = 'daily' | 'anki' | 'docs';

export default function AppTabs() {
  const [activeTab, setActiveTab] = useState<TabId>('daily');

  return (
    <div className="content-wrapper">
      <div className="max-w-5xl mx-auto px-4 py-4">
        {/* Tab bar */}
        <div suppressHydrationWarning className="flex items-center gap-2 p-1 mb-6 rounded-xl border border-[var(--border)] bg-[var(--background-secondary)] w-fit mx-auto">
          <button
            suppressHydrationWarning
            onClick={() => setActiveTab('daily')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'daily' ? 'bg-[var(--accent)] text-white shadow' : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--verse-bg)]'}`}
          >
            <span suppressHydrationWarning><BookOpen size={16} /></span> Daily Portion
          </button>
          <button
            suppressHydrationWarning
            onClick={() => setActiveTab('anki')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'anki' ? 'bg-[var(--accent)] text-white shadow' : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--verse-bg)]'}`}
          >
            <span suppressHydrationWarning><Layers size={16} /></span> Anki Deck
          </button>
          <button
            suppressHydrationWarning
            onClick={() => setActiveTab('docs')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'docs' ? 'bg-[var(--accent)] text-white shadow' : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--verse-bg)]'}`}
          >
            <span suppressHydrationWarning><FileText size={16} /></span> Documentation
          </button>
        </div>

        <div className="tab-content">
          {activeTab === 'daily' && <DailyPortion />}
          {activeTab === 'anki' && <AnkiDeckTab />}
          {activeTab === 'docs' && <DocumentationTab />}
        </div>
      </div>
    </div>
  );
}
