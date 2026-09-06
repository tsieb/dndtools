import { describe, expect, it } from 'vitest';
import { en } from '../../i18n/messages/en';
import {
	SHORTCUTS,
	matchesShortcut,
	shortcut,
	shortcutsForScope,
	type ShortcutCombo,
} from './registry';

/** A KeyboardEvent-shaped literal, so these run without a DOM. */
function press(key: string, mods: Partial<Record<'mod' | 'shift' | 'alt', boolean>> = {}) {
	return {
		key,
		metaKey: false,
		ctrlKey: !!mods.mod,
		shiftKey: !!mods.shift,
		altKey: !!mods.alt,
	};
}

/** The ids AppShell's global keydown handler binds to (app/AppShell.tsx). */
const HANDLER_IDS = ['global.palette', 'global.help', 'global.sceneDisplay', 'global.advanceCard'];

describe('the keyboard shortcut registry', () => {
	it('gives every entry a unique id, a key legend and a real catalog string', () => {
		const ids = SHORTCUTS.map((entry) => entry.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const entry of SHORTCUTS) {
			expect(entry.keys.trim()).not.toBe('');
			expect(en[entry.action]).toBeTruthy();
		}
	});

	it('resolves every id a handler fires on', () => {
		for (const id of HANDLER_IDS) expect(shortcut(id).combo).toBeDefined();
	});

	it('refuses an unknown id rather than becoming a dead key', () => {
		expect(() => shortcut('global.nope')).toThrow(/Unknown keyboard shortcut/);
	});

	it('binds no combo twice within a scope', () => {
		const seen = new Set<string>();
		for (const entry of SHORTCUTS) {
			if (!entry.combo) continue;
			const c: ShortcutCombo = entry.combo;
			const signature = `${entry.scope}|${c.key.toLowerCase()}|${!!c.mod}|${c.shift ?? '*'}`;
			expect(seen.has(signature)).toBe(false);
			seen.add(signature);
		}
	});

	it('matches the command palette on either modifier, including inside a text field', () => {
		expect(matchesShortcut('global.palette', press('k', { mod: true }))).toBe(true);
		expect(matchesShortcut('global.palette', press('K', { mod: true }))).toBe(true);
		expect(matchesShortcut('global.palette', press('k', { mod: true }), { typing: true })).toBe(
			true,
		);
		expect(matchesShortcut('global.palette', press('k'))).toBe(false);
	});

	it('keeps every other shortcut off the keyboard while a text field has focus', () => {
		expect(matchesShortcut('global.help', press('?'))).toBe(true);
		expect(matchesShortcut('global.help', press('?'), { typing: true })).toBe(false);
		expect(matchesShortcut('global.advanceCard', press('ArrowRight', { mod: true }))).toBe(true);
		expect(
			matchesShortcut('global.advanceCard', press('ArrowRight', { mod: true }), { typing: true }),
		).toBe(false);
	});

	it('requires the declared Shift state and never fires with Alt held', () => {
		expect(matchesShortcut('global.sceneDisplay', press('S', { mod: true, shift: true }))).toBe(
			true,
		);
		expect(matchesShortcut('global.sceneDisplay', press('s', { mod: true }))).toBe(false);
		expect(
			matchesShortcut('global.sceneDisplay', press('S', { mod: true, shift: true, alt: true })),
		).toBe(false);
	});

	it('carries the map editor tool keymap so the overlay never re-types it', () => {
		const map = shortcutsForScope('map');
		expect(map.some((entry) => entry.id === 'map.tool.select')).toBe(true);
		expect(map.some((entry) => entry.id === 'map.zoom')).toBe(true);
		expect(shortcutsForScope('canvas').length).toBeGreaterThan(0);
		expect(shortcutsForScope('global').length).toBeGreaterThan(0);
	});
});
