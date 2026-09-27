import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Docs sidebar mirrors the Next.js `_meta.json` order from
 * quran-anki-companion-obsidian-plugin:content/philosophy/_meta.json,
 * plus the two extra guides (settings, statistics) that live alongside them.
 * Mindmap reference docs (content/mindmaps/*) are intentionally excluded.
 */
const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Guides',
      link: {type: 'generated-index', title: 'Guides', slug: '/philosophy'},
      items: [
        'philosophy/getting-started',
        'philosophy/practice-hub',
        'philosophy/mindmap-strategy',
        'philosophy/spaced-repetition',
        'philosophy/mutashabihat',
        'philosophy/re-learning',
        'philosophy/settings',
        'philosophy/statistics',
      ],
    },
  ],
};

export default sidebars;
