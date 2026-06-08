import { describe, expect, it } from 'vitest';
import {
	DEEP_LINK_UNAVAILABLE_MESSAGE,
	createDemoMapState,
	dispatchCommand,
	resolveDeepLink,
	type CoreStateSlice,
	type DeepLinkStateView,
} from '../src/index';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * NAV-005 — map/Scene/note/object/character/search-result deep links restore the
 * intended selection when authorized (AC1), show a generic unavailable state for a
 * target hidden from a player without revealing it (AC2), and report unavailable for
 * an uncached/offline target while preserving non-sensitive route state (AC3).
 */

const env = makeEnvironment();

/** A state slice with the demo maps loaded, plus a DM and a player. */
function stateWithMaps(): CoreStateSlice {
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	return { ...base, maps: createDemoMapState() };
}

function view(state: CoreStateSlice): DeepLinkStateView {
	return { scenes: state.scenes, maps: state.maps, permissions: state.permissions };
}

/** Create a Scene and return [state, sceneId]. */
function withScene(
	state: CoreStateSlice,
	visibility: 'dm-only' | 'shared' | 'player-visible',
): [CoreStateSlice, string] {
	const result = dispatchCommand(state, env, {
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Misty Vale', visibility },
	});
	if (result.status !== 'accepted') throw new Error('scene.create rejected');
	const created = result.events.find((e) => e.kind === 'scene.created');
	if (!created || created.kind !== 'scene.created') throw new Error('no scene.created event');
	return [result.nextState, created.sceneId];
}

describe('NAV-005 AC1 a deep link to a visible POI focuses the map viewport', () => {
	it('restores the requested region as the map viewport focus for the DM', () => {
		const state = stateWithMaps();
		const result = resolveDeepLink(view(state), DM_ACTOR.id, {
			type: 'map',
			entityId: 'map-western-reaches',
			selectionId: 'region-coast',
			sectionId: 'atlas',
		});
		expect(result.kind).toBe('restore');
		if (result.kind === 'restore') {
			expect(result.entityId).toBe('map-western-reaches');
			expect(result.entityName).toBe('Western Reaches');
			expect(result.selectionId).toBe('region-coast');
			expect(result.selectionLabel).toBe('Storm Coast');
			expect(result.route).toBe('/atlas/');
		}
	});

	it('focuses a player-visible map POI for a player', () => {
		const state = stateWithMaps();
		// Western Reaches is player-visible.
		const result = resolveDeepLink(view(state), PLAYER_ACTOR.id, {
			type: 'map',
			entityId: 'map-western-reaches',
			selectionId: 'region-north-road',
			sectionId: 'atlas',
		});
		expect(result.kind).toBe('restore');
		if (result.kind === 'restore') expect(result.selectionId).toBe('region-north-road');
	});

	it('falls back to the map default region when the requested region is unknown', () => {
		const state = stateWithMaps();
		const result = resolveDeepLink(view(state), DM_ACTOR.id, {
			type: 'map',
			entityId: 'map-western-reaches',
			selectionId: 'region-does-not-exist',
			sectionId: 'atlas',
		});
		expect(result.kind).toBe('restore');
		// The map still opens at its default region rather than 404-ing.
		if (result.kind === 'restore') expect(result.selectionId).toBe('region-north-road');
	});

	it('restores an open Scene with a visible section for a player', () => {
		const [state, sceneId] = withScene(stateWithMaps(), 'player-visible');
		const result = resolveDeepLink(view(state), PLAYER_ACTOR.id, {
			type: 'scene',
			entityId: sceneId,
			sectionId: 'scenes',
		});
		expect(result.kind).toBe('restore');
		if (result.kind === 'restore') {
			expect(result.entityName).toBe('Misty Vale');
			expect(result.route).toBe(`/scene/${sceneId}/`);
		}
	});
});

describe('NAV-005 AC2 a target hidden from a player is generic-unavailable', () => {
	it('does not reveal a dm-only map to a player', () => {
		const state = stateWithMaps();
		// Ruined Keep is `shared` (not player-visible without projection).
		const result = resolveDeepLink(view(state), PLAYER_ACTOR.id, {
			type: 'map',
			entityId: 'map-ruined-keep',
			selectionId: 'region-secret-cellar',
			sectionId: 'atlas',
		});
		expect(result.kind).toBe('unavailable');
		if (result.kind === 'unavailable') {
			expect(result.reason).toBe('hidden');
			expect(result.message).toBe(DEEP_LINK_UNAVAILABLE_MESSAGE);
			// The generic message names no entity and no region.
			expect(result.message).not.toContain('Ruined Keep');
			expect(result.message).not.toContain('Secret Cellar');
		}
	});

	it('gives the same generic message for a hidden Scene and a missing one', () => {
		const [state, sceneId] = withScene(stateWithMaps(), 'dm-only');
		const hidden = resolveDeepLink(view(state), PLAYER_ACTOR.id, {
			type: 'scene',
			entityId: sceneId,
			sectionId: 'scenes',
		});
		const missing = resolveDeepLink(view(state), PLAYER_ACTOR.id, {
			type: 'scene',
			entityId: 'scene-does-not-exist',
			sectionId: 'scenes',
		});
		expect(hidden.kind).toBe('unavailable');
		expect(missing.kind).toBe('unavailable');
		if (hidden.kind === 'unavailable' && missing.kind === 'unavailable') {
			// A player cannot distinguish "hidden from you" from "does not exist": same
			// user-facing message in both cases (NAV-005 AC2).
			expect(hidden.message).toBe(missing.message);
		}
	});

	it('treats an unknown actor as generic-unavailable (fail closed)', () => {
		const state = stateWithMaps();
		const result = resolveDeepLink(view(state), 'actor-nobody', {
			type: 'map',
			entityId: 'map-western-reaches',
			sectionId: 'atlas',
		});
		expect(result.kind).toBe('unavailable');
		if (result.kind === 'unavailable') expect(result.message).toBe(DEEP_LINK_UNAVAILABLE_MESSAGE);
	});
});

describe('MAP-018 AC2 a POI deep link to a hidden map artifact is generic-unavailable', () => {
	// This describe block tests the `type: \'poi\'` resolution path through resolveDeepLink /
	// resolvePoiDeepLink specifically. The map-query unit suite already proves that a hidden POI is
	// absent from getMapViewForActor; these tests verify the deep-link surface itself returns the
	// correct generic unavailable (not just the underlying query layer), which is the direct AC2 proof.

	it('a player cannot deep-link to a dm-only POI — fails closed to generic unavailable', () => {
		const state = stateWithMaps();
		// poi-smugglers-cache is on the dm-only layer of the player-visible Western Reaches map.
		const result = resolveDeepLink(view(state), PLAYER_ACTOR.id, {
			type: 'poi',
			entityId: 'map-western-reaches',
			selectionId: 'poi-smugglers-cache',
			sectionId: 'atlas',
		});
		expect(result.kind).toBe('unavailable');
		if (result.kind === 'unavailable') {
			// The single generic message names no entity so the hidden POI\'s existence is not confirmed.
			expect(result.message).toBe(DEEP_LINK_UNAVAILABLE_MESSAGE);
			expect(result.message).not.toContain('Smugglers');
			expect(result.message).not.toContain('Cache');
		}
	});

	it('an observer cannot deep-link to a dm-only POI — same generic unavailable', () => {
		const state = { ...stateWithMaps(), permissions: buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR).permissions };
		const result = resolveDeepLink(view(state), OBSERVER_ACTOR.id, {
			type: 'poi',
			entityId: 'map-western-reaches',
			selectionId: 'poi-smugglers-cache',
			sectionId: 'atlas',
		});
		expect(result.kind).toBe('unavailable');
		if (result.kind === 'unavailable') {
			expect(result.message).toBe(DEEP_LINK_UNAVAILABLE_MESSAGE);
		}
	});

	it('hidden POI deep link is indistinguishable from a missing POI (same message)', () => {
		const state = stateWithMaps();
		const hiddenResult = resolveDeepLink(view(state), PLAYER_ACTOR.id, {
			type: 'poi',
			entityId: 'map-western-reaches',
			selectionId: 'poi-smugglers-cache', // exists but hidden
			sectionId: 'atlas',
		});
		const missingResult = resolveDeepLink(view(state), PLAYER_ACTOR.id, {
			type: 'poi',
			entityId: 'map-western-reaches',
			selectionId: 'poi-does-not-exist', // does not exist at all
			sectionId: 'atlas',
		});
		expect(hiddenResult.kind).toBe('unavailable');
		expect(missingResult.kind).toBe('unavailable');
		if (hiddenResult.kind === 'unavailable' && missingResult.kind === 'unavailable') {
			// A player cannot distinguish "hidden from you" from "does not exist" (MAP-018 AC2).
			expect(hiddenResult.message).toBe(missingResult.message);
		}
	});

	it('the DM CAN deep-link to the same POI — it resolves with the correct viewport coordinate', () => {
		const state = stateWithMaps();
		const result = resolveDeepLink(view(state), DM_ACTOR.id, {
			type: 'poi',
			entityId: 'map-western-reaches',
			selectionId: 'poi-smugglers-cache',
			sectionId: 'atlas',
		});
		expect(result.kind).toBe('restore');
		if (result.kind === 'restore') {
			expect(result.selectionId).toBe('poi-smugglers-cache');
			// The viewport is derived from the POI\'s normalized position (SRCH-007 AC1).
			expect(result.viewport).toEqual({ mapId: 'map-western-reaches', x: 0.71, y: 0.41 });
		}
	});
});

describe('NAV-005 AC3 an uncached/offline target preserves non-sensitive route state', () => {
	it('reports unavailable for a map not present in local state but keeps the section', () => {
		const state = stateWithMaps();
		const result = resolveDeepLink(view(state), DM_ACTOR.id, {
			type: 'map',
			entityId: 'map-never-synced',
			sectionId: 'atlas',
		});
		expect(result.kind).toBe('unavailable');
		if (result.kind === 'unavailable') {
			expect(result.reason).toBe('not-cached');
			// Non-sensitive route state (the section, the link kind) is preserved so the
			// shell can render a coherent unavailable page (NAV-005 AC3).
			expect(result.sectionId).toBe('atlas');
			expect(result.type).toBe('map');
		}
	});

	it('reports unavailable for not-yet-implemented domains without leaking', () => {
		const state = stateWithMaps();
		for (const type of ['note', 'object', 'character', 'search-result'] as const) {
			const result = resolveDeepLink(view(state), DM_ACTOR.id, {
				type,
				entityId: 'entity-1',
				sectionId: 'knowledge',
			});
			expect(result.kind).toBe('unavailable');
			if (result.kind === 'unavailable') {
				expect(result.reason).toBe('not-cached');
				expect(result.sectionId).toBe('knowledge');
				expect(result.message).toBe(DEEP_LINK_UNAVAILABLE_MESSAGE);
			}
		}
	});
});
