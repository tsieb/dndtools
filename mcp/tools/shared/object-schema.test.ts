import { describe, expect, it } from 'vitest';
import {
	objectDataSchemaByType,
	objectRelationshipSchema,
	vaultObjectRecordSchema,
} from './object-schema.js';

describe('object-schema', () => {
	it('accepts all object data schemas for the 12 supported types', () => {
		const samples = {
			stat_block: {
				abilities: {},
				traits: [],
				actions: [],
				reactions: [],
				legendaryActions: [],
			},
			character: {
				abilities: {},
				goals: [],
				bonds: [],
				flaws: [],
			},
			image: {
				url: 'file:///map.png',
			},
			map: {
				filePath: '.vault/assets/maps/region-map.png',
			},
			npc: {
				goals: [],
				secrets: [],
			},
			location: {
				features: [],
				notableNpcIds: [],
			},
			faction: {
				goals: [],
				resources: [],
			},
			quest: {
				steps: [],
				relatedLocationIds: [],
			},
			item: {
				properties: [],
			},
			handout: {
				title: 'Letter from the Duke',
				content: 'Meet me at dawn.',
				handoutType: 'letter',
				delivered: false,
			},
			encounter: {
				participants: [],
				rewards: [],
			},
			timeline_event: {
				involvedObjectIds: [],
				consequences: [],
			},
		} as const;

		for (const [type, payload] of Object.entries(samples)) {
			const schema = objectDataSchemaByType[type as keyof typeof objectDataSchemaByType];
			expect(schema.safeParse(payload).success).toBe(true);
		}
	});

	it('supports custom relationship labels with target references', () => {
		expect(
			objectRelationshipSchema.safeParse({
				type: 'custom',
				label: 'mentor',
				targetId: 'obj-123',
			}).success,
		).toBe(true);
	});

	it('rejects custom relationships without labels', () => {
		expect(
			objectRelationshipSchema.safeParse({
				type: 'custom',
				targetId: 'obj-123',
			}).success,
		).toBe(false);
	});

	it('validates discriminated full object records', () => {
		const parsed = vaultObjectRecordSchema.safeParse({
			id: 'obj-1',
			type: 'npc',
			name: 'Sildar Hallwinter',
			summary: '',
			tags: ['npc'],
			relationships: [{ type: 'custom', label: 'mentor', targetId: 'obj-2' }],
			data: {
				role: 'ally',
				goals: [],
				secrets: [],
			},
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
		});
		expect(parsed.success).toBe(true);
	});

	it('accepts map records with layers and POIs', () => {
		const parsed = objectDataSchemaByType.map.safeParse({
			filePath: '.vault/assets/maps/phandalin.png',
			layers: [
				{
					id: 'layer-dm',
					name: 'DM Notes',
					colorTheme: 'amber',
					visible: true,
					playerVisible: false,
				},
			],
			pois: [
				{
					id: 'poi-town-square',
					label: 'Town Square',
					category: 'city',
					x: 0.42,
					y: 0.61,
					layerId: 'layer-dm',
					linkedNoteId: 'note-phandalin',
				},
			],
		});
		expect(parsed.success).toBe(true);
	});
});
