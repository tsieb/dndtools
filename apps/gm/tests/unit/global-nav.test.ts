import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	CANONICAL_NAVIGATION_SECTIONS,
	EMPTY_PERMISSION_STATE,
	listNavigationRegistryForActor,
	type Actor,
	type PermissionState,
} from '@dndtools/core';
import {
	GLOBAL_NAV_ORDER,
	NON_GLOBAL_CAPABILITY_IDS,
	buildGlobalNav,
	isSectionActive,
	splitForTabBar,
} from '../../src/lib/navigation/global-nav';

/**
 * UX-SHELL — the seven-section global navigation presentation (UX-NAV-002/004/005/006).
 *
 * These tests pin the GUI presentation list to the ACCEPTED navigation contract so it cannot
 * drift: the ordered global-nav ids must equal `navigation-registry.yaml`'s globalNav order, the
 * excluded ids must equal its capability classification, and the produced nav must be
 * actor-filtered (no DM-only / observer-hidden section leaks into the data).
 */

const REGISTRY_PATH = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../fixtures/navigation-registry.yaml',
);

function idsInBlock(raw: string, startMarker: string, endMarker: string): string[] {
	const start = raw.indexOf(startMarker);
	const end = raw.indexOf(endMarker, start + startMarker.length);
	const block = raw.slice(start, end === -1 ? undefined : end);
	return [...block.matchAll(/^\s+-\s+id:\s*(\S+)/gm)].map((match) => match[1]!);
}

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

describe('UX-SHELL global-nav contract alignment', () => {
	const raw = readFileSync(REGISTRY_PATH, 'utf8');

	it('the ordered global-nav ids equal navigation-registry.yaml globalNav order (UX-NAV-002)', () => {
		const contractOrder = idsInBlock(raw, '\nglobalNav:', '\ncapabilities:');
		expect([...GLOBAL_NAV_ORDER]).toEqual(contractOrder);
		expect(GLOBAL_NAV_ORDER).toHaveLength(7);
		expect(GLOBAL_NAV_ORDER[0]).toBe('command-center');
		expect(GLOBAL_NAV_ORDER[GLOBAL_NAV_ORDER.length - 1]).toBe('settings');
	});

	it('the excluded ids equal the contract capability classification (Scenes/Audio/MCP)', () => {
		const capabilityIds = idsInBlock(raw, '\ncapabilities:', '\nnonGlobalSurfaces:');
		expect([...NON_GLOBAL_CAPABILITY_IDS].sort()).toEqual([...capabilityIds].sort());
	});

	it('every global-nav and capability id resolves to one functional canonical section', () => {
		const functionalIds = new Set(CANONICAL_NAVIGATION_SECTIONS.map((section) => section.id));
		const classified = [...GLOBAL_NAV_ORDER, ...NON_GLOBAL_CAPABILITY_IDS];
		for (const id of classified) expect(functionalIds.has(id)).toBe(true);
		// The classification partitions the whole registry — no section is unclassified or invented.
		expect(new Set(classified)).toEqual(functionalIds);
	});
});

describe('buildGlobalNav actor filtering + ordering', () => {
	it('presents all seven destinations in canonical order for the DM, excluding capabilities', () => {
		const nav = buildGlobalNav(listNavigationRegistryForActor(PERMISSIONS, DM.id), '/');
		expect(nav.map((item) => item.id)).toEqual([...GLOBAL_NAV_ORDER]);
		// Non-global capabilities are absent from the primary nav even for the DM. (Compared as
		// strings: the GlobalNavId and capability-id unions are intentionally disjoint.)
		const navIds = new Set<string>(nav.map((item) => item.id));
		for (const id of NON_GLOBAL_CAPABILITY_IDS) {
			expect(navIds.has(id)).toBe(false);
		}
		// Positions are sequential (drive Alt+<n>); Settings is divider-separated last.
		expect(nav.map((item) => item.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
		expect(nav.at(-1)).toMatchObject({ id: 'settings', last: true });
		expect(nav[0]).toMatchObject({ id: 'command-center', home: true });
	});

	it('presents the same seven destinations for a player (no global section is DM-only)', () => {
		const nav = buildGlobalNav(listNavigationRegistryForActor(PERMISSIONS, PLAYER.id), '/');
		expect(nav.map((item) => item.id)).toEqual([...GLOBAL_NAV_ORDER]);
	});

	it('omits observer-hidden sections entirely (Characters/Campaign/Knowledge) without leaking', () => {
		const nav = buildGlobalNav(listNavigationRegistryForActor(PERMISSIONS, OBSERVER.id), '/');
		expect(nav.map((item) => item.id)).toEqual(['command-center', 'session', 'atlas', 'settings']);
		// The hidden sections are absent from the data — not present-and-disabled.
		for (const id of ['characters', 'campaign', 'knowledge']) {
			expect(nav.some((item) => item.id === id)).toBe(false);
		}
		// Positions stay sequential among the visible set (order invariant, gaps closed).
		expect(nav.map((item) => item.position)).toEqual([1, 2, 3, 4]);
	});

	it('returns an empty nav for an unknown actor (fail closed)', () => {
		expect(buildGlobalNav(listNavigationRegistryForActor(PERMISSIONS, 'nobody'), '/')).toEqual([]);
	});
});

describe('isSectionActive', () => {
	it('marks the Command Center home active only on the exact root', () => {
		expect(isSectionActive('/', '/', true)).toBe(true);
		expect(isSectionActive('/session/', '/', true)).toBe(false);
	});

	it('marks a section active on its root and any descendant route', () => {
		expect(isSectionActive('/session/', '/session/', false)).toBe(true);
		expect(isSectionActive('/session/active/', '/session/', false)).toBe(true);
		expect(isSectionActive('/sessions/', '/session/', false)).toBe(false);
		expect(isSectionActive('/atlas/', '/session/', false)).toBe(false);
	});
});

describe('splitForTabBar (UX-NAV-005/006 bottom tab bar overflow)', () => {
	it('keeps four direct tabs + an overflow set when more than five sections are reachable', () => {
		const nav = buildGlobalNav(listNavigationRegistryForActor(PERMISSIONS, DM.id), '/');
		const { primary, overflow } = splitForTabBar(nav);
		expect(primary.map((item) => item.id)).toEqual([
			'command-center',
			'session',
			'characters',
			'atlas',
		]);
		expect(overflow.map((item) => item.id)).toEqual(['campaign', 'knowledge', 'settings']);
	});

	it('shows every section as a direct tab when five or fewer are reachable (no More)', () => {
		const nav = buildGlobalNav(listNavigationRegistryForActor(PERMISSIONS, OBSERVER.id), '/');
		const { primary, overflow } = splitForTabBar(nav);
		expect(primary).toHaveLength(4);
		expect(overflow).toEqual([]);
	});
});
