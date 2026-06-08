import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	dispatchCommand,
	exportWidgetPackage,
	getSceneForActor,
	type CoreStateSlice,
	type WidgetPackageDefinition,
} from '../src';

const EMPTY_SCHEMA = { type: 'object' as const, additionalProperties: true };

function packageDefinition(
	overrides: Partial<WidgetPackageDefinition> = {},
): WidgetPackageDefinition {
	const id = overrides.id ?? 'workspace.counter';
	const version = overrides.version ?? '1.0.0';
	return {
		id,
		version,
		displayName: overrides.displayName ?? 'Counter',
		widgets: overrides.widgets ?? [
			{
				type: 'counter',
				version,
				displayName: 'Counter',
				author: 'workspace',
				supportedProfiles: ['desktop', 'tablet', 'mobile', 'web'],
				defaultSize: { width: 180, height: 120 },
				minSize: { width: 120, height: 80 },
				resizePolicy: 'free',
				requiredBindings: [],
				optionalBindings: [],
				configurationSchema: EMPTY_SCHEMA,
				runtimeStateSchema: EMPTY_SCHEMA,
				capabilitySets: ['manager', 'operator', 'viewer'],
				commands: [],
				events: [],
				hostPermissions: [],
			},
		],
		migrations: overrides.migrations ?? [],
		assets: overrides.assets ?? [],
		portabilityWarnings: overrides.portabilityWarnings ?? [],
	};
}

function createScene(state = buildInitialState(DM_ACTOR, PLAYER_ACTOR), env = makeEnvironment()) {
	const created = dispatchCommand(state, env, {
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Lifecycle', visibility: 'player-visible' },
	});
	if (created.status !== 'accepted') throw new Error('create failed');
	const sceneId = Object.keys(created.nextState.scenes.scenes)[0];
	if (!sceneId) throw new Error('missing scene id');
	return { env, state: created.nextState, sceneId };
}

function addWidget(
	state: CoreStateSlice,
	env: ReturnType<typeof makeEnvironment>,
	sceneId: string,
	type = 'map',
	configuration: Record<string, unknown> = {},
) {
	const added = dispatchCommand(state, env, {
		type: 'scene.add-widget',
		actorId: DM_ACTOR.id,
		payload: {
			sceneId,
			widget: {
				type,
				version: '1.0.0',
				layout: { x: 10, y: 20, w: 240, h: 160 },
				configuration,
				binding:
					type === 'map'
						? {
								source: { entityType: 'map', entityId: 'map-1' },
								mode: 'read' as const,
								requiredCapability: 'viewer' as const,
							}
						: null,
			},
		},
	});
	if (added.status !== 'accepted') throw new Error(`add failed: ${added.status}`);
	const event = added.events.find((item) => item.kind === 'scene.widget-added');
	if (!event || event.kind !== 'scene.widget-added') throw new Error('missing widget event');
	return { state: added.nextState, widgetId: event.widgetInstanceId };
}

function startSession(
	state: CoreStateSlice,
	env: ReturnType<typeof makeEnvironment>,
	sceneId: string,
) {
	const started = dispatchCommand(state, env, {
		type: 'session.set-workflow',
		actorId: DM_ACTOR.id,
		payload: { workflow: 'active', activeSceneId: sceneId },
	});
	if (started.status !== 'accepted') throw new Error('session start failed');
	return started.nextState;
}

describe('CANVAS-002: widget creation is a core command', () => {
	it('adds a map widget with layout, configuration, binding placeholder, and sync operation', () => {
		const { env, state, sceneId } = createScene(buildInitialState(DM_ACTOR));
		const result = dispatchCommand(state, env, {
			type: 'scene.add-widget',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				widget: {
					type: 'map',
					version: '1.0.0',
					layout: { x: 32, y: 48, w: 320, h: 240 },
					configuration: { viewport: 'north-road' },
					binding: null,
				},
			},
		});
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		const scene = result.nextState.scenes.scenes[sceneId];
		const widget = scene?.widgets[0];
		expect(widget).toMatchObject({
			type: 'map',
			version: '1.0.0',
			layout: { x: 32, y: 48, w: 320, h: 240, z: 1 },
			configuration: { viewport: 'north-road' },
			binding: null,
			localState: {},
			disabled: null,
		});
		expect(result.nextState.sync.operations.at(-1)).toMatchObject({
			entityType: 'scene',
			entityId: sceneId,
			opType: 'scene.add-widget',
			path: `widgets/${widget?.id}`,
		});
	});

	it('rejects unknown widget types before mutation', () => {
		const { env, state, sceneId } = createScene(buildInitialState(DM_ACTOR));
		const result = dispatchCommand(state, env, {
			type: 'scene.add-widget',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				widget: {
					type: 'uninstalled-widget',
					version: '1.0.0',
					layout: { x: 0, y: 0, w: 100, h: 100 },
				},
			},
		});
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.code).toBe('package-not-found');
		expect(result.nextState.scenes.scenes[sceneId]?.widgets).toEqual([]);
	});
});

describe('CANVAS-008: widget package definition and host permissions', () => {
	it('rejects installation when a widget definition lacks configuration schema', () => {
		const state = buildInitialState(DM_ACTOR);
		const env = makeEnvironment();
		const invalidPackage = {
			id: 'workspace.invalid',
			version: '1.0.0',
			displayName: 'Invalid',
			widgets: [
				{
					type: 'invalid',
					version: '1.0.0',
					displayName: 'Invalid',
					author: 'workspace',
					supportedProfiles: ['desktop'],
					defaultSize: { width: 100, height: 100 },
					minSize: { width: 100, height: 100 },
					resizePolicy: 'free',
					requiredBindings: [],
					optionalBindings: [],
					capabilitySets: ['viewer'],
					commands: [],
					events: [],
					hostPermissions: [],
				},
			],
		};
		const result = dispatchCommand(state, env, {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: invalidPackage },
		});
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.issues?.[0]).toMatchObject({
			path: 'schema.missing-configuration-schema',
		});
	});

	it('rejects re-installing a live package and preserves its enabled/trust/revision state', () => {
		const state = buildInitialState(DM_ACTOR);
		const env = makeEnvironment();
		const installed = dispatchCommand(state, env, {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: packageDefinition() },
		});
		if (installed.status !== 'accepted') throw new Error('install failed');
		const enabled = dispatchCommand(installed.nextState, env, {
			type: 'widget.package.enable',
			actorId: DM_ACTOR.id,
			payload: { packageId: 'workspace.counter' },
		});
		if (enabled.status !== 'accepted') throw new Error('enable failed');
		const before = enabled.nextState.widgets.packages['workspace.counter'];

		const reinstall = dispatchCommand(enabled.nextState, env, {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: packageDefinition() },
		});
		expect(reinstall.status).toBe('rejected');
		if (reinstall.status !== 'rejected') return;
		expect(reinstall.rejection.code).toBe('invalid-state');
		// State is untouched: the live package keeps its enabled flag and bumped revision.
		expect(reinstall.nextState.widgets.packages['workspace.counter']).toBe(before);
		expect(before?.enabled).toBe(true);
	});

	it('renders a widget as degraded when declared network access is denied by default', () => {
		const networkPackage = packageDefinition({
			id: 'workspace.weather',
			displayName: 'Weather',
			widgets: [
				{
					...packageDefinition().widgets[0]!,
					type: 'weather',
					displayName: 'Weather',
					hostPermissions: ['network'],
				},
			],
		});
		const state = buildInitialState(DM_ACTOR);
		const env = makeEnvironment();
		const installed = dispatchCommand(state, env, {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: networkPackage },
		});
		if (installed.status !== 'accepted') throw new Error('install failed');
		expect(
			installed.nextState.widgets.packages['workspace.weather']?.trust.hostPermissions.network,
		).toBe('denied');
		const enabled = dispatchCommand(installed.nextState, env, {
			type: 'widget.package.enable',
			actorId: DM_ACTOR.id,
			payload: { packageId: 'workspace.weather' },
		});
		if (enabled.status !== 'accepted') throw new Error('enable failed');
		const scene = createScene(enabled.nextState, env);
		const added = addWidget(scene.state, scene.env, scene.sceneId, 'weather');
		const summary = getSceneForActor(
			added.state.scenes,
			added.state.permissions,
			DM_ACTOR.id,
			scene.sceneId,
			{ widgetPackages: added.state.widgets },
		);
		if (!('widgets' in summary)) throw new Error('denied');
		expect(summary.widgets[0]).toMatchObject({
			kind: 'degraded',
			unavailableHostPermissions: ['network'],
		});
	});
});

describe('CANVAS-010: declared widget command dispatch', () => {
	it('allows an authorized player to start a timer through the declared command', () => {
		const { env, state, sceneId } = createScene();
		const { state: withTimer, widgetId } = addWidget(state, env, sceneId, 'timer');
		const active = startSession(withTimer, env, sceneId);
		const granted: CoreStateSlice = {
			...active,
			permissions: {
				...active.permissions,
				grants: [
					{
						id: 'grant-1',
						entityType: 'widget',
						entityId: widgetId,
						playerActorId: PLAYER_ACTOR.id,
						capabilitySet: 'operator',
						createdBy: DM_ACTOR.id,
						createdAt: '2026-06-03T00:00:00.000Z',
					},
				],
			},
		};
		const sceneRevision = granted.scenes.scenes[sceneId]?.ownership.revision;
		const started = dispatchCommand(granted, env, {
			type: 'widget.dispatch-command',
			actorId: PLAYER_ACTOR.id,
			idempotencyKey: 'timer-start-1',
			payload: {
				sceneId,
				widgetInstanceId: widgetId,
				commandType: 'timer.start',
				payload: { durationSeconds: 90 },
				expectedRevision: sceneRevision,
			},
		});
		expect(started.status).toBe('accepted');
		if (started.status !== 'accepted') return;
		expect(started.nextState.session.timers[widgetId]).toMatchObject({
			status: 'running',
			durationSeconds: 90,
			revision: 1,
		});
		expect(started.nextState.sync.operations.at(-1)).toMatchObject({
			entityType: 'session',
			opType: 'widget.dispatch-command',
			path: `timers/${widgetId}`,
		});
	});

	it('treats a repeated idempotency key as an idempotent success, not a rejection', () => {
		const { env, state, sceneId } = createScene();
		const { state: withTimer, widgetId } = addWidget(state, env, sceneId, 'timer');
		const active = startSession(withTimer, env, sceneId);
		const sceneRevision = active.scenes.scenes[sceneId]?.ownership.revision;
		const command = {
			type: 'widget.dispatch-command' as const,
			actorId: DM_ACTOR.id,
			idempotencyKey: 'timer-start-retry',
			payload: {
				sceneId,
				widgetInstanceId: widgetId,
				commandType: 'timer.start',
				payload: { durationSeconds: 45 },
				expectedRevision: sceneRevision,
			},
		};
		const first = dispatchCommand(active, env, command);
		if (first.status !== 'accepted') throw new Error('first dispatch failed');
		const firstOpId = first.nextState.sync.operations.at(-1)?.id;

		const replay = dispatchCommand(first.nextState, env, command);
		expect(replay.status).toBe('accepted');
		if (replay.status !== 'accepted') return;
		// Idempotent: no duplicate operation, no timer revision bump, returns the prior op id.
		expect(replay.nextState).toBe(first.nextState);
		expect(replay.events).toEqual([]);
		expect(replay.operationIds).toEqual([firstOpId]);
		expect(replay.nextState.session.timers[widgetId]?.revision).toBe(1);
	});

	it('rejects widget commands that target a hidden binding path', () => {
		const { env, state, sceneId } = createScene();
		const added = dispatchCommand(state, env, {
			type: 'scene.add-widget',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				widget: {
					type: 'timer',
					version: '1.0.0',
					layout: { x: 0, y: 0, w: 100, h: 100 },
					binding: {
						source: {
							entityType: 'timer',
							entityId: 'timer-1',
							selector: 'hidden:secret',
						},
						mode: 'operate',
						requiredCapability: 'operator',
					},
				},
			},
		});
		if (added.status !== 'accepted') throw new Error('add failed');
		const event = added.events.find((item) => item.kind === 'scene.widget-added');
		if (!event || event.kind !== 'scene.widget-added') throw new Error('no widget event');
		const result = dispatchCommand(added.nextState, env, {
			type: 'widget.dispatch-command',
			actorId: DM_ACTOR.id,
			idempotencyKey: 'hidden-1',
			payload: {
				sceneId,
				widgetInstanceId: event.widgetInstanceId,
				commandType: 'timer.start',
				payload: { durationSeconds: 30 },
				expectedRevision: added.nextState.scenes.scenes[sceneId]?.ownership.revision,
			},
		});
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.code).toBe('hidden-target');
		expect(result.nextState.session.timers[event.widgetInstanceId]).toBeUndefined();
	});
});

describe('CANVAS-011: widget package upgrades and migration diagnostics', () => {
	it('migrates existing widget configuration when migration logic validates', () => {
		const v1 = packageDefinition({
			widgets: [
				{
					...packageDefinition().widgets[0]!,
					configurationSchema: {
						type: 'object',
						required: ['label'],
						properties: { label: { type: 'string' } },
						additionalProperties: false,
					},
				},
			],
		});
		const v2 = packageDefinition({
			version: '2.0.0',
			widgets: [
				{
					...packageDefinition({ version: '2.0.0' }).widgets[0]!,
					version: '2.0.0',
					configurationSchema: {
						type: 'object',
						required: ['title'],
						properties: { title: { type: 'string' } },
						additionalProperties: false,
					},
				},
			],
			migrations: [
				{
					widgetType: 'counter',
					fromVersion: '1.0.0',
					toVersion: '2.0.0',
					renameConfigurationKeys: { label: 'title' },
				},
			],
		});
		const state = buildInitialState(DM_ACTOR);
		const env = makeEnvironment();
		const installed = dispatchCommand(state, env, {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: v1 },
		});
		if (installed.status !== 'accepted') throw new Error('install');
		const enabled = dispatchCommand(installed.nextState, env, {
			type: 'widget.package.enable',
			actorId: DM_ACTOR.id,
			payload: { packageId: 'workspace.counter' },
		});
		if (enabled.status !== 'accepted') throw new Error('enable');
		const scene = createScene(enabled.nextState, env);
		const added = addWidget(scene.state, scene.env, scene.sceneId, 'counter', {
			label: 'Round',
		});
		const upgraded = dispatchCommand(added.state, env, {
			type: 'widget.package.upgrade',
			actorId: DM_ACTOR.id,
			payload: { package: v2 },
		});
		expect(upgraded.status).toBe('accepted');
		if (upgraded.status !== 'accepted') return;
		const widget = upgraded.nextState.scenes.scenes[scene.sceneId]?.widgets[0];
		expect(widget).toMatchObject({
			version: '2.0.0',
			configuration: { title: 'Round' },
			disabled: null,
		});
		expect(upgraded.nextState.widgets.packages['workspace.counter']?.migrationStatus.state).toBe(
			'migrated',
		);
	});

	it('leaves a recoverable disabled instance when migration fails validation', () => {
		const v1 = packageDefinition();
		const v2 = packageDefinition({
			version: '2.0.0',
			widgets: [
				{
					...packageDefinition({ version: '2.0.0' }).widgets[0]!,
					version: '2.0.0',
				},
			],
			migrations: [
				{
					widgetType: 'counter',
					fromVersion: '1.0.0',
					toVersion: '2.0.0',
					failWithDiagnostic: 'configuration could not be migrated',
				},
			],
		});
		const state = buildInitialState(DM_ACTOR);
		const env = makeEnvironment();
		const installed = dispatchCommand(state, env, {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: v1 },
		});
		if (installed.status !== 'accepted') throw new Error('install');
		const enabled = dispatchCommand(installed.nextState, env, {
			type: 'widget.package.enable',
			actorId: DM_ACTOR.id,
			payload: { packageId: 'workspace.counter' },
		});
		if (enabled.status !== 'accepted') throw new Error('enable');
		const scene = createScene(enabled.nextState, env);
		const added = addWidget(scene.state, scene.env, scene.sceneId, 'counter');
		const upgraded = dispatchCommand(added.state, env, {
			type: 'widget.package.upgrade',
			actorId: DM_ACTOR.id,
			payload: { package: v2 },
		});
		expect(upgraded.status).toBe('accepted');
		if (upgraded.status !== 'accepted') return;
		const widget = upgraded.nextState.scenes.scenes[scene.sceneId]?.widgets[0];
		expect(widget?.version).toBe('1.0.0');
		expect(widget?.disabled).toMatchObject({
			reason: 'migration-failed',
			message: 'configuration could not be migrated',
			previousVersion: '1.0.0',
		});
		expect(upgraded.nextState.widgets.packages['workspace.counter']?.enabled).toBe(false);
		expect(upgraded.nextState.widgets.packages['workspace.counter']?.migrationStatus.state).toBe(
			'failed',
		);
	});
});

describe('CANVAS-014: destroy removes widget-local state without mutating bindings', () => {
	it('removes the widget instance and local state while only recording a Scene operation', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR);

		// Create a real map entity so we can assert it is not mutated by widget destroy.
		const mapCreated = dispatchCommand(base, env, {
			type: 'map.create',
			actorId: DM_ACTOR.id,
			payload: { name: 'Dungeon Level 1' },
		});
		expect(mapCreated.status).toBe('accepted');
		if (mapCreated.status !== 'accepted') return;
		const mapId = mapCreated.events.find((e) => e.kind === 'map.created')?.mapId as string;

		const { state: stateWithScene, sceneId } = createScene(mapCreated.nextState, env);

		// Add a map widget bound to the real map entity.
		const added = dispatchCommand(stateWithScene, env, {
			type: 'scene.add-widget',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				widget: {
					type: 'map',
					version: '1.0.0',
					layout: { x: 10, y: 20, w: 240, h: 160 },
					configuration: {},
					binding: {
						source: { entityType: 'map', entityId: mapId },
						mode: 'read' as const,
						requiredCapability: 'viewer' as const,
					},
				},
			},
		});
		if (added.status !== 'accepted') throw new Error('add-widget failed');
		const widgetEvent = added.events.find((e) => e.kind === 'scene.widget-added');
		if (!widgetEvent || widgetEvent.kind !== 'scene.widget-added')
			throw new Error('missing scene.widget-added event');
		const widgetId = widgetEvent.widgetInstanceId;

		// Capture the bound entity snapshot before destroy.
		const mapEntityBefore = added.nextState.maps.maps[mapId];

		const destroyed = dispatchCommand(added.nextState, env, {
			type: 'scene.destroy-widget',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetId },
		});
		expect(destroyed.status).toBe('accepted');
		if (destroyed.status !== 'accepted') return;
		// Widget instance is removed from the Scene.
		expect(destroyed.nextState.scenes.scenes[sceneId]?.widgets).toEqual([]);
		// Bound map entity is not mutated or deleted by the destroy command.
		expect(destroyed.nextState.maps.maps[mapId]).toBe(mapEntityBefore);
		// Only a scene-scoped operation is appended; no map.delete or entity operation.
		expect(destroyed.nextState.sync.operations.at(-1)).toMatchObject({
			entityType: 'scene',
			entityId: sceneId,
			opType: 'scene.destroy-widget',
			path: `widgets/${widgetId}`,
		});
	});

	it('rejects attempts to smuggle bound-entity deletion through destroy payload', () => {
		const { env, state, sceneId } = createScene(buildInitialState(DM_ACTOR));
		const { state: withWidget, widgetId } = addWidget(state, env, sceneId, 'map');
		const result = dispatchCommand(withWidget, env, {
			type: 'scene.destroy-widget',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetId, deleteBoundEntity: true },
		});
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.code).toBe('invalid-payload');
		expect(result.nextState.scenes.scenes[sceneId]?.widgets).toHaveLength(1);
	});
});

describe('CANVAS-017: package review, disable, remove, and export', () => {
	it('keeps existing widgets as disabled placeholders when a package is disabled or removed', () => {
		const pkg = packageDefinition();
		const state = buildInitialState(DM_ACTOR);
		const env = makeEnvironment();
		const installed = dispatchCommand(state, env, {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: pkg },
		});
		if (installed.status !== 'accepted') throw new Error('install');
		const enabled = dispatchCommand(installed.nextState, env, {
			type: 'widget.package.enable',
			actorId: DM_ACTOR.id,
			payload: { packageId: pkg.id },
		});
		if (enabled.status !== 'accepted') throw new Error('enable');
		const scene = createScene(enabled.nextState, env);
		const added = addWidget(scene.state, scene.env, scene.sceneId, 'counter');
		const disabled = dispatchCommand(added.state, env, {
			type: 'widget.package.disable',
			actorId: DM_ACTOR.id,
			payload: { packageId: pkg.id, reason: 'Review failed' },
		});
		expect(disabled.status).toBe('accepted');
		if (disabled.status !== 'accepted') return;
		let summary = getSceneForActor(
			disabled.nextState.scenes,
			disabled.nextState.permissions,
			DM_ACTOR.id,
			scene.sceneId,
			{ widgetPackages: disabled.nextState.widgets },
		);
		if (!('widgets' in summary)) throw new Error('denied');
		expect(summary.widgets[0]).toMatchObject({ kind: 'disabled', reason: 'Review failed' });

		const removed = dispatchCommand(disabled.nextState, env, {
			type: 'widget.package.remove',
			actorId: DM_ACTOR.id,
			payload: { packageId: pkg.id },
		});
		expect(removed.status).toBe('accepted');
		if (removed.status !== 'accepted') return;
		summary = getSceneForActor(
			removed.nextState.scenes,
			removed.nextState.permissions,
			DM_ACTOR.id,
			scene.sceneId,
			{ widgetPackages: removed.nextState.widgets },
		);
		if (!('widgets' in summary)) throw new Error('denied');
		expect(summary.widgets[0]).toMatchObject({ kind: 'disabled' });
		expect(removed.nextState.widgets.packages[pkg.id]?.removedAt).toBeTruthy();
	});

	it('does not carry a stale disabled flag into saved templates or instantiated scenes', () => {
		const pkg = packageDefinition();
		const state = buildInitialState(DM_ACTOR);
		const env = makeEnvironment();
		const installed = dispatchCommand(state, env, {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: pkg },
		});
		if (installed.status !== 'accepted') throw new Error('install');
		const enabled = dispatchCommand(installed.nextState, env, {
			type: 'widget.package.enable',
			actorId: DM_ACTOR.id,
			payload: { packageId: pkg.id },
		});
		if (enabled.status !== 'accepted') throw new Error('enable');
		const scene = createScene(enabled.nextState, env);
		const added = addWidget(scene.state, scene.env, scene.sceneId, 'counter');
		const disabled = dispatchCommand(added.state, env, {
			type: 'widget.package.disable',
			actorId: DM_ACTOR.id,
			payload: { packageId: pkg.id, reason: 'Review failed' },
		});
		if (disabled.status !== 'accepted') throw new Error('disable');
		// The source widget now carries a disabled placeholder flag.
		expect(disabled.nextState.scenes.scenes[scene.sceneId]?.widgets[0]?.disabled).toBeTruthy();

		const saved = dispatchCommand(disabled.nextState, env, {
			type: 'scene.save-template',
			actorId: DM_ACTOR.id,
			payload: { sourceSceneId: scene.sceneId, templateName: 'Counter Template' },
		});
		if (saved.status !== 'accepted') throw new Error('save-template');
		const templateEvent = saved.events.find((e) => e.kind === 'scene.template-saved');
		if (!templateEvent || templateEvent.kind !== 'scene.template-saved')
			throw new Error('no event');
		const templateScene = saved.nextState.scenes.scenes[templateEvent.templateSceneId];
		expect(templateScene?.widgets[0]?.disabled).toBeNull();

		const inst = dispatchCommand(saved.nextState, env, {
			type: 'scene.instantiate-template',
			actorId: DM_ACTOR.id,
			payload: { templateSceneId: templateEvent.templateSceneId, newSceneName: 'Live Counter' },
		});
		if (inst.status !== 'accepted') throw new Error('instantiate');
		const instEvent = inst.events.find((e) => e.kind === 'scene.template-instantiated');
		if (!instEvent || instEvent.kind !== 'scene.template-instantiated') throw new Error('no event');
		expect(inst.nextState.scenes.scenes[instEvent.newSceneId]?.widgets[0]?.disabled).toBeNull();
	});

	it('exports package metadata and filters device-local asset paths', () => {
		const pkg = packageDefinition({
			assets: [
				{ path: 'widgets/counter/icon.png', sha256: 'abc' },
				{ path: '/Users/local/secret.png' },
			],
			portabilityWarnings: ['uses optional art asset'],
		});
		const state = buildInitialState(DM_ACTOR);
		const env = makeEnvironment();
		const installed = dispatchCommand(state, env, {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: pkg },
		});
		if (installed.status !== 'accepted') throw new Error('install');
		const exported = exportWidgetPackage(installed.nextState.widgets, env, pkg.id);
		expect('package' in exported).toBe(true);
		if (!('package' in exported)) return;
		expect(exported.package).toMatchObject({
			id: pkg.id,
			version: pkg.version,
			widgets: expect.any(Array),
			migrations: expect.any(Array),
		});
		expect(exported.trust.hostPermissions.filesystem).toBe('denied');
		expect(exported.package.assets).toEqual([{ path: 'widgets/counter/icon.png', sha256: 'abc' }]);
		expect(exported.portabilityDiagnostics[0]).toMatchObject({
			code: 'portability.device-local-asset-path',
		});
		// AC4: portabilityWarnings in the export merges original warnings with new warnings
		// generated during the export pass (e.g. device-local path exclusions).
		expect(exported.package.portabilityWarnings).toEqual([
			'uses optional art asset',
			'Device-local asset path /Users/local/secret.png was excluded from export.',
		]);
	});

	it('rejects widget command dispatch when a package is disabled (AC2 no-code-executes)', () => {
		// When a package is disabled, every widget instance of that type gets a disabled flag set
		// on it. Any attempt to dispatch a widget command to a disabled instance must be rejected
		// with 'package-disabled' before any handler logic runs — the Processing Core must not
		// execute widget package code on behalf of a disabled package.
		const pkg = packageDefinition();
		const state = buildInitialState(DM_ACTOR);
		const env = makeEnvironment();
		const installed = dispatchCommand(state, env, {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: pkg },
		});
		if (installed.status !== 'accepted') throw new Error('install');
		const enabled = dispatchCommand(installed.nextState, env, {
			type: 'widget.package.enable',
			actorId: DM_ACTOR.id,
			payload: { packageId: pkg.id },
		});
		if (enabled.status !== 'accepted') throw new Error('enable');
		const scene = createScene(enabled.nextState, env);
		const { state: withWidget, widgetId } = addWidget(scene.state, scene.env, scene.sceneId, 'counter');
		const disableResult = dispatchCommand(withWidget, env, {
			type: 'widget.package.disable',
			actorId: DM_ACTOR.id,
			payload: { packageId: pkg.id, reason: 'security review failed' },
		});
		if (disableResult.status !== 'accepted') throw new Error('disable');
		// The widget instance now carries a disabled flag.
		expect(disableResult.nextState.scenes.scenes[scene.sceneId]?.widgets[0]?.disabled).toBeTruthy();

		// Attempt to dispatch any command to the disabled widget instance.
		const sceneRevision = disableResult.nextState.scenes.scenes[scene.sceneId]?.ownership.revision;
		const dispatchResult = dispatchCommand(disableResult.nextState, env, {
			type: 'widget.dispatch-command',
			actorId: DM_ACTOR.id,
			idempotencyKey: 'counter-cmd-1',
			payload: {
				sceneId: scene.sceneId,
				widgetInstanceId: widgetId,
				commandType: 'counter.noop',
				payload: {},
				expectedRevision: sceneRevision,
			},
		});
		expect(dispatchResult.status).toBe('rejected');
		if (dispatchResult.status !== 'rejected') return;
		expect(dispatchResult.rejection.code).toBe('package-disabled');
		// State is not mutated by the rejected dispatch.
		expect(dispatchResult.nextState).toBe(disableResult.nextState);
	});

	it('re-installing an exported package from a vault backup preserves portability warnings and starts disabled (AC3)', () => {
		// Simulate a vault-backup import round-trip: install → export → remove → re-install.
		// AC3: when portability validation runs on import, package id, version, schemas, assets, and
		// requested host permissions are checked before the widget can be enabled.
		const pkg = packageDefinition({
			assets: [{ path: 'widgets/counter/icon.png', sha256: 'abc' }],
			portabilityWarnings: ['original portability note'],
		});
		const state = buildInitialState(DM_ACTOR);
		const env = makeEnvironment();

		// Install original, then export (portability validation run at export).
		const installed = dispatchCommand(state, env, {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: pkg },
		});
		if (installed.status !== 'accepted') throw new Error('install');

		const exported = exportWidgetPackage(installed.nextState.widgets, env, pkg.id);
		expect('package' in exported).toBe(true);
		if (!('package' in exported)) return;

		// Remove the original package.
		const removed = dispatchCommand(installed.nextState, env, {
			type: 'widget.package.remove',
			actorId: DM_ACTOR.id,
			payload: { packageId: pkg.id },
		});
		if (removed.status !== 'accepted') throw new Error('remove');

		// Re-install from the exported (vault backup) definition. This is the import path:
		// id, version, schemas, assets, and requested host permissions are all validated via Zod
		// and semantic checks inside handleInstallWidgetPackage before the package can be enabled.
		const reimport = dispatchCommand(removed.nextState, env, {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: exported.package },
		});
		expect(reimport.status).toBe('accepted');
		if (reimport.status !== 'accepted') return;

		const record = reimport.nextState.widgets.packages[pkg.id];
		// Package starts disabled (fail closed) — cannot run until explicitly enabled.
		expect(record?.enabled).toBe(false);
		// All host permissions denied by default.
		expect(Object.values(record?.trust.hostPermissions ?? {})).toSatisfy((decisions: unknown[]) =>
			decisions.every((d) => d === 'denied'),
		);
		// Portability warnings from the export are preserved in the re-imported definition.
		expect(record?.package.portabilityWarnings).toContain('original portability note');
		// Structural fields (id, version, schemas, assets) are validated and present.
		expect(record?.package.id).toBe(pkg.id);
		expect(record?.package.version).toBe(pkg.version);
		expect(record?.package.widgets[0]?.configurationSchema).toBeDefined();
		expect(record?.package.assets).toEqual(exported.package.assets);
	});
});
