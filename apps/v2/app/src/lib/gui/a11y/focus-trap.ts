/**
 * Focus-trap primitive (UX-A11Y-009, UX-A11Y-012).
 *
 * The single, reusable implementation of the WAI-ARIA dialog focus contract: when a modal surface
 * opens, focus moves inside it, Tab/Shift+Tab cycle within it (never escaping to the background),
 * Escape closes it (AP-3: a trap must ALWAYS be escapable), and on close focus is restored to the
 * element that opened it (UX-A11Y-009 §focus trap + restoration). Every dialog / command palette /
 * sheet uses THIS module — no bespoke per-surface trap (UX-A11Y-012 "no bespoke implementations").
 *
 * Pure (`nextTrapTarget`, `getFocusable`) + a DOM controller (`createFocusTrap`). The pure parts are
 * unit-tested without a browser; the controller is exercised in jsdom and Playwright.
 */

/** Selector for natively focusable elements plus authored focusables (`tabindex` / role widgets). */
const FOCUSABLE_SELECTOR = [
	'a[href]',
	'area[href]',
	'button',
	'input',
	'select',
	'textarea',
	'summary',
	'audio[controls]',
	'video[controls]',
	'iframe',
	'[contenteditable]:not([contenteditable="false"])',
	'[tabindex]',
].join(',');

/** True when an element is currently focusable: not disabled, not hidden, not `tabindex="-1"`. */
export function isFocusable(el: Element): el is HTMLElement {
	if (!(el instanceof HTMLElement)) return false;
	if (el.hasAttribute('disabled')) return false;
	if (el.getAttribute('aria-hidden') === 'true') return false;
	if (el.tabIndex < 0) return false;
	// `[hidden]` (or an ancestor with it) removes the element from the tab order; the `hidden`
	// attribute is honoured by assistive tech and the browser alike.
	for (let node: HTMLElement | null = el; node; node = node.parentElement) {
		if (node.hasAttribute('hidden')) return false;
	}
	return true;
}

/** All focusable descendants of `container`, in DOM order (the Tab order within a trap). */
export function getFocusable(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isFocusable);
}

/**
 * Pure Tab-cycle resolver: given the ordered focusables, the currently focused one, and whether
 * Shift is held, return the element that should receive focus next so the cycle wraps inside the
 * trap. Returns `null` when there is nothing focusable. Wrapping at the ends is what keeps focus
 * from escaping to background content (UX-A11Y-012 AC1).
 */
export function nextTrapTarget(
	focusables: readonly HTMLElement[],
	current: HTMLElement | null,
	shiftKey: boolean,
): HTMLElement | null {
	if (focusables.length === 0) return null;
	const first = focusables[0]!;
	const last = focusables[focusables.length - 1]!;
	const index = current ? focusables.indexOf(current) : -1;
	if (shiftKey) {
		// Backward from the first element (or from outside the trap) wraps to the last.
		if (index <= 0) return last;
		return focusables[index - 1]!;
	}
	// Forward from the last element (or from outside the trap) wraps to the first.
	if (index === -1 || index === focusables.length - 1) return first;
	return focusables[index + 1]!;
}

export interface FocusTrapOptions {
	/** Invoked when Escape is pressed inside the trap (AP-3: every trap must be escapable). */
	onEscape?: () => void;
	/** Element to focus first; defaults to the first focusable in the container. */
	initialFocus?: HTMLElement | null;
	/** Element focus returns to on deactivate; defaults to whatever was focused at activation. */
	returnFocusTo?: HTMLElement | null;
}

export interface FocusTrap {
	activate(): void;
	deactivate(): void;
	/** Re-read focusables (call after the trapped content changes). */
	readonly active: boolean;
}

/**
 * Create a focus trap bound to `container`. Call `activate()` when the surface opens and
 * `deactivate()` when it closes. Idempotent; SSR/test-safe (no-ops without a document).
 */
export function createFocusTrap(container: HTMLElement, options: FocusTrapOptions = {}): FocusTrap {
	let active = false;
	let restoreTarget: HTMLElement | null = null;

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			if (options.onEscape) {
				event.preventDefault();
				options.onEscape();
			}
			return;
		}
		if (event.key !== 'Tab') return;
		const focusables = getFocusable(container);
		if (focusables.length === 0) {
			// Keep focus on the container itself rather than letting it leave the trap.
			event.preventDefault();
			container.focus();
			return;
		}
		const activeEl = document.activeElement as HTMLElement | null;
		const target = nextTrapTarget(focusables, activeEl, event.shiftKey);
		if (target) {
			event.preventDefault();
			target.focus();
		}
	}

	function onFocusIn(event: FocusEvent): void {
		// If focus somehow lands outside the trap (programmatic, screen-reader cursor), pull it back.
		const target = event.target as Node | null;
		if (target && !container.contains(target)) {
			const focusables = getFocusable(container);
			(focusables[0] ?? container).focus();
		}
	}

	return {
		get active() {
			return active;
		},
		activate() {
			if (active || typeof document === 'undefined') return;
			active = true;
			restoreTarget =
				options.returnFocusTo ?? (document.activeElement as HTMLElement | null) ?? null;
			container.addEventListener('keydown', onKeydown);
			document.addEventListener('focusin', onFocusIn);
			const initial = options.initialFocus ?? getFocusable(container)[0] ?? container;
			initial.focus();
		},
		deactivate() {
			if (!active) return;
			active = false;
			container.removeEventListener('keydown', onKeydown);
			document.removeEventListener('focusin', onFocusIn);
			// Restore focus to the opener (UX-A11Y-009 §restoration) if it is still connected.
			if (restoreTarget && restoreTarget.isConnected) restoreTarget.focus();
			restoreTarget = null;
		},
	};
}
