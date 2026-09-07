import { describe, expect, it } from 'vitest';
import {
	applyToolbarAction,
	toggleBullets,
	toggleHeading,
	toggleOrdered,
	wrapInline,
} from './Toolbar';
import { completeWikilink, findWikilinkTrigger, wrapIndex } from './Autocomplete';
import { completeSlash, filterSlashItems, findSlashTrigger, slashItems } from './SlashMenu';

/* RC-KNW-1.2 — the pure text transforms behind the editor. These are the functions that can eat a
 * DM's paragraph if an offset is wrong, so they are tested away from the component. */

const LABELS = { linkText: 'link text', column: 'Column' };
const t = ((key: string) => key) as never;

describe('inline marks', () => {
	it('wraps the selection and leaves it selected', () => {
		const edit = wrapInline('the bell rings', 4, 8, '**');
		expect(edit.text).toBe('the **bell** rings');
		expect(edit.text.slice(edit.start, edit.end)).toBe('bell');
	});

	it('unwraps rather than nesting when the selection is already marked', () => {
		const edit = wrapInline('the **bell** rings', 6, 10, '**');
		expect(edit.text).toBe('the bell rings');
		expect(edit.text.slice(edit.start, edit.end)).toBe('bell');
	});

	it('puts the caret between the markers when nothing is selected', () => {
		const edit = wrapInline('', 0, 0, '**');
		expect(edit.text).toBe('****');
		expect(edit.start).toBe(2);
	});
});

describe('line prefixes', () => {
	it('bullets every touched line and toggles them all off again', () => {
		const on = toggleBullets('rope\ntinderbox', 0, 14);
		expect(on.text).toBe('- rope\n- tinderbox');
		expect(toggleBullets(on.text, 0, on.text.length).text).toBe('rope\ntinderbox');
	});

	it('renumbers from one and converts bullets in place', () => {
		const edit = toggleOrdered('- rope\n- tinderbox', 0, 18);
		expect(edit.text).toBe('1. rope\n2. tinderbox');
	});

	it('replaces an existing heading level instead of stacking hashes', () => {
		expect(toggleHeading('# Harbour', 0, 9).text).toBe('## Harbour');
		expect(toggleHeading('## Harbour', 0, 10).text).toBe('Harbour');
	});

	it('leaves blank lines alone inside a selected block', () => {
		expect(toggleBullets('rope\n\ntinderbox', 0, 15).text).toBe('- rope\n\n- tinderbox');
	});
});

describe('toolbar actions', () => {
	it('turns a selection into a link and parks the caret in the empty href', () => {
		const edit = applyToolbarAction('link', 'see the bell', 8, 12, LABELS);
		expect(edit.text).toBe('see the [bell](https://)');
		expect(edit.start).toBe(edit.text.length - 1);
	});

	it('inserts a table whose header row is a real markdown delimiter table', () => {
		const edit = applyToolbarAction('table', '', 0, 0, LABELS);
		expect(edit.text.split('\n')[1]).toBe('| --- | --- |');
	});
});

describe('wikilink autocomplete', () => {
	it('opens on an unterminated [[ and reports what was typed', () => {
		expect(findWikilinkTrigger('Ask about the [[har', 19)).toEqual({ start: 14, query: 'har' });
	});

	it('stays closed once the link is closed, or across a line break', () => {
		expect(findWikilinkTrigger('Ask about the [[Harbour]] now', 29)).toBeNull();
		expect(findWikilinkTrigger('[[Harbour\nnext line', 19)).toBeNull();
	});

	it('replaces the trigger with a complete link', () => {
		const at = findWikilinkTrigger('go to [[har', 11)!;
		expect(completeWikilink('go to [[har', at, 11, 'Harbour Bell')).toEqual({
			text: 'go to [[Harbour Bell]]',
			caret: 22,
		});
	});

	it('wraps the active index in both directions', () => {
		expect(wrapIndex(-1, 3)).toBe(2);
		expect(wrapIndex(3, 3)).toBe(0);
	});
});

describe('slash menu', () => {
	it('opens only when the slash starts a word', () => {
		expect(findSlashTrigger('/tab', 4)).toEqual({ start: 0, query: 'tab' });
		expect(findSlashTrigger('a /tab', 6)).toEqual({ start: 2, query: 'tab' });
		expect(findSlashTrigger('12/03', 5)).toBeNull();
		expect(findSlashTrigger('/ tab', 5)).toBeNull();
	});

	it('offers a table, all four callouts, a roll, a date, core templates and core snippets', () => {
		const items = slashItems(t, '7 September 2026');
		const ids = items.map((item) => item.id);
		expect(ids).toContain('table');
		expect(ids).toContain('callout-secret');
		expect(ids).toContain('roll');
		expect(items.find((item) => item.id === 'date')?.insert).toBe('7 September 2026');
		// Sourced from the core catalogs, not from a copy kept in the app.
		expect(ids).toContain('template-session-recap');
		expect(ids).toContain('snippet-read-aloud');
	});

	it('filters on label and keywords', () => {
		const items = slashItems(t, 'today');
		expect(filterSlashItems(items, 'secret').map((item) => item.id)).toContain('callout-secret');
		expect(filterSlashItems(items, 'zzz')).toHaveLength(0);
	});

	it('replaces the trigger with the item text and honours its caret offset', () => {
		const items = slashItems(t, 'today');
		const callout = items.find((item) => item.id === 'callout-lore')!;
		const at = findSlashTrigger('note\n/lore', 10)!;
		const next = completeSlash('note\n/lore', at, 10, callout);
		expect(next.text).toBe('note\n> [!Lore] \n> ');
		// The caret lands on the callout's title slot, not after the whole block.
		expect(next.text.slice(next.caret)).toBe('\n> ');
	});
});
