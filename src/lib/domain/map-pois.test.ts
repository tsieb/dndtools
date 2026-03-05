import { describe, expect, it } from 'vitest';
import {
	collectMapPlacementsForNote,
	extractMapFrontmatterPlacement,
	extractNotePreviewLines,
} from '$lib/domain/map-pois.js';
import { createVaultObjectId, type MapObject } from '$lib/types/object.js';

function makeMap(overrides: Partial<MapObject> = {}): MapObject {
	return {
		id: createVaultObjectId('map-1'),
		type: 'map',
		name: 'Sword Coast',
		summary: '',
		tags: ['map'],
		visibility: 'dm_only',
		relationships: [],
		data: {
			filePath: '.vault/assets/maps/sword-coast.png',
			pois: [],
			layers: [],
		},
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		...overrides,
	} as MapObject;
}

describe('extractNotePreviewLines', () => {
	it('returns the first three non-empty lines', () => {
		expect(extractNotePreviewLines('\nLine one\n\nLine two\nLine three\nLine four')).toEqual([
			'Line one',
			'Line two',
			'Line three',
		]);
	});
});

describe('extractMapFrontmatterPlacement', () => {
	it('parses object mapPosition frontmatter', () => {
		const parsed = extractMapFrontmatterPlacement({
			mapId: 'map-1',
			mapPosition: { x: 0.25, y: '0.75', poiId: 'poi-harbor' },
		});
		expect(parsed).toEqual({
			mapId: 'map-1',
			coordinates: { x: 0.25, y: 0.75 },
			poiId: 'poi-harbor',
		});
	});
});

describe('collectMapPlacementsForNote', () => {
	it('collects map POI links and frontmatter placements', () => {
		const maps = [
			makeMap({
				id: createVaultObjectId('map-1'),
				name: 'Phandalin',
				data: {
					filePath: '.vault/assets/maps/phandalin.png',
					pois: [
						{
							id: 'poi-town',
							label: 'Town Center',
							category: 'city',
							x: 0.5,
							y: 0.5,
							linkedNoteId: 'note-location',
						},
					],
					layers: [],
				},
			}),
		];
		const placements = collectMapPlacementsForNote(maps, 'note-location', {
			mapId: 'map-1',
			mapPosition: { x: 0.7, y: 0.2 },
		});
		expect(placements).toHaveLength(2);
		expect(placements[0]?.mapId).toBe('map-1');
		expect(
			placements.some(
				(placement) => placement.coordinates.x === 0.7 && placement.coordinates.y === 0.2,
			),
		).toBe(true);
	});
});
