import { describe, expect, it } from 'vitest';
import { createDemoMapState, queryMapLayers, type CoreStateSlice } from '../src';
import { DM_ACTOR, OBSERVER_ACTOR, PLAYER_ACTOR, buildInitialState } from '../src/testing/fixtures';

const MAP_ID = 'map-western-reaches';

function stateWithMaps(): CoreStateSlice {
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
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
