'use client';

import { useEffect } from 'react';

const SCROLLABLE_SELECTOR = '.custom-scrollbar';
const ACTIVE_SCROLL_CLASS = 'is-scrolling';
const IDLE_TIMEOUT_MS = 700;

type ListenerEntry = {
  onScroll: () => void;
  onTouchStart: () => void;
  timeoutId: number | null;
};

export default function ScrollbarVisibilityController() {
  useEffect(() => {
    const listeners = new Map<HTMLElement, ListenerEntry>();

    const showWhileScrolling = (element: HTMLElement) => {
      const entry = listeners.get(element);
      if (!entry) return;

      element.classList.add(ACTIVE_SCROLL_CLASS);

      if (entry.timeoutId !== null) {
        window.clearTimeout(entry.timeoutId);
      }

      entry.timeoutId = window.setTimeout(() => {
        element.classList.remove(ACTIVE_SCROLL_CLASS);
        entry.timeoutId = null;
      }, IDLE_TIMEOUT_MS);
    };

    const attach = (element: HTMLElement) => {
      if (listeners.has(element)) return;

      const onScroll = () => showWhileScrolling(element);
      const onTouchStart = () => showWhileScrolling(element);

      element.addEventListener('scroll', onScroll, { passive: true });
      element.addEventListener('touchstart', onTouchStart, { passive: true });

      listeners.set(element, {
        onScroll,
        onTouchStart,
        timeoutId: null,
      });
    };

    const detach = (element: HTMLElement) => {
      const entry = listeners.get(element);
      if (!entry) return;

      element.removeEventListener('scroll', entry.onScroll);
      element.removeEventListener('touchstart', entry.onTouchStart);

      if (entry.timeoutId !== null) {
        window.clearTimeout(entry.timeoutId);
      }

      element.classList.remove(ACTIVE_SCROLL_CLASS);
      listeners.delete(element);
    };

    const syncListeners = () => {
      const currentElements = new Set(
        Array.from(document.querySelectorAll<HTMLElement>(SCROLLABLE_SELECTOR))
      );

      currentElements.forEach((element) => attach(element));
      listeners.forEach((_, element) => {
        if (!currentElements.has(element)) detach(element);
      });
    };

    syncListeners();

    const observer = new MutationObserver(syncListeners);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      Array.from(listeners.keys()).forEach((element) => detach(element));
    };
  }, []);

  return null;
}
