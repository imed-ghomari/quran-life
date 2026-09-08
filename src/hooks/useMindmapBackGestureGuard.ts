import React from 'react';

const { useEffect, useLayoutEffect } = React;

let guardCount = 0;
let originalBodyOverscrollX: string | null = null;
let originalHtmlOverscrollX: string | null = null;
let listenersAttached = false;
let touchStartX = 0;
let touchStartY = 0;

const EDGE_GUARD_PX = 24;

const handleTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
};

const handleTouchMove = (event: TouchEvent) => {
    if (!event.cancelable) return;
    const touch = event.touches[0];
    if (!touch) return;

    const dx = touch.clientX - touchStartX;
    const dy = Math.abs(touch.clientY - touchStartY);
    if (dy >= Math.abs(dx)) return;

    const viewportWidth = window.innerWidth || 0;
    const fromLeftEdge = touchStartX <= EDGE_GUARD_PX;
    const fromRightEdge = viewportWidth > 0 && touchStartX >= viewportWidth - EDGE_GUARD_PX;

    if ((fromLeftEdge && dx > 0) || (fromRightEdge && dx < 0)) {
        event.preventDefault();
    }
};

const attachListeners = () => {
    if (listenersAttached) return;
    window.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true });
    window.addEventListener('touchmove', handleTouchMove, { capture: true, passive: false });
    listenersAttached = true;
};

const detachListeners = () => {
    if (!listenersAttached) return;
    window.removeEventListener('touchstart', handleTouchStart, { capture: true });
    window.removeEventListener('touchmove', handleTouchMove, { capture: true });
    listenersAttached = false;
};

const applyGuard = () => {
    guardCount += 1;
    if (guardCount !== 1) return;

    originalBodyOverscrollX = document.body.style.overscrollBehaviorX;
    originalHtmlOverscrollX = document.documentElement.style.overscrollBehaviorX;

    document.body.style.overscrollBehaviorX = 'none';
    document.documentElement.style.overscrollBehaviorX = 'none';

    attachListeners();
};

const releaseGuard = () => {
    if (guardCount === 0) return;
    guardCount -= 1;
    if (guardCount !== 0) return;

    if (originalBodyOverscrollX !== null) {
        document.body.style.overscrollBehaviorX = originalBodyOverscrollX;
    }
    if (originalHtmlOverscrollX !== null) {
        document.documentElement.style.overscrollBehaviorX = originalHtmlOverscrollX;
    }

    originalBodyOverscrollX = null;
    originalHtmlOverscrollX = null;
    detachListeners();
};

const useGuardEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function useMindmapBackGestureGuard(isActive: boolean) {
    useGuardEffect(() => {
        if (!isActive || typeof window === 'undefined') return;
        applyGuard();
        return () => releaseGuard();
    }, [isActive]);
}
