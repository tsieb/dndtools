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

		// The commits each :large scenario makes after its snapshot is restored, as dispatched by
		// `scripts/perf/capture.ts`. A new :large scenario must declare its writes here.
		const largeScenarioCommits: Record<string, (state: CoreStateSlice) => CoreCommand[]> = {
			'smoke-ci:large': () => [],
			'app-startup:large': () => [],
			'vault-open:large': () => [],
			'scene-first-render:large': () => [],
			'widget-update:large': (state) => {
				const sceneId = state.commandCenter.homeSceneId!;
				const widget = state.scenes.scenes[sceneId].widgets[0];
				return Array.from({ length: 25 }, (_, i) => ({
					type: 'scene.move-widget',
					actorId: DM_ACTOR.id,
					payload: {
						sceneId,
						widgetInstanceId: widget.id,
						x: widget.layout.x,
						y: 40 + (i % 8) * 30,
					},
				}));
			},
			// The map rows open the snapshot's pan/zoom map; they create nothing.
			'map-pan-zoom-desktop:large': () => [],
			'map-pan-zoom-slim:large': () => [],
			'search:large': () => [],
			'graph-indexing:large': () =>
				Array.from({ length: 5 }, (_, i) => ({
					type: 'content.create-item',
					actorId: DM_ACTOR.id,
					payload: {
						kind: 'note',
						title: `Perf indexed note ${i}`,
						body: 'Linked to [[Perf note 1]] and [[Perf note 2]].',
						visibility: 'player-visible',
					},
				})),
			'sync-reconciliation:large': () => [],
			'live-session-delivery:large': () => [],
		};

		function uuidSizedIds() {
			let n = 0;
			// The browser runtime mints UUIDs, longer than the fixture's sequential ids.
			return () => `00000000-0000-4000-8000-${(n += 1).toString().padStart(12, '0')}`;
		}

		const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');

		it('declares the commits of every :large scenario', () => {
			expect(Object.keys(largeScenarioCommits).sort()).toEqual(
				SCENARIOS.map((scenario) => scenario.budgetId)
					.filter((id) => id.endsWith(':large'))
					.sort(),
			);
		});

		it('keeps every :large scenario commit under the cap on both boundary shapes, with headroom', () => {
			const registry = createStoragePlatformServiceRegistry();
			expect(registry.get('storage.persistFullState')?.maxPayloadBytes).toBeUndefined();
			const peaks: Record<string, { current: number; reference: number }> = {};
			for (const [scenarioId, commits] of Object.entries(largeScenarioCommits)) {
				let state = buildLargeVault();
				// A scenario that commits nothing still holds the restored snapshot as its durable state.
				let current = bytes({ next: state, appended: [] });
				let reference = bytes({ previous: state, next: state });
				const env = makeEnvironment({ ids: uuidSizedIds() });
				for (const command of commits(state)) {
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
