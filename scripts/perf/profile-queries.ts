/** Diagnostic only: pnpm exec tsx scripts/perf/profile-queries.ts. Not a browser budget capture. */
import { Session } from 'node:inspector/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import {
	DM_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../../packages/core/src/testing/fixtures';
import {
	dispatchCommand,
	getGraphHealthForDm,
	getGraphClustersForActor,
	getGraphVisualizationForActor,
} from '../../packages/core/src/index';
let state = buildInitialState(DM_ACTOR);
const env = makeEnvironment();
for (let i = 0; i < 2000; i++) {
	const result = dispatchCommand(state, env, {
		type: 'content.create-item',
		actorId: DM_ACTOR.id,
		payload: {
			kind: 'note',
			title: `Perf note ${i}`,
			body: `Perf fixture note ${i}. See [[Perf note ${(i + 1) % 2000}]] and [[Perf note ${(i + 7) % 2000}]].`,
			visibility: 'player-visible',
		},
	});
	if (result.status !== 'accepted') throw new Error(JSON.stringify(result.rejection));
	state = result.nextState;
}
const inspector = new Session();
inspector.connect();
await inspector.post('Profiler.enable');
await inspector.post('Profiler.start');
const samples: Record<string, number[]> = {};
for (let i = 0; i < 7; i++)
	for (const [name, run] of Object.entries({
		visualization: () =>
			getGraphVisualizationForActor(
				state.content,
				state.maps,
				state.session,
				state.permissions,
				DM_ACTOR.id,
				'local-markdown',
			),
		health: () =>
			getGraphHealthForDm(state.content, state.permissions, DM_ACTOR.id, '2026-09-19T12:00:00Z'),
		clusters: () =>
			getGraphClustersForActor(
				state.content,
				state.permissions,
				DM_ACTOR.id,
				'2026-09-19T12:00:00Z',
			),
	})) {
		const start = performance.now();
		run();
		(samples[name] ??= []).push(performance.now() - start);
	}
const { profile } = await inspector.post('Profiler.stop');
inspector.disconnect();
mkdirSync('tmp/perf', { recursive: true });
writeFileSync('tmp/perf/query-profile.cpuprofile', JSON.stringify(profile));
writeFileSync('tmp/perf/query-timings.json', JSON.stringify(samples, null, 2));
console.log(samples);
