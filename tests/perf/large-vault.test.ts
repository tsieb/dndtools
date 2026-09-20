import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { buildLargeVault, LARGE_VAULT_COUNTS } from '../../packages/core/src/testing/large-vault';
import {
	PERFORMANCE_BUDGETS,
	budgetsForOwner,
	validateBudgetRegistry,
} from '../../packages/core/src/perf/budget-registry';
import { buildDemoSeedProfile } from '../../apps/gm-react/src/runtime/demo-seed';
import { SCENARIOS } from '../../scripts/perf/capture';
import { validateRestoredCoreState } from '../../apps/gm-react/src/platform/storage/coreStore';

describe('large vault performance fixture', () => {
	it('builds a deterministic, independently owned, restorable snapshot in under ten seconds', async () => {
		const started = performance.now();
		const state = await buildDemoSeedProfile('large');
		const elapsed = performance.now() - started;
		expect(elapsed).toBeLessThan(10_000);
		console.info(`Large fixture build: ${elapsed.toFixed(1)} ms`);
		expect(Object.keys(state.content.items)).toHaveLength(LARGE_VAULT_COUNTS.notes);
		expect(Object.keys(state.maps.maps)).toHaveLength(LARGE_VAULT_COUNTS.maps);
		expect(Object.keys(state.characters.characters)).toHaveLength(LARGE_VAULT_COUNTS.characters);
		const scene = state.scenes.scenes[state.commandCenter.homeSceneId!];
		expect(scene.widgets).toHaveLength(LARGE_VAULT_COUNTS.tiles);
		expect(new Set(scene.widgets.map((tile) => tile.id)).size).toBe(60);
		expect(
			validateRestoredCoreState({ ...state, sync: { operations: state.sync.operations } }).content,
		).toEqual(state.content);
		const second = buildLargeVault();
		expect(second).toEqual(state);
		state.content.items['perf-note-0'].body = 'mutated';
		state.permissions.actors['actor-dm'].displayName = 'mutated';
		expect(second.permissions.actors['actor-dm'].displayName).toBe('Test DM');
		expect(second.content.items['perf-note-0'].body).toContain('[[Perf note 1]]');
		for (const note of Object.values(second.content.items)) {
			for (const match of note.body.matchAll(/\[\[Perf note (\d+)\]\]/g)) {
				expect(second.content.items[`perf-note-${match[1]}`]).toBeDefined();
			}
		}
	});
	it('registers and captures both rows of all eleven budgets with qualified large targets', () => {
		expect(SCENARIOS.map((scenario) => scenario.budgetId)).toEqual(
			PERFORMANCE_BUDGETS.map((budget) => budget.id),
		);
		expect(SCENARIOS).toHaveLength(22);
		expect(budgetsForOwner('maps')).toHaveLength(2);
		expect(budgetsForOwner('maps', PERFORMANCE_BUDGETS)).toHaveLength(4);
		expect(validateBudgetRegistry({ today: '2026-09-20' })).toEqual([]);
		for (const id of ['search', 'graph-indexing', 'vault-open', 'scene-first-render']) {
			const standard = PERFORMANCE_BUDGETS.find((budget) => budget.id === id)!;
			const large = PERFORMANCE_BUDGETS.find((budget) => budget.id === `${id}:large`)!;
			expect(large.metric.target).toBeGreaterThan(standard.metric.target);
			expect(large.dataset).toContain('5,000 notes');
		}
	});
});
