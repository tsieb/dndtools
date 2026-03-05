import type { MapObject, VaultObject } from '$lib/types/object.js';

export interface MapPlacementCoordinate {
	x: number;
	y: number;
}

export interface MapPlacementLink {
	mapId: string;
	mapName: string;
	poiId: string | null;
	poiLabel: string;
	coordinates: MapPlacementCoordinate;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function toCoordinate(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return Math.min(1, Math.max(0, value));
	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value);
		if (Number.isFinite(parsed)) return Math.min(1, Math.max(0, parsed));
	}
	return null;
}

export function extractNotePreviewLines(content: string, count = 3): string[] {
	return content
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.slice(0, Math.max(1, count));
}

export function objectPreviewLines(object: VaultObject): string[] {
	const type = object.type.replace(/_/g, ' ');
	const summary = object.summary.trim();
	const first = `${object.name} (${type})`;
	if (!summary) return [first];
	return [first, summary];
}

export function extractMapFrontmatterPlacement(
	frontmatter: Record<string, unknown>,
): { mapId: string; coordinates: MapPlacementCoordinate; poiId: string | null } | null {
	const rawMapId = frontmatter['mapId'];
	const mapId = typeof rawMapId === 'string' ? rawMapId.trim() : '';
	if (!mapId) return null;

	const rawPoiId = frontmatter['mapPoi'];
	const poiId = typeof rawPoiId === 'string' && rawPoiId.trim() ? rawPoiId.trim() : null;
	const rawPosition = frontmatter['mapPosition'];
	if (Array.isArray(rawPosition) && rawPosition.length >= 2) {
		const x = toCoordinate(rawPosition[0]);
		const y = toCoordinate(rawPosition[1]);
		if (x !== null && y !== null) {
			return { mapId, coordinates: { x, y }, poiId };
		}
	}
	if (typeof rawPosition === 'string') {
		const [left, right] = rawPosition.split(',', 2);
		const x = toCoordinate(left);
		const y = toCoordinate(right);
		if (x !== null && y !== null) {
			return { mapId, coordinates: { x, y }, poiId };
		}
	}
	if (isRecord(rawPosition)) {
		const x = toCoordinate(rawPosition['x']);
		const y = toCoordinate(rawPosition['y']);
		if (x !== null && y !== null) {
			const embeddedPoiId =
				typeof rawPosition['poiId'] === 'string' && rawPosition['poiId'].trim()
					? rawPosition['poiId'].trim()
					: poiId;
			return { mapId, coordinates: { x, y }, poiId: embeddedPoiId ?? null };
		}
	}
	return null;
}

export function collectMapPlacementsForNote(
	maps: readonly MapObject[],
	noteId: string,
	noteFrontmatter?: Record<string, unknown>,
): MapPlacementLink[] {
	const placements: MapPlacementLink[] = [];
	const seen = new Set<string>();
	for (const map of maps) {
		for (const poi of map.data.pois ?? []) {
			if (poi.linkedNoteId !== noteId) continue;
			const key = `${map.id}:${poi.id}`;
			if (seen.has(key)) continue;
			seen.add(key);
			placements.push({
				mapId: String(map.id),
				mapName: map.name,
				poiId: poi.id,
				poiLabel: poi.label,
				coordinates: { x: poi.x, y: poi.y },
			});
		}
	}

	if (noteFrontmatter) {
		const frontmatterPlacement = extractMapFrontmatterPlacement(noteFrontmatter);
		if (frontmatterPlacement) {
			const map = maps.find((entry) => String(entry.id) === frontmatterPlacement.mapId);
			if (map) {
				const fallbackPoi = map.data.pois?.find((poi) => poi.id === frontmatterPlacement.poiId);
				const label = fallbackPoi?.label ?? 'Frontmatter placement';
				const key = `${map.id}:${frontmatterPlacement.poiId ?? `${frontmatterPlacement.coordinates.x},${frontmatterPlacement.coordinates.y}`}`;
				if (!seen.has(key)) {
					placements.push({
						mapId: String(map.id),
						mapName: map.name,
						poiId: frontmatterPlacement.poiId,
						poiLabel: label,
						coordinates: frontmatterPlacement.coordinates,
					});
				}
			}
		}
	}

	return placements.sort((a, b) => {
		const byName = a.mapName.localeCompare(b.mapName, undefined, { sensitivity: 'base' });
		if (byName !== 0) return byName;
		return a.poiLabel.localeCompare(b.poiLabel, undefined, { sensitivity: 'base' });
	});
}
