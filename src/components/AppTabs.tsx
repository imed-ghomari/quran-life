'use client';

import { useState, useRef } from 'react';
import DailyPortion from '@/components/DailyPortion';
import AnkiDeckTab from '@/components/AnkiDeckTab';
import DocumentationTab from '@/components/DocumentationTab';
import { BookOpen, Layers, FileText, Sun, Moon, Monitor, Upload, FileJson } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

type TabId = 'daily' | 'anki' | 'docs';

export default function AppTabs() {
  const [activeTab, setActiveTab] = useState<TabId>('daily');
  const { theme, setTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const cycleTheme = () => {
    const order: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
    const idx = order.indexOf(theme as any);
    const next = order[(idx + 1) % order.length] || 'system';
    setTheme(next);
  };

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  const handleExportBackup = () => {
    try {
      const ankiMindmaps = (() => { try { return JSON.parse(localStorage.getItem('quran-life:anki:mindmaps:v1') || 'null'); } catch { return null; } })();
      const ankiSplits = (() => { try { return JSON.parse(localStorage.getItem('quran-life:anki:splits:v1') || 'null'); } catch { return null; } })();
      const ankiDocs = (() => { try { return JSON.parse(localStorage.getItem('quran-life:anki:mindmapDocs:v1') || 'null'); } catch { return null; } })();
      const ankiDeleted = (() => { try { return JSON.parse(localStorage.getItem('quran-life:anki:deletedMindmaps:v1') || 'null'); } catch { return null; } })();
      const dailySettings = (() => { try { return JSON.parse(localStorage.getItem('quran-life:daily:settings:v1') || 'null'); } catch { return null; } })();
      const dailyProgress = (() => { try { return JSON.parse(localStorage.getItem('quran-life:daily:progress:v1') || 'null'); } catch { return null; } })();
      const dailyStats = (() => { try { return JSON.parse(localStorage.getItem('quran-life:daily:listeningStats:v1') || 'null'); } catch { return null; } })();
      const themeVal = (() => { try { return localStorage.getItem('theme'); } catch { return null; } })();
      const accentTheme = (() => { try { return localStorage.getItem('accent-theme'); } catch { return null; } })();

      const backup: any = {
        version: 2,
        exportedAt: new Date().toISOString(),
        // legacy top-level for backward compat with old import (AnkiDeckTab)
        splits: ankiSplits || {},
        mindmaps: ankiMindmaps || {},
        mindmapDocs: ankiDocs || {},
        deckName: 'QuranLife::Review',
        // new structured
        anki: {
          splits: ankiSplits || {},
          mindmaps: ankiMindmaps || {},
          mindmapDocs: ankiDocs || {},
          deletedMindmaps: ankiDeleted || [],
        },
        daily: {
          settings: dailySettings,
          progress: dailyProgress,
          listeningStats: dailyStats,
        },
        theme: {
          theme: themeVal,
          accentTheme,
        },
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quran-life-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Backup exported (all data)');
    } catch (e) {
      console.error(e);
      showToast('Export failed');
    }
  };

  const handleImportBackup = async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      // Support both legacy (top-level splits/mindmaps) and new (anki/daily/theme) formats
      const ankiSplits = json.anki?.splits ?? json.splits ?? null;
      const ankiMindmaps = json.anki?.mindmaps ?? json.mindmaps ?? null;
      const ankiDocs = json.anki?.mindmapDocs ?? json.mindmapDocs ?? null;
      const ankiDeleted = json.anki?.deletedMindmaps ?? null;
      const dailySettings = json.daily?.settings ?? null;
      const dailyProgress = json.daily?.progress ?? null;
      const dailyStats = json.daily?.listeningStats ?? null;
      const themeVal = json.theme?.theme ?? null;
      const accentVal = json.theme?.accentTheme ?? null;

      let importedCount = 0;
      if (ankiSplits && typeof ankiSplits === 'object') {
        try { localStorage.setItem('quran-life:anki:splits:v1', JSON.stringify(ankiSplits)); importedCount++; } catch {}
      }
      if (ankiMindmaps && typeof ankiMindmaps === 'object') {
        try { localStorage.setItem('quran-life:anki:mindmaps:v1', JSON.stringify(ankiMindmaps)); importedCount++; } catch {}
      }
      if (ankiDocs && typeof ankiDocs === 'object') {
        try { localStorage.setItem('quran-life:anki:mindmapDocs:v1', JSON.stringify(ankiDocs)); importedCount++; } catch {}
      }
      if (Array.isArray(ankiDeleted)) {
        try { localStorage.setItem('quran-life:anki:deletedMindmaps:v1', JSON.stringify(ankiDeleted)); importedCount++; } catch {}
      }
      if (dailySettings && typeof dailySettings === 'object') {
        try { localStorage.setItem('quran-life:daily:settings:v1', JSON.stringify(dailySettings)); importedCount++; } catch {}
      }
      if (Array.isArray(dailyProgress)) {
        try { localStorage.setItem('quran-life:daily:progress:v1', JSON.stringify(dailyProgress)); importedCount++; } catch {}
      }
      if (dailyStats) {
        try { localStorage.setItem('quran-life:daily:listeningStats:v1', JSON.stringify(dailyStats)); importedCount++; } catch {}
      }
      if (typeof themeVal === 'string' && ['light', 'dark', 'system'].includes(themeVal)) {
        try { localStorage.setItem('theme', themeVal); } catch {}
        setTheme(themeVal as any);
      }
      if (typeof accentVal === 'string') {
        try { localStorage.setItem('accent-theme', accentVal); } catch {}
      }
      if (json.deckName && typeof json.deckName === 'string') {
        // deckName is not persisted in localStorage currently, but keep for compat
      }

      showToast(`Imported ${importedCount} sections — reloading...`);
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      console.error(e);
      showToast('Invalid backup file');
    }
  };

  return (
    <div className="content-wrapper">
      <div className="max-w-5xl mx-auto px-4 py-4">
        {/* Tab bar with global actions — uses main branch design tokens: adv-segmented + today-header-btn + btn */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
          <div className="adv-segmented flex items-center gap-1 p-1 rounded-xl border border-[var(--border)] bg-[var(--background-secondary)] w-fit flex-wrap">
            <button
              suppressHydrationWarning
              onClick={() => setActiveTab('daily')}
              className={`adv-seg-btn flex items-center gap-2 ${activeTab === 'daily' ? 'adv-seg-active' : ''}`}
              aria-pressed={activeTab === 'daily'}
            >
              <span suppressHydrationWarning><BookOpen size={16} /></span> Daily Portion
            </button>
            <button
              suppressHydrationWarning
              onClick={() => setActiveTab('anki')}
              className={`adv-seg-btn flex items-center gap-2 ${activeTab === 'anki' ? 'adv-seg-active' : ''}`}
              aria-pressed={activeTab === 'anki'}
            >
              <span suppressHydrationWarning><Layers size={16} /></span> Anki Deck
            </button>
            <button
              suppressHydrationWarning
              onClick={() => setActiveTab('docs')}
              className={`adv-seg-btn flex items-center gap-2 ${activeTab === 'docs' ? 'adv-seg-active' : ''}`}
              aria-pressed={activeTab === 'docs'}
            >
              <span suppressHydrationWarning><FileText size={16} /></span> Documentation
            </button>

            {/* Divider — separates tabs from global actions */}
            <div className="w-px h-6 bg-[var(--border)] mx-1 hidden sm:block" />

            {/* Global actions — today-header-btn for icon, btn secondary for text actions (main guidelines) */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={cycleTheme}
                title={`Theme: ${theme} (click to cycle)`}
                className="today-header-btn"
                aria-label="Toggle theme"
              >
                <ThemeIcon size={16} />
              </button>

              <div className="w-px h-6 bg-[var(--border)] mx-1 hidden sm:block" />

              <button
                onClick={handleExportBackup}
                title="Export backup (all data: daily portion + anki + theme)"
                className="btn btn-secondary std-normal-btn !py-2 !px-3 text-xs"
              >
                <Upload size={14} /> <span className="hidden sm:inline">Export</span>
              </button>

              <label
                title="Import backup (all data)"
                className="btn btn-secondary std-normal-btn !py-2 !px-3 text-xs cursor-pointer"
              >
                <FileJson size={14} /> <span className="hidden sm:inline">Import</span>
                <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={e => e.target.files?.[0] && handleImportBackup(e.target.files[0])} />
              </label>
            </div>
          </div>
        </div>

        <div className="tab-content">
          {activeTab === 'daily' && <DailyPortion />}
          {activeTab === 'anki' && <AnkiDeckTab />}
          {activeTab === 'docs' && <DocumentationTab />}
        </div>

        {toast && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[var(--background-secondary)] border border-[var(--border)] shadow-lg rounded-xl px-4 py-2 text-sm z-50">{toast}</div>
        )}
      </div>
    </div>
  );
}
