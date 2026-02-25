'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

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
    const PUBLIC_THEME_KEY = 'public-theme';
    const [theme, setThemeState] = useState<Theme>('system');
    const [accentTheme, setAccentThemeState] = useState<AccentTheme>('default');
    const [hydrated, setHydrated] = useState(false);
    const pathname = usePathname();
    const isPostAuthRoute = Boolean(
        pathname
        && (
            pathname.startsWith('/dashboard')
            || pathname.startsWith('/todo')
            || pathname.startsWith('/settings')
            || pathname.startsWith('/statistics')
            || pathname.startsWith('/docs')
        )
    );

    useEffect(() => {
        if (typeof window === 'undefined') return;
        setHydrated(true);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined' || !hydrated) return;

        if (!isPostAuthRoute) {
            const storedPublicTheme = localStorage.getItem(PUBLIC_THEME_KEY) as Theme | null;
            if (storedPublicTheme && ['light', 'dark', 'system'].includes(storedPublicTheme)) {
                setThemeState(storedPublicTheme);
            } else {
                setThemeState('system');
            }
            setAccentThemeState('default');
            return;
        }

        const stored = localStorage.getItem(APP_THEME_KEY) as Theme | null;
        if (stored && ['light', 'dark', 'system'].includes(stored)) {
            setThemeState(stored);
        } else {
            setThemeState('system');
        }

        const storedAccentTheme = localStorage.getItem(APP_ACCENT_THEME_KEY) as AccentTheme | null;
        if (storedAccentTheme && ['default', 'dracula', 'nord', 'catppuccin', 'solarized', 'tokyo-night'].includes(storedAccentTheme)) {
            setAccentThemeState(storedAccentTheme);
        } else {
            setAccentThemeState('default');
        }
    }, [hydrated, isPostAuthRoute]);

    useEffect(() => {
        if (typeof window === 'undefined' || !hydrated) return;
        const root = window.document.documentElement;
        const mq = window.matchMedia('(prefers-color-scheme: dark)');

        if (!isPostAuthRoute) {
            const applyPublicTheme = () => {
                const resolved = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme;
                root.setAttribute('data-theme', resolved);
            };
            applyPublicTheme();
            root.setAttribute('data-accent-theme', 'default');
            localStorage.setItem(PUBLIC_THEME_KEY, theme);
            if (theme === 'system') {
                mq.addEventListener('change', applyPublicTheme);
                return () => mq.removeEventListener('change', applyPublicTheme);
            }
            return;
        }

        const applyTheme = () => {
            const resolved = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme;
            root.setAttribute('data-theme', resolved);
            localStorage.setItem(APP_THEME_KEY, theme);
        };

        applyTheme();
        const handleChange = () => {
            if (theme === 'system') applyTheme();
        };
        mq.addEventListener('change', handleChange);
        return () => mq.removeEventListener('change', handleChange);
    }, [theme, hydrated, isPostAuthRoute]);

    useEffect(() => {
        if (typeof window === 'undefined' || !hydrated) return;
        if (!isPostAuthRoute) return;
        const root = window.document.documentElement;
        root.setAttribute('data-accent-theme', accentTheme);
        localStorage.setItem(APP_ACCENT_THEME_KEY, accentTheme);
    }, [accentTheme, hydrated, isPostAuthRoute]);

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
