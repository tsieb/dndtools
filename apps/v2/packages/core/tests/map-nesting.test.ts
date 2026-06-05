import { describe, expect, it } from 'vitest';
import {
	MAX_NESTING_DEPTH,
	addEmbed,
	ancestorMapIds,
	applyMatrix,
	composeChain,
	composeMatrix,
	computeTransitionIntoChild,
	computeTransitionToParent,
	descendantMapIds,
	dispatchCommand,
	embedTransformToMatrix,
	invertMatrix,
	longestPathFromAnyRoot,
	normalizeMapEntity,
	projectPointThroughChain,
	removeEmbed,
	resolveEmbedsForActor,
	subtreeDepth,
	updateEmbed,
	validateAddEmbed,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	type MapEmbed,
	type MapEmbedTransform,
	type MapEntity,
	type MapState,
	type Point2D,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import type { SceneVisibility } from '../src/state/scene-state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function makeMap(
	id: string,
	visibility: SceneVisibility = 'player-visible',
	embeds: MapEmbed[] = [],
): MapEntity {
	return normalizeMapEntity({
		id,
		name: `Map ${id}`,
		description: '',
		visibility,
		scale: null,
		projection: { kind: 'flat', rotationDegrees: 0 },
		layers: [],
		regions: [],
		assetIds: [],
		embeds,
		defaultRegionId: null,
		updatedAt: '2026-06-04T00:00:00.000Z',
		revision: 1,
	});
}

function embed(id: string, childMapId: string, transform?: Partial<MapEmbedTransform>): MapEmbed {
	return {
		id,
		childMapId,
		transform: {
			position: { x: 0, y: 0 },
			scale: 0.5,
			rotationDegrees: 0,
			...transform,
		},
		transitionBehavior: 'zoom',
		transitionThreshold: 0.5,
	};
}

function mapsRecord(...maps: MapEntity[]): MapState['maps'] {
	return Object.fromEntries(maps.map((m) => [m.id, m]));
}

const IDENTITY_TRANSFORM: MapEmbedTransform = {
	position: { x: 0, y: 0 },
	scale: 1,
	rotationDegrees: 0,
};

function approxEqual(a: number, b: number, tol = 1e-9): boolean {
	return Math.abs(a - b) <= tol;
}

function pointsClose(a: Point2D, b: Point2D, tol = 1e-9): boolean {
	return approxEqual(a.x, b.x, tol) && approxEqual(a.y, b.y, tol);
}

// ===========================================================================
// MAP-017 AC1 — cycle prevention
// ===========================================================================
describe('MAP-017 AC1 cycle prevention', () => {
	it('rejects embedding a map into itself (self-embed)', () => {
		const maps = mapsRecord(makeMap('a'));
		const error = validateAddEmbed(maps, {
			parentMapId: 'a',
			embedId: 'e1',
			childMapId: 'a',
			transform: IDENTITY_TRANSFORM,
			transitionBehavior: 'zoom',
			transitionThreshold: 0.5,
		});
		expect(error?.kind).toBe('self-embed');
	});

	it('rejects a direct cycle: embedding an ancestor under its child', () => {
		// a embeds b. Now try to embed a under b — that would make a a descendant of itself.
		const a = makeMap('a', 'player-visible', [embed('e-ab', 'b')]);
		const b = makeMap('b');
		const maps = mapsRecord(a, b);
		const error = validateAddEmbed(maps, {
			parentMapId: 'b',
			embedId: 'e-ba',
			childMapId: 'a',
			transform: IDENTITY_TRANSFORM,
			transitionBehavior: 'zoom',
			transitionThreshold: 0.5,
		});
		expect(error?.kind).toBe('cycle');
	});

	it('rejects an INDIRECT cycle across multiple levels (a→b→c, then c←a)', () => {
		const a = makeMap('a', 'player-visible', [embed('e-ab', 'b')]);
		const b = makeMap('b', 'player-visible', [embed('e-bc', 'c')]);
		const c = makeMap('c');
		const maps = mapsRecord(a, b, c);
		// Embedding a (the root) under c (the leaf) closes a cycle a→b→c→a.
		const error = validateAddEmbed(maps, {
			parentMapId: 'c',
			embedId: 'e-ca',
			childMapId: 'a',
			transform: IDENTITY_TRANSFORM,
			transitionBehavior: 'zoom',
			transitionThreshold: 0.5,
		});
		expect(error?.kind).toBe('cycle');
	});

	it('allows a non-cyclic embed (a DAG: a→b and a→c, then b→c is fine)', () => {
		const a = makeMap('a', 'player-visible', [embed('e-ab', 'b'), embed('e-ac', 'c')]);
		const b = makeMap('b');
		const c = makeMap('c');
		const maps = mapsRecord(a, b, c);
		const error = validateAddEmbed(maps, {
			parentMapId: 'b',
			embedId: 'e-bc',
			childMapId: 'c',
			transform: IDENTITY_TRANSFORM,
			transitionBehavior: 'zoom',
			transitionThreshold: 0.5,
		});
		expect(error).toBeNull();
	});

	it('descendant/ancestor walks are cycle-safe even on a corrupt cyclic state', () => {
		// Force a cyclic state (a→b, b→a) that the commands would never create, and confirm the walks
		// terminate rather than loop forever.
		const a = makeMap('a', 'player-visible', [embed('e-ab', 'b')]);
		const b = makeMap('b', 'player-visible', [embed('e-ba', 'a')]);
		const maps = mapsRecord(a, b);
		expect([...descendantMapIds(maps, 'a')].sort()).toEqual(['a', 'b']);
		expect([...ancestorMapIds(maps, 'a')].sort()).toEqual(['b']);
	});
});

// ===========================================================================
// MAP-017 — max depth enforcement
// ===========================================================================
describe('MAP-017 max depth enforcement', () => {
	function buildChain(length: number): MapState['maps'] {
		// Build a chain m0 -> m1 -> ... -> m(length-1). length nodes, length-1 edges (depth length-1).
		const maps: MapEntity[] = [];
		for (let i = 0; i < length; i += 1) {
			const childEmbed = i < length - 1 ? [embed(`e-${i}`, `m${i + 1}`)] : [];
			maps.push(makeMap(`m${i}`, 'player-visible', childEmbed));
		}
		return mapsRecord(...maps);
	}

	it('the configured max depth comfortably covers world→region→city→building (depth 3)', () => {
		expect(MAX_NESTING_DEPTH).toBeGreaterThanOrEqual(3);
	});

	it('allows a chain exactly at the max depth', () => {
		// A chain of MAX_NESTING_DEPTH edges already exists; we instead validate adding the final edge
		// that brings the chain TO the limit. Build a chain of MAX_NESTING_DEPTH nodes (depth-1 edges),
		// then add one more leaf to reach exactly MAX_NESTING_DEPTH edges.
		const maps = buildChain(MAX_NESTING_DEPTH); // depth = MAX-1 edges
		const leafId = `m${MAX_NESTING_DEPTH - 1}`;
		const newLeaf = makeMap('leaf');
		maps.leaf = newLeaf;
		const error = validateAddEmbed(maps, {
			parentMapId: leafId,
			embedId: 'e-final',
			childMapId: 'leaf',
			transform: IDENTITY_TRANSFORM,
			transitionBehavior: 'zoom',
			transitionThreshold: 0.5,
		});
		expect(error).toBeNull();
	});

	it('rejects an embed that would exceed the max depth', () => {
		// A chain already at MAX_NESTING_DEPTH edges (MAX+1 nodes). Adding one more leaf exceeds it.
		const maps = buildChain(MAX_NESTING_DEPTH + 1); // depth = MAX edges
		const leafId = `m${MAX_NESTING_DEPTH}`;
		maps.leaf = makeMap('leaf');
		const error = validateAddEmbed(maps, {
			parentMapId: leafId,
			embedId: 'e-overflow',
			childMapId: 'leaf',
			transform: IDENTITY_TRANSFORM,
			transitionBehavior: 'zoom',
			transitionThreshold: 0.5,
		});
		expect(error?.kind).toBe('max-depth-exceeded');
		if (error?.kind === 'max-depth-exceeded') {
			expect(error.limit).toBe(MAX_NESTING_DEPTH);
			expect(error.wouldBeDepth).toBe(MAX_NESTING_DEPTH + 1);
		}
	});

	it('rejects when the CHILD already carries a deep subtree that overflows under the new parent', () => {
		// parent at depth 1 (root->parent). Child is the root of a deep chain. Adding the edge would
		// push the combined chain past the limit even though neither alone exceeds it.
		const root = makeMap('root', 'player-visible', [embed('e-rp', 'parent')]);
		const parent = makeMap('parent');
		// child subtree of depth MAX_NESTING_DEPTH - 1 edges
		const childMaps: MapEntity[] = [];
		for (let i = 0; i < MAX_NESTING_DEPTH; i += 1) {
			const childEmbed = i < MAX_NESTING_DEPTH - 1 ? [embed(`e-c${i}`, `c${i + 1}`)] : [];
			childMaps.push(makeMap(`c${i}`, 'player-visible', childEmbed));
		}
		const maps = mapsRecord(root, parent, ...childMaps);
		const error = validateAddEmbed(maps, {
			parentMapId: 'parent',
			embedId: 'e-pc',
			childMapId: 'c0',
			transform: IDENTITY_TRANSFORM,
			transitionBehavior: 'zoom',
			transitionThreshold: 0.5,
		});
		expect(error?.kind).toBe('max-depth-exceeded');
	});

	it('subtreeDepth and longestPathFromAnyRoot agree on a simple chain', () => {
		const maps = buildChain(4); // m0->m1->m2->m3, depth 3
		expect(subtreeDepth(maps, 'm0')).toBe(3);
		expect(subtreeDepth(maps, 'm3')).toBe(0);
		expect(longestPathFromAnyRoot(maps, 'm3')).toBe(3);
		expect(longestPathFromAnyRoot(maps, 'm0')).toBe(0);
	});
});

// ===========================================================================
// MAP-017 AC2 — transform composition round-trips across depth
// ===========================================================================
describe('MAP-017 AC2 transform composition', () => {
	it('the identity transform maps a point to itself', () => {
		const m = embedTransformToMatrix(IDENTITY_TRANSFORM);
		const p = { x: 0.3, y: 0.7 };
		expect(pointsClose(applyMatrix(m, p), p)).toBe(true);
	});

	it('a scaled+translated embed places the child origin at its position', () => {
		const t: MapEmbedTransform = { position: { x: 0.2, y: 0.4 }, scale: 0.5, rotationDegrees: 0 };
		const m = embedTransformToMatrix(t);
		// child origin (0,0) -> position
		expect(pointsClose(applyMatrix(m, { x: 0, y: 0 }), { x: 0.2, y: 0.4 })).toBe(true);
		// child (1,1) -> position + scale*(1,1)
		expect(pointsClose(applyMatrix(m, { x: 1, y: 1 }), { x: 0.7, y: 0.9 })).toBe(true);
	});

	it('a 90° rotation rotates the child point about the origin', () => {
		const t: MapEmbedTransform = { position: { x: 0, y: 0 }, scale: 1, rotationDegrees: 90 };
		const m = embedTransformToMatrix(t);
		// (1,0) rotated 90° clockwise (our convention a=cos, b=sin) -> (cos90, sin90) = (0, 1)
		const out = applyMatrix(m, { x: 1, y: 0 });
		expect(approxEqual(out.x, 0, 1e-9)).toBe(true);
		expect(approxEqual(out.y, 1, 1e-9)).toBe(true);
	});

	it('inverting a transform round-trips a point exactly (within tolerance)', () => {
		const t: MapEmbedTransform = { position: { x: 0.1, y: 0.2 }, scale: 0.3, rotationDegrees: 35 };
		const m = embedTransformToMatrix(t);
		const inv = invertMatrix(m);
		expect(inv).not.toBeNull();
		const p = { x: 0.42, y: 0.58 };
		const round = applyMatrix(inv!, applyMatrix(m, p));
		expect(pointsClose(round, p, 1e-9)).toBe(true);
	});

	it('a degenerate zero-scale transform is non-invertible (fail closed)', () => {
		const m = embedTransformToMatrix({ position: { x: 0, y: 0 }, scale: 0, rotationDegrees: 0 });
		expect(invertMatrix(m)).toBeNull();
	});

	it('composes a 4-level world→region→city→building chain and round-trips deterministically', () => {
		// MAP-017 AC2: coordinates and scale transforms resolve deterministically at each level.
		const chain: MapEmbedTransform[] = [
			{ position: { x: 0.5, y: 0.5 }, scale: 0.4, rotationDegrees: 10 }, // world->region
			{ position: { x: 0.2, y: 0.1 }, scale: 0.3, rotationDegrees: 20 }, // region->city
			{ position: { x: 0.6, y: 0.3 }, scale: 0.25, rotationDegrees: -15 }, // city->building
		];
		const rootToLeaf = composeChain(chain);
		// determinism: composing again yields an identical matrix.
		expect(composeChain(chain)).toEqual(rootToLeaf);

		const buildingPoint = { x: 0.5, y: 0.5 };
		// child(building)->root(world) via composed matrix, then back via inverse round-trips.
		const worldPoint = applyMatrix(rootToLeaf, buildingPoint);
		const inverse = invertMatrix(rootToLeaf);
		expect(inverse).not.toBeNull();
		expect(pointsClose(applyMatrix(inverse!, worldPoint), buildingPoint, 1e-9)).toBe(true);

		// projectPointThroughChain round-trips too.
		const projected = projectPointThroughChain(chain, worldPoint);
		expect(projected).not.toBeNull();
		expect(pointsClose(projected!.leafPoint, buildingPoint, 1e-9)).toBe(true);
		expect(pointsClose(projected!.roundTrip, worldPoint, 1e-9)).toBe(true);
	});

	it('composeMatrix is associative for a 3-transform chain', () => {
		const a = embedTransformToMatrix({
			position: { x: 0.1, y: 0 },
			scale: 0.5,
			rotationDegrees: 12,
		});
		const b = embedTransformToMatrix({
			position: { x: 0, y: 0.2 },
			scale: 0.7,
			rotationDegrees: 33,
		});
		const c = embedTransformToMatrix({
			position: { x: 0.3, y: 0.3 },
			scale: 0.9,
			rotationDegrees: 5,
		});
		const left = composeMatrix(composeMatrix(a, b), c);
		const right = composeMatrix(a, composeMatrix(b, c));
		const p = { x: 0.25, y: 0.75 };
		expect(pointsClose(applyMatrix(left, p), applyMatrix(right, p), 1e-9)).toBe(true);
	});
});

// ===========================================================================
// MAP-008 — embed preserves the child's independent layers + permissions
// ===========================================================================
describe('MAP-008 embed preserves child independence', () => {
	function stateWith(...maps: MapEntity[]): CoreStateSlice {
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		base.maps = { maps: mapsRecord(...maps), assets: {}, schemaVersion: base.maps.schemaVersion };
		return base;
	}

	it('AC1: the DM embeds a child at a configured transform; the embed stores only a reference', () => {
		const parent = makeMap('region', 'player-visible');
		const child = makeMap('city', 'player-visible');
		const state = stateWith(parent, child);
		const result = accept(
			dispatchCommand(state, makeEnvironment(), {
				type: 'map.embed-child',
				actorId: DM_ACTOR.id,
				payload: {
					parentMapId: 'region',
					childMapId: 'city',
					transform: { position: { x: 0.3, y: 0.2 }, scale: 0.4, rotationDegrees: 15 },
					transitionBehavior: 'zoom',
				},
			} satisfies CoreCommand),
		);
		const nextParent = result.nextState.maps.maps.region!;
		expect(nextParent.embeds).toHaveLength(1);
		const stored = nextParent.embeds[0]!;
		expect(stored.childMapId).toBe('city');
		expect(stored.transform).toEqual({
			position: { x: 0.3, y: 0.2 },
			scale: 0.4,
			rotationDegrees: 15,
		});
		// The embed carries no copy of the child's layers/visibility/name.
		expect(Object.keys(stored)).toEqual(
			expect.arrayContaining([
				'id',
				'childMapId',
				'transform',
				'transitionBehavior',
				'transitionThreshold',
			]),
		);
		expect((stored as unknown as Record<string, unknown>).layers).toBeUndefined();
		expect((stored as unknown as Record<string, unknown>).visibility).toBeUndefined();
		// The child entity is untouched (placement lives on the parent).
		expect(result.nextState.maps.maps.city).toEqual(child);
	});

	it('AC2: a DM-only child stays hidden to a player even when the parent is player-visible', () => {
		const parent = makeMap('region', 'player-visible', [embed('e1', 'secret')]);
		const child = makeMap('secret', 'dm-only');
		const maps = mapsRecord(parent, child);

		// DM resolves the child with its name + transform.
		const dmEmbeds = resolveEmbedsForActor(maps, 'region', DM_ACTOR);
		expect(dmEmbeds).toHaveLength(1);
		expect(dmEmbeds[0]).toMatchObject({
			kind: 'available',
			childName: 'Map secret',
			childMapId: 'secret',
		});

		// Player resolves the SAME embed as a generic unavailable — no name, no transform, no child id.
		const playerEmbeds = resolveEmbedsForActor(maps, 'region', PLAYER_ACTOR);
		expect(playerEmbeds).toHaveLength(1);
		const hidden = playerEmbeds[0]!;
		expect(hidden.kind).toBe('unavailable');
		const serialized = JSON.stringify(hidden);
		expect(serialized).not.toContain('Map secret');
		expect(serialized).not.toContain('secret'); // neither the child id nor name leaks
	});

	it('embedding a player-visible child still leaves the child its own permission model', () => {
		const parent = makeMap('region', 'player-visible', [embed('e1', 'city')]);
		const child = makeMap('city', 'player-visible');
		const maps = mapsRecord(parent, child);
		const playerEmbeds = resolveEmbedsForActor(maps, 'region', PLAYER_ACTOR);
		expect(playerEmbeds[0]).toMatchObject({ kind: 'available', childMapId: 'city' });
		// observer: player-visible is visible to observers too.
		const obsEmbeds = resolveEmbedsForActor(maps, 'region', OBSERVER_ACTOR);
		expect(obsEmbeds[0]!.kind).toBe('available');
	});

	it('a shared child is NOT exposed through a bare nesting transition (treated as hidden)', () => {
		const parent = makeMap('region', 'player-visible', [embed('e1', 'vault')]);
		const child = makeMap('vault', 'shared');
		const maps = mapsRecord(parent, child);
		const playerEmbeds = resolveEmbedsForActor(maps, 'region', PLAYER_ACTOR);
		expect(playerEmbeds[0]!.kind).toBe('unavailable');
	});

	it('only the DM may embed (a player command is rejected, fail closed)', () => {
		const parent = makeMap('region', 'player-visible');
		const child = makeMap('city', 'player-visible');
		const state = stateWith(parent, child);
		const result = rejected(
			dispatchCommand(state, makeEnvironment(), {
				type: 'map.embed-child',
				actorId: PLAYER_ACTOR.id,
				payload: {
					parentMapId: 'region',
					childMapId: 'city',
					transform: IDENTITY_TRANSFORM,
				},
			} satisfies CoreCommand),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('the embed/update/remove lifecycle round-trips and never deletes the child', () => {
		const parent = makeMap('region', 'player-visible');
		const child = makeMap('city', 'player-visible');
		const env = makeEnvironment();
		let state = stateWith(parent, child);

		const embedded = accept(
			dispatchCommand(state, env, {
				type: 'map.embed-child',
				actorId: DM_ACTOR.id,
				payload: { parentMapId: 'region', childMapId: 'city', transform: IDENTITY_TRANSFORM },
			} satisfies CoreCommand),
		);
		state = embedded.nextState;
		const embedId = state.maps.maps.region!.embeds[0]!.id;

		const updated = accept(
			dispatchCommand(state, env, {
				type: 'map.update-embed',
				actorId: DM_ACTOR.id,
				payload: {
					parentMapId: 'region',
					embedId,
					transform: { position: { x: 0.1, y: 0.1 }, scale: 0.2, rotationDegrees: 5 },
				},
			} satisfies CoreCommand),
		);
		state = updated.nextState;
		expect(state.maps.maps.region!.embeds[0]!.transform.scale).toBe(0.2);

		const removed = accept(
			dispatchCommand(state, env, {
				type: 'map.remove-embed',
				actorId: DM_ACTOR.id,
				payload: { parentMapId: 'region', embedId },
			} satisfies CoreCommand),
		);
		state = removed.nextState;
		expect(state.maps.maps.region!.embeds).toHaveLength(0);
		// child map still exists.
		expect(state.maps.maps.city).toBeDefined();
	});

	it('a cycle is rejected at the COMMAND layer with the nesting-cycle code', () => {
		const a = makeMap('a', 'player-visible', [embed('e-ab', 'b')]);
		const b = makeMap('b', 'player-visible');
		const state = stateWith(a, b);
		const result = rejected(
			dispatchCommand(state, makeEnvironment(), {
				type: 'map.embed-child',
				actorId: DM_ACTOR.id,
				payload: { parentMapId: 'b', childMapId: 'a', transform: IDENTITY_TRANSFORM },
			} satisfies CoreCommand),
		);
		expect(result.rejection.code).toBe('nesting-cycle');
		// fail closed: nothing mutated.
		expect(result.nextState.maps.maps.b!.embeds).toHaveLength(0);
	});

	it('embedding a missing child is rejected fail-closed (map-not-found)', () => {
		const parent = makeMap('region', 'player-visible');
		const state = stateWith(parent);
		const result = rejected(
			dispatchCommand(state, makeEnvironment(), {
				type: 'map.embed-child',
				actorId: DM_ACTOR.id,
				payload: { parentMapId: 'region', childMapId: 'ghost', transform: IDENTITY_TRANSFORM },
			} satisfies CoreCommand),
		);
		expect(result.rejection.code).toBe('map-not-found');
	});

	it('an invalid transform (zero scale) is rejected fail-closed', () => {
		const parent = makeMap('region', 'player-visible');
		const child = makeMap('city', 'player-visible');
		const state = stateWith(parent, child);
		const result = rejected(
			dispatchCommand(state, makeEnvironment(), {
				type: 'map.embed-child',
				actorId: DM_ACTOR.id,
				payload: {
					parentMapId: 'region',
					childMapId: 'city',
					transform: { position: { x: 0, y: 0 }, scale: 0, rotationDegrees: 0 },
				},
			} satisfies CoreCommand),
		);
		expect(result.rejection.code).toBe('invalid-payload');
	});
});

// ===========================================================================
// MAP-017 AC3 — broken/hidden child surfaces as a generic, non-leaking unavailable
// ===========================================================================
describe('MAP-017 AC3 broken/hidden child non-leak', () => {
	it('a DELETED child (dangling reference) is a generic unavailable that names nothing', () => {
		// The parent references a child that is not in state at all.
		const parent = makeMap('region', 'player-visible', [embed('e1', 'gone')]);
		const maps = mapsRecord(parent);
		for (const actor of [DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR]) {
			const resolved = resolveEmbedsForActor(maps, 'region', actor);
			expect(resolved[0]!.kind).toBe('unavailable');
			const serialized = JSON.stringify(resolved[0]);
			expect(serialized).not.toContain('gone'); // child id never appears
		}
	});

	it('a hidden child and a missing child produce an IDENTICAL message for a player (indistinguishable)', () => {
		const parentHidden = makeMap('rh', 'player-visible', [embed('e1', 'secret')]);
		const secret = makeMap('secret', 'dm-only');
		const parentMissing = makeMap('rm', 'player-visible', [embed('e2', 'gone')]);

		const hidden = resolveEmbedsForActor(mapsRecord(parentHidden, secret), 'rh', PLAYER_ACTOR)[0]!;
		const missing = resolveEmbedsForActor(mapsRecord(parentMissing), 'rm', PLAYER_ACTOR)[0]!;
		expect(hidden.kind).toBe('unavailable');
		expect(missing.kind).toBe('unavailable');
		if (hidden.kind === 'unavailable' && missing.kind === 'unavailable') {
			// Same generic user-facing message; same diagnostic bucket for a non-DM (both `hidden`).
			expect(hidden.message).toBe(missing.message);
			expect(hidden.reason).toBe('hidden');
			expect(missing.reason).toBe('hidden');
		}
	});

	it('the DM gets a distinct diagnostic bucket (missing) but still no name leak, since none exists', () => {
		const parent = makeMap('region', 'player-visible', [embed('e1', 'gone')]);
		const resolved = resolveEmbedsForActor(mapsRecord(parent), 'region', DM_ACTOR)[0]!;
		expect(resolved.kind).toBe('unavailable');
		if (resolved.kind === 'unavailable') expect(resolved.reason).toBe('missing');
	});

	it('an unknown actor sees every embed as unavailable (fail closed)', () => {
		const parent = makeMap('region', 'player-visible', [embed('e1', 'city')]);
		const city = makeMap('city', 'player-visible');
		const resolved = resolveEmbedsForActor(mapsRecord(parent, city), 'region', undefined);
		expect(resolved[0]!.kind).toBe('unavailable');
	});
});

// ===========================================================================
// MAP-009 — spatial transition within visible data
// ===========================================================================
describe('MAP-009 spatial transition', () => {
	it('AC1: zooming past the threshold transitions into a visible child and clamps the child viewport', () => {
		const parent = makeMap('region', 'player-visible', [
			embed('e1', 'city', { position: { x: 0.5, y: 0.2 }, scale: 0.3 }),
		]);
		const city = makeMap('city', 'player-visible');
		const maps = mapsRecord(parent, city);
		// A viewport zoomed in tight enough that the child footprint (scale 0.3) fills > threshold (0.5)
		// of the viewport span (0.3): 0.3 / 0.3 = 1.0 >= 0.5.
		const viewport = { x: 0.5, y: 0.18, w: 0.3, h: 0.3 };
		const transition = computeTransitionIntoChild(maps, 'region', 'e1', viewport, PLAYER_ACTOR);
		expect(transition.kind).toBe('transition');
		if (transition.kind === 'transition') {
			expect(transition.direction).toBe('into-child');
			expect(transition.childMapId).toBe('city');
			// the target viewport is clamped to [0,1]
			expect(transition.targetViewport.x).toBeGreaterThanOrEqual(0);
			expect(transition.targetViewport.y).toBeGreaterThanOrEqual(0);
			expect(transition.targetViewport.x + transition.targetViewport.w).toBeLessThanOrEqual(
				1 + 1e-9,
			);
			expect(transition.targetViewport.y + transition.targetViewport.h).toBeLessThanOrEqual(
				1 + 1e-9,
			);
		}
	});

	it('below the threshold no transition fires', () => {
		const parent = makeMap('region', 'player-visible', [
			embed('e1', 'city', { position: { x: 0.5, y: 0.2 }, scale: 0.3 }),
		]);
		const city = makeMap('city', 'player-visible');
		const maps = mapsRecord(parent, city);
		// A wide viewport (span 1.0): child fill = 0.3 / 1.0 = 0.3 < threshold 0.5.
		const transition = computeTransitionIntoChild(
			maps,
			'region',
			'e1',
			{ x: 0, y: 0, w: 1, h: 1 },
			PLAYER_ACTOR,
		);
		expect(transition.kind).toBe('none');
	});

	it('AC2: a transition into a hidden child is BLOCKED with a generic unavailable (no name leak)', () => {
		const parent = makeMap('region', 'player-visible', [
			embed('e1', 'secret', { position: { x: 0.5, y: 0.2 }, scale: 0.3 }),
		]);
		const secret = makeMap('secret', 'dm-only');
		const maps = mapsRecord(parent, secret);
		const viewport = { x: 0.5, y: 0.18, w: 0.3, h: 0.3 };
		const transition = computeTransitionIntoChild(maps, 'region', 'e1', viewport, PLAYER_ACTOR);
		expect(transition.kind).toBe('unavailable');
		const serialized = JSON.stringify(transition);
		expect(serialized).not.toContain('secret');
		// The DM, by contrast, CAN transition into the same child.
		const dmTransition = computeTransitionIntoChild(maps, 'region', 'e1', viewport, DM_ACTOR);
		expect(dmTransition.kind).toBe('transition');
	});

	it('the parent↔child round-trip preserves the world area (into-child then to-parent)', () => {
		const transform = { position: { x: 0.4, y: 0.3 }, scale: 0.25, rotationDegrees: 0 };
		const parent = makeMap('region', 'player-visible', [embed('e1', 'city', transform)]);
		const city = makeMap('city', 'player-visible');
		const maps = mapsRecord(parent, city);
		// pick a parent viewport fully inside the child footprint so the inverse stays in-bounds.
		const parentViewport = { x: 0.45, y: 0.35, w: 0.1, h: 0.1 };
		const into = computeTransitionIntoChild(maps, 'region', 'e1', parentViewport, DM_ACTOR);
		expect(into.kind).toBe('transition');
		if (into.kind !== 'transition') return;
		const back = computeTransitionToParent(maps, 'region', 'e1', into.targetViewport);
		expect(back.kind).toBe('transition');
		if (back.kind !== 'transition') return;
		// Round-trip returns to (approximately) the original parent viewport.
		expect(approxEqual(back.targetViewport.x, parentViewport.x, 1e-9)).toBe(true);
		expect(approxEqual(back.targetViewport.y, parentViewport.y, 1e-9)).toBe(true);
		expect(approxEqual(back.targetViewport.w, parentViewport.w, 1e-9)).toBe(true);
		expect(approxEqual(back.targetViewport.h, parentViewport.h, 1e-9)).toBe(true);
	});

	it('an unknown actor cannot transition (fail closed)', () => {
		const parent = makeMap('region', 'player-visible', [
			embed('e1', 'city', { position: { x: 0.5, y: 0.2 }, scale: 0.3 }),
		]);
		const city = makeMap('city', 'player-visible');
		const maps = mapsRecord(parent, city);
		const transition = computeTransitionIntoChild(
			maps,
			'region',
			'e1',
			{ x: 0.5, y: 0.18, w: 0.3, h: 0.3 },
			undefined,
		);
		expect(transition.kind).toBe('unavailable');
	});
});

// ===========================================================================
// pure reducers
// ===========================================================================
describe('map-nesting pure reducers', () => {
	it('addEmbed appends without mutating the input', () => {
		const parent = makeMap('a', 'player-visible', [embed('e0', 'x')]);
		const before = parent.embeds.length;
		const next = addEmbed(parent, {
			parentMapId: 'a',
			embedId: 'e1',
			childMapId: 'b',
			transform: IDENTITY_TRANSFORM,
			transitionBehavior: 'instant',
			transitionThreshold: 0.7,
		});
		expect(parent.embeds.length).toBe(before); // input untouched
		expect(next).toHaveLength(before + 1);
		expect(next[before]!.childMapId).toBe('b');
		expect(next[before]!.transitionBehavior).toBe('instant');
	});

	it('updateEmbed rejects an unknown embed id and an invalid transform', () => {
		const parent = makeMap('a', 'player-visible', [embed('e0', 'x')]);
		const missing = updateEmbed(parent, 'nope', { transitionBehavior: 'fade' });
		expect('error' in missing && missing.error.kind).toBe('embed-not-found');
		const bad = updateEmbed(parent, 'e0', {
			transform: { position: { x: 0, y: 0 }, scale: -1, rotationDegrees: 0 },
		});
		expect('error' in bad && bad.error.kind).toBe('invalid-transform');
	});

	it('removeEmbed removes a known embed and rejects an unknown embed id', () => {
		const parent = makeMap('a', 'player-visible', [embed('e0', 'x'), embed('e1', 'y')]);
		const removed = removeEmbed(parent, 'e0');
		expect('embeds' in removed && removed.embeds.map((e) => e.id)).toEqual(['e1']);
		const missing = removeEmbed(parent, 'nope');
		expect('error' in missing && missing.error.kind).toBe('embed-not-found');
	});
});
