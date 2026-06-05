import type { MapEntity, MapFeature, MapLayer } from './map-state';
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

/** Validate a single feature's shape: normalized coordinates in [0,1], non-empty point list. */
function validateContent(content: readonly MapFeature[]): MapEditError | null {
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
