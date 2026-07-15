import type { MapEntity, MapRegion } from './map-state';

/**
 * MAP-021 — pure reducers for map REGIONS.
 *
 * A {@link MapRegion} is a named rectangle of normalized (0..1) map space. It is the unit the session
 * projects to players (`session.set-active-map` carries a `regionId`, and the player view is framed on
 * that region), and `MapEntity.defaultRegionId` names the one a map opens on. The type and both readers
 * shipped long ago; nothing could ever CREATE one, so every region in the vault came from the demo seed.
 * These reducers close that gap.
 *
 * Two rules are load-bearing and enforced here rather than in the handler, so they hold for every
 * caller:
 *
 *   - bounds are validated fail-closed — finite, non-degenerate (w/h > 0), and wholly inside normalized
 *     map space. A region that hangs off the edge of the map would frame a player view on nothing.
 *   - deleting the map's DEFAULT region CLEARS `defaultRegionId` rather than leaving it dangling. A
 *     dangling default is the classic form of this bug: the map still names a region that no longer
 *     exists, and every consumer has to guess what to do. {@link deleteRegion} returns the corrected
 *     `defaultRegionId` alongside the new list, so the caller cannot forget.
 */

export type MapRegionError =
	| { kind: 'region-not-found'; regionId: string }
	| { kind: 'duplicate-region-id'; regionId: string }
	| { kind: 'invalid-name'; message: string }
	| { kind: 'invalid-bounds'; message: string };

export interface MapRegionStamp {
	actorId: string;
	now: string;
}

export interface MapRegionBounds {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Bounds must be finite, non-degenerate, and wholly within normalized [0,1] map space. */
export function validateRegionBounds(bounds: MapRegionBounds): MapRegionError | null {
	const { x, y, w, h } = bounds;
	if (![x, y, w, h].every((value) => Number.isFinite(value))) {
		return { kind: 'invalid-bounds', message: 'Region bounds must be finite numbers.' };
	}
	if (w <= 0 || h <= 0) {
		return { kind: 'invalid-bounds', message: 'Region width and height must be greater than zero.' };
	}
	if (x < 0 || y < 0 || x + w > 1 || y + h > 1) {
		return {
			kind: 'invalid-bounds',
			message: 'Region bounds must lie within normalized [0,1] map space.',
		};
	}
	return null;
}

function validateRegionName(name: string): MapRegionError | null {
	if (name.trim().length === 0) {
		return { kind: 'invalid-name', message: 'A region needs a name.' };
	}
	return null;
}

export interface CreateRegionInput {
	id: string;
	name: string;
	bounds: MapRegionBounds;
}

export function createRegion(
	regions: readonly MapRegion[],
	input: CreateRegionInput,
): { regions: MapRegion[]; created: MapRegion } | { error: MapRegionError } {
	if (regions.some((region) => region.id === input.id)) {
		return { error: { kind: 'duplicate-region-id', regionId: input.id } };
	}
	const nameError = validateRegionName(input.name);
	if (nameError) return { error: nameError };
	const boundsError = validateRegionBounds(input.bounds);
	if (boundsError) return { error: boundsError };

	const created: MapRegion = {
		id: input.id,
		name: input.name,
		bounds: { ...input.bounds },
	};
	return { regions: [...regions, created], created };
}

export interface UpdateRegionPatch {
	name?: string;
	bounds?: MapRegionBounds;
}

export function updateRegion(
	regions: readonly MapRegion[],
	regionId: string,
	patch: UpdateRegionPatch,
): { regions: MapRegion[]; updated: MapRegion } | { error: MapRegionError } {
	const existing = regions.find((region) => region.id === regionId);
	if (!existing) return { error: { kind: 'region-not-found', regionId } };

	if (patch.name !== undefined) {
		const nameError = validateRegionName(patch.name);
		if (nameError) return { error: nameError };
	}
	if (patch.bounds !== undefined) {
		const boundsError = validateRegionBounds(patch.bounds);
		if (boundsError) return { error: boundsError };
	}

	const updated: MapRegion = {
		id: existing.id,
		name: patch.name ?? existing.name,
		bounds: patch.bounds ? { ...patch.bounds } : { ...existing.bounds },
	};
	return { regions: regions.map((region) => (region.id === regionId ? updated : region)), updated };
}

/**
 * Delete a region. When the deleted region is the map's DEFAULT, the returned `defaultRegionId` is
 * `null` — the field is CLEARED, never left dangling at a region that no longer exists.
 */
export function deleteRegion(
	map: MapEntity,
	regionId: string,
): { regions: MapRegion[]; defaultRegionId: string | null; deleted: MapRegion } | { error: MapRegionError } {
	const deleted = map.regions.find((region) => region.id === regionId);
	if (!deleted) return { error: { kind: 'region-not-found', regionId } };
	return {
		regions: map.regions.filter((region) => region.id !== regionId),
		defaultRegionId: map.defaultRegionId === regionId ? null : map.defaultRegionId,
		deleted,
	};
}
