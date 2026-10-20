'use client';

/**
 * EXPERIMENTAL — split-screen mindmap editor (desktop only).
 *
 * Shows the Anki deck on the left half of the view and the mindmap editor on
 * the right half. Toggling the button in the editor header returns to the
 * full-screen editor.
 *
 * TO REMOVE THIS FEATURE COMPLETELY:
 *  1. Delete this file (`src/plugin/experimental/mindmapSplitView.tsx`).
 *  2. In `AnkiDeckObsidian.tsx`, remove the blocks marked
 *     `EXPERIMENTAL split mindmap view` (import, state, editor branch) and put
 *     the editor branch back to a plain `return (...)`.
 *  3. In `MindmapEditorObsidian.tsx`, remove the blocks marked
 *     `EXPERIMENTAL split mindmap view` (import, two props, header button and
 *     the `body.is-mobile` CSS line).
 */

import React from 'react';
import { Columns2 } from 'lucide-react';

/** Set to false to hide the split-view button without deleting any code. */
export const EXPERIMENTAL_SPLIT_MINDMAP_VIEW = true;

interface MindmapSplitLayoutProps {
    split: boolean;
    deck: React.ReactNode;
    editor: React.ReactNode;
}

/**
 * Fixed 50/50 split. The editor stays mounted in the same React position when
 * toggling, so tldraw never reloads or loses the current drawing/zoom.
 */
export function MindmapSplitLayout({ split, deck, editor }: MindmapSplitLayoutProps) {
    return (
        <div
            className="ql-mindmap-split-layout"
            data-split={split ? 'on' : 'off'}
            style={{
                display: 'flex',
                flexDirection: 'row',
                width: '100%',
                height: '100%',
                flex: 1,
                minHeight: '65vh',
                minWidth: 0,
                overflow: 'hidden',
                margin: 0,
                padding: 0,
                gap: 0,
            }}
        >
            {split && (
                <div
                    key="deck"
                    className="ql-mindmap-split-deck"
                    style={{
                        flex: '0 0 50%',
                        width: '50%',
                        height: '100%',
                        minWidth: 0,
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        borderRight: '1px solid var(--background-modifier-border)',
                        background: 'var(--background-secondary)',
                        boxSizing: 'border-box',
                    }}
                >
                    {deck}
                </div>
            )}
            <div
                key="editor"
                className="ql-mindmap-split-editor"
                style={{
                    flex: split ? '0 0 50%' : '1 1 100%',
                    width: split ? '50%' : '100%',
                    height: '100%',
                    minWidth: 0,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    position: 'relative',
                }}
            >
                {editor}
            </div>
        </div>
    );
}

interface MindmapSplitToggleButtonProps {
    split: boolean;
    onToggle: () => void;
}

/** Header button rendered to the left of the editor's X button. */
export function MindmapSplitToggleButton({ split, onToggle }: MindmapSplitToggleButtonProps) {
    return (
        <button
            type="button"
            onClick={onToggle}
            className="mindmap-header-split"
            aria-label={split ? 'Exit split view' : 'Split view with Anki deck'}
            aria-pressed={split}
            title={split ? 'Back to full-screen editor' : 'Show Anki deck side by side'}
            style={{
                marginLeft: 0,
                flexShrink: 0,
                padding: 8,
                borderRadius: 999,
                border: split ? '1px solid var(--background-modifier-border)' : '1px solid transparent',
                background: split ? 'var(--background-secondary)' : 'transparent',
                color: split ? 'var(--interactive-accent)' : 'var(--text-muted)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <Columns2 size={20} />
        </button>
    );
}
