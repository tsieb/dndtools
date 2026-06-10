import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	WIDGET_DATA_ENVIRONMENT_SCHEMA_VERSION,
	dispatchCommand,
	entityBindingKey,
	getSceneForActor,
	listScenesForActor,
	type EntityBindingRecord,
	type WidgetDataEnvironment,
} from '../src';

function createSharedScene() {
	const env = makeEnvironment();
	const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	const created = dispatchCommand(state, env, {
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Shared Forum', visibility: 'shared' },
	});
	if (created.status !== 'accepted') throw new Error('create');
	const sceneId = Object.keys(created.nextState.scenes.scenes)[0];
	if (!sceneId) throw new Error('no id');
	return { state: created.nextState, env, sceneId };
}

function makeDataEnv(records: EntityBindingRecord[]): WidgetDataEnvironment {
	const entities: Record<string, EntityBindingRecord> = {};
	for (const r of records) {
		entities[entityBindingKey(r.entityType, r.entityId)] = r;
	}
	return { entities, schemaVersion: WIDGET_DATA_ENVIRONMENT_SCHEMA_VERSION };
}

function addNoteWidget(
	state: ReturnType<typeof createSharedScene>['state'],
	env: ReturnType<typeof makeEnvironment>,
	sceneId: string,
	entityId: string,
) {
	const result = dispatchCommand(state, env, {
		type: 'scene.add-widget',
		actorId: DM_ACTOR.id,
		payload: {
			sceneId,
			widget: {
				type: 'note',
				version: '1.0.0',
				layout: { x: 0, y: 0, w: 160, h: 120 },
				binding: { source: { entityType: 'note', entityId }, mode: 'read', requiredCapability: 'viewer' },
			},
		},
	});
	if (result.status !== 'accepted') throw new Error('add-widget failed');
	const evt = result.events.find((e) => e.kind === 'scene.widget-added');
	if (!evt || evt.kind !== 'scene.widget-added') throw new Error('missing widget-added event');
	return { state: result.nextState, widgetId: evt.widgetInstanceId };
}

describe('CANVAS-013: Scene-level metadata authored independently of widget layout and entity data', () => {
	it('player assigned to a shared Scene sees the Scene shell while DM-only authoring is still distinct', () => {
		const { state, env, sceneId } = createSharedScene();
		const assigned = dispatchCommand(state, env, {
			type: 'scene.update-metadata',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				playerViewAssignments: [{ playerActorId: PLAYER_ACTOR.id, sectionIds: null }],
			},
		});
		expect(assigned.status).toBe('accepted');
		if (assigned.status !== 'accepted') return;
		const playerList = listScenesForActor(
			assigned.nextState.scenes,
			assigned.nextState.permissions,
			PLAYER_ACTOR.id,
		);
		expect(playerList.map((s) => s.name)).toEqual(['Shared Forum']);
		const summary = getSceneForActor(
			assigned.nextState.scenes,
			assigned.nextState.permissions,
			PLAYER_ACTOR.id,
			sceneId,
		);
		expect('widgets' in summary).toBe(true);
	});

	it('widget bindings in a player-assigned shared Scene are actor-filtered: dm-only entity is hidden from player', () => {
		// AC1 binding-filter coverage: a player receiving the scene shell must not see
		// widgets whose bound entity is dm-only — the Processing Core filters them.
		const { state, env, sceneId } = createSharedScene();
		const { state: withWidget } = addNoteWidget(state, env, sceneId, 'secret-note');
		const assigned = dispatchCommand(withWidget, env, {
			type: 'scene.update-metadata',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				playerViewAssignments: [{ playerActorId: PLAYER_ACTOR.id, sectionIds: null }],
			},
		});
		expect(assigned.status).toBe('accepted');
		if (assigned.status !== 'accepted') return;

		const dataEnv = makeDataEnv([
			{ entityType: 'note', entityId: 'secret-note', visibility: 'dm-only' },
		]);
		const summary = getSceneForActor(
			assigned.nextState.scenes,
			assigned.nextState.permissions,
			PLAYER_ACTOR.id,
			sceneId,
			{ dataEnvironment: dataEnv },
		);
		// Scene shell is accessible to the assigned player.
		expect('kind' in summary).toBe(false);
		if ('kind' in summary) return;
		// The dm-only widget binding is hidden — not leaked to the player.
		expect(summary.widgets).toHaveLength(1);
		expect(summary.widgets[0]?.kind).toBe('hidden');
	});

	it('changing tags or background does not touch widget bindings or canonical entity revision', () => {
		// AC2 coverage: scene has a bound widget before the metadata update so
		// the assertion is non-trivial (was previously vacuous with an empty widget array).
		const { state, env, sceneId } = createSharedScene();
		const { state: withWidget } = addNoteWidget(state, env, sceneId, 'bound-note');
		const before = withWidget.scenes.scenes[sceneId];
		expect(before).toBeTruthy();
		expect(before?.widgets).toHaveLength(1);

		const result = dispatchCommand(withWidget, env, {
			type: 'scene.update-metadata',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				tags: ['new-tag'],
				visualSettings: { background: 'dark' },
			},
		});
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		const after = result.nextState.scenes.scenes[sceneId];
		if (!before || !after) throw new Error('missing scene');
		expect(after.tags).toEqual(['new-tag']);
		expect(after.visualSettings.background).toBe('dark');
		// Widget bindings are untouched by a metadata-only update.
		expect(after.widgets).toEqual(before.widgets);
		// Entity state slices are not modified; only the scene slice changed.
		expect(result.nextState.permissions).toBe(withWidget.permissions);
	});

	it('non-DM editors cannot author Scene metadata', () => {
		const { state, env, sceneId } = createSharedScene();
		const denied = dispatchCommand(state, env, {
			type: 'scene.update-metadata',
			actorId: PLAYER_ACTOR.id,
			payload: { sceneId, tags: ['hax'] },
		});
		expect(denied.status).toBe('rejected');
		if (denied.status !== 'rejected') return;
		expect(denied.rejection.code).toBe('actor-not-authorized');
	});
});
