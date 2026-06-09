/**
 * Shared focus-trap Svelte action (A11Y-003 AC2).
 *
 * Apply this action to any `role="dialog"` container to implement the
 * Tab-cycling focus trap required by A11Y-003 AC2: "Given a modal opens,
 * when Tab cycles, then focus remains inside until dismissed."
 *
 * Tab and Shift+Tab wrap around the container's focusable elements; all
 * other keys are left untouched so Escape handling in the host component
 * is unaffected. The window listener is added on mount and torn down on
 * destroy so no leak occurs after the dialog unmounts — the test in
 * `tests/unit/focus-trap.test.ts` verifies both directions.
 *
 * Usage:
 *   <div role="dialog" use:trapFocus>…</div>
 */
export function trapFocus(node: HTMLElement) {
	const FOCUSABLE =
		'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

	function onKey(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;
		const focusable = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)];
		if (focusable.length === 0) return;
		const first = focusable[0]!;
		const last = focusable[focusable.length - 1]!;
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	window.addEventListener('keydown', onKey);
	return {
		destroy() {
			window.removeEventListener('keydown', onKey);
		},
	};
}
