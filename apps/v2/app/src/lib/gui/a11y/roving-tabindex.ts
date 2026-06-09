/**
 * Roving-tabindex primitive (UX-A11Y-009 §roving tabindex, UX-A11Y-012 menu/tabs/tree/grid).
 *
 * The single keyboard-navigation engine for composite widgets where only ONE item is in the Tab
 * order at a time (`tabindex=0`) and Arrow/Home/End move focus among siblings (`tabindex=-1`).
 * Tabs, menus, trees, toolbars, the Scene Outline, and the initiative grid all resolve their next
 * focus index through `nextRovingIndex`, so there is no positive `tabindex` anywhere (AP-8) and the
 * arrow-key model is identical across every widget (UX-A11Y-012 "no bespoke implementations").
 *
 * Pure functions only — no DOM, no Svelte — so the navigation logic is unit-tested directly and the
 * Svelte components just map a key event to an index and call `el.focus()`.
 */

export type Orientation = 'horizontal' | 'vertical' | 'both';

export interface RovingMove {
	key: string;
	currentIndex: number;
	count: number;
	orientation?: Orientation;
	/** Wrap from last→first and first→last (APG tabs/menus). Default true. */
	wrap?: boolean;
}

const FORWARD_KEYS: Record<Orientation, ReadonlySet<string>> = {
	horizontal: new Set(['ArrowRight']),
	vertical: new Set(['ArrowDown']),
	both: new Set(['ArrowRight', 'ArrowDown']),
};

const BACKWARD_KEYS: Record<Orientation, ReadonlySet<string>> = {
	horizontal: new Set(['ArrowLeft']),
	vertical: new Set(['ArrowUp']),
	both: new Set(['ArrowLeft', 'ArrowUp']),
};

/**
 * Resolve the index that should receive focus for a roving-tabindex key press, or `null` when the
 * key is not a navigation key for this orientation (so the caller leaves the event alone).
 *
 * Arrow keys move by one (respecting orientation); Home/End jump to the first/last item. Out-of-
 * orientation arrows return `null` (e.g. ArrowUp in a `horizontal` tablist is not consumed).
 */
export function nextRovingIndex(move: RovingMove): number | null {
	const { key, currentIndex, count } = move;
	const orientation = move.orientation ?? 'vertical';
	const wrap = move.wrap ?? true;
	if (count <= 0) return null;

	if (key === 'Home') return 0;
	if (key === 'End') return count - 1;

	if (FORWARD_KEYS[orientation].has(key)) {
		const next = currentIndex + 1;
		if (next < count) return next;
		return wrap ? 0 : currentIndex;
	}
	if (BACKWARD_KEYS[orientation].has(key)) {
		const prev = currentIndex - 1;
		if (prev >= 0) return prev;
		return wrap ? count - 1 : currentIndex;
	}
	return null;
}

/**
 * Typeahead: find the index of the next item whose label starts with `char` (case-insensitive),
 * searching forward from just after `fromIndex` and wrapping. Returns `null` when nothing matches.
 * Used by menus/trees (APG typeahead).
 */
export function typeaheadIndex(
	labels: readonly string[],
	char: string,
	fromIndex: number,
): number | null {
	const needle = char.trim().toLowerCase();
	if (needle.length !== 1) return null;
	const count = labels.length;
	for (let step = 1; step <= count; step += 1) {
		const i = (fromIndex + step) % count;
		if (labels[i]?.trim().toLowerCase().startsWith(needle)) return i;
	}
	return null;
}

/**
 * Apply the roving contract to a set of elements: set `tabindex=0` on `activeIndex` and
 * `tabindex=-1` on the rest. Atomic with the focus move (UX-A11Y-009 §roving tabindex).
 */
export function applyRovingTabindex(items: readonly HTMLElement[], activeIndex: number): void {
	items.forEach((item, i) => {
		item.tabIndex = i === activeIndex ? 0 : -1;
	});
}
