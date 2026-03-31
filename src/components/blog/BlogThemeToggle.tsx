'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import styles from './blog.module.css';

export default function BlogThemeToggle() {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === 'system') setTheme('light');
    else if (theme === 'light') setTheme('dark');
    else setTheme('system');
  };

  const icon =
    theme === 'light' ? <Sun size={18} /> : theme === 'dark' ? <Moon size={18} /> : <Monitor size={18} />;

  const label = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System';

  return (
    <button
      type="button"
      onClick={cycleTheme}
      className={styles.themeToggle}
      aria-label={`Switch theme. Current theme: ${label}`}
      title={`Theme: ${label}`}
    >
      {icon}
      <span className={styles.themeToggleLabel}>{label}</span>
    </button>
  );
}
