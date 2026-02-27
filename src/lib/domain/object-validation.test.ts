import { describe, expect, it } from 'vitest';
import { lintVaultObjects } from '$lib/domain/object-validation.js';
import type { VaultObject } from '$lib/types/object.js';
import { createVaultObjectId } from '$lib/types/object.js';

function makeQuestObject(overrides: Partial<VaultObject> = {}): VaultObject {
	return {
		id: createVaultObjectId('quest-1'),
		type: 'quest',
		name: 'Broken Quest',
		summary: '',
		tags: ['quest'],
		relationships: [],
		data: {
			status: 'active',
			objective: '',
			reward: '',
			steps: [],
			relatedLocationIds: [],
		},
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		...overrides,
	} as VaultObject;
}

describe('lintVaultObjects', () => {
	it('reports required-field issues for object-specific schemas', () => {
		const issues = lintVaultObjects([makeQuestObject()]);
		expect(issues.some((issue) => issue.code === 'quest.objective_required')).toBe(true);
	});

	it('reports broken relationship references', () => {
		const quest = makeQuestObject({
			data: {
				status: 'active',
				objective: 'Recover artifact',
				reward: '500gp',
				steps: ['Travel'],
				relatedLocationIds: [],
			},
			relationships: [
				{
					type: 'ally',
					targetId: createVaultObjectId('missing-npc'),
				},
			],
		});
		const issues = lintVaultObjects([quest]);
		expect(issues.some((issue) => issue.code === 'object.relationship_broken_reference')).toBe(
			true,
		);
	});
});
