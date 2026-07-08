import { describe, expect, it } from 'vitest';
import {
	addRecentEntry,
	filterReachable,
	isPinned,
	selectStripLists,
	togglePinnedEntry,
	STRIP_RECENT_LIMIT,
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

describe('selectStripLists (UX-NAV-015 actor-filtered strip)', () => {
	it('UX-NAV-015 AC1: renders the pinned items the actor can reach', () => {
		const pinned = [entry('/session/', 'Session'), entry('/atlas/', 'Atlas'), entry('/characters/', 'Party')];
		const reachable = [
			{ route: '/session/', title: 'Session' },
			{ route: '/atlas/', title: 'Atlas' },
			{ route: '/characters/', title: 'Party' },
		];
		const { pinned: out } = selectStripLists(pinned, [], reachable);
		expect(out.map((e) => e.route)).toEqual(['/session/', '/atlas/', '/characters/']);
	});

	it('UX-NAV-015 AC2: shows up to 5 recent items and excludes pinned routes', () => {
		const reachable = Array.from({ length: 7 }, (_, i) => ({
			route: `/scene/s${i}/`,
			title: `Scene ${i}`,
		}));
		const pinned = [entry('/scene/s0/', 'Scene 0')];
		// Seven recents, newest first; the pinned one is excluded, the rest capped to 5.
		const recent = reachable.map((d) => entry(d.route, d.title));
		const { recent: out } = selectStripLists(pinned, recent, reachable);
		expect(out).toHaveLength(STRIP_RECENT_LIMIT);
		expect(out.some((e) => e.route === '/scene/s0/')).toBe(false); // pinned excluded
		expect(out.map((e) => e.route)).toEqual([
			'/scene/s1/',
			'/scene/s2/',
			'/scene/s3/',
			'/scene/s4/',
			'/scene/s5/',
		]);
	});

	it('UX-NAV-015 AC3 / UX-NAV-013: drops items the actor cannot reach (player no-leak)', () => {
		// A DM pinned a dm-only scene and a player-visible one; viewing as a player, only the
		// player-reachable destination survives — the dm-only scene is absent, not hidden.
		const pinned = [entry('/scene/secret/', 'Secret Lair'), entry('/scene/tavern/', 'Tavern')];
		const recent = [entry('/scene/secret/', 'Secret Lair'), entry('/atlas/', 'Atlas')];
		const playerReachable = [
			{ route: '/scene/tavern/', title: 'Tavern' },
			{ route: '/atlas/', title: 'Atlas' },
		];
		const { pinned: outPinned, recent: outRecent } = selectStripLists(
			pinned,
			recent,
			playerReachable,
		);
		expect(outPinned.map((e) => e.route)).toEqual(['/scene/tavern/']);
		expect(outRecent.map((e) => e.route)).toEqual(['/atlas/']);
		// The dm-only route never appears in either strip list.
		expect([...outPinned, ...outRecent].some((e) => e.route === '/scene/secret/')).toBe(false);
	});
});
