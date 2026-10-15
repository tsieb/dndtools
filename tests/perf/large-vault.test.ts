import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import type { CoreCommand, CoreStateSlice } from '../../packages/core/src/commands/types';
import { dispatchCommand } from '../../packages/core/src/commands/dispatch';
import {
	DEFAULT_MAX_PAYLOAD_BYTES,
	validatePlatformRequest,
} from '../../packages/core/src/platform/service-boundary';
import { createStoragePlatformServiceRegistry } from '../../packages/core/src/schemas/platform-service';
import { DM_ACTOR, makeEnvironment } from '../../packages/core/src/testing/fixtures';
import {
	buildLargeVault,
	LARGE_VAULT_COUNTS,
	LARGE_VAULT_PAN_ZOOM_MAP,
} from '../../packages/core/src/testing/large-vault';
import {
	PERFORMANCE_BUDGETS,
	budgetsForOwner,
	validateBudgetRegistry,
} from '../../packages/core/src/perf/budget-registry';
import { buildDemoSeedProfile } from '../../apps/gm-react/src/runtime/demo-seed';
import {
	GRAPH_INDEXING_NOTES,
	largeScenarioCommits,
	SCENARIOS,
	WIDGET_UPDATE_ROWS,
} from '../../scripts/perf/capture';
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
		state.content.items['n0'].body = 'mutated';
		state.permissions.actors['actor-dm'].displayName = 'mutated';
		expect(second.permissions.actors['actor-dm'].displayName).toBe('Test DM');
		expect(second.content.items['n0'].body).toContain('[[Perf note 1]]');
		const titles = new Set(Object.values(second.content.items).map((note) => note.title));
		for (const note of Object.values(second.content.items)) {
			const links = [...note.body.matchAll(/\[\[(Perf note \d+)\]\]/g)];
			expect(links).toHaveLength(2);
			for (const match of links) expect(titles.has(match[1])).toBe(true);
		}
		const panZoom = Object.values(second.maps.maps).filter(
			(map) => map.name === LARGE_VAULT_PAN_ZOOM_MAP.name,
		);
		expect(panZoom).toHaveLength(1);
		expect(panZoom[0].layers).toHaveLength(LARGE_VAULT_PAN_ZOOM_MAP.layers);
		expect(panZoom[0].pois).toHaveLength(LARGE_VAULT_PAN_ZOOM_MAP.pois);
	}, 30_000);
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

	describe('storage payload cap', () => {
		// Every accepted command persists the whole durable state through `storage.persistFullState`,
		// which rejects a payload over the default cap. This fixture keeps the cap where it is.
		const cap = DEFAULT_MAX_PAYLOAD_BYTES;
		// Minimum room left under the cap on either boundary shape. RC-KNW-5.2's note history alone
		// added ~190 KB to the doubled reference payload, so this absorbs two changes of that size
		// before a hosted capture can lose a :large row to a rejected commit.
		const headroom = 384 * 1024;

		// The commits each :large scenario makes after its snapshot is restored, built by
		// `scripts/perf/capture.ts` from the same data its scenarios dispatch.
		const commitsFor = (state: CoreStateSlice) =>
			largeScenarioCommits(state, DM_ACTOR.id) as Record<string, CoreCommand[]>;

		function uuidSizedIds() {
			let n = 0;
			// The browser runtime mints UUIDs, longer than the fixture's sequential ids.
			return () => `00000000-0000-4000-8000-${(n += 1).toString().padStart(12, '0')}`;
		}

		const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');

		it('declares the commits of every :large scenario', () => {
			const commits = commitsFor(buildLargeVault());
			expect(Object.keys(commits).sort()).toEqual(
				SCENARIOS.map((scenario) => scenario.budgetId)
					.filter((id) => id.endsWith(':large'))
					.sort(),
			);
			// Only these two rows write on the large vault; every other row reads the snapshot.
			const writers = Object.entries(commits).filter(([, list]) => list.length > 0);
			expect(Object.fromEntries(writers.map(([id, list]) => [id, list.length]))).toEqual({
				'widget-update:large': WIDGET_UPDATE_ROWS.length,
				'graph-indexing:large': GRAPH_INDEXING_NOTES.length,
			});
		});

		it('keeps every :large scenario commit under the cap on both boundary shapes, with headroom', () => {
			const registry = createStoragePlatformServiceRegistry();
			expect(registry.get('storage.persistFullState')?.maxPayloadBytes).toBeUndefined();
			const peaks: Record<string, { current: number; reference: number }> = {};
			for (const [scenarioId, commits] of Object.entries(commitsFor(buildLargeVault()))) {
				let state = buildLargeVault();
				// A scenario that commits nothing still holds the restored snapshot as its durable state.
				let current = bytes({ next: state, appended: [] });
				let reference = bytes({ previous: state, next: state });
				const env = makeEnvironment({ ids: uuidSizedIds() });
				for (const command of commits) {
					const result = dispatchCommand(state, env, command);
					expect(result.status, `${scenarioId}: ${command.type}`).toBe('accepted');
					if (result.status !== 'accepted') break;
					const next = result.nextState;
					const appended = next.sync.operations.slice(state.sync.operations.length);
					// This revision's boundary: the next state and the operations the commit appends,
					// validated by the real storage registry.
					const request = { next, appended };
					const validated = validatePlatformRequest(registry, 'storage.persistFullState', request);
					expect(validated.ok, `${scenarioId}: ${command.type}`).toBe(true);
					current = Math.max(current, bytes(request));
					// The pinned CI reference (`tests/perf/baseline.ci.json`) sends the previous AND the
					// next state, so it measures about twice the vault. The capture drives both revisions.
					reference = Math.max(reference, bytes({ previous: state, next }));
					state = next;
				}
				peaks[scenarioId] = { current, reference };
			}
			console.info(`Large fixture peak commit payloads (cap ${cap} B): ${JSON.stringify(peaks)}`);
			for (const [scenarioId, peak] of Object.entries(peaks)) {
				expect(peak.current, `${scenarioId} (this revision)`).toBeLessThanOrEqual(cap - headroom);
				expect(peak.reference, `${scenarioId} (pinned reference)`).toBeLessThanOrEqual(
					cap - headroom,
				);
			}
		}, 60_000);
	});
});
