import { describe, expect, it } from 'vitest';
import {
	buildObjectRelationshipGraph,
	getRelationshipNeighbors,
} from '$lib/domain/object-relationships.js';
import type { VaultObject } from '$lib/types/object.js';
import { createVaultObjectId } from '$lib/types/object.js';

const npc: VaultObject = {
	id: createVaultObjectId('npc-1'),
	type: 'npc',
	name: 'Sildar',
	summary: '',
	tags: ['npc'],
	relationships: [
		{ type: 'ally', targetId: createVaultObjectId('faction-1') },
		{ type: 'appears_in_session', sessionId: 'session-3' },
		{ type: 'custom', label: 'mentor', targetId: createVaultObjectId('faction-1') },
	],
	data: {
		role: 'ally',
		goals: [],
		secrets: [],
	},
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
};

const faction: VaultObject = {
	id: createVaultObjectId('faction-1'),
	type: 'faction',
	name: 'Lords Alliance',
	summary: '',
	tags: ['faction'],
	relationships: [{ type: 'ally', targetId: createVaultObjectId('npc-1') }],
	data: {
		factionType: 'alliance',
		goals: [],
		resources: [],
	},
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('buildObjectRelationshipGraph', () => {
	it('builds graph nodes/edges and marks unresolved targets', () => {
		const graph = buildObjectRelationshipGraph([
			npc,
			{
				...faction,
				relationships: [
					...faction.relationships,
					{ type: 'enemy', targetId: createVaultObjectId('missing-obj') },
				],
			},
		]);

		expect(graph.nodes).toHaveLength(2);
		expect(graph.edges).toHaveLength(5);
		expect(graph.edges.some((edge) => edge.unresolved)).toBe(true);
		expect(
			graph.edges.some((edge) => edge.type === 'custom' && edge.label === 'mentor'),
		).toBe(true);
	});

	it('returns bidirectional neighbors for linked objects', () => {
		const graph = buildObjectRelationshipGraph([npc, faction]);
		const npcNeighbors = getRelationshipNeighbors(graph, npc.id);
		expect(npcNeighbors).toContain(faction.id);
	});
});
