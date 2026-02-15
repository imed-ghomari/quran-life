'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>('system');
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const stored = localStorage.getItem('theme') as Theme | null;
        if (stored && ['light', 'dark', 'system'].includes(stored)) {
            setThemeState(stored);
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

    return (
        <ThemeContext.Provider value={{ theme, setTheme: setThemeState }}>
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
