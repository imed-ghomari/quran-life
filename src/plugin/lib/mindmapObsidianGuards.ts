/**
 * Shared Obsidian guards for the tldraw-based mindmap editor + viewer.
 *
 * 1. Swipe / history guard — Obsidian (especially mobile) listens for
 *    horizontal swipes at the document level to reveal the left/right
 *    sidebars, and for two-finger / horizontal trackpad swipes to navigate
 *    back/forward. When the user pans the mindmap canvas with the hand tool
 *    those document-level handlers must never see the gesture, while tldraw
 *    itself must still receive it. So we listen in the *bubble* phase on the
 *    mindmap container (tldraw's own canvas handlers run first at target
 *    phase) and stop the event from propagating further out to Obsidian.
 * 2. Watermark tooltip strip — the tldraw watermark button carries
 *    `title="made with tldraw"`, which shows a native hover tooltip over the
 *    canvas. The watermark itself stays (license), but the tooltip is noise,
 *    so we strip the title attribute (observed, since tldraw re-renders it).
 * 3. Tight camera fit — `zoomToFit()` defaults to a 128px screen-space inset
 *    which leaves large blank margins in the small inline viewer. Fitting
 *    with a small inset makes the mindmap fill the viewer.
 */

const WATERMARK_TITLE = 'made with tldraw';

/** Tight inset (screen px) used when fitting the viewer camera. */
export const MINDMAP_VIEWER_FIT_INSET = 24;

/**
 * Attach bubble-phase listeners on `el` that keep pan/zoom gestures inside
 * the mindmap from reaching Obsidian's global swipe / history handlers.
 * Returns a cleanup function.
 */
export function attachMindmapSwipeGuard(el: HTMLElement): () => void {
	const onTouch = (e: Event) => {
		// Single-finger pan AND multi-finger (pinch / two-finger history swipe)
		// must both stay inside the canvas. Never preventDefault here — tldraw
		// needs the events — just stop them bubbling to Obsidian.
		e.stopPropagation();
	};

	const onWheel = (e: WheelEvent) => {
		// Horizontal trackpad swipes are what Obsidian turns into pane /
		// back-forward navigation. tldraw already handled the pan at target
		// phase; block the browser/Obsidian default + further propagation.
		e.stopPropagation();
		try {
			// stopImmediatePropagation also shields against other document-level
			// listeners registered on the same target phase ordering.
			e.stopImmediatePropagation?.();
		} catch {
			/* noop */
		}
		if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
			try {
				if (e.cancelable) e.preventDefault();
			} catch {
				/* noop */
			}
		}
	};

	const onGesture = (e: Event) => {
		// iOS Safari pinch gesture events — keep them local too.
		e.stopPropagation();
	};

	const opts: AddEventListenerOptions = { capture: false, passive: true };
	const wheelOpts: AddEventListenerOptions = { capture: false, passive: false };
	el.addEventListener('touchstart', onTouch, opts);
	el.addEventListener('touchmove', onTouch, opts);
	el.addEventListener('touchend', onTouch, opts);
	el.addEventListener('touchcancel', onTouch, opts);
	el.addEventListener('wheel', onWheel as EventListener, wheelOpts);
	el.addEventListener('gesturestart', onGesture, opts);
	el.addEventListener('gesturechange', onGesture, opts);
	el.addEventListener('gestureend', onGesture, opts);

	return () => {
		el.removeEventListener('touchstart', onTouch, opts);
		el.removeEventListener('touchmove', onTouch, opts);
		el.removeEventListener('touchend', onTouch, opts);
		el.removeEventListener('touchcancel', onTouch, opts);
		el.removeEventListener('wheel', onWheel as EventListener, wheelOpts);
		el.removeEventListener('gesturestart', onGesture, opts);
		el.removeEventListener('gesturechange', onGesture, opts);
		el.removeEventListener('gestureend', onGesture, opts);
	};
}

/** Remove the watermark hover tooltip inside `root` (watermark stays). */
export function stripTldrawWatermarkTitles(root: ParentNode = document): void {
	try {
		const nodes = root.querySelectorAll?.(
			`[title="${WATERMARK_TITLE}"]`
		);
		nodes?.forEach((n) => {
			try {
				n.removeAttribute('title');
			} catch {
				/* noop */
			}
		});
	} catch {
		/* noop */
	}
}

/**
 * Observe `root` and strip the watermark title whenever tldraw re-renders it.
 * Returns a cleanup function.
 */
export function observeTldrawWatermarkTitles(root: HTMLElement): () => void {
	stripTldrawWatermarkTitles(root);
	try {
		const observer = new MutationObserver(() => stripTldrawWatermarkTitles(root));
		observer.observe(root, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['title'],
		});
		return () => observer.disconnect();
	} catch {
		return () => {};
	}
}

/**
 * Bottom-bar offset handling — Obsidian phones float their own bottom bar
 * over the WebView, which used to sit on top of tldraw's toolbar. But
 * tablets (and desktop) have no such bar, so a hardcoded lift leaves a dead
 * gap there. Instead we *measure* the clearance between our content edge and
 * any Obsidian-owned bar actually overlaying it, and expose it as
 * `--ql-obsidian-bottom-offset` on the mindmap container (0 when absent).
 *
 * Detection is geometric (no hardcoded Obsidian class names to go stale):
 * points just inside our own container edge are hit-tested; whatever is NOT
 * part of our container and looks like a wide, short chrome strip counts.
 * Probing inside our container (rather than at the viewport edge) is what
 * makes this robust: floating bars sit inset from the viewport edge
 * (notch / home-indicator insets, floating margins), and an in-flow bar
 * (desktop status bar, tablet headers) can never contain a probe point
 * inside our content, so it can never match.
 */
export const OBSIDIAN_BOTTOM_OFFSET_VAR = '--ql-obsidian-bottom-offset';
export const OBSIDIAN_TOP_OFFSET_VAR = '--ql-obsidian-top-offset';

/** A hit-test ancestor counts as overlay chrome: wide, short strip. */
function isOverlayChrome(rect: DOMRect, vw: number, vh: number): boolean {
	if (!rect || rect.height <= 0) return false;
	// A full-width chrome strip, not a small floating button…
	if (rect.width < vw * 0.5) return false;
	// …and not some giant overlay.
	if (rect.height > vh * 0.4) return false;
	return true;
}

/**
 * Cross-window element check. Prefers Obsidian's own `Node.instanceOf`
 * (patched onto the DOM prototype at startup, works across WebView windows);
 * outside Obsidian (web build, unit tests) where the patch is absent, walks
 * the prototype chain instead of a bare `instanceof` for the same reason.
 * Never throws — measurement must degrade to 0, not crash.
 */
function isChromeElement(el: unknown): el is HTMLElement {
	if (typeof el !== 'object' || el === null) return false;
	try {
		const patched = el as { instanceOf?: (type: unknown) => boolean };
		if (typeof patched.instanceOf === 'function') {
			return patched.instanceOf(HTMLElement) === true;
		}
	} catch {
		/* fall through to the prototype walk */
	}
	try {
		let proto: unknown = Object.getPrototypeOf(el);
		while (proto) {
			if (proto === HTMLElement.prototype) return true;
			proto = Object.getPrototypeOf(proto);
		}
	} catch {
		/* not an element */
	}
	return false;
}

/** Best clearance found at point (x, y): the outermost matching ancestor wins
 * (an inner title row under-reports the bar's true extent). */
function probeChromeGap(
	container: HTMLElement,
	x: number,
	y: number,
	vw: number,
	vh: number,
	edge: 'top' | 'bottom',
	edgeStart: number,
): number {
	let stack: Element[];
	try {
		stack = document.elementsFromPoint(Math.round(x), Math.round(y));
	} catch {
		return 0;
	}
	if (!stack || !stack.length) return 0;
	let best = 0;
	for (const el of stack) {
		if (!isChromeElement(el)) continue;
		if (el === document.documentElement || el === document.body) continue;
		// Our own UI (header, canvas, toasts, …) never counts.
		if (container.contains(el)) continue;
		// Walk up: the hit element may be a small button inside the bar.
		let node: HTMLElement | null = el;
		let depth = 0;
		while (node && node !== document.body && depth < 5) {
			let rect: DOMRect | null = null;
			try {
				rect = node.getBoundingClientRect();
			} catch {
				break;
			}
			if (rect && isOverlayChrome(rect, vw, vh)) {
				const gap = edge === 'top' ? rect.bottom - edgeStart : edgeStart - rect.top;
				if (gap > best) best = gap;
			}
			node = node.parentElement;
			depth += 1;
		}
	}
	return best;
}

/**
 * Clearance (px) between the container's `edge` and the nearest overlaying
 * Obsidian-owned bar covering it, or 0 when there is none. For the top edge
 * that is `barBottom - contentTop`, for the bottom `contentBottom - barTop`,
 * so the value already includes any notch / home-indicator gap the floating
 * bar leaves — consumers take `max(osSafeArea, this)` instead of adding both.
 */
function measureChromeGap(container: HTMLElement, edge: 'top' | 'bottom'): number {
	try {
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		if (!vw || !vh || !container.isConnected) return 0;
		const box = container.getBoundingClientRect();
		if (box.width <= 0 || box.height <= 0) return 0;
		const edgeStart = edge === 'top' ? box.top : box.bottom;
		const xs = [vw * 0.25, vw * 0.5, vw * 0.75];
		// Depths just inside the container edge: a single edge pixel misses
		// whenever the bar starts a little further in.
		const depths = [2, 22, 42, 62, 82];
		let best = 0;
		for (const d of depths) {
			const y = edge === 'top' ? edgeStart + d : edgeStart - d;
			if (y < 0 || y > vh) continue;
			for (const x of xs) {
				const gap = probeChromeGap(container, x, y, vw, vh, edge, edgeStart);
				if (gap > best) best = gap;
			}
		}
		return Math.round(Math.max(0, Math.min(best, vh * 0.4)));
	} catch {
		/* noop */
	}
	return 0;
}

/**
 * Measure the clearance between our content bottom and an Obsidian-owned
 * bottom bar overlaying it, or 0 when there is none (tablet / desktop /
 * hidden bar).
 */
export function measureObsidianBottomOffset(container: HTMLElement): number {
	return measureChromeGap(container, 'bottom');
}

/**
 * Keep `--ql-obsidian-bottom-offset` on `container` in sync with the actual
 * Obsidian bottom bar (re-checked on resize/orientation/DOM changes, since
 * Obsidian can show or hide its chrome at any time). Returns a cleanup fn.
 */
export function observeObsidianBottomBar(container: HTMLElement): () => void {
	return observeChromeOffset(container, OBSIDIAN_BOTTOM_OFFSET_VAR, measureObsidianBottomOffset, 'ql-has-obsidian-bottom-bar');
}

/**
 * Top-chrome counterpart of the bottom-bar handling above: on phones Obsidian
 * floats its view-header over the top of the view, which used to sit on top
 * of the mindmap editor's own header. The measured clearance is exposed as
 * `--ql-obsidian-top-offset` on the editor container (0 when no overlaying
 * bar exists, e.g. tablets/desktop where the header is in-flow above the
 * content). Consumed phone-only in CSS so other form factors are untouched.
 */

/**
 * Measure the clearance between our content top and an Obsidian-owned top
 * bar overlaying it, or 0 when there is none (tablet / desktop / hidden bar).
 */
export function measureObsidianTopOffset(container: HTMLElement): number {
	return measureChromeGap(container, 'top');
}

/**
 * Keep `--ql-obsidian-top-offset` on `container` in sync with the actual
 * Obsidian top bar. Returns a cleanup fn.
 */
export function observeObsidianTopBar(container: HTMLElement): () => void {
	return observeChromeOffset(container, OBSIDIAN_TOP_OFFSET_VAR, measureObsidianTopOffset);
}

/**
 * Shared offset observer: measures via `measure`, publishes as `cssVar`
 * (re-checked on resize/orientation/DOM changes, since Obsidian can show or
 * hide its chrome at any time). When `toggleClass` is given it is toggled on
 * `container` while the offset is non-zero. Returns a cleanup fn.
 */
function observeChromeOffset(
	container: HTMLElement,
	cssVar: string,
	measure: (container: HTMLElement) => number,
	toggleClass?: string,
): () => void {
	const apply = () => {
		try {
			const height = measure(container);
			container.style.setProperty(cssVar, `${height}px`);
			if (toggleClass) container.classList.toggle(toggleClass, height > 0);
		} catch {
			/* noop */
		}
	};

	apply();

	let raf = 0;
	const schedule = () => {
		try {
			window.cancelAnimationFrame(raf);
		} catch {
			/* noop */
		}
		try {
			raf = window.requestAnimationFrame(apply);
		} catch {
			apply();
		}
	};

	window.addEventListener('resize', schedule);
	window.addEventListener('orientationchange', schedule);

	let bodyObserver: MutationObserver | null = null;
	try {
		// Direct children only: enough for Obsidian chrome appearing /
		// disappearing, without firing for every tldraw canvas mutation.
		bodyObserver = new MutationObserver(schedule);
		bodyObserver.observe(document.body, { childList: true, subtree: false });
	} catch {
		bodyObserver = null;
	}

	// Obsidian may finish its mobile layout a beat after our mount.
	const timers: number[] = [];
	try {
		timers.push(window.setTimeout(apply, 500));
		timers.push(window.setTimeout(apply, 1500));
	} catch {
		/* noop */
	}

	return () => {
		try {
			window.removeEventListener('resize', schedule);
			window.removeEventListener('orientationchange', schedule);
		} catch {
			/* noop */
		}
		try {
			bodyObserver?.disconnect();
		} catch {
			/* noop */
		}
		for (const t of timers) {
			try {
				window.clearTimeout(t);
			} catch {
				/* noop */
			}
		}
		try {
			window.cancelAnimationFrame(raf);
		} catch {
			/* noop */
		}
	};
}

/**
 * Fit the camera tightly around page content with a small inset so the
 * mindmap fills the viewer instead of floating in blank space.
 * Falls back to plain zoomToFit when the inset form is unavailable.
 */
/** Minimal structural view of the tldraw editor we need for camera fitting. */
interface CameraFitEditor {
	zoomToFit?: (opts?: { inset?: number; duration?: number }) => void;
}

export function fitMindmapCameraTight(editor: CameraFitEditor | null | undefined, inset: number = MINDMAP_VIEWER_FIT_INSET): void {
	if (!editor) return;
	try {
		// zoomToFit forwards opts to zoomToBounds, which honours `inset`
		// (default is 128px — far too loose for the inline preview).
		editor.zoomToFit?.({ inset, duration: 0 });
	} catch {
		try {
			editor.zoomToFit?.({ duration: 0 });
		} catch {
			/* noop */
		}
	}
}
