import type { MapEntity, MapFeature, MapLayer } from './map-state';
import { normalizeMapFeature } from './map-state';
import { findLayer } from './map-layers';

/**
 * MAP-003 — pure map-editing (draw/paint) reducers.
 *
 * Map editing is expressed as a content REPLACEMENT on a single layer: the command carries the
 * complete BEFORE content and the complete AFTER content of the affected layer. This is what makes a
 * paint edit simultaneously:
 *
 *   - UNDOABLE — the inverse is the same set-content operation with `before`/`after` swapped, so undo
 *     restores the captured before-state EXACTLY (deep-equal, MAP-003 AC1). The command-lifecycle
 *     inverse mapping reuses this (the inverse of `map.edit-layer` is `map.edit-layer`).
 *   - SYNC-REPLAYABLE — the committed durable op carries `before`/`after` so another device can apply
 *     the change and validate it (Contract 2: operations are replayable, idempotent, and carry enough
 *     to merge by layer/feature id). Re-applying the same after-content is idempotent.
 *
 * The reducer is a deterministic, side-effect-free transform over the layer's content array. The
 * command handler (`commands/map-editing.ts`) owns actor/lock gating, optimistic-concurrency
 * (before-content must match the layer's current content), and the durable op. This module owns only
 * the content math, so it is unit-testable in isolation.
 */

export type MapEditError =
	| { kind: 'layer-not-found'; layerId: string }
	| { kind: 'layer-locked'; layerId: string }
	| { kind: 'stale-before'; layerId: string; message: string }
	| { kind: 'invalid-content'; message: string };

export interface MapEditStamp {
	actorId: string;
	now: string;
}

/** Deep structural equality for a content array. Used for the optimistic-concurrency before-check and
 *  for proving an undo restored the EXACT prior content. Pure and allocation-light. */
export function featuresEqual(a: readonly MapFeature[], b: readonly MapFeature[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i += 1) {
		const fa = a[i]!;
		const fb = b[i]!;
		if (fa.id !== fb.id || fa.kind !== fb.kind || fa.style !== fb.style) return false;
		if (fa.points.length !== fb.points.length) return false;
		for (let p = 0; p < fa.points.length; p += 1) {
			const pa = fa.points[p]!;
			const pb = fb.points[p]!;
			if (pa.x !== pb.x || pa.y !== pb.y) return false;
		}
	}
	return true;
}

/** Defensive deep clone of a content array, so a returned layer never aliases the input. */
function cloneFeatures(features: readonly MapFeature[]): MapFeature[] {
	return features.map((feature) => ({
		...feature,
		points: feature.points.map((point) => ({ ...point })),
	}));
}

/**
 * Validate a single feature's shape: normalized coordinates in [0,1], non-empty point list. Narrowed to
 * the `invalid-content` member so both the wholesale (MAP-003) and the incremental (MAP-021) reducers
 * can share it without either one's error union having to admit the other's kinds.
 */
function validateContent(
	content: readonly MapFeature[],
): Extract<MapEditError, { kind: 'invalid-content' }> | null {
	for (const feature of content) {
		if (feature.points.length === 0) {
			return { kind: 'invalid-content', message: `Feature ${feature.id} has no points.` };
		}
		for (const point of feature.points) {
			if (
				!Number.isFinite(point.x) ||
				!Number.isFinite(point.y) ||
				point.x < 0 ||
				point.x > 1 ||
				point.y < 0 ||
				point.y > 1
			) {
				return {
					kind: 'invalid-content',
					message: `Feature ${feature.id} has a point outside normalized [0,1] map space.`,
				};
			}
		}
	}
	return null;
}

export interface ApplyLayerEditInput {
	layerId: string;
	/** The content the caller observed before editing (optimistic concurrency base). */
	before: MapFeature[];
	/** The complete content after the edit. Replaces the layer's content wholesale. */
	after: MapFeature[];
}

/**
 * MAP-003: replace a layer's content with `after`, having captured `before`. Fails closed when:
 *   - the layer does not exist,
 *   - the layer is locked (a locked layer rejects edits, mirroring MAP-005),
 *   - the layer's CURRENT content does not deep-equal the supplied `before` (a stale base — another
 *     edit landed first; surfaced so the GUI can re-read rather than silently clobber), or
 *   - the after-content is malformed (point outside normalized space / empty feature).
 *
 * On success the affected layer's content is the deep-cloned `after`, its revision is bumped, and its
 * audit fields are stamped. No other layer is touched.
 */
export function applyLayerEdit(
	layers: MapLayer[],
	input: ApplyLayerEditInput,
	stamp: MapEditStamp,
): { layers: MapLayer[] } | { error: MapEditError } {
	const layer = layers.find((candidate) => candidate.id === input.layerId);
	if (!layer) return { error: { kind: 'layer-not-found', layerId: input.layerId } };
	if (layer.locked) return { error: { kind: 'layer-locked', layerId: input.layerId } };
	if (!featuresEqual(layer.content, input.before)) {
		return {
			error: {
				kind: 'stale-before',
				layerId: input.layerId,
				message: 'The layer changed since this edit was started. Re-read the layer and retry.',
			},
		};
	}
	const invalid = validateContent(input.after);
	if (invalid) return { error: invalid };
	const nextLayers = layers.map((candidate) =>
		candidate.id === input.layerId
			? {
					...candidate,
					content: cloneFeatures(input.after),
					revision: candidate.revision + 1,
					updatedBy: stamp.actorId,
					updatedAt: stamp.now,
				}
			: candidate,
	);
	return { layers: nextLayers };
}

/** Read a layer's current content as the `before` base for the next edit. Empty for an unknown
 *  layer (the edit then fails closed on the stale-before check). */
export function layerContent(map: MapEntity, layerId: string): MapFeature[] {
	const layer = findLayer(map, layerId);
	return layer ? cloneFeatures(layer.content) : [];
}

/* ------------------------------------------------------------------------------------------------ */
/* MAP-021 — INCREMENTAL feature editing (add / update / remove)                                     */
/* ------------------------------------------------------------------------------------------------ */

/**
 * MAP-021 — the incremental counterpart of {@link applyLayerEdit}.
 *
 * `applyLayerEdit` (MAP-003) carries the layer's ENTIRE before AND after content, both in the command
 * payload and in the durable op value. That is correct — and it does not scale. The generator fleet
 * routinely emits thousands of features onto a layer, so one brush stroke on a 5,000-feature layer
 * writes 10,000 features into the op log. The three reducers below express the same edits as a DELTA:
 * the command (and therefore the durable op) carries only the features that actually changed.
 *
 * Everything else is unchanged from the MAP-003 contract: a locked layer rejects fail-closed (MAP-005),
 * geometry is validated in normalized [0,1] space, the layer revision bumps, and the edit is
 * REPLAYABLE by feature id on another device (Contract 2 — the merge unit has always been the feature
 * id, which is exactly what these ops carry).
 *
 * `map.edit-layer` keeps its whole-array semantics untouched: it is shipped, tested, and undoable, and
 * the two paths coexist (the wholesale edit is still the right shape for a small hand-drawn layer).
 */

/**
 * The per-command ceiling on how many features one incremental command may carry. A bound is required
 * (SEC-006): without it, a single command could drive an unbounded allocation through the op log. It is
 * generous enough for any real generator output (the largest shipped generator emits low thousands) and
 * fail-closed — a batch beyond it is REJECTED, never truncated (a silently truncated paint stroke is
 * worse than a refused one).
 */
export const MAX_FEATURE_BATCH = 20_000 as const;

export type MapFeatureBatchError =
	| { kind: 'layer-not-found'; layerId: string }
	| { kind: 'layer-locked'; layerId: string }
	/** An update/remove named a feature id the layer does not hold. Fail closed — never a silent no-op. */
	| { kind: 'feature-not-found'; featureId: string }
	/** An add would collide with an existing feature id, or the batch repeats an id. */
	| { kind: 'duplicate-feature'; featureId: string }
	| { kind: 'batch-too-large'; message: string }
	| { kind: 'invalid-content'; message: string };

/** A removed feature plus the index it occupied, so the inverse can restore the EXACT array order. */
export interface RemovedFeature {
	feature: MapFeature;
	index: number;
}

function checkBatch(count: number): MapFeatureBatchError | null {
	if (count === 0) {
		return { kind: 'invalid-content', message: 'The feature batch is empty; nothing to apply.' };
	}
	if (count > MAX_FEATURE_BATCH) {
		return {
			kind: 'batch-too-large',
			message: `A feature batch may carry at most ${MAX_FEATURE_BATCH} features (got ${count}). Split the edit.`,
		};
	}
	return null;
}

/** Resolve the target layer, rejecting a missing or LOCKED layer fail-closed (MAP-005). */
function requireEditableLayer(
	layers: readonly MapLayer[],
	layerId: string,
): MapLayer | MapFeatureBatchError {
	const layer = layers.find((candidate) => candidate.id === layerId);
	if (!layer) return { kind: 'layer-not-found', layerId };
	if (layer.locked) return { kind: 'layer-locked', layerId };
	return layer;
}

function withLayerContent(
	layers: MapLayer[],
	layerId: string,
	content: MapFeature[],
	stamp: MapEditStamp,
): MapLayer[] {
	return layers.map((candidate) =>
		candidate.id === layerId
			? {
					...candidate,
					content,
					revision: candidate.revision + 1,
					updatedBy: stamp.actorId,
					updatedAt: stamp.now,
				}
			: candidate,
	);
}

export interface AddFeaturesInput {
	layerId: string;
	features: MapFeature[];
	/**
	 * Optional insertion index per feature, aligned with `features`. Absent ⇒ the batch is APPENDED.
	 * Present ⇒ each feature is spliced in at its index, applied in ascending index order — which is
	 * exactly what restores the original array when undoing a `map.remove-features` (the removed
	 * features' original indices are replayed back in).
	 */
	indices?: number[] | null;
}

/**
 * MAP-021: ADD features to a layer. Rejects, fail-closed: a missing/locked layer, an empty or
 * oversized batch, malformed geometry, a duplicate id within the batch, and an id the layer already
 * holds (an add that silently overwrote an existing feature would lose content with no record).
 */
export function addFeatures(
	layers: MapLayer[],
	input: AddFeaturesInput,
	stamp: MapEditStamp,
): { layers: MapLayer[]; added: MapFeature[] } | { error: MapFeatureBatchError } {
	const layer = requireEditableLayer(layers, input.layerId);
	if ('kind' in layer) return { error: layer };

	const sizeError = checkBatch(input.features.length);
	if (sizeError) return { error: sizeError };

	const invalid = validateContent(input.features);
	if (invalid) return { error: invalid };

	const existing = new Set(layer.content.map((feature) => feature.id));
	const seen = new Set<string>();
	for (const feature of input.features) {
		if (existing.has(feature.id) || seen.has(feature.id)) {
			return { error: { kind: 'duplicate-feature', featureId: feature.id } };
		}
		seen.add(feature.id);
	}

	const added = input.features.map(normalizeMapFeature);
	let content: MapFeature[];
	if (input.indices && input.indices.length > 0) {
		if (input.indices.length !== added.length) {
			return {
				error: {
					kind: 'invalid-content',
					message: 'When indices are supplied there must be exactly one per feature.',
				},
			};
		}
		// Splice in ASCENDING index order: replaying a removal's original indices this way reconstructs
		// the exact array the removal took them out of.
		const ordered = added
			.map((feature, position) => ({ feature, index: input.indices![position]! }))
			.sort((a, b) => a.index - b.index);
		content = layer.content.map(normalizeMapFeature);
		for (const entry of ordered) {
			if (!Number.isInteger(entry.index) || entry.index < 0 || entry.index > content.length) {
				return {
					error: {
						kind: 'invalid-content',
						message: `Insertion index ${entry.index} is outside the layer's content range.`,
					},
				};
			}
			content.splice(entry.index, 0, entry.feature);
		}
	} else {
		content = [...layer.content.map(normalizeMapFeature), ...added];
	}

	return { layers: withLayerContent(layers, input.layerId, content, stamp), added };
}

export interface UpdateFeaturesInput {
	layerId: string;
	/** Replacement features, matched to the layer's content BY ID. An unknown id rejects. */
	features: MapFeature[];
}

/**
 * MAP-021: UPDATE features in place, matched by id. The feature keeps its position in the content
 * array (so an update never reorders the render stack). An id the layer does not hold is REJECTED
 * rather than treated as an add — an update that silently created content would let a stale client
 * resurrect a feature another DM deleted. `previous` carries the prior values so the caller can build
 * the exact inverse.
 */
export function updateFeatures(
	layers: MapLayer[],
	input: UpdateFeaturesInput,
	stamp: MapEditStamp,
):
	| { layers: MapLayer[]; updated: MapFeature[]; previous: MapFeature[] }
	| { error: MapFeatureBatchError } {
	const layer = requireEditableLayer(layers, input.layerId);
	if ('kind' in layer) return { error: layer };

	const sizeError = checkBatch(input.features.length);
	if (sizeError) return { error: sizeError };

	const invalid = validateContent(input.features);
	if (invalid) return { error: invalid };

	const byId = new Map(layer.content.map((feature) => [feature.id, feature]));
	const seen = new Set<string>();
	const previous: MapFeature[] = [];
	for (const feature of input.features) {
		const prior = byId.get(feature.id);
		if (!prior) return { error: { kind: 'feature-not-found', featureId: feature.id } };
		if (seen.has(feature.id)) {
			return { error: { kind: 'duplicate-feature', featureId: feature.id } };
		}
		seen.add(feature.id);
		previous.push(normalizeMapFeature(prior));
	}

	const replacements = new Map(
		input.features.map((feature) => [feature.id, normalizeMapFeature(feature)]),
	);
	const content = layer.content.map((feature) =>
		replacements.get(feature.id) ?? normalizeMapFeature(feature),
	);
	const updated = input.features.map(normalizeMapFeature);

	return { layers: withLayerContent(layers, input.layerId, content, stamp), updated, previous };
}

export interface RemoveFeaturesInput {
	layerId: string;
	featureIds: string[];
}

/**
 * MAP-021: REMOVE features by id. Returns each removed feature WITH the index it occupied: that pair
 * is what makes the removal invertible (`map.add-features` replays the features back at their original
 * indices), and it is what the durable op carries so undo never has to replay the layer from zero.
 */
export function removeFeatures(
	layers: MapLayer[],
	input: RemoveFeaturesInput,
	stamp: MapEditStamp,
): { layers: MapLayer[]; removed: RemovedFeature[] } | { error: MapFeatureBatchError } {
	const layer = requireEditableLayer(layers, input.layerId);
	if ('kind' in layer) return { error: layer };

	const sizeError = checkBatch(input.featureIds.length);
	if (sizeError) return { error: sizeError };

	const seen = new Set<string>();
	const targets = new Set<string>();
	for (const featureId of input.featureIds) {
		if (seen.has(featureId)) return { error: { kind: 'duplicate-feature', featureId } };
		seen.add(featureId);
		if (!layer.content.some((feature) => feature.id === featureId)) {
			return { error: { kind: 'feature-not-found', featureId } };
		}
		targets.add(featureId);
	}

	const removed: RemovedFeature[] = [];
	const content: MapFeature[] = [];
	layer.content.forEach((feature, index) => {
		if (targets.has(feature.id)) removed.push({ feature: normalizeMapFeature(feature), index });
		else content.push(normalizeMapFeature(feature));
	});

	return { layers: withLayerContent(layers, input.layerId, content, stamp), removed };
}
