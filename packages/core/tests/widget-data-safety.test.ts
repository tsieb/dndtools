import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	WIDGET_DATA_ENVIRONMENT_SCHEMA_VERSION,
	deriveWidgetValue,
	dispatchCommand,
	entityBindingKey,
	evaluateWidgetWriteFlow,
	getSceneForActor,
	resolveWidgetBinding,
	resolveWidgetBindingSet,
	type CoreStateSlice,
	type EntityBindingRecord,
	type WidgetBinding,
	type WidgetDataEnvironment,
	type WidgetPackageDefinition,
} from '../src';

function envWith(
	records: EntityBindingRecord[],
	knownEntityKeys?: string[],
): WidgetDataEnvironment {
	const entities: Record<string, EntityBindingRecord> = {};
	for (const record of records) {
		entities[entityBindingKey(record.entityType, record.entityId)] = record;
	}
	return { entities, knownEntityKeys, schemaVersion: WIDGET_DATA_ENVIRONMENT_SCHEMA_VERSION };
}

function binding(entityType: string, entityId: string, selector?: string): WidgetBinding {
	return { source: { entityType, entityId, selector }, mode: 'read', requiredCapability: 'viewer' };
}

function createScene(
	state: CoreStateSlice,
	env: ReturnType<typeof makeEnvironment>,
	visibility: 'dm-only' | 'player-visible' | 'shared',
) {
	const created = dispatchCommand(state, env, {
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Data Safety', visibility },
	});
	if (created.status !== 'accepted') throw new Error('scene create failed');
	const sceneId = Object.keys(created.nextState.scenes.scenes)[0];
	if (!sceneId) throw new Error('missing scene id');
	return { state: created.nextState, sceneId };
}

function addBoundWidget(
	state: CoreStateSlice,
	env: ReturnType<typeof makeEnvironment>,
	sceneId: string,
	type: string,
	bound: WidgetBinding | null,
) {
	const added = dispatchCommand(state, env, {
		type: 'scene.add-widget',
		actorId: DM_ACTOR.id,
		payload: {
			sceneId,
			widget: { type, version: '1.0.0', layout: { x: 0, y: 0, w: 120, h: 100 }, binding: bound },
		},
	});
	if (added.status !== 'accepted') throw new Error(`add widget failed: ${added.status}`);
	const event = added.events.find((item) => item.kind === 'scene.widget-added');
	if (!event || event.kind !== 'scene.widget-added') throw new Error('no widget event');
	return { state: added.nextState, widgetId: event.widgetInstanceId };
}

// --- CANVAS-009: actor-scoped binding resolution -------------------------------

describe('CANVAS-009: resolveWidgetBinding resolves states at the data layer', () => {
	it('returns unbound for a required binding that is not yet selected', () => {
		expect(resolveWidgetBinding(null, PLAYER_ACTOR, undefined, { bindingRequired: true })).toEqual({
			state: 'unbound',
		});
		expect(resolveWidgetBinding(null, PLAYER_ACTOR)).toEqual({ state: 'available', value: null });
	});

	it('resolves declared query sets and carries the highest source privilege', () => {
		const env = envWith([
			{
				entityType: 'combatant',
				entityId: 'npc-hidden',
				visibility: 'dm-only',
				value: { name: 'Assassin', hp: 4 },
			},
			{
				entityType: 'combatant',
				entityId: 'pc-visible',
				visibility: 'player-visible',
				value: { name: 'Tamsin', hp: 12 },
			},
		]);
		const dmSet = resolveWidgetBindingSet(
			[
				{ id: 'dm-combatants', binding: binding('combatant', 'npc-hidden'), required: true },
				{ id: 'player-combatants', binding: binding('combatant', 'pc-visible'), required: true },
			],
			DM_ACTOR,
			env,
		);
		expect(dmSet.highestPrivilege).toBe('dm-only');
		expect(dmSet.queries['dm-combatants']).toMatchObject({
			state: 'available',
			privilege: 'dm-only',
		});

		const playerSet = resolveWidgetBindingSet(
			[
				{ id: 'dm-combatants', binding: binding('combatant', 'npc-hidden'), required: true },
				{ id: 'player-combatants', binding: binding('combatant', 'pc-visible'), required: true },
			],
			PLAYER_ACTOR,
			env,
		);
		expect(playerSet.highestPrivilege).toBe('player-visible');
		expect(playerSet.queries['dm-combatants']).toMatchObject({
			state: 'hidden',
			privilege: 'unknown',
		});
	});

	it('propagates computed-value taint and requires DM confirmation for lower-privilege writes', () => {
		const computed = deriveWidgetValue('The hidden NPC is badly wounded', [
			{ value: { hp: 3 }, privilege: 'dm-only' },
			{ value: { threshold: 10 }, privilege: 'player-visible' },
		]);
		expect(computed.privilege).toBe('dm-only');

		const warning = evaluateWidgetWriteFlow({
			widgetInstanceId: 'npc-combat-widget',
			values: [computed],
			destinationClass: 'player-scene',
		});
		expect(warning.decision).toBe('requires-confirmation');
		expect(warning.warning).toMatchObject({
			sourcePrivilege: 'dm-only',
			destinationClass: 'player-scene',
		});
		expect(JSON.stringify(warning.audit)).not.toContain('hidden NPC');

		const confirmed = evaluateWidgetWriteFlow({
			widgetInstanceId: 'npc-combat-widget',
			values: [computed],
			destinationClass: 'player-scene',
			confirmedByDm: true,
		});
		expect(confirmed.decision).toBe('allowed');
		expect(confirmed.audit.confirmedByDm).toBe(true);
	});

	it('hides a dm-only entity from players and observers but not from the DM', () => {
		const env = envWith([
			{ entityType: 'character', entityId: 'npc-1', visibility: 'dm-only', value: { hp: 12 } },
		]);
		const b = binding('character', 'npc-1');
		expect(resolveWidgetBinding(b, PLAYER_ACTOR, env)).toEqual({
			state: 'hidden',
			reason: 'dm-only',
		});
		expect(resolveWidgetBinding(b, OBSERVER_ACTOR, env)).toEqual({
			state: 'hidden',
			reason: 'dm-only',
		});
		expect(resolveWidgetBinding(b, DM_ACTOR, env)).toEqual({
			state: 'available',
			value: { hp: 12 },
		});
	});

	it('treats a shared entity as visible only to explicitly shared players', () => {
		const env = envWith([
			{
				entityType: 'note',
				entityId: 'handout-1',
				visibility: 'shared',
				sharedWith: [PLAYER_ACTOR.id],
				value: { title: 'Letter' },
			},
		]);
		const b = binding('note', 'handout-1');
		expect(resolveWidgetBinding(b, PLAYER_ACTOR, env)).toEqual({
			state: 'available',
			value: { title: 'Letter' },
		});
		expect(resolveWidgetBinding(b, OBSERVER_ACTOR, env)).toEqual({
			state: 'hidden',
			reason: 'not-shared',
		});
	});

	it('redacts dm-only fields from the available value for non-DM actors', () => {
		const env = envWith([
			{
				entityType: 'character',
				entityId: 'pc-1',
				visibility: 'player-visible',
				hiddenSelectors: ['dmNotes'],
				value: { hp: 8, dmNotes: 'secret plan' },
			},
		]);
		const entityBinding = binding('character', 'pc-1');
		expect(resolveWidgetBinding(entityBinding, PLAYER_ACTOR, env)).toEqual({
			state: 'available',
			value: { hp: 8 },
		});
		expect(resolveWidgetBinding(entityBinding, DM_ACTOR, env)).toEqual({
			state: 'available',
			value: { hp: 8, dmNotes: 'secret plan' },
		});
		// A binding that targets the hidden field itself resolves to hidden for players.
		const fieldBinding = binding('character', 'pc-1', 'dmNotes');
		expect(resolveWidgetBinding(fieldBinding, PLAYER_ACTOR, env)).toEqual({
			state: 'hidden',
			reason: 'field-hidden',
		});
	});

	it('surfaces conflicted entities without choosing a version, for every actor', () => {
		const env = envWith([
			{
				entityType: 'character',
				entityId: 'pc-2',
				visibility: 'player-visible',
				conflict: { paths: ['hp'] },
				value: { hp: 5 },
			},
		]);
		const b = binding('character', 'pc-2');
		expect(resolveWidgetBinding(b, PLAYER_ACTOR, env)).toEqual({
			state: 'conflicted',
			conflictPaths: ['hp'],
		});
		expect(resolveWidgetBinding(b, DM_ACTOR, env)).toEqual({
			state: 'conflicted',
			conflictPaths: ['hp'],
		});
	});

	it('a field-selector binding ignores a conflict on an UNRELATED path', () => {
		const env = envWith([
			{
				entityType: 'character',
				entityId: 'pc-3',
				visibility: 'player-visible',
				conflict: { paths: ['data.backstory'] },
				value: { hp: 7 },
			},
		]);
		// A binding to `combat.hp` is NOT blocked by an unrelated `data.backstory` conflict.
		expect(resolveWidgetBinding(binding('character', 'pc-3', 'combat.hp'), DM_ACTOR, env).state).toBe(
			'available',
		);
		// A binding to the conflicted path itself IS conflicted.
		expect(resolveWidgetBinding(binding('character', 'pc-3', 'data.backstory'), DM_ACTOR, env)).toEqual({
			state: 'conflicted',
			conflictPaths: ['data.backstory'],
		});
		// An entity-level binding (no selector) is still conflicted by any conflict.
		expect(resolveWidgetBinding(binding('character', 'pc-3'), DM_ACTOR, env).state).toBe('conflicted');
	});

	it('checks visibility before conflict so a hidden entity never leaks its conflict to players', () => {
		const env = envWith([
			{ entityType: 'character', entityId: 'npc-2', visibility: 'dm-only', conflict: true },
		]);
		const b = binding('character', 'npc-2');
		// Player only learns it is hidden; the DM sees the conflict to resolve it.
		expect(resolveWidgetBinding(b, PLAYER_ACTOR, env)).toEqual({
			state: 'hidden',
			reason: 'dm-only',
		});
		expect(resolveWidgetBinding(b, DM_ACTOR, env)).toEqual({
			state: 'conflicted',
			conflictPaths: ['(entity)'],
		});
	});

	it('marks a binding missing when its target is not among known entity keys', () => {
		const env = envWith([], [entityBindingKey('map', 'map-1')]);
		expect(resolveWidgetBinding(binding('map', 'gone'), DM_ACTOR, env)).toEqual({
			state: 'missing',
		});
		expect(resolveWidgetBinding(binding('map', 'map-1'), DM_ACTOR, env)).toEqual({
			state: 'available',
			value: null,
		});
	});
});

describe('CANVAS-009: getSceneForActor renders explicit binding states', () => {
	it('AC1: a binding to hidden data in a player context renders hidden, not the value', () => {
		const env = makeEnvironment();
		const { state, sceneId } = createScene(
			buildInitialState(DM_ACTOR, PLAYER_ACTOR),
			env,
			'player-visible',
		);
		const { state: withWidget, widgetId } = addBoundWidget(
			state,
			env,
			sceneId,
			'note',
			binding('note', 'dm-secret'),
		);
		const dataEnvironment = envWith([
			{
				entityType: 'note',
				entityId: 'dm-secret',
				visibility: 'dm-only',
				value: { body: 'top secret' },
			},
		]);
		const summary = getSceneForActor(
			withWidget.scenes,
			withWidget.permissions,
			PLAYER_ACTOR.id,
			sceneId,
			{ widgetPackages: withWidget.widgets, dataEnvironment },
		);
		if (!('widgets' in summary)) throw new Error('player denied scene');
		expect(summary.widgets[0]).toEqual({
			kind: 'hidden',
			widgetInstanceId: widgetId,
			type: 'note',
			reason: 'dm-only',
		});
		// The hidden value must not be present anywhere in the player payload.
		expect(JSON.stringify(summary)).not.toContain('top secret');

		// The DM, by contrast, receives the widget as available.
		const dmSummary = getSceneForActor(
			withWidget.scenes,
			withWidget.permissions,
			DM_ACTOR.id,
			sceneId,
			{ widgetPackages: withWidget.widgets, dataEnvironment },
		);
		if (!('widgets' in dmSummary)) throw new Error('dm denied scene');
		expect(dmSummary.widgets[0]?.kind).toBe('available');
	});

	it('AC2: a binding to an entity with an unresolved conflict renders conflicted', () => {
		const env = makeEnvironment();
		const { state, sceneId } = createScene(
			buildInitialState(DM_ACTOR, PLAYER_ACTOR),
			env,
			'player-visible',
		);
		const { state: withWidget, widgetId } = addBoundWidget(
			state,
			env,
			sceneId,
			'character',
			binding('character', 'pc-9'),
		);
		const dataEnvironment = envWith([
			{
				entityType: 'character',
				entityId: 'pc-9',
				visibility: 'player-visible',
				conflict: { paths: ['hp', 'conditions'] },
				value: { hp: 3 },
			},
		]);
		const summary = getSceneForActor(
			withWidget.scenes,
			withWidget.permissions,
			PLAYER_ACTOR.id,
			sceneId,
			{ widgetPackages: withWidget.widgets, dataEnvironment },
		);
		if (!('widgets' in summary)) throw new Error('player denied scene');
		expect(summary.widgets[0]).toEqual({
			kind: 'conflicted',
			widgetInstanceId: widgetId,
			type: 'character',
			conflictPaths: ['hp', 'conditions'],
		});
		// Conflicted state carries no resolved widget/value payload — no version is chosen.
		expect(summary.widgets[0]).not.toHaveProperty('widget');
	});

	it('renders unbound when a widget requires a binding that has not been selected', () => {
		const env = makeEnvironment();
		const boundPackage: WidgetPackageDefinition = {
			id: 'workspace.char-panel',
			version: '1.0.0',
			displayName: 'Character Panel',
			widgets: [
				{
					type: 'char-panel',
					version: '1.0.0',
					displayName: 'Character Panel',
					author: 'workspace',
					supportedProfiles: ['desktop', 'tablet', 'mobile', 'web'],
					defaultSize: { width: 200, height: 160 },
					minSize: { width: 120, height: 80 },
					resizePolicy: 'free',
					requiredBindings: [
						{
							id: 'character',
							label: 'Character',
							entityTypes: ['character'],
							mode: 'read',
							requiredCapability: 'viewer',
						},
					],
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
		const installed = dispatchCommand(buildInitialState(DM_ACTOR), env, {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: boundPackage },
		});
		if (installed.status !== 'accepted') throw new Error('install failed');
		const enabled = dispatchCommand(installed.nextState, env, {
			type: 'widget.package.enable',
			actorId: DM_ACTOR.id,
			payload: { packageId: boundPackage.id },
		});
		if (enabled.status !== 'accepted') throw new Error('enable failed');
		const { state, sceneId } = createScene(enabled.nextState, env, 'dm-only');
		const { state: withWidget, widgetId } = addBoundWidget(state, env, sceneId, 'char-panel', null);
		const summary = getSceneForActor(
			withWidget.scenes,
			withWidget.permissions,
			DM_ACTOR.id,
			sceneId,
			{
				widgetPackages: withWidget.widgets,
				dataEnvironment: envWith([]),
			},
		);
		if (!('widgets' in summary)) throw new Error('dm denied scene');
		expect(summary.widgets[0]).toEqual({
			kind: 'unbound',
			widgetInstanceId: widgetId,
			type: 'char-panel',
		});
	});
});

// --- CANVAS-010: declared command dispatch validation --------------------------

function grantOperator(state: CoreStateSlice, widgetId: string): CoreStateSlice {
	return {
		...state,
		permissions: {
			...state.permissions,
			grants: [
				{
					id: 'grant-op',
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
}

function startSession(
	state: CoreStateSlice,
	env: ReturnType<typeof makeEnvironment>,
	sceneId: string,
) {
	const result = dispatchCommand(state, env, {
		type: 'session.set-workflow',
		actorId: DM_ACTOR.id,
		payload: { workflow: 'active', activeSceneId: sceneId },
	});
	if (result.status !== 'accepted') throw new Error('session start failed');
	return result.nextState;
}

describe('CANVAS-010: the Processing Core validates widget commands before mutation', () => {
	it('AC1: an authorized player operator can start a timer and session state changes', () => {
		const env = makeEnvironment();
		const { state, sceneId } = createScene(
			buildInitialState(DM_ACTOR, PLAYER_ACTOR),
			env,
			'player-visible',
		);
		const { state: withTimer, widgetId } = addBoundWidget(state, env, sceneId, 'timer', null);
		const granted = grantOperator(startSession(withTimer, env, sceneId), widgetId);
		const expectedRevision = granted.scenes.scenes[sceneId]?.ownership.revision;
		const started = dispatchCommand(granted, env, {
			type: 'widget.dispatch-command',
			actorId: PLAYER_ACTOR.id,
			idempotencyKey: 'op-timer-1',
			payload: {
				sceneId,
				widgetInstanceId: widgetId,
				commandType: 'timer.start',
				payload: { durationSeconds: 120 },
				expectedRevision,
			},
		});
		expect(started.status).toBe('accepted');
		if (started.status !== 'accepted') return;
		expect(started.nextState.session.timers[widgetId]).toMatchObject({
			status: 'running',
			durationSeconds: 120,
		});
	});

	it('rejects an operate command from a player without an operator grant', () => {
		const env = makeEnvironment();
		const { state, sceneId } = createScene(
			buildInitialState(DM_ACTOR, PLAYER_ACTOR),
			env,
			'player-visible',
		);
		const { state: withTimer, widgetId } = addBoundWidget(state, env, sceneId, 'timer', null);
		const result = dispatchCommand(withTimer, env, {
			type: 'widget.dispatch-command',
			actorId: PLAYER_ACTOR.id,
			idempotencyKey: 'op-timer-denied',
			payload: {
				sceneId,
				widgetInstanceId: widgetId,
				commandType: 'timer.start',
				payload: { durationSeconds: 60 },
				expectedRevision: withTimer.scenes.scenes[sceneId]?.ownership.revision,
			},
		});
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.code).toBe('actor-not-authorized');
		expect(result.nextState.session.timers[widgetId]).toBeUndefined();
	});

	it('AC2: rejects a command whose binding targets a hidden entity path before mutation', () => {
		const env = makeEnvironment();
		const { state, sceneId } = createScene(buildInitialState(DM_ACTOR), env, 'dm-only');
		const { state: withTimer, widgetId } = addBoundWidget(
			state,
			env,
			sceneId,
			'timer',
			binding('timer', 'timer-x', 'hidden:secret'),
		);
		const result = dispatchCommand(withTimer, env, {
			type: 'widget.dispatch-command',
			actorId: DM_ACTOR.id,
			idempotencyKey: 'hidden-cmd',
			payload: {
				sceneId,
				widgetInstanceId: widgetId,
				commandType: 'timer.start',
				payload: { durationSeconds: 30 },
				expectedRevision: withTimer.scenes.scenes[sceneId]?.ownership.revision,
			},
		});
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.code).toBe('hidden-target');
		expect(result.nextState.session.timers[widgetId]).toBeUndefined();
	});

	it('rejects a command whose binding targets a conflicted entity path before mutation', () => {
		const env = makeEnvironment();
		const { state, sceneId } = createScene(buildInitialState(DM_ACTOR), env, 'dm-only');
		const { state: withTimer, widgetId } = addBoundWidget(
			state,
			env,
			sceneId,
			'timer',
			binding('timer', 'timer-y', 'conflicted:duration'),
		);
		const result = dispatchCommand(withTimer, env, {
			type: 'widget.dispatch-command',
			actorId: DM_ACTOR.id,
			idempotencyKey: 'conflicted-cmd',
			payload: {
				sceneId,
				widgetInstanceId: widgetId,
				commandType: 'timer.start',
				payload: { durationSeconds: 30 },
				expectedRevision: withTimer.scenes.scenes[sceneId]?.ownership.revision,
			},
		});
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.code).toBe('conflicted-target');
		expect(result.nextState.session.timers[widgetId]).toBeUndefined();
	});

	it('rejects a command that carries a stale expected Scene revision', () => {
		const env = makeEnvironment();
		const { state, sceneId } = createScene(buildInitialState(DM_ACTOR), env, 'dm-only');
		const { state: withTimer, widgetId } = addBoundWidget(state, env, sceneId, 'timer', null);
		const result = dispatchCommand(withTimer, env, {
			type: 'widget.dispatch-command',
			actorId: DM_ACTOR.id,
			idempotencyKey: 'stale-rev',
			payload: {
				sceneId,
				widgetInstanceId: widgetId,
				commandType: 'timer.start',
				payload: { durationSeconds: 30 },
				expectedRevision: 999,
			},
		});
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.code).toBe('revision-conflict');
		expect(result.nextState.session.timers[widgetId]).toBeUndefined();
	});
});
