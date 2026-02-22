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
    const [theme, setThemeState] = useState<Theme>('system');
    const [accentTheme, setAccentThemeState] = useState<AccentTheme>('default');
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const stored = localStorage.getItem('theme') as Theme | null;
        if (stored && ['light', 'dark', 'system'].includes(stored)) {
            setThemeState(stored);
        }
        const storedAccentTheme = localStorage.getItem('accent-theme') as AccentTheme | null;
        if (storedAccentTheme && ['default', 'dracula', 'nord', 'catppuccin', 'solarized', 'tokyo-night'].includes(storedAccentTheme)) {
            setAccentThemeState(storedAccentTheme);
        }
        setHydrated(true);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined' || !hydrated) return;
        const root = window.document.documentElement;
        const mq = window.matchMedia('(prefers-color-scheme: dark)');

        const applyTheme = () => {
            const resolved = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme;
            root.setAttribute('data-theme', resolved);
            localStorage.setItem('theme', theme);
        };

        applyTheme();
        const handleChange = () => {
            if (theme === 'system') applyTheme();
        };
        mq.addEventListener('change', handleChange);
        return () => mq.removeEventListener('change', handleChange);
    }, [theme, hydrated]);

    useEffect(() => {
        if (typeof window === 'undefined' || !hydrated) return;
        const root = window.document.documentElement;
        root.setAttribute('data-accent-theme', accentTheme);
        localStorage.setItem('accent-theme', accentTheme);
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
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
