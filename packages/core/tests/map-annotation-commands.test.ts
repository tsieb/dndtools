import { describe, expect, it } from 'vitest';
import {
	createDemoMapState,
	dispatchCommand,
	getMapViewForActor,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * MAP-010/011/012/013/014/019 — durable annotation COMMAND handlers. Every mutation is DM-gated
 * (except a token move by its controller), appends a conflict-shaped durable operation, and is
 * fail-closed. These cover durability/sync-shape, fog offline queueing, token-control authorization,
 * and the overlay prerequisite gate.
 */

const WESTERN = 'map-western-reaches';
const KEEP = 'map-ruined-keep';

function seeded(): CoreStateSlice {
	const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	return { ...state, maps: createDemoMapState() };
}

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got ${JSON.stringify(result.rejection)}`);
	}
	return result;
}

function rejected(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	if (result.status !== 'rejected') throw new Error('expected rejected');
	return result;
}

function run(state: CoreStateSlice, command: CoreCommand): CommandResult {
	return dispatchCommand(state, makeEnvironment(), command);
}

describe('MAP-010 POI create/move/categorize/link is a durable DM command', () => {
	it('creates a POI in normalized space and appends a durable op', () => {
		const result = accept(
			run(seeded(), {
				type: 'map.create-poi',
				actorId: DM_ACTOR.id,
				payload: {
					mapId: WESTERN,
					layerId: 'layer-terrain',
					label: 'Watchtower',
					category: 'landmark',
					position: { x: 0.25, y: 0.3 },
					visibility: 'player-visible',
					linkedEntityType: 'note',
					linkedEntityId: 'note-watchtower',
				},
			}),
		);
		expect(result.operationIds).toHaveLength(1);
		expect(result.events[0]).toMatchObject({ kind: 'map.poi-changed', mutation: 'create' });
		const map = result.nextState.maps.maps[WESTERN]!;
		const created = map.pois.find((p) => p.label === 'Watchtower')!;
		// MAP-010 AC1: normalized coordinates, label, category, and target entity id all stored.
		expect(created.label).toBe('Watchtower');
		expect(created.category).toBe('landmark');
		expect(created.position).toEqual({ x: 0.25, y: 0.3 });
		expect(created.linkedEntityType).toBe('note');
		expect(created.linkedEntityId).toBe('note-watchtower');
		// The parent map revision is bumped (conflict-shaped change).
		expect(map.revision).toBe(2);
	});

	it('MAP-010 AC2: POI position passes through the actor-filtered query unchanged (anchored across zoom/resize)', () => {
		// Create a POI at a specific normalized position; verify getMapViewForActor returns the SAME
		// normalized coordinates so any render at any scale uses the same (x,y) anchor.
		const result = accept(
			run(seeded(), {
				type: 'map.create-poi',
				actorId: DM_ACTOR.id,
				payload: {
					mapId: WESTERN,
					layerId: 'layer-terrain',
					label: 'Beacon',
					category: 'landmark',
					position: { x: 0.33, y: 0.77 },
					visibility: 'player-visible',
				},
			}),
		);
		const view = getMapViewForActor(
			result.nextState.maps,
			result.nextState.permissions,
			PLAYER_ACTOR.id,
			WESTERN,
		);
		if (view.kind !== 'available') throw new Error('unavailable');
		const beacon = view.pois.find((p) => p.label === 'Beacon')!;
		// Coordinates must be bit-for-bit identical regardless of render scale.
		expect(beacon.position).toEqual({ x: 0.33, y: 0.77 });
	});

	it('rejects an out-of-bounds POI before any mutation (fail-closed)', () => {
		const state = seeded();
		const result = rejected(
			run(state, {
				type: 'map.create-poi',
				actorId: DM_ACTOR.id,
				payload: { mapId: WESTERN, layerId: 'layer-terrain', label: 'X', position: { x: 2, y: 0 } },
			}),
		);
		expect(result.rejection.code).toBe('invalid-payload');
		// State untouched.
		expect(result.nextState).toBe(state);
	});

	it('a player cannot create a POI (DM-only authoring)', () => {
		const result = rejected(
			run(seeded(), {
				type: 'map.create-poi',
				actorId: PLAYER_ACTOR.id,
				payload: {
					mapId: WESTERN,
					layerId: 'layer-terrain',
					label: 'X',
					position: { x: 0.1, y: 0.1 },
				},
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});
});

describe('MAP-011 POI visibility is independent and does not leak', () => {
	it('changing a POI to player-visible makes it appear in the player view without reload', () => {
		let state = seeded();
		// The Smugglers' Cache POI is dm-only on a dm-only layer; reveal both.
		state = accept(
			run(state, {
				type: 'map.set-layer-visibility',
				actorId: DM_ACTOR.id,
				payload: { mapId: WESTERN, layerId: 'layer-hidden-camps', visibility: 'player-visible' },
			}),
		).nextState;
		// Before revealing the POI itself it is still hidden (independent visibility).
		const beforePoi = getMapViewForActor(state.maps, state.permissions, PLAYER_ACTOR.id, WESTERN);
		if (beforePoi.kind !== 'available') throw new Error('unavailable');
		expect(beforePoi.pois.map((p) => p.id)).not.toContain('poi-smugglers-cache');

		state = accept(
			run(state, {
				type: 'map.update-poi',
				actorId: DM_ACTOR.id,
				payload: { mapId: WESTERN, poiId: 'poi-smugglers-cache', visibility: 'player-visible' },
			}),
		).nextState;
		const afterPoi = getMapViewForActor(state.maps, state.permissions, PLAYER_ACTOR.id, WESTERN);
		if (afterPoi.kind !== 'available') throw new Error('unavailable');
		expect(afterPoi.pois.map((p) => p.id)).toContain('poi-smugglers-cache');
	});
});

describe('MAP-012 fog reveal/conceal is durable and syncs (queues offline)', () => {
	it('a reveal persists and is delivered when connected', () => {
		const result = accept(
			run(seeded(), {
				type: 'map.append-fog',
				actorId: DM_ACTOR.id,
				payload: {
					mapId: KEEP,
					layerId: 'layer-fog',
					kind: 'reveal',
					region: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
					visibility: 'shared',
					connectionState: 'connected',
				},
			}),
		);
		expect(result.operationIds).toHaveLength(1);
		expect(result.events[0]).toMatchObject({
			kind: 'map.fog-changed',
			mutation: 'reveal',
			deliveryStatus: 'delivered',
		});
		const map = result.nextState.maps.maps[KEEP]!;
		expect(map.fog.some((op) => op.kind === 'reveal')).toBe(true);
		// MAP-012 AC1: the reveal op is visible to a projected player (shared fog on shared layer).
		const playerView = getMapViewForActor(
			result.nextState.maps,
			result.nextState.permissions,
			PLAYER_ACTOR.id,
			KEEP,
			{ deliveredMapIds: new Set([KEEP]) },
		);
		if (playerView.kind !== 'available') throw new Error('KEEP should be available to delivered player');
		expect(playerView.fog.some((op) => op.kind === 'reveal')).toBe(true);
	});

	it('MAP-012 AC2: an offline reveal queues with undelivered status but is still persisted locally', () => {
		const result = accept(
			run(seeded(), {
				type: 'map.append-fog',
				actorId: DM_ACTOR.id,
				payload: {
					mapId: KEEP,
					layerId: 'layer-fog',
					kind: 'reveal',
					region: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
					visibility: 'shared',
					connectionState: 'offline',
				},
			}),
		);
		expect(result.events[0]).toMatchObject({ deliveryStatus: 'queued' });
		// Local-first: the op is durably appended even while undelivered.
		expect(result.operationIds).toHaveLength(1);
		const op = result.nextState.sync.operations.at(-1)!;
		expect(op.opType).toBe('map.fog.append');
		expect((op.value as { deliveryStatus: string }).deliveryStatus).toBe('queued');
	});

	it('a concealed region never appears in the player actor-filtered query when its layer is hidden', () => {
		// Append a dm-only conceal on a dm-only layer; the player must never see it.
		const result = accept(
			run(seeded(), {
				type: 'map.append-fog',
				actorId: DM_ACTOR.id,
				payload: {
					mapId: WESTERN,
					layerId: 'layer-hidden-camps',
					kind: 'conceal',
					region: { x: 0.6, y: 0.3, w: 0.2, h: 0.2 },
					visibility: 'dm-only',
				},
			}),
		);
		const view = getMapViewForActor(
			result.nextState.maps,
			result.nextState.permissions,
			PLAYER_ACTOR.id,
			WESTERN,
		);
		if (view.kind !== 'available') throw new Error('unavailable');
		expect(view.fog).toHaveLength(0);
	});
});

describe('MAP-013 route is durable; distance/time are derived in the query', () => {
	it('creates a route and the query reports a deterministic measurement', () => {
		const result = accept(
			run(seeded(), {
				type: 'map.create-route',
				actorId: DM_ACTOR.id,
				payload: {
					mapId: WESTERN,
					layerId: 'layer-roads',
					label: 'Patrol Loop',
					visibility: 'player-visible',
					waypoints: [
						{ id: 'w1', position: { x: 0.1, y: 0.1 } },
						{ id: 'w2', position: { x: 0.4, y: 0.5 } },
					],
				},
			}),
		);
		const view = getMapViewForActor(
			result.nextState.maps,
			result.nextState.permissions,
			DM_ACTOR.id,
			WESTERN,
			{
				travelSpeed: { distancePerTime: 24, timeUnit: 'days' },
			},
		);
		if (view.kind !== 'available') throw new Error('unavailable');
		const route = view.routes.find((r) => r.label === 'Patrol Loop')!;
		// normalized 0.5 * 120 miles = 60 miles; / 24 = 2.5 days.
		expect(route.measurement.distance).toBeCloseTo(60, 6);
		expect(route.measurement.travelTime).toBeCloseTo(2.5, 6);
	});
});

describe('MAP-014 overlay mode prerequisite gate is fail-closed', () => {
	it('AC1: entering grid-align without a visible grid is blocked with a reason', () => {
		const result = rejected(
			run(seeded(), {
				type: 'map.set-overlay-mode',
				actorId: DM_ACTOR.id,
				payload: { mapId: KEEP, mode: 'grid-align' },
			}),
		);
		expect(result.rejection.code).toBe('overlay-prerequisite-unmet');
		expect(result.rejection.message).toMatch(/grid-visible/);
	});

	it('AC1: auto-satisfy enables grid visibility and enters the mode', () => {
		const result = accept(
			run(seeded(), {
				type: 'map.set-overlay-mode',
				actorId: DM_ACTOR.id,
				payload: { mapId: KEEP, mode: 'grid-align', autoSatisfyPrerequisites: true },
			}),
		);
		const map = result.nextState.maps.maps[KEEP]!;
		expect(map.overlay.mode).toBe('grid-align');
		expect(map.overlay.gridVisible).toBe(true);
	});

	it('AC2: configuring grid off while in grid-align is blocked (no bypass)', () => {
		const state = accept(
			run(seeded(), {
				type: 'map.set-overlay-mode',
				actorId: DM_ACTOR.id,
				payload: { mapId: KEEP, mode: 'grid-align', autoSatisfyPrerequisites: true },
			}),
		).nextState;
		const result = rejected(
			run(state, {
				type: 'map.configure-overlay',
				actorId: DM_ACTOR.id,
				payload: { mapId: KEEP, gridVisible: false },
			}),
		);
		expect(result.rejection.code).toBe('overlay-prerequisite-unmet');
	});
});

describe('MAP-019 token lifecycle + actor-filtered control', () => {
	it('the DM creates a token recording all required fields', () => {
		const result = accept(
			run(seeded(), {
				type: 'map.create-token',
				actorId: DM_ACTOR.id,
				payload: {
					mapId: KEEP,
					layerId: 'layer-rooms',
					label: 'Goblin',
					linkedActorId: 'actor-player-2',
					position: { x: 0.5, y: 0.5 },
					size: 1,
					visibility: 'shared',
					controllerActorId: null,
				},
			}),
		);
		const map = result.nextState.maps.maps[KEEP]!;
		const token = map.tokens.find((t) => t.label === 'Goblin')!;
		expect(token.linkedActorId).toBe('actor-player-2');
		expect(token.visibility).toBe('shared');
	});

	it('MAP-019 AC2: a move computes distance from scale and carries it on the event', () => {
		// Move the seeded hero token; the keep scale is 200 feet per map width.
		const result = accept(
			run(seeded(), {
				type: 'map.move-token',
				actorId: DM_ACTOR.id,
				payload: { mapId: KEEP, tokenId: 'token-hero', position: { x: 0.52, y: 0.24 } },
			}),
		);
		const event = result.events[0];
		expect(event).toMatchObject({ kind: 'map.token-changed', mutation: 'move' });
		// from {0.22,0.24} to {0.52,0.24}: dx=0.3, dy=0 → 0.3*200 = 60 feet.
		if (event && event.kind === 'map.token-changed') expect(event.moveDistance).toBeCloseTo(60, 6);
	});

	it('MAP-019 AC4: a player can move ONLY a token they control', () => {
		// The hero token's controller is actor-player → allowed.
		const allowed = accept(
			run(seeded(), {
				type: 'map.move-token',
				actorId: PLAYER_ACTOR.id,
				payload: { mapId: KEEP, tokenId: 'token-hero', position: { x: 0.3, y: 0.3 } },
			}),
		);
		expect(allowed.events[0]).toMatchObject({ kind: 'map.token-changed', mutation: 'move' });

		// The ambusher token is dm-only and uncontrolled → rejected BEFORE mutation.
		const denied = rejected(
			run(seeded(), {
				type: 'map.move-token',
				actorId: PLAYER_ACTOR.id,
				payload: { mapId: KEEP, tokenId: 'token-ambusher', position: { x: 0.3, y: 0.3 } },
			}),
		);
		expect(denied.rejection.code).toBe('actor-not-authorized');
	});

	it('a player cannot move a token controlled by a DIFFERENT player', () => {
		let state = seeded();
		// Reassign control of the hero to player-2; player-1 then cannot move it.
		state = accept(
			run(state, {
				type: 'map.update-token',
				actorId: DM_ACTOR.id,
				payload: { mapId: KEEP, tokenId: 'token-hero', controllerActorId: 'actor-player-2' },
			}),
		).nextState;
		const denied = rejected(
			run(state, {
				type: 'map.move-token',
				actorId: PLAYER_ACTOR.id,
				payload: { mapId: KEEP, tokenId: 'token-hero', position: { x: 0.3, y: 0.3 } },
			}),
		);
		expect(denied.rejection.code).toBe('actor-not-authorized');
	});
});
