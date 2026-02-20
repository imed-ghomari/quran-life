'use client';

import React, { useEffect, useRef, useState } from 'react';

type Placement = 'top' | 'bottom';

interface TooltipState {
    visible: boolean;
    text: string;
    x: number;
    y: number;
    placement: Placement;
}

const SHOW_DELAY_MS = 80;
const LONG_PRESS_DELAY_MS = 280;
const TAP_HIDE_DELAY_MS = 1200;

export default function GlobalTooltip() {
    const [state, setState] = useState<TooltipState>({
        visible: false,
        text: '',
        x: 0,
        y: 0,
        placement: 'top',
    });

    const activeElRef = useRef<Element | null>(null);
    const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const touchModeRef = useRef<'long-press' | 'tap' | null>(null);
    const isTouchPointerRef = useRef(false);

    const clearTimer = (timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) => {
        if (!timerRef.current) {
            return;
        }
        clearTimeout(timerRef.current);
        timerRef.current = null;
    };

    const clearShowTimer = () => {
        clearTimer(showTimerRef);
    };

    const clearLongPressTimer = () => {
        clearTimer(longPressTimerRef);
    };

    const clearAutoHideTimer = () => {
        clearTimer(autoHideTimerRef);
    };

    const getTooltipText = (el: Element) => {
        const dataTooltip = el.getAttribute('data-tooltip');
        if (dataTooltip && dataTooltip.trim()) {
            return dataTooltip.trim();
        }

        const migratedTitle = el.getAttribute('data-custom-tooltip-title');
        if (migratedTitle && migratedTitle.trim()) {
            return migratedTitle.trim();
        }

        return '';
    };

    const migrateTitleAttr = (el: Element) => {
        const title = el.getAttribute('title');
        if (!title || !title.trim()) {
            return;
        }

        if (!el.hasAttribute('data-custom-tooltip-title')) {
            el.setAttribute('data-custom-tooltip-title', title.trim());
        }
        el.removeAttribute('title');
    };

    const migrateTitlesInSubtree = (root: ParentNode) => {
        const nodes = root.querySelectorAll('[title]');
        nodes.forEach(migrateTitleAttr);
    };

    const resolveTriggerMode = (el: Element): 'long-press' | 'tap' | 'hover' => {
        const trigger = el.getAttribute('data-tooltip-trigger');
        if (trigger === 'long-press' || trigger === 'tap') {
            return trigger;
        }
        return 'hover';
    };

    const hideTooltip = () => {
        if (showTimerRef.current) {
            clearTimeout(showTimerRef.current);
            showTimerRef.current = null;
        }
        clearLongPressTimer();
        clearAutoHideTimer();
        activeElRef.current = null;
        touchModeRef.current = null;
        setState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };

    const computePosition = (el: Element) => {
        const rect = el.getBoundingClientRect();
        const preferTop = rect.top >= 56;

        return {
            x: rect.left + rect.width / 2,
            y: preferTop ? rect.top - 10 : rect.bottom + 10,
            placement: preferTop ? ('top' as const) : ('bottom' as const),
        };
    };

    const showTooltip = (el: Element, delayMs: number = SHOW_DELAY_MS) => {
        const text = getTooltipText(el);
        if (!text) {
            hideTooltip();
            return;
        }

        activeElRef.current = el;
        const { x, y, placement } = computePosition(el);

        clearShowTimer();
        showTimerRef.current = setTimeout(() => {
            setState({ visible: true, text, x, y, placement });
        }, delayMs);
    };

    const findTooltipTarget = (target: EventTarget | null) => {
        if (!(target instanceof Element)) {
            return null;
        }

        if (target.closest('[data-tooltip-disabled="true"]')) {
            return null;
        }

        const el = target.closest('[data-custom-tooltip-title],[data-tooltip]');
        if (!el || !getTooltipText(el)) {
            return null;
        }

        return el;
    };

    useEffect(() => {
        migrateTitlesInSubtree(document);
        if (document.documentElement.hasAttribute('title')) {
            migrateTitleAttr(document.documentElement);
        }
        if (document.body.hasAttribute('title')) {
            migrateTitleAttr(document.body);
        }

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.target instanceof Element) {
                    if (mutation.attributeName === 'title') {
                        migrateTitleAttr(mutation.target);
                    }
                    continue;
                }

                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (!(node instanceof Element)) {
                            return;
                        }
                        migrateTitleAttr(node);
                        migrateTitlesInSubtree(node);
                    });
                }
            }
        });

        observer.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['title'],
        });

        const onMouseOver = (event: MouseEvent) => {
            if (isTouchPointerRef.current) {
                return;
            }
            const el = findTooltipTarget(event.target);
            if (!el) {
                return;
            }

            if (activeElRef.current === el && state.visible) {
                return;
            }

            showTooltip(el, SHOW_DELAY_MS);
        };

        const onFocusIn = (event: FocusEvent) => {
            const el = findTooltipTarget(event.target);
            if (!el) {
                return;
            }
            showTooltip(el, 0);
        };

        const onMouseOut = (event: MouseEvent) => {
            if (!activeElRef.current) {
                return;
            }

            const related = event.relatedTarget;
            if (related instanceof Node && activeElRef.current.contains(related)) {
                return;
            }

            hideTooltip();
        };

        const onFocusOut = () => {
            hideTooltip();
        };

        const onPointerDown = (event: PointerEvent) => {
            isTouchPointerRef.current = event.pointerType === 'touch' || event.pointerType === 'pen';
            if (!isTouchPointerRef.current) {
                return;
            }

            const el = findTooltipTarget(event.target);
            if (!el) {
                hideTooltip();
                return;
            }

            const trigger = resolveTriggerMode(el);
            if (trigger === 'hover') {
                return;
            }

            if (trigger === 'tap') {
                touchModeRef.current = 'tap';
                showTooltip(el, 0);
                clearAutoHideTimer();
                autoHideTimerRef.current = setTimeout(() => {
                    hideTooltip();
                }, TAP_HIDE_DELAY_MS);
                return;
            }

            touchModeRef.current = 'long-press';
            clearLongPressTimer();
            longPressTimerRef.current = setTimeout(() => {
                showTooltip(el, 0);
            }, LONG_PRESS_DELAY_MS);
        };

        const onPointerUpOrCancel = () => {
            clearLongPressTimer();
            if (touchModeRef.current === 'long-press') {
                hideTooltip();
            }
            isTouchPointerRef.current = false;
        };

        const onScrollOrResize = () => {
            if (!activeElRef.current || !state.visible) {
                return;
            }

            const { x, y, placement } = computePosition(activeElRef.current);
            setState((prev) => ({ ...prev, x, y, placement }));
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                hideTooltip();
            }
        };

        document.addEventListener('mouseover', onMouseOver, true);
        document.addEventListener('mouseout', onMouseOut, true);
        document.addEventListener('focusin', onFocusIn, true);
        document.addEventListener('focusout', onFocusOut, true);
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('pointerup', onPointerUpOrCancel, true);
        document.addEventListener('pointercancel', onPointerUpOrCancel, true);
        document.addEventListener('scroll', onScrollOrResize, true);
        window.addEventListener('resize', onScrollOrResize);
        window.addEventListener('keydown', onKeyDown, true);

        return () => {
            observer.disconnect();
            clearShowTimer();
            clearLongPressTimer();
            clearAutoHideTimer();
            document.removeEventListener('mouseover', onMouseOver, true);
            document.removeEventListener('mouseout', onMouseOut, true);
            document.removeEventListener('focusin', onFocusIn, true);
            document.removeEventListener('focusout', onFocusOut, true);
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('pointerup', onPointerUpOrCancel, true);
            document.removeEventListener('pointercancel', onPointerUpOrCancel, true);
            document.removeEventListener('scroll', onScrollOrResize, true);
            window.removeEventListener('resize', onScrollOrResize);
            window.removeEventListener('keydown', onKeyDown, true);
        };
    }, [state.visible]);

    if (!state.text) {
        return null;
    }

    return (
        <div
            className={`custom-hover-tooltip ${state.visible ? 'is-visible' : ''}`}
            role="tooltip"
            style={{
                left: state.x,
                top: state.y,
                transform: state.placement === 'top'
                    ? 'translate(-50%, -100%)'
                    : 'translate(-50%, 0)',
            }}
        >
            {state.text}
        </div>
    );
}
