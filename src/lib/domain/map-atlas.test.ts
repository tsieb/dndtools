import { describe, expect, it } from 'vitest';
import {
	mapBreadcrumbs,
	mapDescendantIds,
	mapHierarchyEntries,
	notesInMapScope,
} from '$lib/domain/map-atlas.js';
import type { Note } from '$lib/types/note.js';
import type { MapObject } from '$lib/types/object.js';

function makeMap(id: string, name: string, overrides: Partial<MapObject['data']> = {}): MapObject {
	return {
		id: id as MapObject['id'],
		type: 'map',
		name,
		summary: '',
		tags: ['map'],
		visibility: 'dm_only',
		relationships: [],
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-02T00:00:00.000Z',
		data: {
			filePath: `.vault/assets/maps/${id}.png`,
			...overrides,
		},
	};
}

function makeNote(id: string, mapId?: string): Note {
	return {
		id: id as Note['id'],
		title: id,
		content: '',
		folder: '/locations' as Note['folder'],
		filePath: `/locations/${id}.md`,
		tags: ['location'],
		frontmatter: mapId ? { mapId } : {},
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-02T00:00:00.000Z',
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
		visibility: 'dm_only',
	};
}

describe('map-atlas', () => {
	it('builds breadcrumbs through parent map chain', () => {
		const maps = [
			makeMap('map-world', 'World'),
			makeMap('map-region', 'Region', { parentMapId: 'map-world' }),
			makeMap('map-city', 'City', { parentMapId: 'map-region' }),
		];
		const crumbs = mapBreadcrumbs('map-city', maps);
		expect(crumbs.map((entry) => entry.mapId)).toEqual(['map-world', 'map-region', 'map-city']);
	});

	it('returns all descendants for a map scope', () => {
		const maps = [
			makeMap('map-world', 'World'),
			makeMap('map-region', 'Region', { parentMapId: 'map-world' }),
			makeMap('map-city', 'City', { parentMapId: 'map-region' }),
			makeMap('map-dungeon', 'Dungeon', { parentMapId: 'map-city' }),
		];
		const ids = mapDescendantIds('map-region', maps);
		expect([...ids].sort()).toEqual(['map-city', 'map-dungeon', 'map-region']);
	});

	it('filters notes by map scope using descendants', () => {
		const maps = [
			makeMap('map-world', 'World'),
			makeMap('map-region', 'Region', { parentMapId: 'map-world' }),
			makeMap('map-city', 'City', { parentMapId: 'map-region' }),
		];
		const notes = [
			makeNote('note-world', 'map-world'),
			makeNote('note-city', 'map-city'),
			makeNote('note-other', 'map-missing'),
		];
		const scoped = notesInMapScope(notes, maps, 'map-region');
		expect(scoped.map((note) => String(note.id)).sort()).toEqual(['note-city']);
	});

	it('builds map hierarchy entries with stable depth ordering', () => {
		const maps = [
			makeMap('map-region', 'Region', { parentMapId: 'map-world' }),
			makeMap('map-world', 'World'),
			makeMap('map-city', 'City', { parentMapId: 'map-region' }),
		];
		const entries = mapHierarchyEntries(maps);
		expect(entries.map((entry) => `${entry.name}:${entry.depth}`)).toEqual([
			'World:0',
			'Region:1',
			'City:2',
		]);
	});
});
