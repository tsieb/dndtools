import {
	addMapFeaturesInputSchema,
	deriveMapFeaturesInputSchema,
	generateMapInputSchema,
	removeMapFeaturesInputSchema,
	restoreMapLayersInputSchema,
	updateMapFeaturesInputSchema,
} from '../schemas/commands';
import type { MapEntity, MapFeature, MapLayer, MapState } from '../state/map-state';
import { normalizeMapLayer } from '../state/map-state';
import {
	addFeatures,
	removeFeatures,
	updateFeatures,
	type MapFeatureBatchError,
} from '../state/map-editing';
import type { MapLayerMutationKind } from '../state/map-layers';
import type { MapPoi } from '../state/map-annotations';
import { createRngStreams } from '../state/prng';
import { getGenerator } from '../generation/registry';
import { resolveParams, type GeneratorContext, type GeneratorOutput } from '../generation/types';
import { deriveAll, featureRing, type DeriveOptions } from '../generation/derive';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';
import type {
	CommandRejection,
	CommandResult,
	CoreEnvironment,
	CoreEvent,
	CoreStateSlice,
} from './types';

/**
 * MAP-021 — the bridge between the generator fleet and the map editor.
 *
 * Six DM-only commands, all built on the same five-step shape as every other map command (parse →
 * preamble → pure reducer → error table → shared commit tail), and all appending exactly ONE durable op:
 *
 *   `map.add-features` / `map.update-features` / `map.remove-features` — INCREMENTAL editing. The op
 *   carries only the DELTA. `map.edit-layer` (MAP-003) carries the layer's entire before AND after
 *   content in both the payload and the op value, which is fine for a small hand-drawn layer and a
 *   scaling failure on a generated one: a single brush stroke on a 5,000-feature layer writes 10,000
 *   features into the op log. `map.edit-layer` is unchanged — the two paths coexist.
 *
 *   `map.generate` — REGISTRY-DRIVEN generation. The op records `{generatorId, generatorVersion, seed,
 *   params}` and NOT the geometry. That is the whole point of determinism: a replaying device re-runs
 *   the generator and gets byte-identical layers, so the op stays ~200 bytes whether the run produced 12
 *   features or 12,000. The recorded VERSION is the guard on that promise — see the replay note below.
 *
 *   `map.derive-features` — AUTO-DERIVATION. Walls/doors/lights fall out of the floor-polygon union, so
 *   every generator's (and every hand-drawn) floor set becomes VTT-exportable with working
 *   line-of-sight, for free.
 *
 *   `map.restore-layers` — the durable LAYER-SET RESTORE that several inverses land on (see
 *   `lifecycle/map-undo.ts`). It removes named layers, upserts supplied layer snapshots, and re-applies
 *   an explicit order map — because a delete-layer repacks every other layer's order, and undoing it
 *   has to put that back exactly.
 */

const FEATURE_ERROR_TO_REJECTION: Record<MapFeatureBatchError['kind'], CommandRejection['code']> = {
	'layer-not-found': 'invalid-state',
	// A locked layer is an AUTHORITY failure, not a payload one — same mapping `map.edit-layer` uses.
	'layer-locked': 'actor-not-authorized',
	'feature-not-found': 'invalid-state',
	'duplicate-feature': 'invalid-state',
	'batch-too-large': 'payload-too-large',
	'invalid-content': 'invalid-payload',
};

function rejectFeatureError(error: MapFeatureBatchError, state: CoreStateSlice): CommandResult {
	const code = FEATURE_ERROR_TO_REJECTION[error.kind];
	const message =
		'message' in error
			? error.message
			: error.kind === 'layer-not-found'
				? `Layer ${error.layerId} does not exist on this map.`
				: error.kind === 'layer-locked'
					? `Layer ${error.layerId} is locked and rejects this edit. Unlock it first.`
					: error.kind === 'feature-not-found'
						? `Feature ${error.featureId} does not exist on this layer.`
						: `Feature ${error.featureId} already exists on this layer.`;
	return reject({ code, message }, state);
}

function requireMap(state: CoreStateSlice, mapId: string): MapEntity | CommandRejection {
	const map = state.maps.maps[mapId];
	if (!map) return { code: 'map-not-found', message: `Map ${mapId} does not exist.` };
	return map;
}

/** Resolve actor (DM) + map up front; every command in this module shares this preamble. */
function preamble(
	state: CoreStateSlice,
	actorId: string,
	mapId: string,
): { actorId: string; map: MapEntity } | { rejection: CommandResult } {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return { rejection: reject(actor, state) };
	const dmCheck = requireDm(actor);
	if (dmCheck) return { rejection: reject(dmCheck, state) };
	const map = requireMap(state, mapId);
	if ('code' in map) return { rejection: reject(map, state) };
	return { actorId: actor.id, map };
}

interface CommitPatch {
	layers: MapLayer[];
	pois?: MapPoi[];
	regions?: MapEntity['regions'];
}

/**
 * The shared tail: write the patched map back, bump the MAP revision, append ONE durable op, emit the
 * events. Identical in shape to `commitMapEditing` / `commitLayers` / `commitMap` — the map revision is
 * the conflict anchor, the layer revision (bumped by the pure reducer) is the per-layer one.
 */
function commitFeatures(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	map: MapEntity,
	patch: CommitPatch,
	op: { opType: string; path: string; value: unknown },
	events: CoreEvent[],
): CommandResult {
	const now = env.clock();
	const nextMap: MapEntity = {
		...map,
		...patch,
		updatedAt: now,
		revision: map.revision + 1,
	};
	const nextMaps: MapState = { ...state.maps, maps: { ...state.maps.maps, [map.id]: nextMap } };
	const { log: nextLog, op: appended } = appendOperationDraft(env, state.sync, actorId, {
		entityType: 'map',
		entityId: map.id,
		opType: op.opType,
		path: op.path,
		value: op.value,
		beforeRevision: map.revision,
		afterRevision: nextMap.revision,
	});
	return {
		status: 'accepted',
		nextState: { ...state, maps: nextMaps, sync: nextLog },
		events,
		operationIds: [appended.id],
	};
}

function layerChanged(
	mapId: string,
	layerId: string,
	mutation: MapLayerMutationKind,
	actorId: string,
): CoreEvent {
	return { kind: 'map.layer-changed', mapId, layerId, mutation, actorId };
}

// ---------------------------------------------------------------------------
// A. Incremental feature commands (MAP-021)
// ---------------------------------------------------------------------------

/**
 * MAP-021: ADD features to a layer. The durable op carries ONLY the added features — never the layer's
 * existing content. This is the command the paint tools and the "drop a prop" tools dispatch.
 */
export function handleAddMapFeatures(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(addMapFeaturesInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = preamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;

	const result = addFeatures(
		pre.map.layers,
		{
			layerId: parsed.data.layerId,
			features: parsed.data.features as MapFeature[],
			indices: parsed.data.indices,
		},
		{ actorId: pre.actorId, now: env.clock() },
	);
	if ('error' in result) return rejectFeatureError(result.error, state);

	return commitFeatures(
		state,
		env,
		pre.actorId,
		pre.map,
		{ layers: result.layers },
		{
			opType: 'map.layer.add-features',
			path: `layers/${parsed.data.layerId}/content`,
			// THE DELTA, and nothing else. The op is replayable (apply the same features by id) and
			// invertible (remove the same ids) without carrying a single pre-existing feature.
			value: {
				mutation: 'add-features',
				layerId: parsed.data.layerId,
				features: result.added,
				...(parsed.data.indices ? { indices: parsed.data.indices } : {}),
			},
		},
		[layerChanged(pre.map.id, parsed.data.layerId, 'add-features', pre.actorId)],
	);
}

/**
 * MAP-021: UPDATE features in place, matched by id. The op carries only the new values; the PRIOR values
 * are recovered from the state-before by `buildMapInverse`, so the forward op stays a pure delta.
 */
export function handleUpdateMapFeatures(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(updateMapFeaturesInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = preamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;

	const result = updateFeatures(
		pre.map.layers,
		{ layerId: parsed.data.layerId, features: parsed.data.features as MapFeature[] },
		{ actorId: pre.actorId, now: env.clock() },
	);
	if ('error' in result) return rejectFeatureError(result.error, state);

	return commitFeatures(
		state,
		env,
		pre.actorId,
		pre.map,
		{ layers: result.layers },
		{
			opType: 'map.layer.update-features',
			path: `layers/${parsed.data.layerId}/content`,
			value: {
				mutation: 'update-features',
				layerId: parsed.data.layerId,
				features: result.updated,
			},
		},
		[layerChanged(pre.map.id, parsed.data.layerId, 'update-features', pre.actorId)],
	);
}

/**
 * MAP-021: REMOVE features by id. The op carries the removed features AND the indices they occupied —
 * that is what gives the op an INVERSE without replaying the layer from zero (the inverse is
 * `map.add-features` splicing them back in at those indices, restoring the exact array).
 */
export function handleRemoveMapFeatures(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(removeMapFeaturesInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = preamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;

	const result = removeFeatures(
		pre.map.layers,
		{ layerId: parsed.data.layerId, featureIds: parsed.data.featureIds },
		{ actorId: pre.actorId, now: env.clock() },
	);
	if ('error' in result) return rejectFeatureError(result.error, state);

	return commitFeatures(
		state,
		env,
		pre.actorId,
		pre.map,
		{ layers: result.layers },
		{
			opType: 'map.layer.remove-features',
			path: `layers/${parsed.data.layerId}/content`,
			value: {
				mutation: 'remove-features',
				layerId: parsed.data.layerId,
				featureIds: parsed.data.featureIds,
				// The removed features + their indices: the op's own inverse material.
				removed: result.removed.map((entry) => entry.feature),
				removedIndices: result.removed.map((entry) => entry.index),
			},
		},
		[layerChanged(pre.map.id, parsed.data.layerId, 'remove-features', pre.actorId)],
	);
}

// ---------------------------------------------------------------------------
// B. Registry-driven generation (MAP-021)
// ---------------------------------------------------------------------------

/**
 * MAP-021: run a REGISTERED generator and insert its output.
 *
 * Fail-closed, in order, BEFORE any mutation: an unknown generator id; a version mismatch on a replay; a
 * parameter the generator's own `ParamSpec` rejects (the offending `paramId` rides the message); a
 * replace-target that does not exist or is locked; a generated layer id that collides with an existing
 * layer. A rejected run persists nothing partial (the MAP-004 AC2 contract).
 *
 * THE DURABLE OP CARRIES NO GEOMETRY. It records `{generatorId, generatorVersion, seed, params,
 * idPrefix, visibility}` plus the ids it created — the generated layers are re-derived by replaying the
 * generator, which is byte-identical by construction (`createRngStreams` draws only from the seed, and
 * every coordinate is rounded through `norm`). The `generatorVersion` is what keeps that honest: a
 * generator whose PRNG call order changed bumps its `version`, and a replay that supplies the RECORDED
 * version against a bumped definition is REJECTED (`generator-version-mismatch`) rather than silently
 * producing a different map.
 */
export function handleGenerateMap(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(generateMapInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = preamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;

	const definition = getGenerator(parsed.data.generatorId);
	if (!definition) {
		return reject(
			{
				code: 'generator-not-found',
				message: `No generator is registered under id "${parsed.data.generatorId}".`,
			},
			state,
		);
	}

	// REPLAY GUARD (see the doc comment): a recorded version that no longer matches the shipped
	// generator means the replay would produce DIFFERENT geometry. Say so; never fabricate a map.
	if (
		parsed.data.generatorVersion !== undefined &&
		parsed.data.generatorVersion !== definition.version
	) {
		return reject(
			{
				code: 'generator-version-mismatch',
				message: `Generator "${definition.id}" is at version ${definition.version}; this operation recorded version ${parsed.data.generatorVersion}. Its output is no longer reproducible — re-run it to regenerate the layers.`,
			},
			state,
		);
	}

	// The generator's OWN declared `ParamSpec[]` is the single source of truth for its knobs (the schema
	// deliberately does not re-declare them). A bad value names the offending knob rather than failing
	// with a generic "invalid payload" — the DM is told which slider was wrong.
	const resolved = resolveParams(definition, parsed.data.params);
	if ('error' in resolved) {
		return reject(
			{
				code: 'invalid-payload',
				message: `${resolved.error.message} (parameter "${resolved.error.paramId}")`,
				issues: [{ path: resolved.error.paramId, message: resolved.error.message }],
			},
			state,
		);
	}

	// Which existing layers this run REPLACES (a re-roll in place). Ambiguity is rejected rather than
	// resolved: naming targets without `replace: true` is a mistake, and silently ignoring them would
	// leave the DM with two copies of their dungeon.
	const targetLayerIds = parsed.data.targetLayerIds ?? [];
	if (!parsed.data.replace && targetLayerIds.length > 0) {
		return reject(
			{
				code: 'invalid-payload',
				message: 'Set `replace: true` to replace the target layers, or omit `targetLayerIds`.',
			},
			state,
		);
	}
	const replaced: MapLayer[] = [];
	for (const layerId of targetLayerIds) {
		const layer = pre.map.layers.find((candidate) => candidate.id === layerId);
		if (!layer) {
			return reject(
				{ code: 'invalid-state', message: `Layer ${layerId} does not exist on this map.` },
				state,
			);
		}
		if (layer.locked) {
			return reject(
				{
					code: 'actor-not-authorized',
					message: `Layer ${layerId} is locked and cannot be replaced. Unlock it first.`,
				},
				state,
			);
		}
		replaced.push(layer);
	}

	const now = env.clock();
	const ctx: GeneratorContext = {
		params: resolved.params,
		rng: createRngStreams(parsed.data.seed),
		idPrefix: parsed.data.idPrefix,
		visibility: parsed.data.visibility,
		stamp: { actorId: pre.actorId, now },
	};
	const output: GeneratorOutput = definition.run(ctx);

	const survivors = pre.map.layers.filter((layer) => !targetLayerIds.includes(layer.id));
	const existingIds = new Set(survivors.map((layer) => layer.id));
	const collision = output.layers.find((layer) => existingIds.has(layer.id));
	if (collision) {
		return reject(
			{
				code: 'invalid-state',
				message: `Generated layer id "${collision.id}" already exists on this map. Use a fresh id prefix.`,
			},
			state,
		);
	}

	// Append the generated layers after the survivors, preserving dense order.
	const baseOrder = survivors.length;
	const generatedLayers = output.layers.map((layer, index) =>
		normalizeMapLayer({ ...layer, order: baseOrder + index }, baseOrder + index),
	);
	const nextLayers = [...survivors, ...generatedLayers];

	// The generator's POIs become REAL `MapPoi` records (independently visible, filtered by the same
	// actor-filtered map query as any hand-placed POI), not a parallel shadow list only the generator
	// understands. They are stamped with the run's visibility, which fails closed to `dm-only`.
	const generatedPois: MapPoi[] = (output.pois ?? []).map((poi) => ({
		id: poi.id,
		layerId: generatedLayers[0]?.id ?? '',
		label: poi.label,
		category: poi.category,
		position: { x: poi.position.x, y: poi.position.y },
		visibility: parsed.data.visibility,
		notes: poi.notes,
		linkedEntityType: null,
		linkedEntityId: null,
		revision: 1,
		updatedBy: pre.actorId,
		updatedAt: now,
	}));
	const poiCollision = generatedPois.find((poi) =>
		pre.map.pois.some((existing) => existing.id === poi.id),
	);
	if (poiCollision) {
		return reject(
			{
				code: 'invalid-state',
				message: `Generated POI id "${poiCollision.id}" already exists on this map. Use a fresh id prefix.`,
			},
			state,
		);
	}

	const events: CoreEvent[] = [
		layerChanged(pre.map.id, generatedLayers[0]?.id ?? '', 'generate', pre.actorId),
		...generatedPois.map(
			(poi): CoreEvent => ({
				kind: 'map.poi-changed',
				mapId: pre.map.id,
				poiId: poi.id,
				mutation: 'create',
				actorId: pre.actorId,
			}),
		),
	];

	return commitFeatures(
		state,
		env,
		pre.actorId,
		pre.map,
		{ layers: nextLayers, pois: [...pre.map.pois, ...generatedPois] },
		{
			opType: 'map.generate',
			path: 'layers',
			value: {
				mutation: 'generate',
				generatorId: definition.id,
				generatorVersion: definition.version,
				seed: parsed.data.seed,
				params: resolved.params,
				idPrefix: parsed.data.idPrefix,
				visibility: parsed.data.visibility,
				// Ids only — the geometry is REPLAYED, never transported.
				generatedLayerIds: generatedLayers.map((layer) => layer.id),
				generatedPoiIds: generatedPois.map((poi) => poi.id),
				replacedLayerIds: replaced.map((layer) => layer.id),
				// The generator's non-geometric by-products: keyed-room text, the connectivity graph (the
				// entrance/boss/chokepoint structure a DM keys the dungeon from), and the run summary.
				...(output.notes ? { notes: output.notes } : {}),
				...(output.graph ? { graph: output.graph } : {}),
				...(output.summary ? { summary: output.summary } : {}),
			},
		},
		events,
	);
}

// ---------------------------------------------------------------------------
// C. Auto-derivation (MAP-021)
// ---------------------------------------------------------------------------

/** Which feature kinds are FLOOR (contribute area to the union) vs ROOM vs CORRIDOR (centrelines). */
function isRoomFeature(feature: MapFeature): boolean {
	return (
		(feature.kind === 'room' || feature.kind === 'fill' || feature.kind === 'polygon') &&
		featureRing(feature) !== null
	);
}

function isCorridorFeature(feature: MapFeature): boolean {
	return feature.kind === 'stroke' || feature.kind === 'road';
}

/**
 * MAP-021: DERIVE walls / doors / lights from the floor geometry on the source layers and write them
 * onto a target layer (created when absent).
 *
 * This is what makes every generator's output VTT-exportable and gives line-of-sight for free: the
 * boundary of the floor-polygon union IS the wall set, a corridor meeting a room IS a doorway, and the
 * torches belong on the walls. The generators emit floors only and know nothing about any of it.
 *
 * Determinism: the doors/lights draw ONLY from `createRngStreams(seed).stream('derive')`; the walls are
 * a pure function of the floors. Two devices deriving from the same layers with the same seed produce
 * byte-identical features.
 */
export function handleDeriveMapFeatures(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(deriveMapFeaturesInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = preamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;

	// Collect the floors. A source layer that does not exist is a rejection, not a silent skip — a
	// derivation that quietly read three of four layers would produce a map with a hole in its walls.
	const floors: MapFeature[] = [];
	for (const layerId of parsed.data.sourceLayerIds) {
		const layer = pre.map.layers.find((candidate) => candidate.id === layerId);
		if (!layer) {
			return reject(
				{ code: 'invalid-state', message: `Layer ${layerId} does not exist on this map.` },
				state,
			);
		}
		floors.push(...layer.content);
	}
	const rooms = floors.filter(isRoomFeature);
	const corridors = floors.filter(isCorridorFeature);
	if (rooms.length === 0 && corridors.length === 0) {
		return reject(
			{
				code: 'invalid-state',
				message:
					'The source layers hold no floor geometry (rooms, polygons, or corridor centrelines). Nothing to derive.',
			},
			state,
		);
	}

	const options: DeriveOptions = {
		...parsed.data.options,
		idPrefix: parsed.data.idPrefix,
		placeDoors: parsed.data.doors,
		placeLights: parsed.data.lights,
	};
	const rng = createRngStreams(parsed.data.seed).stream('derive');
	const derived = deriveAll({ floors, corridors, rooms }, rng, options);

	const features: MapFeature[] = [
		...(parsed.data.walls ? derived.walls : []),
		...derived.doors,
		...derived.lights,
	];
	if (features.length === 0) {
		return reject(
			{
				code: 'invalid-state',
				message: 'The derivation produced no features. Enable walls, doors, or lights.',
			},
			state,
		);
	}

	const now = env.clock();
	const stamp = { actorId: pre.actorId, now };

	// Target: an existing layer (features are APPENDED to it — an id collision rejects fail-closed, so
	// re-deriving with the same id prefix can never silently double the wall set) or a fresh one.
	const targetLayerId = parsed.data.targetLayerId;
	if (targetLayerId) {
		const result = addFeatures(pre.map.layers, { layerId: targetLayerId, features }, stamp);
		if ('error' in result) return rejectFeatureError(result.error, state);
		return commitDerived(
			state,
			env,
			pre.actorId,
			pre.map,
			result.layers,
			targetLayerId,
			false,
			parsed.data,
			derived,
		);
	}

	const createdLayerId = `${parsed.data.idPrefix}-derived`;
	if (pre.map.layers.some((layer) => layer.id === createdLayerId)) {
		return reject(
			{
				code: 'invalid-state',
				message: `Layer "${createdLayerId}" already exists on this map. Use a fresh id prefix, or target it explicitly.`,
			},
			state,
		);
	}
	const created = normalizeMapLayer(
		{
			id: createdLayerId,
			name: 'Derived (walls, doors, lights)',
			category: 'base',
			visibility: parsed.data.visibility,
			enabled: true,
			opacity: 1,
			content: features,
			updatedBy: pre.actorId,
			updatedAt: now,
		},
		pre.map.layers.length,
	);
	return commitDerived(
		state,
		env,
		pre.actorId,
		pre.map,
		[...pre.map.layers, created],
		createdLayerId,
		true,
		parsed.data,
		derived,
	);
}

function commitDerived(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	map: MapEntity,
	layers: MapLayer[],
	targetLayerId: string,
	layerCreated: boolean,
	payload: { sourceLayerIds: string[]; seed: number | string; idPrefix: string },
	derived: { walls: MapFeature[]; doors: MapFeature[]; lights: MapFeature[] },
): CommandResult {
	return commitFeatures(
		state,
		env,
		actorId,
		map,
		{ layers },
		{
			opType: 'map.layer.derive',
			path: `layers/${targetLayerId}/content`,
			// Like `map.generate`, the derivation is a pure function of state the op already names, so the
			// op records the INPUTS (source layers + seed + prefix) and the feature IDS, never the geometry.
			value: {
				mutation: 'derive',
				layerId: targetLayerId,
				layerCreated,
				sourceLayerIds: payload.sourceLayerIds,
				seed: payload.seed,
				idPrefix: payload.idPrefix,
				featureIds: [...derived.walls, ...derived.doors, ...derived.lights].map(
					(feature) => feature.id,
				),
				counts: {
					walls: derived.walls.length,
					doors: derived.doors.length,
					lights: derived.lights.length,
				},
			},
		},
		[layerChanged(map.id, targetLayerId, 'derive', actorId)],
	);
}

// ---------------------------------------------------------------------------
// D. The durable layer-set restore (the undo tail) — MAP-021
// ---------------------------------------------------------------------------

/**
 * MAP-021: remove the named layers, upsert the supplied layer snapshots, and re-apply the explicit
 * order map. DM-only; a LOCKED layer on either side rejects fail-closed (an undo may not quietly walk
 * through a lock the DM set).
 *
 * This is the inverse `buildMapInverse` returns for the mutations that are only exactly invertible at
 * layer granularity: `map.generate` (remove the generated layers, restore any it replaced),
 * `map.derive-features` (drop the created layer, or put the target layer's prior content back), and
 * `map.delete-layer` (restore the layer's whole content AND undo the order repack the delete applied to
 * every other layer). It carries only the layers it actually restores.
 */
export function handleRestoreMapLayers(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(restoreMapLayersInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = preamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;

	const now = env.clock();

	for (const layerId of parsed.data.removeLayerIds) {
		const layer = pre.map.layers.find((candidate) => candidate.id === layerId);
		if (!layer) {
			return reject(
				{ code: 'invalid-state', message: `Layer ${layerId} does not exist on this map.` },
				state,
			);
		}
		if (layer.locked) {
			return reject(
				{
					code: 'actor-not-authorized',
					message: `Layer ${layerId} is locked and cannot be removed. Unlock it first.`,
				},
				state,
			);
		}
	}
	for (const snapshot of parsed.data.restoreLayers) {
		const existing = pre.map.layers.find((candidate) => candidate.id === snapshot.id);
		if (existing?.locked) {
			return reject(
				{
					code: 'actor-not-authorized',
					message: `Layer ${snapshot.id} is locked and cannot be overwritten. Unlock it first.`,
				},
				state,
			);
		}
	}

	const removeIds = new Set(parsed.data.removeLayerIds);
	const restoredIds = new Set(parsed.data.restoreLayers.map((layer) => layer.id));
	const kept = pre.map.layers.filter(
		(layer) => !removeIds.has(layer.id) && !restoredIds.has(layer.id),
	);
	// A restored snapshot is written back VERBATIM (name/category/visibility/opacity/tags/query/locked/
	// content/order), with a fresh audit stamp and a bumped revision — the DATA returns exactly, and the
	// revision still moves forward, so the durable history never rewinds.
	const restored = parsed.data.restoreLayers.map((snapshot) =>
		normalizeMapLayer(
			{
				...(snapshot as MapLayer),
				revision: snapshot.revision + 1,
				updatedBy: actorId,
				updatedAt: now,
			},
			snapshot.order,
		),
	);
	const merged = [...kept, ...restored];
	if (merged.length === 0) {
		return reject(
			{ code: 'invalid-state', message: 'A map must keep at least one layer.' },
			state,
		);
	}

	const orderMap = parsed.data.order;
	const ordered = merged
		.map((layer) => ({ layer, order: orderMap?.[layer.id] ?? layer.order }))
		.sort((a, b) => a.order - b.order || a.layer.id.localeCompare(b.layer.id))
		// Repack densely so the order field stays a contiguous 0..n-1 sequence, exactly as every other
		// layer reducer leaves it.
		.map(({ layer }, index) => (layer.order === index ? layer : { ...layer, order: index }));

	// The POIs a generation planted alongside its layers. Undoing the generate is ONE act, so they go
	// with it — an undone dungeon must not leave its entrance marker floating on an empty map.
	const removePoiIds = new Set(parsed.data.removePoiIds);
	const restoredPoiIds = new Set(parsed.data.restorePois.map((poi) => poi.id));
	const keptPois = pre.map.pois.filter(
		(poi) => !removePoiIds.has(poi.id) && !restoredPoiIds.has(poi.id),
	);
	const restoredPois: MapPoi[] = parsed.data.restorePois.map((poi) => ({
		...(poi as MapPoi),
		position: { ...poi.position },
		revision: poi.revision + 1,
		updatedBy: pre.actorId,
		updatedAt: now,
	}));

	return commitFeatures(
		state,
		env,
		pre.actorId,
		pre.map,
		{ layers: ordered, pois: [...keptPois, ...restoredPois] },
		{
			opType: 'map.layer.restore',
			path: 'layers',
			value: {
				mutation: 'restore',
				removedLayerIds: parsed.data.removeLayerIds,
				restoredLayerIds: parsed.data.restoreLayers.map((layer) => layer.id),
				removedPoiIds: parsed.data.removePoiIds,
				restoredPoiIds: parsed.data.restorePois.map((poi) => poi.id),
			},
		},
		[
			layerChanged(
				pre.map.id,
				parsed.data.restoreLayers[0]?.id ?? parsed.data.removeLayerIds[0] ?? '',
				'restore',
				pre.actorId,
			),
		],
	);
}
