'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

type Placement = 'top' | 'bottom';

interface TooltipState {
    visible: boolean;
    text: string;
    anchorX: number;
    anchorY: number;
    placement: Placement;
}

interface TooltipRenderState {
    left: number;
    top: number;
    placement: Placement;
    maxWidth: number;
    maxHeight: number;
}

const SHOW_DELAY_MS = 80;
const LONG_PRESS_DELAY_MS = 280;
const TAP_HIDE_DELAY_MS = 1200;

export default function GlobalTooltip() {
    const [state, setState] = useState<TooltipState>({
        visible: false,
        text: '',
        anchorX: 0,
        anchorY: 0,
        placement: 'top',
    });
    const [renderState, setRenderState] = useState<TooltipRenderState>({
        left: 0,
        top: 0,
        placement: 'top',
        maxWidth: 320,
        maxHeight: 280,
    });

    const activeElRef = useRef<Element | null>(null);
    const tooltipRef = useRef<HTMLDivElement | null>(null);
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

    const computeAnchor = (el: Element) => {
        const rect = el.getBoundingClientRect();
        const preferTop = rect.top >= 56;

        return {
            anchorX: rect.left + rect.width / 2,
            anchorY: preferTop ? rect.top - 10 : rect.bottom + 10,
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
        const { anchorX, anchorY, placement } = computeAnchor(el);

        clearShowTimer();
        showTimerRef.current = setTimeout(() => {
            setState({ visible: true, text, anchorX, anchorY, placement });
        }, delayMs);
    };

    useLayoutEffect(() => {
        if (!state.visible || !tooltipRef.current) {
            return;
        }

        const margin = 12;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const maxWidth = Math.max(180, Math.min(420, viewportWidth - margin * 2));
        const maxHeight = Math.max(96, Math.min(320, Math.floor(viewportHeight * 0.42)));
        const tooltipEl = tooltipRef.current;

        tooltipEl.style.maxWidth = `${maxWidth}px`;
        tooltipEl.style.maxHeight = `${maxHeight}px`;

        const rect = tooltipEl.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;

        const clampedLeft = Math.min(
            Math.max(state.anchorX - width / 2, margin),
            viewportWidth - width - margin,
        );

        const topForBottom = state.anchorY;
        const topForTop = state.anchorY - height;
        let nextPlacement: Placement = state.placement;
        let top = nextPlacement === 'top' ? topForTop : topForBottom;

        if (nextPlacement === 'top' && top < margin) {
            nextPlacement = 'bottom';
            top = topForBottom;
        } else if (nextPlacement === 'bottom' && top + height > viewportHeight - margin) {
            nextPlacement = 'top';
            top = topForTop;
        }

        if (top < margin) {
            top = margin;
        } else if (top + height > viewportHeight - margin) {
            top = viewportHeight - height - margin;
        }

        setRenderState((prev) => {
            if (
                prev.left === clampedLeft
                && prev.top === top
                && prev.placement === nextPlacement
                && prev.maxWidth === maxWidth
                && prev.maxHeight === maxHeight
            ) {
                return prev;
            }

            return {
                left: clampedLeft,
                top,
                placement: nextPlacement,
                maxWidth,
                maxHeight,
            };
        });
    }, [state.visible, state.anchorX, state.anchorY, state.placement, state.text]);

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

            const { anchorX, anchorY, placement } = computeAnchor(activeElRef.current);
            setState((prev) => ({ ...prev, anchorX, anchorY, placement }));
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
            ref={tooltipRef}
            className={`custom-hover-tooltip ${state.visible ? 'is-visible' : ''}`}
            role="tooltip"
            style={{
                left: renderState.left,
                top: renderState.top,
                maxWidth: renderState.maxWidth,
                maxHeight: renderState.maxHeight,
                transform: renderState.placement === 'top'
                    ? 'translateY(-2px)'
                    : 'translateY(2px)',
            }}
        >
            {state.text}
        </div>
    );
}
