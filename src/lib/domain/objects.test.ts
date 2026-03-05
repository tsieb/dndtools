import { describe, expect, it } from 'vitest';
import {
	createDefaultMapAnnotationLayers,
	normalizeCharacterData,
	normalizeMapData,
	normalizeObjectRelationships,
} from '$lib/domain/objects.js';

describe('normalizeObjectRelationships', () => {
	it('keeps built-in relationship types', () => {
		const normalized = normalizeObjectRelationships([
			{ type: 'ally', targetId: 'obj-1', description: 'Trusted contact' },
		]);
		expect(normalized).toEqual([
			{ type: 'ally', targetId: 'obj-1', sessionId: undefined, description: 'Trusted contact' },
		]);
	});

	it('supports explicit custom relationship labels', () => {
		const normalized = normalizeObjectRelationships([
			{ type: 'custom', label: 'mentor', targetId: 'obj-2' },
		]);
		expect(normalized).toEqual([
			{
				type: 'custom',
				label: 'mentor',
				targetId: 'obj-2',
				sessionId: undefined,
				description: undefined,
			},
		]);
	});

	it('maps unknown relationship types into custom labels', () => {
		const normalized = normalizeObjectRelationships([{ type: 'rival', targetId: 'obj-3' }]);
		expect(normalized).toEqual([
			{
				type: 'custom',
				label: 'rival',
				targetId: 'obj-3',
				sessionId: undefined,
				description: undefined,
			},
		]);
	});

	it('rejects custom relationships without labels', () => {
		const normalized = normalizeObjectRelationships([{ type: 'custom', targetId: 'obj-4' }]);
		expect(normalized).toEqual([]);
	});
});

describe('normalizeCharacterData', () => {
	it('normalizes and preserves dmNotes', () => {
		const normalized = normalizeCharacterData({
			notes: '  public notes  ',
			dmNotes: '  secret note  ',
		});
		expect(normalized.notes).toBe('public notes');
		expect(normalized.dmNotes).toBe('secret note');
	});
});

describe('normalizeMapData', () => {
	it('normalizes POIs and clamps normalized coordinates', () => {
		const layers = createDefaultMapAnnotationLayers();
		const normalized = normalizeMapData({
			filePath: '.vault/assets/maps/city.png',
			layers,
			pois: [
				{
					id: 'poi-market',
					label: ' Market Square ',
					category: 'city',
					x: 1.6,
					y: -0.5,
					layerId: layers[0]?.id,
					linkedNoteId: ' note-market ',
				},
			],
		});
		expect(normalized.pois).toEqual([
			{
				id: 'poi-market',
				label: 'Market Square',
				category: 'city',
				x: 1,
				y: 0,
				layerId: layers[0]?.id,
				linkedNoteId: 'note-market',
				linkedObjectId: undefined,
			},
		]);
	});

	it('creates default layers when POIs are present but layers are missing', () => {
		const normalized = normalizeMapData({
			filePath: '.vault/assets/maps/region.png',
			pois: [{ id: 'poi-keep', label: 'Ancient Keep', category: 'dungeon', x: 0.2, y: 0.3 }],
		});
		expect(normalized.layers?.length).toBeGreaterThan(0);
		expect(normalized.pois?.[0]?.layerId).toBe(normalized.layers?.[0]?.id);
	});

	it('normalizes persisted session fog snapshots', () => {
		const normalized = normalizeMapData({
			filePath: '.vault/assets/maps/foggy.png',
			lastSessionFog: {
				savedAt: '2026-03-04T00:00:00.000Z',
				sourceBoardId: 'board-1',
				sourceCombatTileId: 'tile-1',
				fogState: {
					colorTheme: 'black',
					freeExplore: false,
					polygons: [
						{
							id: 'fog-1',
							mode: 'reveal',
							shape: 'rectangle',
							points: [
								{ x: 0.1, y: 0.1 },
								{ x: 0.4, y: 0.1 },
								{ x: 0.4, y: 0.4 },
							],
							createdAt: '2026-03-04T00:00:00.000Z',
						},
					],
					updatedAt: '2026-03-04T00:00:00.000Z',
				},
			},
		});
		expect(normalized.lastSessionFog?.fogState.polygons).toHaveLength(1);
		expect(normalized.lastSessionFog?.sourceBoardId).toBe('board-1');
	});
});
