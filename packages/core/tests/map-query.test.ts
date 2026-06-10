import { describe, expect, it } from 'vitest';
import {
	EMPTY_CALENDAR_CONTINUITY_STATE,
	EMPTY_SESSION_AUDIO_STATE,
	EMPTY_SESSION_COMBAT_STATE,
	createDemoMapState,
	deliveredMapIdsForActor,
	getMapViewForActor,
	listMapsForActor,
	mapGraphEdgesForActor,
	searchMapsForActor,
	type MapState,
	type SessionState,
} from '../src';
import { DM_ACTOR, OBSERVER_ACTOR, PLAYER_ACTOR, buildPermissionState } from '../src/testing/fixtures';

/**
 * MAP-018 — THE actor-filtered map query keystone. Every surface (render/search/graph/widget/MCP/
 * deep-link) consumes this one model, so a hidden POI/route/fog/token cannot leak through any of them.
 * These are the ADVERSARIAL non-leak assertions: a non-DM actor's view/search/graph NEVER carries the
 * hidden artifact's id, label, notes, or coordinates.
 */

const PERMISSIONS = buildPermissionState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);

function demo(): MapState {
	return createDemoMapState();
}

// The seeded Western Reaches is player-visible with a player-visible Harbor Town POI and a DM-only
// Smugglers' Cache POI (on a dm-only layer). The Ruined Keep is `shared` and seeds a dm-only ambusher
// token + a dm-only trap-rune POI.
const WESTERN = 'map-western-reaches';
const KEEP = 'map-ruined-keep';

describe('MAP-011/MAP-018 a DM-only POI never leaks to a non-DM through the unified view', () => {
	it('the DM sees both POIs; a player sees only the player-visible one', () => {
		const dmView = getMapViewForActor(demo(), PERMISSIONS, DM_ACTOR.id, WESTERN);
		const playerView = getMapViewForActor(demo(), PERMISSIONS, PLAYER_ACTOR.id, WESTERN);
		expect(dmView.kind).toBe('available');
		expect(playerView.kind).toBe('available');
		if (dmView.kind !== 'available' || playerView.kind !== 'available') return;

		expect(dmView.pois.map((p) => p.id).sort()).toEqual(['poi-harbor-town', 'poi-smugglers-cache']);
		expect(playerView.pois.map((p) => p.id)).toEqual(['poi-harbor-town']);
		// Hard leak assertion: the hidden POI's id/label/notes/coords never appear in the player payload.
		const serialized = JSON.stringify(playerView);
		expect(serialized).not.toContain('poi-smugglers-cache');
		expect(serialized).not.toContain("Smugglers' Cache");
		expect(serialized).not.toContain('contraband');
		expect(serialized).not.toContain('0.71'); // the hidden POI's x coordinate
	});

	it('the DM hidden-count reports the player-hidden POI; the player sees zero counts', () => {
		const dmView = getMapViewForActor(demo(), PERMISSIONS, DM_ACTOR.id, WESTERN);
		const playerView = getMapViewForActor(demo(), PERMISSIONS, PLAYER_ACTOR.id, WESTERN);
		if (dmView.kind !== 'available' || playerView.kind !== 'available') throw new Error('unavailable');
		expect(dmView.hidden.pois).toBe(1);
		expect(playerView.hidden.pois).toBe(0);
	});

	it('revealing the hidden POI to players makes it appear WITHOUT a reload (live query)', () => {
		const state = demo();
		// Flip the hidden POI AND its layer to player-visible (independent visibility — MAP-011 AC2).
		const map = state.maps[WESTERN]!;
		map.pois = map.pois.map((poi) =>
			poi.id === 'poi-smugglers-cache' ? { ...poi, visibility: 'player-visible' } : poi,
		);
		map.layers = map.layers.map((layer) =>
			layer.id === 'layer-hidden-camps' ? { ...layer, visibility: 'player-visible' } : layer,
		);
		const playerView = getMapViewForActor(state, PERMISSIONS, PLAYER_ACTOR.id, WESTERN);
		if (playerView.kind !== 'available') throw new Error('unavailable');
		expect(playerView.pois.map((p) => p.id).sort()).toEqual([
			'poi-harbor-town',
			'poi-smugglers-cache',
		]);
	});
});

describe('MAP-018 AC1 hidden POIs/routes/tokens are absent from search and graph for a player', () => {
	it('search never returns a hidden POI', () => {
		const dmHits = searchMapsForActor(demo(), PERMISSIONS, DM_ACTOR.id, 'cache');
		const playerHits = searchMapsForActor(demo(), PERMISSIONS, PLAYER_ACTOR.id, 'cache');
		expect(dmHits.map((h) => h.id)).toContain('poi-smugglers-cache');
		expect(playerHits).toHaveLength(0);
		// Even searching by the exact hidden label yields nothing for the player.
		expect(searchMapsForActor(demo(), PERMISSIONS, PLAYER_ACTOR.id, "Smugglers' Cache")).toHaveLength(
			0,
		);
	});

	it('search returns visible POIs/routes for the player', () => {
		const harbor = searchMapsForActor(demo(), PERMISSIONS, PLAYER_ACTOR.id, 'harbor');
		expect(harbor.some((h) => h.id === 'poi-harbor-town')).toBe(true);
		const route = searchMapsForActor(demo(), PERMISSIONS, PLAYER_ACTOR.id, 'north road');
		expect(route.some((h) => h.kind === 'route' && h.id === 'route-north-road')).toBe(true);
	});

	it('the map graph never carries a hidden POI link for a player', () => {
		const dmEdges = mapGraphEdgesForActor(demo(), PERMISSIONS, DM_ACTOR.id);
		const playerEdges = mapGraphEdgesForActor(demo(), PERMISSIONS, PLAYER_ACTOR.id);
		// The DM sees the hidden POI's note backlink; the player never does.
		expect(dmEdges.some((e) => e.fromId === 'poi-smugglers-cache')).toBe(true);
		expect(playerEdges.some((e) => e.fromId === 'poi-smugglers-cache')).toBe(false);
		expect(playerEdges.some((e) => e.toEntityId === 'note-smugglers-cache')).toBe(false);
		// The visible Harbor Town link IS present for the player.
		expect(playerEdges.some((e) => e.toEntityId === 'note-harbor-town')).toBe(true);
	});
});

describe('MAP-019 AC3 hidden tokens are omitted from a non-DM token projection', () => {
	it('a shared map projected to a player omits the dm-only ambusher token', () => {
		const session: SessionState = {
			...EMPTY_SESSION(),
			activeMapProjections: {
				[PLAYER_ACTOR.id]: {
					id: 'proj-1',
					playerActorId: PLAYER_ACTOR.id,
					mapId: KEEP,
					regionId: null,
					deliveryStatus: 'delivered',
					deliveryReason: 'connected',
					createdBy: DM_ACTOR.id,
					createdAt: 'now',
					updatedAt: 'now',
					revision: 1,
				},
			},
		};
		const delivered = deliveredMapIdsForActor(session, PLAYER_ACTOR.id);
		const playerView = getMapViewForActor(demo(), PERMISSIONS, PLAYER_ACTOR.id, KEEP, {
			deliveredMapIds: delivered,
		});
		if (playerView.kind !== 'available') throw new Error('keep should be delivered to the player');
		// The player sees the shared hero token but NOT the dm-only ambusher.
		expect(playerView.tokens.map((t) => t.id)).toEqual(['token-hero']);
		const serialized = JSON.stringify(playerView);
		expect(serialized).not.toContain('token-ambusher');
		expect(serialized).not.toContain('Cellar Ambusher');
		// The fog conceal over the cellar (shared layer) IS delivered; the dm-only trap-rune POI is not.
		// MAP-012 AC1: a shared fog op on a shared layer reaches the player when the map is projected.
		expect(playerView.fog.map((f) => f.id)).toContain('fog-cellar-conceal');
		expect(playerView.pois.map((p) => p.id)).not.toContain('poi-trap-rune');
	});

	it('canMove is true only for the DM or the token controller', () => {
		const session = {
			...EMPTY_SESSION(),
			activeMapProjections: {
				[PLAYER_ACTOR.id]: {
					id: 'proj-1',
					playerActorId: PLAYER_ACTOR.id,
					mapId: KEEP,
					regionId: null,
					deliveryStatus: 'delivered' as const,
					deliveryReason: 'connected' as const,
					createdBy: DM_ACTOR.id,
					createdAt: 'now',
					updatedAt: 'now',
					revision: 1,
				},
			},
		};
		const delivered = deliveredMapIdsForActor(session, PLAYER_ACTOR.id);
		const playerView = getMapViewForActor(demo(), PERMISSIONS, PLAYER_ACTOR.id, KEEP, {
			deliveredMapIds: delivered,
		});
		if (playerView.kind !== 'available') throw new Error('unavailable');
		const hero = playerView.tokens.find((t) => t.id === 'token-hero')!;
		expect(hero.canMove).toBe(true); // the player controls the hero token.

		const dmView = getMapViewForActor(demo(), PERMISSIONS, DM_ACTOR.id, KEEP);
		if (dmView.kind !== 'available') throw new Error('unavailable');
		expect(dmView.tokens.every((t) => t.canMove)).toBe(true); // DM moves everything.
	});
});

describe('MAP-018 a hidden map is a generic unavailable for a non-DM', () => {
	it('a dm-only map is unavailable to a player (indistinguishable from missing)', () => {
		const view = getMapViewForActor(demo(), PERMISSIONS, PLAYER_ACTOR.id, 'map-hidden-outpost');
		expect(view.kind).toBe('unavailable');
		// A missing map is the SAME generic unavailable.
		expect(getMapViewForActor(demo(), PERMISSIONS, PLAYER_ACTOR.id, 'no-such-map').kind).toBe(
			'unavailable',
		);
	});

	it('an unknown actor receives unavailable (fail closed)', () => {
		expect(getMapViewForActor(demo(), PERMISSIONS, 'ghost', WESTERN).kind).toBe('unavailable');
	});

	it('a shared map without delivery is unavailable to a player', () => {
		// No projection ⇒ the shared Ruined Keep is not delivered.
		const view = getMapViewForActor(demo(), PERMISSIONS, PLAYER_ACTOR.id, KEEP);
		expect(view.kind).toBe('unavailable');
	});
});

describe('CON-001 / MAP-018 listMapsForActor — actor-filtered map list, GUI must never filter raw maps itself', () => {
	it('AC1: a player only sees player-visible maps in the list (dm-only maps are ABSENT, not hidden)', () => {
		const list = listMapsForActor(demo(), PERMISSIONS, PLAYER_ACTOR.id);
		// The demo state has at least one player-visible map (Western Reaches).
		expect(list.length).toBeGreaterThan(0);
		expect(list.every((m) => m.visibility === 'player-visible')).toBe(true);
		// Hard leak check: no dm-only map id or name appears in the serialized list.
		const serialized = JSON.stringify(list);
		expect(serialized).not.toContain('dm-only');
	});

	it('AC2: a naive "render everything" component handed the player list cannot leak a dm-only map name/id', () => {
		const dmList = listMapsForActor(demo(), PERMISSIONS, DM_ACTOR.id);
		const playerList = listMapsForActor(demo(), PERMISSIONS, PLAYER_ACTOR.id);
		// The DM sees at least one map the player does not (there must be dm-only maps in the demo).
		const dmIds = new Set(dmList.map((m) => m.id));
		const playerIds = new Set(playerList.map((m) => m.id));
		const dmOnlyIds = [...dmIds].filter((id) => !playerIds.has(id));
		expect(dmOnlyIds.length).toBeGreaterThan(0);
		// None of the dm-only map ids appear in the player payload AT ALL.
		const playerPayload = JSON.stringify(playerList);
		for (const id of dmOnlyIds) {
			expect(playerPayload).not.toContain(id);
		}
	});

	it('the DM sees all maps (including dm-only and shared)', () => {
		const dmList = listMapsForActor(demo(), PERMISSIONS, DM_ACTOR.id);
		const playerList = listMapsForActor(demo(), PERMISSIONS, PLAYER_ACTOR.id);
		expect(dmList.length).toBeGreaterThan(playerList.length);
	});

	it('results are sorted alphabetically by name', () => {
		const list = listMapsForActor(demo(), PERMISSIONS, DM_ACTOR.id);
		for (let i = 1; i < list.length; i++) {
			expect(list[i - 1]!.name.localeCompare(list[i]!.name)).toBeLessThanOrEqual(0);
		}
	});

	it('an unknown actor receives an empty list (fail closed)', () => {
		expect(listMapsForActor(demo(), PERMISSIONS, 'ghost')).toEqual([]);
	});

	it('each list entry has the correct fields (id, name, description, defaultRegionId, visibility)', () => {
		const list = listMapsForActor(demo(), PERMISSIONS, DM_ACTOR.id);
		for (const entry of list) {
			expect(typeof entry.id).toBe('string');
			expect(typeof entry.name).toBe('string');
			expect(typeof entry.description).toBe('string');
			expect(entry.visibility).toMatch(/^(dm-only|player-visible|shared)$/);
			expect(entry.defaultRegionId === null || typeof entry.defaultRegionId === 'string').toBe(true);
		}
	});

	it('listMapsForActor and getMapViewForActor are consistent: every list entry resolves to available', () => {
		// Consistency: any map in the player list must be available via the detail query.
		const playerList = listMapsForActor(demo(), PERMISSIONS, PLAYER_ACTOR.id);
		for (const entry of playerList) {
			const view = getMapViewForActor(demo(), PERMISSIONS, PLAYER_ACTOR.id, entry.id);
			expect(view.kind, `map ${entry.id} in list should be available`).toBe('available');
		}
	});
});

function EMPTY_SESSION(): SessionState {
	return {
		workflow: 'active',
		workflowRevision: 1,
		activeSceneId: null,
		activeMap: null,
		combat: EMPTY_SESSION_COMBAT_STATE,
		diceHistory: [],
		timers: {},
		playerViewAssignments: {},
		activeMapProjections: {},
		handouts: {},
		quickReferencePanels: {},
		audioPlayback: EMPTY_SESSION_AUDIO_STATE,
		playerGroups: {},
		calendarContinuity: EMPTY_CALENDAR_CONTINUITY_STATE,
		recapArchiveId: null,
		archives: {},
		schemaVersion: 1,
	};
}
