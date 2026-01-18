'use client';

import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from './ThemeProvider';

interface ThemeToggleProps {
    variant: 'mobile' | 'desktop';
    className?: string;
    style?: React.CSSProperties;
}

export default function ThemeToggle({ variant, className, style }: ThemeToggleProps) {
    const { theme, setTheme } = useTheme();

    const cycleTheme = () => {
        if (theme === 'system') setTheme('light');
        else if (theme === 'light') setTheme('dark');
        else setTheme('system');
    };

    const getIcon = () => {
        switch (theme) {
            case 'light': return <Sun size={variant === 'mobile' ? 18 : 20} />;
            case 'dark': return <Moon size={variant === 'mobile' ? 18 : 20} />;
            case 'system': return <Monitor size={variant === 'mobile' ? 18 : 20} />;
        }
    };

    const getLabel = () => {
        switch (theme) {
            case 'light': return 'Light';
            case 'dark': return 'Dark';
            case 'system': return 'System';
        }
    };

    if (variant === 'mobile') {
        return (
            <button
                onClick={cycleTheme}
                className={`theme-toggle-mobile ${className || ''}`}
                aria-label="Toggle theme"
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--foreground-secondary)',
                    padding: '0.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    marginRight: 'auto', // Default behavior
                    ...style // Override with provided styles
                }}
            >
                {getIcon()}
            </button>
        );
    }

    // Desktop
    return (
        <button
            onClick={cycleTheme}
            className={`theme-toggle-desktop nav-item ${className || ''}`}
            title={`Theme: ${getLabel()}`}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                padding: '0.65rem 0.5rem',
                width: '100%',
                color: 'var(--foreground-secondary)',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                borderRadius: '12px',
                marginBottom: '0.25rem',
                ...style
            }}
        >
            <span className="nav-icon">
                {getIcon()}
            </span>
            <span style={{
                fontSize: '0.6rem',
                fontWeight: 600,
                marginTop: '1px',
                opacity: 0.8
            }}>
                {getLabel()}
            </span>
        </button>
    );
}
