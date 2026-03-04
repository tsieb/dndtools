import type { MapObject, MapScaleData } from '$lib/types/object.js';

export interface MapLibraryFilters {
	query?: string;
	tag?: string;
	areaNoteId?: string;
}

export function normalizeMapTagInput(raw: string): string[] {
	const seen = new Set<string>();
	const normalized: string[] = [];
	for (const entry of raw.split(',')) {
		const trimmed = entry.trim().replace(/^#/, '');
		if (!trimmed) continue;
		const key = trimmed.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		normalized.push(trimmed);
	}
	return normalized;
}

export function formatMapScaleLabel(scale: MapScaleData | undefined): string | null {
	if (!scale) return null;
	if (!Number.isFinite(scale.unitsPerGridSquare) || scale.unitsPerGridSquare <= 0) return null;
	const unitLabel = scale.unitLabel.trim();
	if (!unitLabel) return null;
	return `1 square = ${scale.unitsPerGridSquare} ${unitLabel}`;
}

function mapSearchText(map: MapObject, areaLabel: string | undefined): string {
	const gridKind = map.data.grid?.type ? `${map.data.grid.type} grid` : '';
	return [
		map.name,
		map.summary,
		map.tags.join(' '),
		map.data.filePath,
		map.data.scale?.unitLabel ?? '',
		areaLabel ?? '',
		gridKind,
	]
		.join(' ')
		.toLowerCase();
}

export function filterMapObjects(
	maps: readonly MapObject[],
	filters: MapLibraryFilters,
	areaLabelByNoteId: Readonly<Record<string, string>>,
): MapObject[] {
	const query = filters.query?.trim().toLowerCase() ?? '';
	const tag = filters.tag?.trim().toLowerCase() ?? '';
	const areaNoteId = filters.areaNoteId?.trim() ?? '';
	return maps
		.filter((map) => {
			if (tag && !map.tags.some((entry) => entry.toLowerCase() === tag)) return false;
			if (areaNoteId && (map.data.areaNoteId ?? '') !== areaNoteId) return false;
			if (!query) return true;
			const areaLabel = map.data.areaNoteId
				? (areaLabelByNoteId[map.data.areaNoteId] ?? map.data.areaNoteId)
				: undefined;
			return mapSearchText(map, areaLabel).includes(query);
		})
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
