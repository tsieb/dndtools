import { describe, expect, it } from 'vitest';
import {
	KEYBOARD_SHORTCUT_REGISTRY,
	KEYBOARD_SHORTCUT_SECTION_ORDER,
	matchGlobalKeyboardShortcut,
} from './keyboard-shortcuts.js';

function createKeyboardEvent(key: string, options: Partial<KeyboardEventInit> = {}): KeyboardEvent {
	return new KeyboardEvent('keydown', {
		key,
		code: options.code,
		ctrlKey: options.ctrlKey,
		metaKey: options.metaKey,
		shiftKey: options.shiftKey,
	});
}

describe('keyboard shortcut registry', () => {
	it('contains entries for all documented sections', () => {
		const sections = new Set(KEYBOARD_SHORTCUT_REGISTRY.map((entry) => entry.section));
		for (const section of KEYBOARD_SHORTCUT_SECTION_ORDER) {
			expect(sections.has(section)).toBe(true);
		}
	});

	it('includes both global and editor scopes', () => {
		const scopes = new Set(KEYBOARD_SHORTCUT_REGISTRY.map((entry) => entry.scope));
		expect(scopes.has('global')).toBe(true);
		expect(scopes.has('editor')).toBe(true);
	});

	it('registers map viewer mode and zoom shortcuts', () => {
		const ids = new Set(KEYBOARD_SHORTCUT_REGISTRY.map((entry) => entry.id));
		expect(ids.has('map_mode_view')).toBe(true);
		expect(ids.has('map_mode_poi_edit')).toBe(true);
		expect(ids.has('map_mode_fog_paint')).toBe(true);
		expect(ids.has('map_mode_route_edit')).toBe(true);
		expect(ids.has('map_mode_grid_align')).toBe(true);
		expect(ids.has('map_mode_combat')).toBe(true);
		expect(ids.has('map_zoom_fit')).toBe(true);
		expect(ids.has('map_zoom_100')).toBe(true);
	});
});

describe('matchGlobalKeyboardShortcut', () => {
	it('matches question mark overlay only when text entry is not focused', () => {
		const shortcut = matchGlobalKeyboardShortcut({
			event: createKeyboardEvent('?', { code: 'Slash', shiftKey: true }),
			isTextEntry: false,
			isInEditor: false,
			layoutTier: 'expanded',
			detailPanelAvailable: false,
			combatTrackerActive: false,
		});
		expect(shortcut).toBe('open_shortcuts_overlay');

		const blocked = matchGlobalKeyboardShortcut({
			event: createKeyboardEvent('?', { code: 'Slash', shiftKey: true }),
			isTextEntry: true,
			isInEditor: false,
			layoutTier: 'expanded',
			detailPanelAvailable: false,
			combatTrackerActive: false,
		});
		expect(blocked).toBeNull();
	});

	it('matches core global shortcuts', () => {
		expect(
			matchGlobalKeyboardShortcut({
				event: createKeyboardEvent('p', { ctrlKey: true }),
				isTextEntry: false,
				isInEditor: false,
				layoutTier: 'expanded',
				detailPanelAvailable: false,
				combatTrackerActive: false,
			}),
		).toBe('open_command_palette');

		expect(
			matchGlobalKeyboardShortcut({
				event: createKeyboardEvent(' ', { code: 'Space', ctrlKey: true, shiftKey: true }),
				isTextEntry: false,
				isInEditor: false,
				layoutTier: 'expanded',
				detailPanelAvailable: false,
				combatTrackerActive: false,
			}),
		).toBe('toggle_quick_reference_overlay');

		expect(
			matchGlobalKeyboardShortcut({
				event: createKeyboardEvent('b', { ctrlKey: true, shiftKey: true }),
				isTextEntry: false,
				isInEditor: false,
				layoutTier: 'expanded',
				detailPanelAvailable: false,
				combatTrackerActive: false,
			}),
		).toBe('toggle_session_quick_panel');
	});

	it('suppresses local-navigation shortcut while in editor', () => {
		const shortcut = matchGlobalKeyboardShortcut({
			event: createKeyboardEvent('b', { ctrlKey: true }),
			isTextEntry: false,
			isInEditor: true,
			layoutTier: 'expanded',
			detailPanelAvailable: false,
			combatTrackerActive: false,
		});
		expect(shortcut).toBeNull();
	});

	it('requires detail panel availability for Ctrl+Shift+R', () => {
		const blocked = matchGlobalKeyboardShortcut({
			event: createKeyboardEvent('r', { ctrlKey: true, shiftKey: true }),
			isTextEntry: false,
			isInEditor: false,
			layoutTier: 'expanded',
			detailPanelAvailable: false,
			combatTrackerActive: false,
		});
		expect(blocked).toBeNull();

		const allowed = matchGlobalKeyboardShortcut({
			event: createKeyboardEvent('r', { ctrlKey: true, shiftKey: true }),
			isTextEntry: false,
			isInEditor: false,
			layoutTier: 'expanded',
			detailPanelAvailable: true,
			combatTrackerActive: false,
		});
		expect(allowed).toBe('toggle_detail_panel');
	});

	it('maps F11 to zen mode only in expanded layout', () => {
		const expanded = matchGlobalKeyboardShortcut({
			event: createKeyboardEvent('F11'),
			isTextEntry: false,
			isInEditor: false,
			layoutTier: 'expanded',
			detailPanelAvailable: false,
			combatTrackerActive: false,
		});
		expect(expanded).toBe('toggle_zen_mode');

		const compact = matchGlobalKeyboardShortcut({
			event: createKeyboardEvent('F11'),
			isTextEntry: false,
			isInEditor: false,
			layoutTier: 'compact',
			detailPanelAvailable: false,
			combatTrackerActive: false,
		});
		expect(compact).toBeNull();
	});

	it('enables single-key combat shortcuts only while combat tracker is active', () => {
		const nextTurn = matchGlobalKeyboardShortcut({
			event: createKeyboardEvent('n'),
			isTextEntry: false,
			isInEditor: false,
			layoutTier: 'expanded',
			detailPanelAvailable: false,
			combatTrackerActive: true,
		});
		expect(nextTurn).toBe('combat_next_turn');

		const quickDamage = matchGlobalKeyboardShortcut({
			event: createKeyboardEvent('d'),
			isTextEntry: false,
			isInEditor: false,
			layoutTier: 'expanded',
			detailPanelAvailable: false,
			combatTrackerActive: true,
		});
		expect(quickDamage).toBe('combat_quick_damage');

		const blockedOutsideCombat = matchGlobalKeyboardShortcut({
			event: createKeyboardEvent('h'),
			isTextEntry: false,
			isInEditor: false,
			layoutTier: 'expanded',
			detailPanelAvailable: false,
			combatTrackerActive: false,
		});
		expect(blockedOutsideCombat).toBeNull();
	});
});
