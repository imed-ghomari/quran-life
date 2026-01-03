import React from 'react'

export default {
    logo: <span>Quran Life Docs</span>,
    project: {
        link: 'https://github.com/imed-ghomari/quran-life',
        component: null, // Hide GitHub link in header
    },
    themeSwitch: {
        component: null, // Hide theme chooser
    },
    docsRepositoryBase: 'https://github.com/imed-ghomari/quran-life/blob/main',
    footer: {
        text: 'Quran Life - Spaced Repetition Memorization System',
    },
    useNextSeoProps() {
        return {
            titleTemplate: '%s – Quran Life'
        }
    },
    head: (
        <>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <meta property="og:title" content="Quran Life Documentation" />
            <meta property="og:description" content="Philosophy and features of the Quran Life memorization app" />
        </>
    ),
    primaryHue: 205, // Steel blue color (~ #5b8fb9)
    darkMode: true,
}
