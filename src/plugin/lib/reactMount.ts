import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';

/**
 * Mount React inside Obsidian ItemView containerEl (no iframe).
 * Handles StrictMode, cleanup on leaf close, and deferred view re-mount.
 * Usage:
 *   this.reactRoot = mountReact(this.contentEl, <App vaultStore={plugin.vaultStore} />)
 *   // onClose: this.reactRoot?.unmount()
 */
export function mountReact(container: HTMLElement, element: React.ReactElement): Root {
  container.empty();
  const rootEl = container.createDiv({ cls: 'quran-life-react-root' });
  rootEl.style.height = '100%';
  rootEl.style.display = 'flex';
  rootEl.style.flexDirection = 'column';
  const root = createRoot(rootEl);
  root.render(React.createElement(React.StrictMode, null, element));
  return root;
}

export function unmountReact(root: Root | null, container: HTMLElement) {
  if (root) {
    try { root.unmount(); } catch {}
  }
  // Obsidian's ItemView expects contentEl empty on close; parent will empty it
}
