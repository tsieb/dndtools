import { describe, expect, it } from 'vitest';
import {
	buildMapSummary,
	fogChangeAnnouncement,
	mapAccessibleLabel,
	poiActivationAnnouncement,
	type MapSummaryInput,
} from '../../src/lib/gui/a11y/map-summary';
import { findLeakedTerms, type Viewer } from '../../src/lib/gui/a11y/visibility-boundary';

// UX-A11Y-005: non-visual map access computed from the player-visible layer; fog state never leaks.

const dm: Viewer = { role: 'dm', actorId: 'actor-dm' };
const player: Viewer = { role: 'player', actorId: 'actor-player' };

const input: MapSummaryInput = {
	mapName: 'Undermountain Level 1',
	scale: 'dungeon map',
	pois: [
		{ id: 'p1', name: 'The Sunken Plaza', type: 'landmark', visibility: 'player-visible' },
		{ id: 'p2', name: 'The Guard Post', type: 'hazard', visibility: 'dm-only' },
		{ id: 'p3', name: 'Hidden Cache', type: 'treasure', visibility: 'dm-only' },
		{ id: 'p4', name: 'Town Well', type: 'landmark', visibility: 'player-visible' },
		{ id: 'p5', name: 'Shared Shrine', type: 'landmark', visibility: 'shared', sharedWith: ['actor-player'] },
	],
	routes: [
		{ id: 'r1', name: 'Main Road', from: 'Town Well', to: 'The Sunken Plaza', visibility: 'player-visible' },
		{ id: 'r2', name: 'Secret Tunnel', from: 'The Guard Post', to: 'Hidden Cache', visibility: 'dm-only' },
	],
	areas: [
		{ id: 'a1', name: 'The Sunken Plaza', type: 'room', visibility: 'player-visible' },
		{ id: 'a2', name: 'The Guard Post', type: 'room', visibility: 'dm-only' },
	],
};

const SECRETS = ['The Guard Post', 'Hidden Cache', 'Secret Tunnel'];

describe('map summary — concise label is content-free', () => {
	it('names the map and scale only', () => {
		expect(mapAccessibleLabel('Undermountain Level 1', 'dungeon map')).toBe(
			'Map: Undermountain Level 1 — dungeon map',
		);
		expect(mapAccessibleLabel('  ', undefined)).toBe('Map: Untitled map');
	});
});

describe('map summary — buildMapSummary', () => {
	it('gives the DM every POI/route/area', () => {
		const model = buildMapSummary(input, dm);
		expect(model.pois).toHaveLength(5);
		expect(model.routes).toHaveLength(2);
		expect(model.areas).toHaveLength(2);
	});

	it('UX-A11Y-005 AC1: a player sees exactly the visible POIs and zero DM-only ones', () => {
		const model = buildMapSummary(input, player);
		expect(model.pois.map((p) => p.id).sort()).toEqual(['p1', 'p4', 'p5']);
		expect(model.routes.map((r) => r.id)).toEqual(['r1']);
		expect(model.areas.map((a) => a.id)).toEqual(['a1']);
		// nothing in the produced model mentions a DM-only POI/route/area
		expect(findLeakedTerms(JSON.stringify(model), SECRETS)).toEqual([]);
		expect(model.countLabel).toBe('3 points of interest, 1 route, 1 area');
	});

	it('formats POI/route/area accessible names', () => {
		const model = buildMapSummary(input, player);
		expect(model.pois.find((p) => p.id === 'p1')?.accessibleName).toBe('The Sunken Plaza, landmark');
		expect(model.routes[0]!.accessibleName).toBe('Main Road: Town Well to The Sunken Plaza');
		expect(model.areas[0]!.accessibleName).toBe('The Sunken Plaza, room');
	});

	it('reports empty when the player can see nothing', () => {
		const model = buildMapSummary(
			{ mapName: 'Vault', pois: [{ id: 'x', name: 'Secret', type: 'trap', visibility: 'dm-only' }], routes: [], areas: [] },
			player,
		);
		expect(model.empty).toBe(true);
		expect(model.countLabel).toBe('No visible points of interest');
	});
});

describe('map summary — fog-of-war announcements (UX-A11Y-005 AC2/AC3)', () => {
	const revealVisible = {
		kind: 'reveal' as const,
		area: { id: 'a1', name: 'The Sunken Plaza', type: 'room', visibility: 'player-visible' as const },
	};
	const hideToDmOnly = {
		kind: 'hide' as const,
		area: { id: 'a2', name: 'The Guard Post', type: 'room', visibility: 'dm-only' as const },
	};

	it('announces a reveal that becomes visible to the player, naming only that area', () => {
		expect(fogChangeAnnouncement(revealVisible, player)).toBe('Area revealed: The Sunken Plaza.');
	});

	it('AC3: never announces a hide to a player (no still-hidden area is named)', () => {
		expect(fogChangeAnnouncement(hideToDmOnly, player)).toBeNull();
	});

	it('does not announce a reveal whose result is still hidden from the player', () => {
		const revealStillHidden = {
			kind: 'reveal' as const,
			area: { id: 'a3', name: 'The Guard Post', type: 'room', visibility: 'dm-only' as const },
		};
		expect(fogChangeAnnouncement(revealStillHidden, player)).toBeNull();
	});

	it('gives the DM both reveal and hide announcements', () => {
		expect(fogChangeAnnouncement(revealVisible, dm)).toBe('Area revealed: The Sunken Plaza.');
		expect(fogChangeAnnouncement(hideToDmOnly, dm)).toBe('Area hidden: The Guard Post.');
	});
});

describe('map summary — POI activation announcement', () => {
	it('announces the centred POI', () => {
		expect(poiActivationAnnouncement({ accessibleName: 'Town Well, landmark' })).toBe(
			'Centred on Town Well, landmark.',
		);
	});
});
