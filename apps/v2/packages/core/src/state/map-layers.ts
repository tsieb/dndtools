import type { MapEntity, MapLayer, MapLayerCategory } from './map-state';
import type { SceneVisibility } from './scene-state';

/**
 * MAP-005 — pure layer reducers. These are deterministic, side-effect-free transforms over a map's
 * `layers` array. The command handlers (`commands/map-layer.ts`) own actor/lock/validation gating
 * and the durable operation log; this module owns ONLY the array math, so the rules are unit-testable
 * in isolation and the command layer never hand-rolls list mutation.
 *
 * Invariants every reducer preserves:
 *   - `order` is dense (0..n-1, ascending) after any structural change, so a reorder/insert/delete
 *     never leaves gaps or ties that would make render order ambiguous.
 *   - a returned layer's `revision` is bumped and `updatedBy`/`updatedAt` are stamped for any layer
 *     the operation actually changed (so a no-op never spuriously re-fingerprints a cache).
 *   - the input array is never mutated; a new array of new layer objects is returned.
 */

export type MapLayerMutationKind =
	| 'create'
	| 'rename'
	| 'reorder'
	| 'duplicate'
	| 'lock'
	| 'delete'
	| 'set-player-visibility'
	| 'set-dm-enabled'
	| 'set-opacity'
	| 'set-tags';

/** A structured failure from a pure reducer; the command layer maps it to a `CommandRejection`. */
export type MapLayerError =
	| { kind: 'layer-not-found'; layerId: string }
	| { kind: 'layer-locked'; layerId: string }
	| { kind: 'duplicate-layer-id'; layerId: string }
	| { kind: 'invalid-order'; message: string }
	| { kind: 'invalid-opacity'; message: string }
	| { kind: 'invalid-name'; message: string }
	| { kind: 'last-layer'; message: string };

export interface MapLayerStamp {
	actorId: string;
	now: string;
}

/** Re-pack `order` to a dense 0..n-1 ascending sequence following the array's current position. */
function reindexOrder(layers: MapLayer[]): MapLayer[] {
	return layers.map((layer, index) => (layer.order === index ? layer : { ...layer, order: index }));
}

/** Stamp a layer as freshly mutated (revision bump + audit fields). */
function stampLayer(layer: MapLayer, stamp: MapLayerStamp): MapLayer {
	return { ...layer, revision: layer.revision + 1, updatedBy: stamp.actorId, updatedAt: stamp.now };
}

export function findLayer(map: MapEntity, layerId: string): MapLayer | undefined {
	return map.layers.find((layer) => layer.id === layerId);
}

/** Sort a copy of the layers by their explicit `order`, then id for a stable tie-break. */
export function sortedLayers(map: MapEntity): MapLayer[] {
	return [...map.layers].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export interface CreateLayerInput {
	id: string;
	name: string;
	category: MapLayerCategory;
	visibility: SceneVisibility;
	enabled: boolean;
	opacity: number;
	tags: string[];
	query: Record<string, string>;
	locked: boolean;
	/** Insert position; appended to the end when omitted/out of range. */
	atOrder?: number;
}

/** MAP-005: append/insert a new named layer with full metadata. The new layer is never locked at the
 *  moment of creation regardless of the requested `locked` flag's intent to lock-after; it is created
 *  with the requested lock state directly (a DM can create a layer already locked). */
export function createLayer(
	layers: MapLayer[],
	input: CreateLayerInput,
	stamp: MapLayerStamp,
): { layers: MapLayer[] } | { error: MapLayerError } {
	if (input.name.trim().length === 0) {
		return { error: { kind: 'invalid-name', message: 'Layer name is required.' } };
	}
	if (layers.some((layer) => layer.id === input.id)) {
		return { error: { kind: 'duplicate-layer-id', layerId: input.id } };
	}
	if (!Number.isFinite(input.opacity) || input.opacity < 0 || input.opacity > 1) {
		return { error: { kind: 'invalid-opacity', message: 'Opacity must be between 0 and 1.' } };
	}
	const newLayer: MapLayer = {
		id: input.id,
		name: input.name,
		category: input.category,
		visibility: input.visibility,
		enabled: input.enabled,
		opacity: input.opacity,
		tags: [...input.tags],
		query: { ...input.query },
		locked: input.locked,
		order: 0,
		revision: 1,
		updatedBy: stamp.actorId,
		updatedAt: stamp.now,
	};
	const ordered = sortedLayers({ layers } as MapEntity);
	const at =
		input.atOrder === undefined || input.atOrder < 0 || input.atOrder > ordered.length
			? ordered.length
			: input.atOrder;
	ordered.splice(at, 0, newLayer);
	return { layers: reindexOrder(ordered) };
}

/** Guard: reject any structural mutation that targets a locked layer (fail-closed, MAP-005). */
function requireUnlocked(layer: MapLayer): MapLayerError | null {
	return layer.locked ? { kind: 'layer-locked', layerId: layer.id } : null;
}

export function renameLayer(
	layers: MapLayer[],
	layerId: string,
	name: string,
	stamp: MapLayerStamp,
): { layers: MapLayer[] } | { error: MapLayerError } {
	const layer = layers.find((candidate) => candidate.id === layerId);
	if (!layer) return { error: { kind: 'layer-not-found', layerId } };
	const lock = requireUnlocked(layer);
	if (lock) return { error: lock };
	if (name.trim().length === 0) {
		return { error: { kind: 'invalid-name', message: 'Layer name is required.' } };
	}
	return {
		layers: layers.map((candidate) =>
			candidate.id === layerId ? stampLayer({ ...candidate, name }, stamp) : candidate,
		),
	};
}

/**
 * MAP-005: move a layer to a new ordinal position. Locked layers cannot be moved. The target layer
 * is removed and re-inserted at `toOrder`; all `order` values are re-packed dense afterward, so the
 * render order changes accordingly and persists.
 */
export function reorderLayer(
	layers: MapLayer[],
	layerId: string,
	toOrder: number,
	stamp: MapLayerStamp,
): { layers: MapLayer[] } | { error: MapLayerError } {
	const layer = layers.find((candidate) => candidate.id === layerId);
	if (!layer) return { error: { kind: 'layer-not-found', layerId } };
	const lock = requireUnlocked(layer);
	if (lock) return { error: lock };
	if (!Number.isInteger(toOrder) || toOrder < 0 || toOrder >= layers.length) {
		return {
			error: {
				kind: 'invalid-order',
				message: `Order must be an integer in [0, ${layers.length - 1}].`,
			},
		};
	}
	const ordered = sortedLayers({ layers } as MapEntity);
	const fromIndex = ordered.findIndex((candidate) => candidate.id === layerId);
	const [moved] = ordered.splice(fromIndex, 1);
	ordered.splice(toOrder, 0, moved!);
	// Stamp the moved layer (its order changed); reindex repacks everyone else's order without a
	// revision bump unless their position also shifted — but a reorder shifts neighbors' positions,
	// so we stamp every layer whose order actually changed.
	const before = new Map(layers.map((candidate) => [candidate.id, candidate.order]));
	const reindexed = reindexOrder(ordered).map((candidate) =>
		before.get(candidate.id) === candidate.order ? candidate : stampLayer(candidate, stamp),
	);
	return { layers: reindexed };
}

/**
 * MAP-005: duplicate a layer. The copy gets a fresh id, a `(copy)` name suffix, inherits all
 * metadata, starts UNLOCKED (so the copy is immediately editable even when the source is locked),
 * and is inserted directly after the source. Duplicating a locked source is allowed because it does
 * not mutate the source.
 */
export function duplicateLayer(
	layers: MapLayer[],
	layerId: string,
	newId: string,
	stamp: MapLayerStamp,
): { layers: MapLayer[]; newLayerId: string } | { error: MapLayerError } {
	const source = layers.find((candidate) => candidate.id === layerId);
	if (!source) return { error: { kind: 'layer-not-found', layerId } };
	if (layers.some((candidate) => candidate.id === newId)) {
		return { error: { kind: 'duplicate-layer-id', layerId: newId } };
	}
	const ordered = sortedLayers({ layers } as MapEntity);
	const sourceIndex = ordered.findIndex((candidate) => candidate.id === layerId);
	const copy: MapLayer = {
		...source,
		id: newId,
		name: `${source.name} (copy)`,
		tags: [...source.tags],
		query: { ...source.query },
		locked: false,
		order: 0,
		revision: 1,
		updatedBy: stamp.actorId,
		updatedAt: stamp.now,
	};
	ordered.splice(sourceIndex + 1, 0, copy);
	return { layers: reindexOrder(ordered), newLayerId: newId };
}

/** MAP-005: set a layer's lock state. Locking/unlocking is itself NOT blocked by the lock (otherwise
 *  a locked layer could never be unlocked); it is the only mutation a locked layer accepts. */
export function setLayerLock(
	layers: MapLayer[],
	layerId: string,
	locked: boolean,
	stamp: MapLayerStamp,
): { layers: MapLayer[] } | { error: MapLayerError } {
	const layer = layers.find((candidate) => candidate.id === layerId);
	if (!layer) return { error: { kind: 'layer-not-found', layerId } };
	if (layer.locked === locked) return { layers }; // no-op; do not re-stamp.
	return {
		layers: layers.map((candidate) =>
			candidate.id === layerId ? stampLayer({ ...candidate, locked }, stamp) : candidate,
		),
	};
}

/** MAP-005: delete a layer. Locked layers cannot be deleted; the last remaining layer cannot be
 *  deleted (a map always has at least one layer). Orders are re-packed dense afterward. */
export function deleteLayer(
	layers: MapLayer[],
	layerId: string,
	stamp: MapLayerStamp,
): { layers: MapLayer[] } | { error: MapLayerError } {
	const layer = layers.find((candidate) => candidate.id === layerId);
	if (!layer) return { error: { kind: 'layer-not-found', layerId } };
	const lock = requireUnlocked(layer);
	if (lock) return { error: lock };
	if (layers.length <= 1) {
		return { error: { kind: 'last-layer', message: 'A map must keep at least one layer.' } };
	}
	const remaining = sortedLayers({ layers } as MapEntity).filter(
		(candidate) => candidate.id !== layerId,
	);
	// Reindex repacks order; stamp only layers whose order actually shifted.
	const before = new Map(layers.map((candidate) => [candidate.id, candidate.order]));
	const reindexed = reindexOrder(remaining).map((candidate) =>
		before.get(candidate.id) === candidate.order ? candidate : stampLayer(candidate, stamp),
	);
	return { layers: reindexed };
}

/**
 * MAP-006: set a layer's PLAYER visibility, INDEPENDENTLY of its DM-display toggle and opacity. Only
 * the `visibility` field changes; `enabled` and `opacity` are untouched, and no OTHER layer is
 * touched. A locked layer rejects this fail-closed.
 */
export function setLayerPlayerVisibility(
	layers: MapLayer[],
	layerId: string,
	visibility: SceneVisibility,
	stamp: MapLayerStamp,
): { layers: MapLayer[] } | { error: MapLayerError } {
	const layer = layers.find((candidate) => candidate.id === layerId);
	if (!layer) return { error: { kind: 'layer-not-found', layerId } };
	const lock = requireUnlocked(layer);
	if (lock) return { error: lock };
	if (layer.visibility === visibility) return { layers };
	return {
		layers: layers.map((candidate) =>
			candidate.id === layerId ? stampLayer({ ...candidate, visibility }, stamp) : candidate,
		),
	};
}

/** MAP-006: set a layer's DM-display toggle (`enabled`), INDEPENDENTLY of visibility/opacity. */
export function setLayerDmEnabled(
	layers: MapLayer[],
	layerId: string,
	enabled: boolean,
	stamp: MapLayerStamp,
): { layers: MapLayer[] } | { error: MapLayerError } {
	const layer = layers.find((candidate) => candidate.id === layerId);
	if (!layer) return { error: { kind: 'layer-not-found', layerId } };
	const lock = requireUnlocked(layer);
	if (lock) return { error: lock };
	if (layer.enabled === enabled) return { layers };
	return {
		layers: layers.map((candidate) =>
			candidate.id === layerId ? stampLayer({ ...candidate, enabled }, stamp) : candidate,
		),
	};
}

/** MAP-006: set a layer's opacity (0..1), INDEPENDENTLY of visibility and the DM-display toggle. */
export function setLayerOpacity(
	layers: MapLayer[],
	layerId: string,
	opacity: number,
	stamp: MapLayerStamp,
): { layers: MapLayer[] } | { error: MapLayerError } {
	const layer = layers.find((candidate) => candidate.id === layerId);
	if (!layer) return { error: { kind: 'layer-not-found', layerId } };
	const lock = requireUnlocked(layer);
	if (lock) return { error: lock };
	if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
		return { error: { kind: 'invalid-opacity', message: 'Opacity must be between 0 and 1.' } };
	}
	if (layer.opacity === opacity) return { layers };
	return {
		layers: layers.map((candidate) =>
			candidate.id === layerId ? stampLayer({ ...candidate, opacity }, stamp) : candidate,
		),
	};
}

/** MAP-005/MAP-007: replace a layer's tags + query metadata. A locked layer rejects fail-closed. */
export function setLayerTags(
	layers: MapLayer[],
	layerId: string,
	tags: string[],
	query: Record<string, string>,
	stamp: MapLayerStamp,
): { layers: MapLayer[] } | { error: MapLayerError } {
	const layer = layers.find((candidate) => candidate.id === layerId);
	if (!layer) return { error: { kind: 'layer-not-found', layerId } };
	const lock = requireUnlocked(layer);
	if (lock) return { error: lock };
	return {
		layers: layers.map((candidate) =>
			candidate.id === layerId
				? stampLayer({ ...candidate, tags: [...tags], query: { ...query } }, stamp)
				: candidate,
		),
	};
}
