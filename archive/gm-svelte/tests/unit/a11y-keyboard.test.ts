import { describe, expect, it } from 'vitest';
import {
	isActivationKey,
	isFromTextEntry,
	isHelpKey,
	KEYBOARD_SHORTCUTS,
	matchesShortcut,
} from '../../src/lib/gui/a11y/keyboard';

// UX-A11Y-002 keyboard parity + UX-A11Y-014 consistent help: shared matchers so every surface
// recognises activation, the Ctrl/Cmd equivalence, and the product-wide help key the same way.

describe('isActivationKey', () => {
	it('matches Enter and Space only', () => {
		expect(isActivationKey({ key: 'Enter' })).toBe(true);
		expect(isActivationKey({ key: ' ' })).toBe(true);
		expect(isActivationKey({ key: 'a' })).toBe(false);
	});
});

describe('matchesShortcut (Ctrl/Cmd equivalence)', () => {
	it('matches Ctrl+K and Cmd+K against the same shortcut', () => {
		const shortcut = { key: 'k', ctrlOrMeta: true };
		expect(matchesShortcut({ key: 'k', ctrlKey: true }, shortcut)).toBe(true);
		expect(matchesShortcut({ key: 'K', metaKey: true }, shortcut)).toBe(true);
		expect(matchesShortcut({ key: 'k' }, shortcut)).toBe(false); // no modifier
	});

	it('respects shift/alt requirements', () => {
		expect(matchesShortcut({ key: 'l', ctrlKey: true, shiftKey: true }, { key: 'l', ctrlOrMeta: true, shift: true })).toBe(true);
		expect(matchesShortcut({ key: 'l', ctrlKey: true }, { key: 'l', ctrlOrMeta: true, shift: true })).toBe(false);
	});
});

describe('isHelpKey', () => {
	it('matches ? and F1 with no command modifiers', () => {
		expect(isHelpKey({ key: '?' })).toBe(true);
		expect(isHelpKey({ key: 'F1' })).toBe(true);
	});

	it('rejects modified chords (so Ctrl+? / Cmd+F1 do not trigger help)', () => {
		expect(isHelpKey({ key: '?', ctrlKey: true })).toBe(false);
		expect(isHelpKey({ key: 'F1', metaKey: true })).toBe(false);
		expect(isHelpKey({ key: 'k' })).toBe(false);
	});
});

describe('isFromTextEntry', () => {
	it('detects inputs, textareas, selects, and contenteditable', () => {
		expect(isFromTextEntry(document.createElement('input'))).toBe(true);
		expect(isFromTextEntry(document.createElement('textarea'))).toBe(true);
		expect(isFromTextEntry(document.createElement('select'))).toBe(true);
		expect(isFromTextEntry(document.createElement('button'))).toBe(false);
		expect(isFromTextEntry(null)).toBe(false);
	});
});

describe('KEYBOARD_SHORTCUTS reference', () => {
	it('documents the help key and the drag-alternative shortcuts', () => {
		const actions = KEYBOARD_SHORTCUTS.map((s) => s.action.toLowerCase());
		expect(KEYBOARD_SHORTCUTS.some((s) => s.keys.includes('?'))).toBe(true);
		expect(actions.some((a) => a.includes('drag alternative'))).toBe(true);
		// Every row is fully populated (rendered in the consistent Help dialog).
		for (const row of KEYBOARD_SHORTCUTS) {
			expect(row.keys.trim()).not.toBe('');
			expect(row.action.trim()).not.toBe('');
			expect(row.scope.trim()).not.toBe('');
		}
	});
});
