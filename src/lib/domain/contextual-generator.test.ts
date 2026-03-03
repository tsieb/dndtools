// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createFolderId, createNoteId } from '$lib/types/note.js';
import {
	buildContextualGeneratorState,
	generateFactionAffiliation,
	generateLocationName,
	generateNpcName,
	generateNpcQuick,
} from './contextual-generator.js';

function sequenceRandom(samples: number[]): () => number {
	let cursor = 0;
	return () => {
		const next = samples[cursor] ?? samples[samples.length - 1] ?? 0;
		cursor += 1;
		return next;
	};
}

describe('contextual generator', () => {
	it('weights vault factions using link-graph structure', () => {
		const state = buildContextualGeneratorState({
			notes: [
				{
					id: createNoteId('faction-high'),
					title: 'Silver Accord',
					tags: ['faction'],
					folder: createFolderId('/'),
					frontmatter: {},
					content: 'Faction note',
					updatedAt: '2026-03-03T00:00:00.000Z',
				},
				{
					id: createNoteId('faction-low'),
					title: 'Dusk Syndicate',
					tags: ['faction'],
					folder: createFolderId('/'),
					frontmatter: {},
					content: 'Faction note',
					updatedAt: '2026-03-03T00:00:00.000Z',
				},
				{
					id: createNoteId('link-a'),
					title: 'A',
					tags: [],
					folder: createFolderId('/'),
					frontmatter: {},
					content: 'A',
					updatedAt: '2026-03-03T00:00:00.000Z',
				},
			],
			objects: [],
			links: [
				{ sourceId: 'faction-high', targetId: 'link-a' },
				{ sourceId: 'link-a', targetId: 'faction-high' },
				{ sourceId: 'faction-high', targetId: 'link-a' },
			],
		});

		expect(state.factionCandidates[0]?.name).toBe('Silver Accord');
		const selected = generateFactionAffiliation(state, { random: () => 0.01 });
		expect(selected).toBe('Silver Accord');
	});

	it('uses active region culture to pick location naming table', () => {
		const state = buildContextualGeneratorState({
			notes: [],
			objects: [],
			links: [],
			activeRegionCulture: 'Northern fjord settlements',
		});

		expect(state.cultureKey).toBe('northern');
		const location = generateLocationName(state, { random: sequenceRandom([0.0]) });
		expect(location.length).toBeGreaterThan(0);
	});

	it('prevents duplicate NPC names against existing roster', () => {
		const state = buildContextualGeneratorState({
			notes: [
				{
					id: createNoteId('npc-1'),
					title: 'Arlen',
					tags: ['npc'],
					folder: createFolderId('/'),
					frontmatter: {},
					content: 'NPC note',
					updatedAt: '2026-03-03T00:00:00.000Z',
				},
			],
			objects: [],
			links: [],
		});

		const generated = generateNpcName(state, { random: sequenceRandom([0.0, 0.0]) });
		expect(generated).not.toBe('Arlen');
		expect(generated.startsWith('Arlen')).toBe(true);
	});

	it('generates NPC quick bundle with deterministic fields', () => {
		const state = buildContextualGeneratorState({
			notes: [],
			objects: [],
			links: [],
			activeRegionCulture: 'Desert caravan route',
		});

		const npc = generateNpcQuick(state, { random: sequenceRandom([0.1, 0.2, 0.3, 0.4, 0.5]) });
		expect(npc.name.length).toBeGreaterThan(0);
		expect(npc.trait.length).toBeGreaterThan(0);
		expect(npc.bond.length).toBeGreaterThan(0);
		expect(npc.flaw.length).toBeGreaterThan(0);
		expect(npc.ideal.length).toBeGreaterThan(0);
		expect(npc.motivation.length).toBeGreaterThan(0);
		expect(npc.factionAffiliation.length).toBeGreaterThan(0);
		expect(npc.culture).toBe('desert');
	});
});
