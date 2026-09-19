import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	BUILTIN_SCENE_TEMPLATES,
	builtinSceneTemplateLayout,
	dispatchCommand,
	type CoreStateSlice,
} from '../src';

// RC-CAN-4.4 — `scene.apply-template` instantiates a template's widgets into ANY scene.

function freshScene() {
	const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	const env = makeEnvironment();
	const created = dispatchCommand(state, env, {
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Goblin Ambush' },
	});
	if (created.status !== 'accepted') throw new Error('create failed');
	const sceneId = Object.keys(created.nextState.scenes.scenes)[0];
	if (!sceneId) throw new Error('no scene');
	return { state: created.nextState, env, sceneId };
}

function apply(
	state: CoreStateSlice,
	env: ReturnType<typeof makeEnvironment>,
	payload: unknown,
	actorId = DM_ACTOR.id,
) {
	return dispatchCommand(state, env, { type: 'scene.apply-template', actorId, payload });
}

describe('RC-CAN-4.4 built-in scene templates', () => {
	it('ships the five named templates, each inside the bounded board columns', () => {
		expect(BUILTIN_SCENE_TEMPLATES.map((t) => t.name)).toEqual([
			'Combat scene',
			'Social encounter',
			'Exploration',
			'Town visit',
			'Session prep',
		]);
		for (const template of BUILTIN_SCENE_TEMPLATES) {
			expect(template.widgets.length).toBeGreaterThan(0);
			for (const widget of template.widgets) expect(widget.x + widget.w).toBeLessThanOrEqual(792);
		}
	});

	it('every built-in widget type is installed in a fresh vault', () => {
		const { state, env, sceneId } = freshScene();
		for (const template of BUILTIN_SCENE_TEMPLATES) {
			const result = apply(state, env, {
				sceneId,
				source: { kind: 'builtin', templateId: template.id },
			});
			expect(result.status).toBe('accepted');
			if (result.status !== 'accepted') continue;
			const event = result.events[0];
			expect(event?.kind === 'scene.template-applied' && event.missingWidgetTypes).toEqual([]);
		}
	});
});

describe('RC-CAN-4.4 scene.apply-template', () => {
	it('lays a built-in into a fresh scene as authored and adopts its background', () => {
		const { state, env, sceneId } = freshScene();
		const result = apply(state, env, {
			sceneId,
			source: { kind: 'builtin', templateId: 'combat' },
		});
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		const scene = result.nextState.scenes.scenes[sceneId]!;
		const combat = BUILTIN_SCENE_TEMPLATES.find((t) => t.id === 'combat')!;
		expect(scene.widgets.map((w) => w.type)).toEqual(combat.widgets.map((w) => w.type));
		expect(scene.widgets.map((w) => [w.layout.x, w.layout.y])).toEqual(
			combat.widgets.map((w) => [w.x, w.y]),
		);
		expect(scene.widgets[3]?.configuration).toEqual({ title: 'Round timer' });
		expect(new Set(scene.widgets.map((w) => w.id)).size).toBe(scene.widgets.length);
		expect(scene.visualSettings.background).toBe('dark');
		expect(scene.ownership.revision).toBe(state.scenes.scenes[sceneId]!.ownership.revision + 1);
		expect(result.nextState.sync.operations.at(-1)?.opType).toBe('scene.apply-template');
	});

	it('appends below existing tiles and keeps the scene background', () => {
		const { state, env, sceneId } = freshScene();
		const first = apply(state, env, { sceneId, source: { kind: 'builtin', templateId: 'social' } });
		if (first.status !== 'accepted') throw new Error('first apply failed');
		const before = first.nextState.scenes.scenes[sceneId]!;
		const bottom = Math.max(...before.widgets.map((w) => w.layout.y + w.layout.h));
		const maxZ = Math.max(...before.widgets.map((w) => w.layout.z));

		const second = apply(first.nextState, env, {
			sceneId,
			source: { kind: 'builtin', templateId: 'exploration' },
		});
		expect(second.status).toBe('accepted');
		if (second.status !== 'accepted') return;
		const after = second.nextState.scenes.scenes[sceneId]!;
		expect(after.widgets.slice(0, before.widgets.length)).toEqual(before.widgets);
		const appended = after.widgets.slice(before.widgets.length);
		expect(appended).toHaveLength(5);
		expect(Math.min(...appended.map((w) => w.layout.y))).toBe(bottom + 24);
		expect(Math.min(...appended.map((w) => w.layout.z))).toBeGreaterThan(maxZ);
		expect(after.visualSettings.background).toBe('parchment');
	});

	it('applies a saved Command Center preset into a plain scene', () => {
		const { state, env, sceneId } = freshScene();
		const home = dispatchCommand(state, env, {
			type: 'command-center.ensure-home',
			actorId: DM_ACTOR.id,
			payload: {},
		});
		if (home.status !== 'accepted') throw new Error('home failed');
		const saved = dispatchCommand(home.nextState, env, {
			type: 'command-center.save-preset',
			actorId: DM_ACTOR.id,
			payload: { name: 'My console' },
		});
		if (saved.status !== 'accepted') throw new Error('save failed');
		const presetId = Object.keys(saved.nextState.commandCenter.presets)[0]!;
		const preset = saved.nextState.commandCenter.presets[presetId]!;

		const result = apply(saved.nextState, env, { sceneId, source: { kind: 'preset', presetId } });
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		const scene = result.nextState.scenes.scenes[sceneId]!;
		expect(scene.widgets.map((w) => w.type)).toEqual(preset.widgets.map((w) => w.type));
		// The home scene is untouched: this is not command-center.apply-preset.
		const homeId = saved.nextState.commandCenter.homeSceneId!;
		expect(result.nextState.scenes.scenes[homeId]).toBe(saved.nextState.scenes.scenes[homeId]);
	});

	it('applies a template scene, and refuses a scene that is not a template', () => {
		const { state, env, sceneId } = freshScene();
		const filled = apply(state, env, { sceneId, source: { kind: 'builtin', templateId: 'town' } });
		if (filled.status !== 'accepted') throw new Error('fill failed');
		const saved = dispatchCommand(filled.nextState, env, {
			type: 'scene.save-template',
			actorId: DM_ACTOR.id,
			payload: { sourceSceneId: sceneId, templateName: 'Market day' },
		});
		if (saved.status !== 'accepted') throw new Error('save failed');
		const event = saved.events[0];
		if (event?.kind !== 'scene.template-saved') throw new Error('no event');

		const target = dispatchCommand(saved.nextState, env, {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name: 'Second town' },
		});
		if (target.status !== 'accepted') throw new Error('create failed');
		const targetId = Object.keys(target.nextState.scenes.scenes).find(
			(id) => target.nextState.scenes.scenes[id]!.name === 'Second town',
		)!;

		const ok = apply(target.nextState, env, {
			sceneId: targetId,
			source: { kind: 'scene', templateSceneId: event.templateSceneId },
		});
		expect(ok.status).toBe('accepted');
		if (ok.status === 'accepted') {
			expect(ok.nextState.scenes.scenes[targetId]!.widgets).toHaveLength(4);
		}

		const refused = apply(target.nextState, env, {
			sceneId: targetId,
			source: { kind: 'scene', templateSceneId: sceneId },
		});
		expect(refused.status).toBe('rejected');
		if (refused.status === 'rejected')
			expect(refused.rejection.code).toBe('template-source-not-template');
	});

	it('fails closed: players, unknown templates, missing presets and missing scenes', () => {
		const { state, env, sceneId } = freshScene();
		const cases: Array<[unknown, string, string?]> = [
			[
				{ sceneId, source: { kind: 'builtin', templateId: 'combat' } },
				'actor-not-authorized',
				PLAYER_ACTOR.id,
			],
			[{ sceneId, source: { kind: 'builtin', templateId: 'dungeon' } }, 'invalid-payload'],
			[{ sceneId, source: { kind: 'preset', presetId: 'nope' } }, 'preset-not-found'],
			[{ sceneId: 'nope', source: { kind: 'builtin', templateId: 'combat' } }, 'scene-not-found'],
		];
		for (const [payload, code, actor] of cases) {
			const result = apply(state, env, payload, actor);
			expect(result.status).toBe('rejected');
			if (result.status === 'rejected') expect(result.rejection.code).toBe(code);
			expect(result.nextState).toBe(state);
		}
	});

	it('the built-in snapshot is pure: the same ids every call, no environment needed', () => {
		const combat = BUILTIN_SCENE_TEMPLATES[0]!;
		expect(builtinSceneTemplateLayout(combat)).toEqual(builtinSceneTemplateLayout(combat));
	});
});
