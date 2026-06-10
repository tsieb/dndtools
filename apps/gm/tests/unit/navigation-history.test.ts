import { describe, expect, it } from 'vitest';
import {
	addRecentEntry,
	filterReachable,
	isPinned,
	togglePinnedEntry,
	type NavEntry,
} from '../../src/lib/platform/navigation-history';

const entry = (route: string, title = route): NavEntry => ({ route, title });

describe('addRecentEntry', () => {
	it('puts the newest visit first and de-duplicates by route', () => {
		let recent: NavEntry[] = [];
		recent = addRecentEntry(recent, entry('/a'));
		recent = addRecentEntry(recent, entry('/b'));
		recent = addRecentEntry(recent, entry('/a'));
		expect(recent.map((e) => e.route)).toEqual(['/a', '/b']);
	});

	it('caps the list to the maximum length', () => {
		let recent: NavEntry[] = [];
		for (let i = 0; i < 12; i += 1) recent = addRecentEntry(recent, entry(`/r${i}`), 8);
		expect(recent).toHaveLength(8);
		// Most recent kept, oldest dropped.
		expect(recent[0]?.route).toBe('/r11');
		expect(recent.some((e) => e.route === '/r0')).toBe(false);
	});
});

describe('togglePinnedEntry / isPinned', () => {
	it('pins then unpins a route while preserving order of others', () => {
		let pinned: NavEntry[] = [entry('/keep')];
		pinned = togglePinnedEntry(pinned, entry('/x'));
		expect(isPinned(pinned, '/x')).toBe(true);
		expect(pinned.map((e) => e.route)).toEqual(['/keep', '/x']);
		pinned = togglePinnedEntry(pinned, entry('/x'));
		expect(isPinned(pinned, '/x')).toBe(false);
		expect(pinned.map((e) => e.route)).toEqual(['/keep']);
	});
});

describe('filterReachable', () => {
	it('drops unreachable routes and refreshes titles from the reachable set (fail closed)', () => {
		const stored = [entry('/scene/secret/', 'Secret Lair'), entry('/scene/tavern/', 'Old Name')];
		const reachable = [{ route: '/scene/tavern/', title: 'Tavern' }];
		const result = filterReachable(stored, reachable);
		// The unreachable dm-only scene is gone; the reachable one keeps the live title.
		expect(result).toEqual([{ route: '/scene/tavern/', title: 'Tavern' }]);
	});
});
