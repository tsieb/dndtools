import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	findWidgetDefinition,
	getSceneForActor,
	type CoreCommand,
} from '@dndtools/core';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { boardWidgetsOf, payloadIndex } from './board-helpers';

// RC-ENG-10.2 — `boardWidgetsOf` used to map every instance of the RAW scene and default one with
// no payload to `available`, while `getSceneForActor` leaves out the instances outside the actor's
// sections. A section-scoped player previewing a shared screen therefore got the titles and
// configuration of widgets their own read never delivered.

function build() {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	const run = (command: CoreCommand) => {
		const result = dispatchCommand(state, env, command);
		if (result.status !== 'accepted') {
			throw new Error(`command rejected: ${JSON.stringify(result.rejection)}`);
		}
		state = result.nextState;
	};
	run({
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Harbor', description: '', visibility: 'player-visible', tags: [] },
	});
	const sceneId = Object.keys(state.scenes.scenes)[0]!;
	const add = (title: string, x: number) =>
		run({
			type: 'scene.add-widget',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				widget: {
					type: 'note',
					version: '1.0.0',
					layout: { x, y: 0, w: 240, h: 160 },
					configuration: { visibility: 'player-visible', title, body: `${title} body` },
					localState: {},
					binding: null,
				},
			},
		});
	add('Harbor notice', 0);
	add('Smuggler cache', 300);
	const [notice, cache] = state.scenes.scenes[sceneId]!.widgets.map((w) => w.id);
	run({
		type: 'scene.set-sections',
		actorId: DM_ACTOR.id,
		payload: {
			sceneId,
			sections: [
				{
					id: 'section-dock',
					name: 'Dock',
					bounds: { x: 0, y: 0, w: 280, h: 200 },
					widgetInstanceIds: [notice!],
				},
				{
					id: 'section-cellar',
					name: 'Cellar',
					bounds: { x: 300, y: 0, w: 280, h: 200 },
					widgetInstanceIds: [cache!],
				},
			],
		},
	});
	// The player is limited to the Dock.
	run({
		type: 'scene.update-metadata',
		actorId: DM_ACTOR.id,
		payload: {
			sceneId,
			playerViewAssignments: [{ playerActorId: PLAYER_ACTOR.id, sectionIds: ['section-dock'] }],
		},
	});

	const viewModel = (actorId: string, options?: { includeUndelivered?: boolean }) => {
		const summary = getSceneForActor(state.scenes, state.permissions, actorId, sceneId, {
			widgetPackages: state.widgets,
		});
		if ('kind' in summary) throw new Error(`scene denied: ${summary.reason}`);
		return boardWidgetsOf(
			state.scenes.scenes[sceneId]!.widgets,
			payloadIndex(summary.widgets),
			(type) => findWidgetDefinition(state.widgets, type) ?? null,
			options,
		);
	};
	return { viewModel, notice: notice!, cache: cache! };
}

describe('boardWidgetsOf keeps only what the actor read delivered', () => {
	it('drops the instance outside a section-scoped player’s sections', () => {
		const { viewModel, notice, cache } = build();
		const widgets = viewModel(PLAYER_ACTOR.id);
		expect(widgets.map((w) => w.id)).toEqual([notice]);
		expect(widgets.map((w) => w.title)).not.toContain('Smuggler cache');
		expect(JSON.stringify(widgets)).not.toContain('Smuggler cache');
		expect(widgets.find((w) => w.id === cache)).toBeUndefined();
	});

	it('still lists every widget for the DM', () => {
		const { viewModel, notice, cache } = build();
		for (const options of [undefined, { includeUndelivered: true }]) {
			const widgets = viewModel(DM_ACTOR.id, options);
			expect(widgets.map((w) => w.id)).toEqual([notice, cache]);
			expect(widgets.every((w) => w.status === 'available')).toBe(true);
		}
	});

	it('never paints an undelivered instance as available, even when asked to keep it', () => {
		const { viewModel, cache } = build();
		const kept = viewModel(PLAYER_ACTOR.id, { includeUndelivered: true }).find(
			(w) => w.id === cache,
		);
		expect(kept?.status).toBe('hidden');
		expect(kept?.statusNote).toBe('Hidden from this viewer');
	});
});
