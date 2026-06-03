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
		const granted: CoreStateSlice = {
			...withTimer,
			permissions: {
				...withTimer.permissions,
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
		const sceneRevision = withTimer.scenes.scenes[sceneId]?.ownership.revision;
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
		const first = dispatchCommand(withTimer, env, command);
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
		const { env, state, sceneId } = createScene(buildInitialState(DM_ACTOR));
		const { state: withWidget, widgetId } = addWidget(state, env, sceneId, 'map');
		const beforeBinding = withWidget.scenes.scenes[sceneId]?.widgets[0]?.binding;
		const destroyed = dispatchCommand(withWidget, env, {
			type: 'scene.destroy-widget',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetId },
		});
		expect(destroyed.status).toBe('accepted');
		if (destroyed.status !== 'accepted') return;
		expect(destroyed.nextState.scenes.scenes[sceneId]?.widgets).toEqual([]);
		expect(beforeBinding?.source).toEqual({ entityType: 'map', entityId: 'map-1' });
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
	});
});
