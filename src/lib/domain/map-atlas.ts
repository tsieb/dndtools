import type { Note } from '$lib/types/note.js';
import type { MapObject, MapPoiData } from '$lib/types/object.js';
import { extractMapFrontmatterPlacement } from '$lib/domain/map-pois.js';

export interface MapHierarchyEntry {
	mapId: string;
	name: string;
	depth: number;
	parentMapId: string | null;
}

export function mapIndexById(maps: readonly MapObject[]): Record<string, MapObject> {
	const index: Record<string, MapObject> = {};
	for (const map of maps) {
		index[String(map.id)] = map;
	}
	return index;
}

export function resolvePoiLinkedMapId(
	poi: MapPoiData,
	mapById: Readonly<Record<string, MapObject>>,
): string | null {
	const candidate = poi.linkedObjectId?.trim() ?? '';
	if (!candidate) return null;
	const linked = mapById[candidate];
	if (!linked || linked.type !== 'map') return null;
	return String(linked.id);
}

export function mapBreadcrumbs(
	mapId: string,
	maps: readonly MapObject[],
): Array<{ mapId: string; name: string }> {
	const byId = mapIndexById(maps);
	const breadcrumbs: Array<{ mapId: string; name: string }> = [];
	const seen = new Set<string>();
	let current = byId[mapId];
	while (current) {
		const currentId = String(current.id);
		if (seen.has(currentId)) break;
		seen.add(currentId);
		breadcrumbs.unshift({ mapId: currentId, name: current.name });
		const parentId = current.data.parentMapId?.trim();
		if (!parentId) break;
		current = byId[parentId];
	}
	return breadcrumbs;
}

export function mapDescendantIds(rootMapId: string, maps: readonly MapObject[]): Set<string> {
	const childrenByParent = new Map<string, string[]>();
	for (const map of maps) {
		const parentId = map.data.parentMapId?.trim();
		if (!parentId) continue;
		const childId = String(map.id);
		const bucket = childrenByParent.get(parentId) ?? [];
		bucket.push(childId);
		childrenByParent.set(parentId, bucket);
	}

	const visited = new Set<string>();
	const queue = [rootMapId];
	while (queue.length > 0) {
		const current = queue.shift()!;
		if (visited.has(current)) continue;
		visited.add(current);
		for (const child of childrenByParent.get(current) ?? []) {
			if (!visited.has(child)) queue.push(child);
		}
	}
	return visited;
}

function noteMapIdsFromPois(noteId: string, maps: readonly MapObject[]): Set<string> {
	const ids = new Set<string>();
	for (const map of maps) {
		const mapId = String(map.id);
		for (const poi of map.data.pois ?? []) {
			if (poi.linkedNoteId === noteId) {
				ids.add(mapId);
			}
		}
	}
	return ids;
}

export function noteMapIds(
	note: Pick<Note, 'id' | 'frontmatter'>,
	maps: readonly MapObject[],
): Set<string> {
	const ids = noteMapIdsFromPois(String(note.id), maps);
	const rawFrontmatterMapId =
		typeof note.frontmatter?.mapId === 'string' ? note.frontmatter.mapId.trim() : '';
	if (rawFrontmatterMapId) {
		ids.add(rawFrontmatterMapId);
	}
	const frontmatterPlacement = extractMapFrontmatterPlacement(note.frontmatter ?? {});
	if (frontmatterPlacement?.mapId) {
		ids.add(frontmatterPlacement.mapId);
	}
	return ids;
}

export function notesInMapScope(
	notes: readonly Note[],
	maps: readonly MapObject[],
	mapId: string,
): Note[] {
	const scope = mapDescendantIds(mapId, maps);
	return notes.filter((note) => {
		const ids = noteMapIds(note, maps);
		for (const id of ids) {
			if (scope.has(id)) return true;
		}
		return false;
	});
}

export function mapHierarchyEntries(maps: readonly MapObject[]): MapHierarchyEntry[] {
	const byId = mapIndexById(maps);
	const childrenByParent = new Map<string | null, string[]>();
	for (const map of maps) {
		const parentId = map.data.parentMapId?.trim() ?? null;
		const bucket = childrenByParent.get(parentId) ?? [];
		bucket.push(String(map.id));
		childrenByParent.set(parentId, bucket);
	}
	for (const bucket of childrenByParent.values()) {
		bucket.sort((a, b) => {
			const left = byId[a]?.name ?? a;
			const right = byId[b]?.name ?? b;
			return left.localeCompare(right, undefined, { sensitivity: 'base' });
		});
	}

	const entries: MapHierarchyEntry[] = [];
	const roots = childrenByParent.get(null) ?? [];
	const seen = new Set<string>();
	const walk = (mapId: string, depth: number, parentMapId: string | null): void => {
		if (seen.has(mapId)) return;
		seen.add(mapId);
		const map = byId[mapId];
		if (!map) return;
		entries.push({
			mapId,
			name: map.name,
			depth,
			parentMapId,
		});
		for (const child of childrenByParent.get(mapId) ?? []) {
			walk(child, depth + 1, mapId);
		}
	};

	for (const rootId of roots) {
		walk(rootId, 0, null);
	}
	for (const map of maps) {
		const id = String(map.id);
		if (!seen.has(id)) {
			walk(id, 0, null);
		}
	}
	return entries;
}
