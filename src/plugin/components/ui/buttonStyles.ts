import type { CSSProperties } from 'react';

/**
 * Shared secondary action button used across the Daily Portion and Anki Deck
 * headers/toolbars. Keep this in sync with the Expand / Show details controls
 * so every small action button in both views looks the same.
 */
export const toolbarButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 10px',
  borderRadius: 8,
  border: '1px solid var(--background-modifier-border)',
  background: 'var(--background-secondary)',
  color: 'var(--text-normal)',
  fontSize: '0.8em',
  cursor: 'pointer',
};
