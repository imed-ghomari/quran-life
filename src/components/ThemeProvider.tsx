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
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // Load stored theme on mount
        const stored = localStorage.getItem('theme') as Theme;
        if (stored && ['light', 'dark', 'system'].includes(stored)) {
            setThemeState(stored);
        }
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;
        
        const root = window.document.documentElement;
        
        // Remove existing theme attributes
        root.removeAttribute('data-theme');

        if (theme === 'system') {
            localStorage.setItem('theme', 'system');
        } else {
            root.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
        }
    }, [theme, mounted]);

    // Avoid hydration mismatch by rendering children only after mount if needed, 
    // but here we just render children. The theme effect happens on client.
    // However, for SSR we might want to inject a script to avoid flash.
    // For now, simple effect is fine.

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
