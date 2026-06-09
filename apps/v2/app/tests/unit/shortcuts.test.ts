import { describe, expect, it } from 'vitest';
import {
	EMPTY_PERMISSION_STATE,
	listNavigationRegistryForActor,
	type Actor,
	type PermissionState,
} from '@dndtools/v2-core';
import { buildGlobalNav } from '../../src/lib/navigation/global-nav';
import {
	buildShortcutRegistry,
	searchShortcuts,
	shortcutHintForRoute,
	SCENES_SHORTCUT_KEYS,
	type ShortcutDescriptor,
} from '../../src/lib/navigation/shortcuts';

/**
 * UX-NAV-019 — the actor-filtered global keyboard shortcut registry.
 *
 * These tests pin the four acceptance behaviours the GUI surfaces depend on: every section gets its
 * positional `Alt+<n>` shortcut and a hint that maps back to its route (AC1/AC2), the DM-only Scenes
 * shortcut is present for a DM and ABSENT for a player/observer (AC4), and the help panel is searchable
 * (AC3).
 */

function permissionWith(actors: Actor[]): PermissionState {
	return {
		...EMPTY_PERMISSION_STATE,
		actors: Object.fromEntries(actors.map((actor) => [actor.id, actor])),
	};
}

const DM: Actor = { id: 'a-dm', role: 'dm', displayName: 'DM' };
const PLAYER: Actor = { id: 'a-player', role: 'player', displayName: 'Player' };
const OBSERVER: Actor = { id: 'a-observer', role: 'observer', displayName: 'Observer' };
const PERMISSIONS = permissionWith([DM, PLAYER, OBSERVER]);

function registryFor(actorId: string): ShortcutDescriptor[] {
	const globalNav = buildGlobalNav(listNavigationRegistryForActor(PERMISSIONS, actorId), '/');
	const scenesRoute =
		listNavigationRegistryForActor(PERMISSIONS, actorId).find(
			(entry) => entry.id === 'scenes' && entry.reachable,
		)?.route ?? null;
	return buildShortcutRegistry({ globalNav, scenesRoute });
}

describe('buildShortcutRegistry — command-surface + navigation shortcuts', () => {
	it('includes the global command-surface shortcuts on every profile', () => {
		const shortcuts = registryFor(DM.id);
		const keys = shortcuts.map((s) => s.keys);
		expect(keys).toContain('Ctrl / Cmd + K'); // command palette
		expect(keys).toContain('Ctrl / Cmd + Shift + F'); // global search
		expect(keys).toContain('Ctrl / Cmd + O'); // quick switcher
		expect(shortcuts.some((s) => s.keys.includes('?'))).toBe(true); // help panel
	});

	it('derives a positional Alt+<n> navigation shortcut for each visible global section', () => {
		const shortcuts = registryFor(DM.id);
		const nav = shortcuts.filter((s) => s.group === 'Navigation' && /^Alt \+ \d/.test(s.keys));
		// Seven global destinations for the DM, positions 1..7.
		expect(nav.map((s) => s.keys)).toEqual([
			'Alt + 1',
			'Alt + 2',
			'Alt + 3',
			'Alt + 4',
			'Alt + 5',
			'Alt + 6',
			'Alt + 7',
		]);
		// Alt+4 targets the Atlas route (UX-NAV-019 AC1).
		expect(nav[3]!.route).toBe('/atlas/');
		expect(nav[3]!.action).toContain('Atlas');
	});

	it('surfaces the home Alt+Shift+H shortcut', () => {
		const shortcuts = registryFor(DM.id);
		expect(shortcuts.some((s) => s.keys === 'Alt + Shift + H' && s.route === '/')).toBe(true);
	});
});

describe('UX-NAV-019 AC4 — DM-only shortcuts are actor-filtered', () => {
	it('includes the DM-only Scenes shortcut for a DM', () => {
		const shortcuts = registryFor(DM.id);
		const scenes = shortcuts.find((s) => s.id === 'nav.scenes');
		expect(scenes).toBeDefined();
		expect(scenes!.keys).toBe(SCENES_SHORTCUT_KEYS);
		expect(scenes!.route).toBe('/scenes/');
		expect(scenes!.scope).toBe('DM only');
	});

	it('omits the DM-only Scenes shortcut for a player and an observer (absent, not disabled)', () => {
		for (const actor of [PLAYER, OBSERVER]) {
			const shortcuts = registryFor(actor.id);
			expect(shortcuts.some((s) => s.id === 'nav.scenes')).toBe(false);
			// The DM-only chord never appears anywhere in the player/observer registry.
			expect(JSON.stringify(shortcuts)).not.toContain(SCENES_SHORTCUT_KEYS);
			expect(JSON.stringify(shortcuts)).not.toContain('Go to Scenes');
		}
	});

	it('gives an observer fewer navigation shortcuts than a DM (only reachable sections)', () => {
		const dmNav = registryFor(DM.id).filter((s) => /^Alt \+ \d/.test(s.keys));
		const observerNav = registryFor(OBSERVER.id).filter((s) => /^Alt \+ \d/.test(s.keys));
		// The observer reaches four global sections; the DM reaches seven.
		expect(observerNav).toHaveLength(4);
		expect(dmNav).toHaveLength(7);
	});
});

describe('shortcutHintForRoute (UX-NAV-019 AC2 palette row hints)', () => {
	it('maps a destination route to its positional Alt+<n> hint', () => {
		const shortcuts = registryFor(DM.id);
		expect(shortcutHintForRoute(shortcuts, '/session/')).toBe('Alt + 2');
		expect(shortcutHintForRoute(shortcuts, '/atlas/')).toBe('Alt + 4');
		// The home route prefers its positional Alt+1 over Alt+Shift+H.
		expect(shortcutHintForRoute(shortcuts, '/')).toBe('Alt + 1');
		expect(shortcutHintForRoute(shortcuts, '/nonexistent/')).toBeNull();
	});
});

describe('searchShortcuts (UX-NAV-019 AC3 searchable help panel)', () => {
	it('filters across keys, action, scope, and group', () => {
		const shortcuts = registryFor(DM.id);
		expect(searchShortcuts(shortcuts, '').length).toBe(shortcuts.length);
		expect(searchShortcuts(shortcuts, 'atlas').some((s) => s.action.includes('Atlas'))).toBe(true);
		expect(searchShortcuts(shortcuts, 'palette').some((s) => s.id === 'palette')).toBe(true);
		// Matching by chord text works too.
		expect(searchShortcuts(shortcuts, 'alt + 4').some((s) => s.keys === 'Alt + 4')).toBe(true);
		expect(searchShortcuts(shortcuts, 'zzzznomatch')).toEqual([]);
	});
});
