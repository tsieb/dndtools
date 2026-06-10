import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	PERMISSIVE_RESOLVER,
	dispatchCommand,
	getSceneForActor,
} from '../src';

function newSceneWithBoundWidget(): {
	state: ReturnType<typeof buildInitialState>;
	env: ReturnType<typeof makeEnvironment>;
	sceneId: string;
	originalWidgetId: string;
} {
	const state = buildInitialState(DM_ACTOR);
	const env = makeEnvironment();
	const created = dispatchCommand(state, env, {
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Source Scene' },
	});
	if (created.status !== 'accepted') throw new Error('create failed');
	const sceneId = Object.keys(created.nextState.scenes.scenes)[0];
	if (!sceneId) throw new Error('no scene');
	const added = dispatchCommand(created.nextState, env, {
		type: 'scene.add-widget',
		actorId: DM_ACTOR.id,
		payload: {
			sceneId,
			widget: {
				type: 'map',
				version: '1.0.0',
				layout: { x: 0, y: 0, w: 200, h: 150 },
				configuration: { initialLayer: 'political' },
				binding: {
					source: { entityType: 'map', entityId: 'map-1' },
					mode: 'read',
					requiredCapability: 'viewer',
				},
			},
		},
	});
	if (added.status !== 'accepted') throw new Error('add failed');
	const widgetAdded = added.events.find((e) => e.kind === 'scene.widget-added');
	if (!widgetAdded || widgetAdded.kind !== 'scene.widget-added')
		throw new Error('no widget event');
	return {
		state: added.nextState,
		env,
		sceneId,
		originalWidgetId: widgetAdded.widgetInstanceId,
	};
}

describe('CANVAS-004: save as template + instantiate without cloning canonical entity data', () => {
	it('instantiation creates new widget instances bound to the same canonical entities', () => {
		const { state, env, sceneId, originalWidgetId } = newSceneWithBoundWidget();

		const saved = dispatchCommand(state, env, {
			type: 'scene.save-template',
			actorId: DM_ACTOR.id,
			payload: { sourceSceneId: sceneId, templateName: 'Source Scene Template' },
		});
		expect(saved.status).toBe('accepted');
		if (saved.status !== 'accepted') return;
		const templateEvent = saved.events.find((e) => e.kind === 'scene.template-saved');
		if (!templateEvent || templateEvent.kind !== 'scene.template-saved')
			throw new Error('missing template event');
		const templateId = templateEvent.templateSceneId;
		const template = saved.nextState.scenes.scenes[templateId];
		expect(template?.templateMeta.isTemplate).toBe(true);

		const inst = dispatchCommand(saved.nextState, env, {
			type: 'scene.instantiate-template',
			actorId: DM_ACTOR.id,
			payload: { templateSceneId: templateId, newSceneName: 'Goblin Ambush #2' },
		});
		expect(inst.status).toBe('accepted');
		if (inst.status !== 'accepted') return;
		const newSceneEvent = inst.events.find((e) => e.kind === 'scene.template-instantiated');
		if (!newSceneEvent || newSceneEvent.kind !== 'scene.template-instantiated')
			throw new Error('missing instantiation event');
		const newScene = inst.nextState.scenes.scenes[newSceneEvent.newSceneId];
		expect(newScene).toBeTruthy();
		expect(newScene?.templateMeta.isTemplate).toBe(false);
		expect(newScene?.templateMeta.instantiatedFromTemplateSceneId).toBe(templateId);
		expect(newScene?.widgets).toHaveLength(1);
		const newWidget = newScene?.widgets[0];
		expect(newWidget?.id).not.toBe(originalWidgetId);
		expect(newWidget?.binding?.source.entityId).toBe('map-1');
	});

	it('renders a missing state for widgets whose binding target is unknown to the resolver', () => {
		const { state, env, sceneId } = newSceneWithBoundWidget();
		const saved = dispatchCommand(state, env, {
			type: 'scene.save-template',
			actorId: DM_ACTOR.id,
			payload: { sourceSceneId: sceneId, templateName: 'T' },
		});
		if (saved.status !== 'accepted') return;
		const templateEvent = saved.events.find((e) => e.kind === 'scene.template-saved');
		if (!templateEvent || templateEvent.kind !== 'scene.template-saved') return;
		const templateId = templateEvent.templateSceneId;

		const inst = dispatchCommand(saved.nextState, env, {
			type: 'scene.instantiate-template',
			actorId: DM_ACTOR.id,
			payload: { templateSceneId: templateId, newSceneName: 'Inst' },
		});
		if (inst.status !== 'accepted') return;
		const newSceneEvent = inst.events.find((e) => e.kind === 'scene.template-instantiated');
		if (!newSceneEvent || newSceneEvent.kind !== 'scene.template-instantiated') return;
		const newSceneId = newSceneEvent.newSceneId;

		// Resolver knows nothing — bound target is "missing", not leaked cached content.
		const summary = getSceneForActor(
			inst.nextState.scenes,
			inst.nextState.permissions,
			DM_ACTOR.id,
			newSceneId,
			{ knownEntityIds: new Set<string>(['some-other-id']), isHiddenForActor: () => false },
		);
		expect('widgets' in summary).toBe(true);
		if (!('widgets' in summary)) return;
		expect(summary.widgets[0]).toMatchObject({ kind: 'missing', type: 'map' });
	});

	it('rejects instantiating a Scene that was never marked as a template', () => {
		const { state, env, sceneId } = newSceneWithBoundWidget();
		const result = dispatchCommand(state, env, {
			type: 'scene.instantiate-template',
			actorId: DM_ACTOR.id,
			payload: { templateSceneId: sceneId, newSceneName: 'No' },
		});
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.code).toBe('template-source-not-template');
		void PERMISSIVE_RESOLVER;
	});
});
