// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { isFocusStranded, restoreReturnFocus } from './returnFocus';

/**
 * Dialog and Sheet used to end their close cleanup with an unconditional
 * `returnFocusRef.current.focus()`. These lock the three cases that made wrong:
 * a removed opener (the common one — a confirmed delete removes the row that opened it),
 * a caller that deliberately moved focus, and the ordinary restore.
 */

function el(tag: string, id?: string): HTMLElement {
	const node = document.createElement(tag);
	if (id) node.id = id;
	if (tag === 'button' || tag === 'main') node.setAttribute('tabindex', '-1');
	document.body.appendChild(node);
	return node;
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('restoreReturnFocus', () => {
	it('restores focus to an opener that is still in the document', () => {
		const opener = el('button', 'opener');
		expect(restoreReturnFocus(opener)).toBe(opener);
		expect(document.activeElement).toBe(opener);
	});

	it('falls back to the main landmark when the opener was removed by its own action', () => {
		// The failing shape: a row's ⋯ delete opens the confirm, the confirm removes the row, and
		// `.focus()` on the detached button is a SILENT no-op — focus lands on <body> and the next
		// Tab restarts at the top of the document.
		const main = el('main', 'main-content');
		const opener = el('button', 'row-delete');
		opener.remove();
		expect(document.contains(opener)).toBe(false);

		expect(restoreReturnFocus(opener)).toBe(main);
		expect(document.activeElement).toBe(main);
	});

	it('reaches /play’s own landmark, which is #player-main rather than #main-content', () => {
		const playerMain = el('main', 'player-main');
		const opener = el('button');
		opener.remove();
		expect(restoreReturnFocus(opener)).toBe(playerMain);
	});

	it('leaves focus alone when the caller deliberately moved it', () => {
		// AppShell's "All sections" sheet navigates on select. Yanking focus back to the More tab
		// would undo that on purpose.
		el('main', 'main-content');
		const opener = el('button', 'more-tab');
		const destination = el('button', 'destination');
		destination.focus();

		expect(restoreReturnFocus(opener)).toBe(null);
		expect(document.activeElement).toBe(destination);
	});

	it('does nothing at all when there is no opener and no landmark', () => {
		expect(restoreReturnFocus(null)).toBe(null);
	});
});

describe('isFocusStranded', () => {
	it('is true for <body> and for a detached active element, false for a live control', () => {
		const live = el('button');
		expect(isFocusStranded()).toBe(true); // nothing focused yet -> body
		live.focus();
		expect(isFocusStranded()).toBe(false);
		live.remove();
		expect(isFocusStranded()).toBe(true);
	});
});
