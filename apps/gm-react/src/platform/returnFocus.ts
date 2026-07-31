/**
 * Return-focus policy for dismissible overlays (Dialog, Sheet).
 *
 * Both used to end their close cleanup with an unconditional `returnFocusRef.current.focus()`.
 * That is wrong in two directions, and `ds/components/core/Popover.jsx` had already worked out
 * half the answer:
 *
 * 1. **The opener is often gone by the time the overlay closes.** A confirmed action routinely
 *    removes the very control that opened it (a row's ⋯ delete, an editor card, a visibility
 *    toggle that unmounts once the value flips). `.focus()` on a detached node is a silent no-op,
 *    so focus falls to `<body>` and the next Tab restarts at the top of the document (WCAG 2.4.3).
 * 2. **A caller may deliberately park focus somewhere else.** AppShell's "All sections" sheet
 *    navigates on select; yanking focus back to the More tab undoes that on purpose.
 *
 * So: only reclaim focus if closing actually STRANDED it, and only onto a node still in the
 * document. When the opener is gone, fall back to the page's `<main>` landmark — both of this
 * app's mains (`#main-content` in AppShell, `#player-main` in PlayerView) already carry
 * `tabIndex={-1}` for their skip links, so this needs no new DOM.
 */

/** The document has lost focus to nowhere useful — nothing focused, `<body>`, or a detached node. */
export function isFocusStranded(doc: Document = document): boolean {
	const active = doc.activeElement;
	return !active || active === doc.body || !doc.contains(active);
}

/**
 * Restore focus after an overlay closes. Returns the element that ended up focused, or null if
 * focus was left alone (the caller moved it) or nothing focusable could be found.
 */
export function restoreReturnFocus(
	opener: HTMLElement | null | undefined,
	doc: Document = document,
): HTMLElement | null {
	if (!isFocusStranded(doc)) return null;
	if (opener && typeof opener.focus === 'function' && doc.contains(opener)) {
		opener.focus();
		return opener;
	}
	// The opener died with the action it performed. Land on the page's main landmark rather than
	// leaving the user at `<body>`, where the next Tab restarts from the browser chrome.
	const main = doc.querySelector('main[tabindex], #main-content, #player-main');
	if (main instanceof HTMLElement && typeof main.focus === 'function') {
		main.focus();
		return main;
	}
	return null;
}
