import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Quran Life',
  tagline: "Daily Qur'an review, mindmap memorization and Anki export — Obsidian plugin docs",
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Production URL for GitHub Pages (user site).
  url: 'https://imed-ghomari.github.io',
  // Served under /<projectName>/ on GitHub Pages.
  baseUrl: '/quran-life/',

  // GitHub pages deployment config.
  organizationName: 'imed-ghomari', // Usually your GitHub org/user name.
  projectName: 'quran-life', // Usually your repo name.

  onBrokenLinks: 'throw',

  trailingSlash: false,

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // Edit links point at the website branch, website/ subdir.
          editUrl: 'https://github.com/imed-ghomari/quran-life/tree/website/website/',
        },
        blog: {
          showReadingTime: true,
          authorsMapPath: 'authors.yml',
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          editUrl: 'https://github.com/imed-ghomari/quran-life/tree/website/website/',
          // Useful options to enforce blogging best practices
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'ignore',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Quran Life',
      logo: {
        alt: 'Quran Life Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {to: '/blog', label: 'Blog', position: 'left'},
        {
          href: 'https://github.com/imed-ghomari/quran-life/releases',
          label: 'Install in Obsidian',
          position: 'right',
        },
        {
          href: 'https://github.com/imed-ghomari/quran-life',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Introduction',
              to: '/docs/intro',
            },
            {
              label: 'Getting Started',
              to: '/docs/philosophy/getting-started',
            },
            {
              label: 'Anki Deck & Reviews',
              to: '/docs/philosophy/practice-hub',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Blog',
              to: '/blog',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/imed-ghomari/quran-life',
            },
            {
              label: 'Releases',
              href: 'https://github.com/imed-ghomari/quran-life/releases',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Quran Life. Built with Docusaurus. Docs live on the <code>website</code> branch so <code>main</code> stays clean for Obsidian review.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
