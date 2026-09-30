import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Docs sidebar mirrors the Next.js `_meta.json` order from
 * quran-anki-companion-obsidian-plugin:content/philosophy/_meta.json,
 * plus the two extra guides (settings, statistics) that live alongside them.
 * The mindmap symbol legend (content/mindmaps/legend.mdx) is included as a
 * Mindmaps reference: readers need it to understand the pre-made mindmaps.
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
    {
      type: 'category',
      label: 'Mindmaps',
      link: {type: 'generated-index', title: 'Mindmaps', slug: '/mindmaps'},
      items: ['mindmaps/legend'],
    },
  ],
};

export default sidebars;
