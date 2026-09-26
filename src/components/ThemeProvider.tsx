'use client';

import React from 'react';
import { readStored, writeStored } from '@/lib/pluginStorage';

const { createContext, useContext, useEffect, useState } = React;

export type Theme = 'light' | 'dark' | 'system';
export type AccentTheme = 'default' | 'dracula' | 'nord' | 'catppuccin' | 'solarized' | 'tokyo-night';

const ACCENT_THEMES: AccentTheme[] = ['default', 'dracula', 'nord', 'catppuccin', 'solarized', 'tokyo-night'];

function isTheme(value: string | null): value is Theme {
    return value === 'light' || value === 'dark' || value === 'system';
}

function isAccentTheme(value: string | null): value is AccentTheme {
    return !!value && (ACCENT_THEMES as string[]).includes(value);
}

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    accentTheme: AccentTheme;
    setAccentTheme: (accentTheme: AccentTheme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getObsidianTheme(): 'light' | 'dark' | null {
    if (typeof document === 'undefined') return null;
    if (document.body.classList.contains('theme-dark') || document.documentElement.classList.contains('theme-dark')) return 'dark';
    if (document.body.classList.contains('theme-light') || document.documentElement.classList.contains('theme-light')) return 'light';
    // also check parent for obsidian workspace class
    if (document.body.classList.contains('is-mobile')) {
        // mobile may still have theme classes
        if (document.body.classList.contains('theme-dark')) return 'dark';
        if (document.body.classList.contains('theme-light')) return 'light';
    }
    return null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const APP_THEME_KEY = 'theme';
    const APP_ACCENT_THEME_KEY = 'accent-theme';
    const [theme, setThemeState] = useState<Theme>('system');
    const [accentTheme, setAccentThemeState] = useState<AccentTheme>('default');
    const [hydrated, setHydrated] = useState(false);
    const [obsidianTheme, setObsidianTheme] = useState<'light' | 'dark' | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        setHydrated(true);
        const obs = getObsidianTheme();
        if (obs) {
            setObsidianTheme(obs);
            setThemeState(obs);
        } else {
            const stored = readStored(APP_THEME_KEY);
            if (isTheme(stored)) {
                setThemeState(stored);
            }
        }
        const storedAccent = readStored(APP_ACCENT_THEME_KEY);
        if (isAccentTheme(storedAccent)) {
            setAccentThemeState(storedAccent);
        }
    }, []);

    // Watch Obsidian theme changes (body class mutation)
    useEffect(() => {
        if (typeof window === 'undefined' || typeof document === 'undefined') return;
        const check = () => {
            const obs = getObsidianTheme();
            if (obs) {
                setObsidianTheme(obs);
                setThemeState(prev => (prev === obs ? prev : obs));
            } else {
                setObsidianTheme(null);
            }
        };
        check();
        const observer = new MutationObserver(check);
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        // also listen to Obsidian's theme change via matchMedia when not in Obsidian
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined' || !hydrated) return;
        const root = window.document.documentElement;
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const applyTheme = () => {
            const obs = obsidianTheme ?? getObsidianTheme();
            let resolved: 'light' | 'dark';
            if (obs) resolved = obs;
            else resolved = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme;
            root.setAttribute('data-theme', resolved);
            // Only persist when not controlled by Obsidian
            if (!obs) writeStored(APP_THEME_KEY, theme);
        };
        applyTheme();
        const handler = () => { if (!obsidianTheme && theme === 'system') applyTheme(); };
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, [theme, hydrated, obsidianTheme]);

    useEffect(() => {
        if (typeof window === 'undefined' || !hydrated) return;
        const root = window.document.documentElement;
        root.setAttribute('data-accent-theme', accentTheme);
        writeStored(APP_ACCENT_THEME_KEY, accentTheme);
    }, [accentTheme, hydrated]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme: setThemeState, accentTheme, setAccentTheme: setAccentThemeState }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme(): ThemeContextType {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        // Obsidian fallback: derive from Obsidian's body class or system preference
        // This makes MindmapEditor and DailyPortion work inside Obsidian ItemView without requiring explicit ThemeProvider wrapper
        const obs = getObsidianTheme();
        const mqDark = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false;
        const resolved: Theme = obs ?? (mqDark ? 'dark' : 'light');
        return {
            theme: resolved,
            setTheme: () => { /* no provider mounted */ },
            accentTheme: 'default',
            setAccentTheme: () => { /* no provider mounted */ },
        };
    }
    return context;
}
