import { describe, expect, it } from 'vitest';
import { lintVaultObjects } from '$lib/domain/object-validation.js';
import type { VaultObject } from '$lib/types/object.js';
import { createVaultObjectId } from '$lib/types/object.js';

function makeQuestObject(id = 'quest-1', overrides: Partial<VaultObject> = {}): VaultObject {
	return {
		id: createVaultObjectId(id),
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
		const quest = makeQuestObject('quest-2', {
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

	it('detects parent/child hierarchy cycles', () => {
		const a = makeQuestObject('quest-a', {
			name: 'A',
			data: {
				status: 'active',
				objective: 'A objective',
				reward: '',
				steps: [],
				relatedLocationIds: [],
			},
			relationships: [{ type: 'child', targetId: createVaultObjectId('quest-b') }],
		});
		const b = makeQuestObject('quest-b', {
			name: 'B',
			data: {
				status: 'active',
				objective: 'B objective',
				reward: '',
				steps: [],
				relatedLocationIds: [],
			},
			relationships: [{ type: 'child', targetId: createVaultObjectId('quest-a') }],
		});
		const issues = lintVaultObjects([a, b]);
		const cycleIssues = issues.filter((issue) => issue.code === 'object.parent_child_cycle');
		expect(cycleIssues).toHaveLength(2);
	});

	it('detects duplicate canonical names', () => {
		const a = makeQuestObject('dup-a', {
			name: 'Sildar Hallwinter',
			data: {
				status: 'active',
				objective: 'A objective',
				reward: '',
				steps: [],
				relatedLocationIds: [],
			},
		});
		const b = makeQuestObject('dup-b', {
			name: ' sildar   hallwinter ',
			data: {
				status: 'active',
				objective: 'B objective',
				reward: '',
				steps: [],
				relatedLocationIds: [],
			},
		});
		const issues = lintVaultObjects([a, b]);
		const duplicates = issues.filter((issue) => issue.code === 'object.duplicate_canonical_name');
		expect(duplicates).toHaveLength(2);
		expect(duplicates.every((issue) => issue.severity === 'warning')).toBe(true);
	});
});
