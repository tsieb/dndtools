const FOCUSABLE_SELECTOR = [
	'a[href]',
	'button:not([disabled])',
	'textarea:not([disabled])',
	'input:not([disabled]):not([type="hidden"])',
	'select:not([disabled])',
	'summary',
	'[tabindex]:not([tabindex="-1"])',
].join(',');

export interface FocusTrapOptions {
	enabled?: boolean;
	initialFocus?: 'first' | 'container';
	restoreFocus?: boolean;
	returnFocusTarget?: HTMLElement | null;
	onEscape?: () => void;
}

function isVisible(element: HTMLElement): boolean {
	if (element.hasAttribute('hidden')) return false;
	const style = window.getComputedStyle(element);
	if (style.display === 'none' || style.visibility === 'hidden') return false;
	return element.getClientRects().length > 0;
}

function getTabbables(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
		(element) => {
			if (!isVisible(element)) return false;
			const tabIndexAttr = element.getAttribute('tabindex');
			if (tabIndexAttr === null) return true;
			const tabIndex = Number(tabIndexAttr);
			return Number.isFinite(tabIndex) && tabIndex >= 0;
		},
	);
}

export function useFocusTrap(node: HTMLElement, options: FocusTrapOptions = {}) {
	const settings = {
		enabled: options.enabled ?? true,
		initialFocus: options.initialFocus ?? 'first',
		restoreFocus: options.restoreFocus ?? true,
		returnFocusTarget: options.returnFocusTarget ?? null,
		onEscape: options.onEscape,
	};
	const previousFocus =
		typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
			? document.activeElement
			: null;

	function resolveReturnFocusTarget(): HTMLElement | null {
		const explicitTarget = settings.returnFocusTarget;
		if (explicitTarget && typeof document !== 'undefined' && document.contains(explicitTarget)) {
			return explicitTarget;
		}
		if (previousFocus && typeof document !== 'undefined' && document.contains(previousFocus)) {
			return previousFocus;
		}
		return null;
	}

	function setInitialFocus(): void {
		if (!settings.enabled) return;
		const insideTrap =
			document.activeElement instanceof HTMLElement && node.contains(document.activeElement);
		if (insideTrap) return;
		if (settings.initialFocus === 'container') {
			node.focus();
			return;
		}
		const tabbables = getTabbables(node);
		(tabbables[0] ?? node).focus();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (!settings.enabled) return;
		if (event.key === 'Escape') {
			if (!settings.onEscape) return;
			event.preventDefault();
			settings.onEscape();
			return;
		}
		if (event.key !== 'Tab') return;

		const tabbables = getTabbables(node);
		if (tabbables.length === 0) {
			event.preventDefault();
			node.focus();
			return;
		}

		const first = tabbables[0];
		const last = tabbables[tabbables.length - 1];
		const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const activeInside = !!active && node.contains(active);

		if (event.shiftKey) {
			if (!activeInside || active === first) {
				event.preventDefault();
				last?.focus();
			}
			return;
		}

		if (!activeInside || active === last) {
			event.preventDefault();
			first?.focus();
		}
	}

	if (node.getAttribute('tabindex') === null) {
		node.setAttribute('tabindex', '-1');
	}
	node.addEventListener('keydown', handleKeydown);

	const raf = window.requestAnimationFrame(() => setInitialFocus());

	return {
		update(nextOptions: FocusTrapOptions): void {
			settings.enabled = nextOptions.enabled ?? settings.enabled;
			settings.initialFocus = nextOptions.initialFocus ?? settings.initialFocus;
			settings.restoreFocus = nextOptions.restoreFocus ?? settings.restoreFocus;
			settings.returnFocusTarget = nextOptions.returnFocusTarget ?? settings.returnFocusTarget;
			settings.onEscape = nextOptions.onEscape ?? settings.onEscape;
			window.requestAnimationFrame(() => setInitialFocus());
		},
		destroy(): void {
			window.cancelAnimationFrame(raf);
			node.removeEventListener('keydown', handleKeydown);
			if (!settings.restoreFocus) return;
			resolveReturnFocusTarget()?.focus();
		},
	};
}

export const focusTrap = useFocusTrap;
