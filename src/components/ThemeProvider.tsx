'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type AccentTheme = 'default' | 'dracula' | 'nord' | 'catppuccin' | 'solarized' | 'tokyo-night';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    accentTheme: AccentTheme;
    setAccentTheme: (accentTheme: AccentTheme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const APP_THEME_KEY = 'theme';
    const APP_ACCENT_THEME_KEY = 'accent-theme';
    const [theme, setThemeState] = useState<Theme>('system');
    const [accentTheme, setAccentThemeState] = useState<AccentTheme>('default');
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        setHydrated(true);
        const stored = localStorage.getItem(APP_THEME_KEY) as Theme | null;
        if (stored && ['light', 'dark', 'system'].includes(stored)) {
            setThemeState(stored);
        }
        const storedAccent = localStorage.getItem(APP_ACCENT_THEME_KEY) as AccentTheme | null;
        if (storedAccent && ['default', 'dracula', 'nord', 'catppuccin', 'solarized', 'tokyo-night'].includes(storedAccent)) {
            setAccentThemeState(storedAccent);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined' || !hydrated) return;
        const root = window.document.documentElement;
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const applyTheme = () => {
            const resolved = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme;
            root.setAttribute('data-theme', resolved);
            localStorage.setItem(APP_THEME_KEY, theme);
        };
        applyTheme();
        const handler = () => { if (theme === 'system') applyTheme(); };
        if (mq.addEventListener) {
            mq.addEventListener('change', handler);
            return () => mq.removeEventListener('change', handler);
        }
        mq.addListener(handler);
        return () => mq.removeListener(handler);
    }, [theme, hydrated]);

    useEffect(() => {
        if (typeof window === 'undefined' || !hydrated) return;
        const root = window.document.documentElement;
        root.setAttribute('data-accent-theme', accentTheme);
        localStorage.setItem(APP_ACCENT_THEME_KEY, accentTheme);
    }, [accentTheme, hydrated]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme: setThemeState, accentTheme, setAccentTheme: setAccentThemeState }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        // Obsidian fallback: derive from Obsidian's body class or system preference
        // This makes MindmapEditor and DailyPortion work inside Obsidian ItemView without requiring explicit ThemeProvider wrapper
        const isObsidianDark = typeof document !== 'undefined'
            ? document.body.classList.contains('theme-dark') || document.documentElement.classList.contains('theme-dark')
            : false;
        const mqDark = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false;
        const resolved: Theme = isObsidianDark || mqDark ? 'dark' : 'light';
        return {
            theme: resolved,
            setTheme: () => {},
            accentTheme: 'default' as AccentTheme,
            setAccentTheme: () => {},
        } as ThemeContextType;
    }
    return context;
}
