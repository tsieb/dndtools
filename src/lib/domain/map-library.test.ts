import { describe, expect, it } from 'vitest';
import { createVaultObjectId, type MapObject } from '$lib/types/object.js';
import {
	filterMapObjects,
	formatMapScaleLabel,
	normalizeMapTagInput,
} from '$lib/domain/map-library.js';

function mapObject(overrides: Partial<MapObject>): MapObject {
	return {
		id: createVaultObjectId('obj-map-1'),
		type: 'map',
		name: 'Map',
		summary: '',
		tags: ['map'],
		visibility: 'dm_only',
		relationships: [],
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		data: {
			filePath: '.vault/assets/maps/default.png',
		},
		...overrides,
	};
}

describe('normalizeMapTagInput', () => {
	it('normalizes comma-separated tags with deduping', () => {
		expect(normalizeMapTagInput(' map, #dungeon, ,Map,city ')).toEqual(['map', 'dungeon', 'city']);
	});
});

describe('formatMapScaleLabel', () => {
	it('formats valid scale labels', () => {
		expect(formatMapScaleLabel({ unitsPerGridSquare: 5, unitLabel: 'ft' })).toBe('1 square = 5 ft');
	});

	it('returns null for invalid scales', () => {
		expect(formatMapScaleLabel(undefined)).toBeNull();
		expect(formatMapScaleLabel({ unitsPerGridSquare: 0, unitLabel: 'ft' })).toBeNull();
		expect(formatMapScaleLabel({ unitsPerGridSquare: 5, unitLabel: ' ' })).toBeNull();
	});
});

describe('filterMapObjects', () => {
	it('filters maps by tag, area, and query', () => {
		const maps = [
			mapObject({
				id: createVaultObjectId('obj-map-1'),
				name: 'Harbor District',
				tags: ['city', 'district'],
				updatedAt: '2026-01-03T00:00:00.000Z',
				data: {
					filePath: '.vault/assets/maps/harbor.png',
					areaNoteId: 'loc-1',
				},
			}),
			mapObject({
				id: createVaultObjectId('obj-map-2'),
				name: 'Catacomb Depths',
				tags: ['dungeon'],
				updatedAt: '2026-01-02T00:00:00.000Z',
				data: {
					filePath: '.vault/assets/maps/catacomb.png',
					areaNoteId: 'loc-2',
				},
			}),
		];
		const areaLabels = {
			'loc-1': 'Stormwatch',
			'loc-2': 'The Catacombs',
		};

		expect(
			filterMapObjects(maps, { tag: 'dungeon' }, areaLabels).map((entry) => entry.name),
		).toEqual(['Catacomb Depths']);
		expect(
			filterMapObjects(maps, { areaNoteId: 'loc-1' }, areaLabels).map((entry) => entry.name),
		).toEqual(['Harbor District']);
		expect(
			filterMapObjects(maps, { query: 'stormwatch' }, areaLabels).map((entry) => entry.name),
		).toEqual(['Harbor District']);
	});
});
