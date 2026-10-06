import { describe, expect, it } from 'vitest';
import { dispatchCommand } from '../src/commands/dispatch';
import type { CommandResult, CoreCommand, CoreStateSlice } from '../src/commands/types';
import { DEFAULT_COMMAND_CENTER_TOOLS } from '../src/state/command-center-state';
import type { WidgetPackageDefinition } from '../src/state/widget-package-state';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import type { CoreEnvironment } from '../src/commands/types';

function dispatch(
	state: CoreStateSlice,
	env: CoreEnvironment,
	command: CoreCommand,
): CommandResult {
	return dispatchCommand(state, env, command);
}

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

const customPackage: WidgetPackageDefinition = {
	id: 'workspace.custom-tools',
	version: '1.0.0',
	displayName: 'Custom Tools',
	widgets: [
		{
			type: 'custom-tool',
			version: '1.0.0',
			displayName: 'Custom Tool',
			author: 'workspace',
			supportedProfiles: ['desktop', 'tablet', 'mobile', 'web'],
			defaultSize: { width: 200, height: 140 },
			minSize: { width: 120, height: 80 },
			resizePolicy: 'free',
			requiredBindings: [],
			optionalBindings: [],
			configurationSchema: { type: 'object', additionalProperties: true },
			capabilitySets: ['manager', 'operator', 'viewer'],
			commands: [],
			events: [],
			hostPermissions: [],
		},
	],
	migrations: [],
	assets: [],
	portabilityWarnings: [],
};

describe('CMD-001 Command Center as home Scene', () => {
	it('creates a default Command Center Scene from the system template when none exists', () => {
		const env = makeEnvironment();
		const state = buildInitialState(DM_ACTOR);

		const result = accept(
			dispatch(state, env, {
				type: 'command-center.ensure-home',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		);

		const homeSceneId = result.nextState.commandCenter.homeSceneId;
		expect(homeSceneId).not.toBeNull();
		const scene = result.nextState.scenes.scenes[homeSceneId!];
		expect(scene).toBeDefined();
		expect(scene!.visibility).toBe('dm-only');
		expect(scene!.widgets.map((w) => w.type)).toEqual(
			DEFAULT_COMMAND_CENTER_TOOLS.map((t) => t.type),
		);
		expect(result.events.map((e) => e.kind)).toEqual([
			'command-center.home-created',
			'command-center.home-ready',
		]);
		// A scene-create and a set-home operation are appended for sync replay.
		expect(result.operationIds).toHaveLength(2);
		expect(result.nextState.sync.operations.map((o) => o.opType)).toEqual([
			'scene.create',
			'command-center.set-home',
		]);
	});

	it('is idempotent: a second ensure-home leaves durable state untouched', () => {
		const env = makeEnvironment();
		const first = accept(
			dispatch(buildInitialState(DM_ACTOR), env, {
				type: 'command-center.ensure-home',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		);
		const homeSceneId = first.nextState.commandCenter.homeSceneId;

		const second = accept(
			dispatch(first.nextState, env, {
				type: 'command-center.ensure-home',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		);

		expect(second.nextState.commandCenter.homeSceneId).toBe(homeSceneId);
		expect(Object.keys(second.nextState.scenes.scenes)).toHaveLength(1);
		expect(second.operationIds).toHaveLength(0);
		expect(second.events.map((e) => e.kind)).toEqual(['command-center.home-ready']);
	});

	it('recreates the home Scene when the pointer references a deleted Scene', () => {
		const env = makeEnvironment();
		const created = accept(
			dispatch(buildInitialState(DM_ACTOR), env, {
				type: 'command-center.ensure-home',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		);
		const stale: CoreStateSlice = {
			...created.nextState,
			scenes: { ...created.nextState.scenes, scenes: {} },
		};

		const recreated = accept(
			dispatch(stale, env, {
				type: 'command-center.ensure-home',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		);
		const homeSceneId = recreated.nextState.commandCenter.homeSceneId;
		expect(homeSceneId).not.toBeNull();
		expect(recreated.nextState.scenes.scenes[homeSceneId!]).toBeDefined();
	});

	it('rejects a non-DM actor', () => {
		const env = makeEnvironment();
		const result = dispatch(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env, {
			type: 'command-center.ensure-home',
			actorId: PLAYER_ACTOR.id,
			payload: {},
		});
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') expect(result.rejection.code).toBe('actor-not-authorized');
	});
});

describe('CMD-007 Command Center presets', () => {
	function withHome(): { env: CoreEnvironment; state: CoreStateSlice; homeSceneId: string } {
		const env = makeEnvironment();
		const created = accept(
			dispatch(buildInitialState(DM_ACTOR), env, {
				type: 'command-center.ensure-home',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		);
		return {
			env,
			state: created.nextState,
			homeSceneId: created.nextState.commandCenter.homeSceneId!,
		};
	}

	it('save-preset is rejected when no Command Center is configured', () => {
		const env = makeEnvironment();
		const result = dispatch(buildInitialState(DM_ACTOR), env, {
			type: 'command-center.save-preset',
			actorId: DM_ACTOR.id,
			payload: { name: 'Combat Night' },
		});
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') {
			expect(result.rejection.code).toBe('command-center-not-configured');
		}
	});

	it('restoring a preset only changes the Command Center Scene', () => {
		const { env, state, homeSceneId } = withHome();

		// An unrelated Scene that must not be touched by preset restore.
		const otherCreated = accept(
			dispatch(state, env, {
				type: 'scene.create',
				actorId: DM_ACTOR.id,
				payload: { name: 'Town Square' },
			}),
		);
		const otherSceneId = Object.keys(otherCreated.nextState.scenes.scenes).find(
			(id) => id !== homeSceneId,
		)!;
		const otherBefore = otherCreated.nextState.scenes.scenes[otherSceneId];

		// Save a preset capturing the default layout.
		const saved = accept(
			dispatch(otherCreated.nextState, env, {
				type: 'command-center.save-preset',
				actorId: DM_ACTOR.id,
				payload: { name: 'Default Board' },
			}),
		);
		const presetId = saved.nextState.commandCenter.presets
			? Object.keys(saved.nextState.commandCenter.presets)[0]
			: undefined;
		expect(presetId).toBeDefined();

		// Mutate the Command Center after saving the preset.
		const firstWidgetId = saved.nextState.scenes.scenes[homeSceneId]!.widgets[0]!.id;
		const moved = accept(
			dispatch(saved.nextState, env, {
				type: 'scene.move-widget',
				actorId: DM_ACTOR.id,
				payload: { sceneId: homeSceneId, widgetInstanceId: firstWidgetId, x: 999, y: 999 },
			}),
		);

		// Apply the preset and confirm it restores the captured layout.
		const restored = accept(
			dispatch(moved.nextState, env, {
				type: 'command-center.apply-preset',
				actorId: DM_ACTOR.id,
				payload: { presetId },
			}),
		);
		const restoredScene = restored.nextState.scenes.scenes[homeSceneId]!;
		expect(restoredScene.widgets).toHaveLength(DEFAULT_COMMAND_CENTER_TOOLS.length);
		// The default board's first widget sits at the template position, not the moved one.
		expect(restoredScene.widgets[0]!.layout.x).not.toBe(999);

		// The unrelated Scene is byte-for-byte unchanged.
		expect(restored.nextState.scenes.scenes[otherSceneId]).toEqual(otherBefore);

		const event = restored.events.find((e) => e.kind === 'command-center.preset-restored');
		expect(event).toMatchObject({
			restoredWidgetCount: DEFAULT_COMMAND_CENTER_TOOLS.length,
			missingWidgetTypes: [],
		});
	});

	it('reports a missing widget type and restores the remaining valid widgets', () => {
		const { env, state, homeSceneId } = withHome();

		const installed = accept(
			dispatch(state, env, {
				type: 'widget.package.install',
				actorId: DM_ACTOR.id,
				payload: { package: customPackage },
			}),
		);
		const enabled = accept(
			dispatch(installed.nextState, env, {
				type: 'widget.package.enable',
				actorId: DM_ACTOR.id,
				payload: { packageId: customPackage.id },
			}),
		);
		const withCustom = accept(
			dispatch(enabled.nextState, env, {
				type: 'scene.add-widget',
				actorId: DM_ACTOR.id,
				payload: {
					sceneId: homeSceneId,
					widget: {
						type: 'custom-tool',
						version: '1.0.0',
						layout: { x: 10, y: 10, w: 200, h: 140 },
						binding: null,
					},
				},
			}),
		);

		const saved = accept(
			dispatch(withCustom.nextState, env, {
				type: 'command-center.save-preset',
				actorId: DM_ACTOR.id,
				payload: { name: 'With Custom' },
			}),
		);
		const presetId = Object.keys(saved.nextState.commandCenter.presets)[0];

		// The custom widget's package is removed before the preset is restored.
		const removed = accept(
			dispatch(saved.nextState, env, {
				type: 'widget.package.remove',
				actorId: DM_ACTOR.id,
				payload: { packageId: customPackage.id },
			}),
		);

		const restored = accept(
			dispatch(removed.nextState, env, {
				type: 'command-center.apply-preset',
				actorId: DM_ACTOR.id,
				payload: { presetId },
			}),
		);
		const restoredScene = restored.nextState.scenes.scenes[homeSceneId]!;
		expect(restoredScene.widgets.map((w) => w.type)).not.toContain('custom-tool');
		expect(restoredScene.widgets).toHaveLength(DEFAULT_COMMAND_CENTER_TOOLS.length);
		const event = restored.events.find((e) => e.kind === 'command-center.preset-restored');
		expect(event).toMatchObject({
			restoredWidgetCount: DEFAULT_COMMAND_CENTER_TOOLS.length,
			missingWidgetTypes: ['custom-tool'],
		});
	});

	it('rejects applying an unknown preset', () => {
		const { env, state } = withHome();
		const result = dispatch(state, env, {
			type: 'command-center.apply-preset',
			actorId: DM_ACTOR.id,
			payload: { presetId: 'nope' },
		});
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') expect(result.rejection.code).toBe('preset-not-found');
	});
});

describe('CMD-002 arranging Command Center widgets', () => {
	it('persists widget layout changes through the move-widget command', () => {
		const env = makeEnvironment();
		const created = accept(
			dispatch(buildInitialState(DM_ACTOR), env, {
				type: 'command-center.ensure-home',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		);
		const homeSceneId = created.nextState.commandCenter.homeSceneId!;
		const widget = created.nextState.scenes.scenes[homeSceneId]!.widgets[1]!;

		const moved = accept(
			dispatch(created.nextState, env, {
				type: 'scene.move-widget',
				actorId: DM_ACTOR.id,
				payload: { sceneId: homeSceneId, widgetInstanceId: widget.id, x: 480, y: 96 },
			}),
		);
		const movedWidget = moved.nextState.scenes.scenes[homeSceneId]!.widgets.find(
			(w) => w.id === widget.id,
		)!;
		expect(movedWidget.layout.x).toBe(480);
		expect(movedWidget.layout.y).toBe(96);
		expect(moved.operationIds).toHaveLength(1);
	});
});
