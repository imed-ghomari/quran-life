import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Docs sidebar: intro, user guides, and the mindmap symbol legend.
 * Categories are expanded by default so the Legend is always visible.
 */
const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Guides',
      collapsed: false,
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
      collapsed: false,
      link: {type: 'generated-index', title: 'Mindmaps', slug: '/mindmaps'},
      items: ['mindmaps/legend'],
    },
  ],
};

export default sidebars;
