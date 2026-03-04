import { describe, expect, it } from 'vitest';
import { getObjectTemplateSeed } from '$lib/domain/object-templates.js';

describe('getObjectTemplateSeed', () => {
	it('returns a 5e baseline seed for each Project 3.1 object type', () => {
		const types = [
			'stat_block',
			'character',
			'image',
			'map',
			'npc',
			'location',
			'faction',
			'quest',
			'item',
			'handout',
			'encounter',
			'timeline_event',
		] as const;

		for (const type of types) {
			const seed = getObjectTemplateSeed(type, 'dnd5e');
			expect(seed.name.length).toBeGreaterThan(0);
			expect(Array.isArray(seed.tags)).toBe(true);
			expect(Array.isArray(seed.relationships)).toBe(true);
		}
	});
});
