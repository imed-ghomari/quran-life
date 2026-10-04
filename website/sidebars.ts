import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Fully flat sidebar: every page at root level, no categories.
 * (Doc files still live in subfolders on disk — that doesn't affect
 * the sidebar or the URLs.)
 */
const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    'philosophy/getting-started',
    'philosophy/practice-hub',
    'philosophy/mindmap-strategy',
    'mindmaps/legend',
    'philosophy/spaced-repetition',
    'philosophy/mutashabihat',
    'philosophy/re-learning',
    'philosophy/settings',
    'philosophy/statistics',
  ],
};

export default sidebars;
