import { describe, expect, it } from 'vitest';
import { createDemoMapState, queryMapLayers, type CoreStateSlice } from '../src';
import { DM_ACTOR, OBSERVER_ACTOR, PLAYER_ACTOR, buildInitialState } from '../src/testing/fixtures';
import type { Actor } from '../src/state/permission-state';

const MAP_ID = 'map-western-reaches';
const PLAYER_B: Actor = { id: 'actor-player-b', role: 'player', displayName: 'Player B' };

function stateWithMaps(): CoreStateSlice {
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	return { ...base, maps: createDemoMapState() };
}

function stateWithTwoPlayers(): CoreStateSlice {
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_B);
	return { ...base, maps: createDemoMapState() };
}

describe('MAP-007 tag/query layers without reading hidden layer data into player contexts', () => {
	it('the DM filtering by a tag gets every matching layer (AC1)', () => {
		const state = stateWithMaps();
		// Western Reaches: layer-hidden-camps is tagged region:coast/type:poi and is dm-only.
		const result = queryMapLayers(state.maps, state.permissions, DM_ACTOR.id, {
			mapId: MAP_ID,
			facets: { type: 'poi' },
		});
		expect(result.layers.map((l) => l.layerId)).toContain('layer-hidden-camps');
		// The DM is told how many of the matches are hidden from players.
		expect(result.hiddenMatchCount).toBe(1);
	});

	it('a player running the same query gets hidden matches OMITTED, not redacted (AC2)', () => {
		const state = stateWithMaps();
		const result = queryMapLayers(state.maps, state.permissions, PLAYER_ACTOR.id, {
			mapId: MAP_ID,
			facets: { type: 'poi' },
		});
		// The only type:poi layer is dm-only → the player's result is EMPTY (omitted, not a redacted
		// placeholder), and no hidden count leaks the existence.
		expect(result.layers).toEqual([]);
		expect(result.hiddenMatchCount).toBe(0);
		// Hard leak check: the hidden layer's id/name never appears anywhere in the serialized result.
		expect(JSON.stringify(result)).not.toContain('hidden-camps');
		expect(JSON.stringify(result)).not.toContain('Hidden Camps');
	});

	it('a player query returns only player-visible layers of a visible map', () => {
		const state = stateWithMaps();
		const result = queryMapLayers(state.maps, state.permissions, PLAYER_ACTOR.id, {
			mapId: MAP_ID,
		});
		// terrain + roads are player-visible; hidden-camps is dm-only.
		expect(result.layers.map((l) => l.layerId).sort()).toEqual(['layer-roads', 'layer-terrain']);
	});

	it('an observer gets the same player-visible filtering and no write/lock leak of hidden layers', () => {
		const state = stateWithMaps();
		const result = queryMapLayers(state.maps, state.permissions, OBSERVER_ACTOR.id, {
			mapId: MAP_ID,
		});
		expect(result.layers.every((l) => l.visibility === 'player-visible')).toBe(true);
		expect(result.layers.some((l) => l.visibility === 'dm-only')).toBe(false);
	});

	it('layers of a dm-only map are entirely hidden from a non-DM (fail closed)', () => {
		const state = stateWithMaps();
		// Make the whole Western Reaches map dm-only.
		const map = state.maps.maps[MAP_ID]!;
		const hidden: CoreStateSlice = {
			...state,
			maps: {
				...state.maps,
				maps: { ...state.maps.maps, [MAP_ID]: { ...map, visibility: 'dm-only' } },
			},
		};
		const result = queryMapLayers(hidden.maps, hidden.permissions, PLAYER_ACTOR.id, {
			mapId: MAP_ID,
		});
		expect(result.layers).toEqual([]);
	});

	it('a shared layer is hidden from a player without delivery and visible with delivery', () => {
		const state = stateWithMaps();
		// Ruined Keep is a shared map with a shared fog layer.
		const ruinedKeep = 'map-ruined-keep';
		const undelivered = queryMapLayers(state.maps, state.permissions, PLAYER_ACTOR.id, {
			mapId: ruinedKeep,
		});
		// Without delivery, the shared map is hidden entirely.
		expect(undelivered.layers).toEqual([]);

		const delivered = queryMapLayers(
			state.maps,
			state.permissions,
			PLAYER_ACTOR.id,
			{ mapId: ruinedKeep },
			{ deliveredMapIds: [ruinedKeep] },
		);
		// With delivery: player-visible (Rooms) + shared (Fog) layers appear; dm-only (Secret Ambush)
		// stays hidden.
		expect(delivered.layers.map((l) => l.layerId).sort()).toEqual(['layer-fog', 'layer-rooms']);
		expect(JSON.stringify(delivered)).not.toContain('Secret Ambush');
	});

	it('an unknown actor gets an empty result (fail closed)', () => {
		const state = stateWithMaps();
		const result = queryMapLayers(state.maps, state.permissions, 'actor-nobody', { mapId: MAP_ID });
		expect(result.layers).toEqual([]);
		expect(result.hiddenMatchCount).toBe(0);
	});

	it('a tag query searches across all visible maps when no mapId is scoped', () => {
		const state = stateWithMaps();
		const result = queryMapLayers(state.maps, state.permissions, DM_ACTOR.id, {
			tags: ['type:fog'],
		});
		expect(result.layers.map((l) => l.layerId)).toContain('layer-fog');
	});
});

describe('MAP-006 AC3 per-player layer delivery: same map, different results for different players', () => {
	/**
	 * MAP-006 AC3 — "Given Layer B is included in Player A's Player View assignment only, when Player A
	 * and Player B query the same map, then only Player A receives Layer B."
	 *
	 * The Ruined Keep has layer-fog (visibility: `shared`). When Player A has explicit map delivery
	 * (simulating an active-map projection or player-view assignment) and Player B does NOT, only
	 * Player A's query returns layer-fog. The mechanism is the per-actor `deliveredMapIds` parameter:
	 * each player's query carries their OWN delivery set, so the isolation is per-actor.
	 */
	const KEEP = 'map-ruined-keep';

	it('Player A (with delivery) sees the shared layer; Player B (without) does not', () => {
		const state = stateWithTwoPlayers();

		// Player A has explicit delivery for the shared Ruined Keep map (simulating an active-map projection).
		const playerAResult = queryMapLayers(
			state.maps,
			state.permissions,
			PLAYER_ACTOR.id,
			{ mapId: KEEP },
			{ deliveredMapIds: [KEEP] },
		);
		// Player B has no delivery for the same map.
		const playerBResult = queryMapLayers(
			state.maps,
			state.permissions,
			PLAYER_B.id,
			{ mapId: KEEP },
		);

		// Player A sees both the player-visible Rooms layer AND the shared Fog layer.
		const playerALayerIds = playerAResult.layers.map((l) => l.layerId).sort();
		expect(playerALayerIds).toEqual(['layer-fog', 'layer-rooms']);

		// Player B sees nothing: without delivery the whole shared map is hidden (not just the shared layer).
		expect(playerBResult.layers).toEqual([]);

		// Hard cross-player leak assertion: the shared layer that Player A receives is absent from
		// Player B's serialized result entirely.
		expect(JSON.stringify(playerBResult)).not.toContain('layer-fog');
		expect(JSON.stringify(playerBResult)).not.toContain('Fog of War');

		// The dm-only Secret Ambush layer never appears for EITHER player, regardless of delivery.
		expect(JSON.stringify(playerAResult)).not.toContain('layer-secret-ambush');
		expect(JSON.stringify(playerAResult)).not.toContain('Secret Ambush');
	});

	it('both players querying the same player-visible map get the same player-visible layers', () => {
		// Confirms the isolation is per-delivery, not per-identity: two players without special
		// delivery on a player-visible map both receive the same player-visible layers.
		const state = stateWithTwoPlayers();
		const western = 'map-western-reaches';

		const playerAResult = queryMapLayers(state.maps, state.permissions, PLAYER_ACTOR.id, { mapId: western });
		const playerBResult = queryMapLayers(state.maps, state.permissions, PLAYER_B.id, { mapId: western });

		expect(playerAResult.layers.map((l) => l.layerId).sort()).toEqual(['layer-roads', 'layer-terrain']);
		expect(playerBResult.layers.map((l) => l.layerId).sort()).toEqual(['layer-roads', 'layer-terrain']);
		// Neither player sees the dm-only hidden-camps layer.
		expect(JSON.stringify(playerAResult)).not.toContain('layer-hidden-camps');
		expect(JSON.stringify(playerBResult)).not.toContain('layer-hidden-camps');
	});
});
