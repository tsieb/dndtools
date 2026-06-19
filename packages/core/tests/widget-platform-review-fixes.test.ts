import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	findActiveWidgetDefinition,
	mergeSystemWidgetPackages,
	resolveWidgetStyleVariables,
	SYSTEM_WIDGET_PACKAGE_STATE,
	WIDGET_PACKAGE_STATE_SCHEMA_VERSION,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	type WidgetDefinition,
	type WidgetPackageDefinition,
	type WidgetPackageRecord,
	type WidgetPackageState,
} from '../src';
import { listWidgetLibrary, resolveAddWidgetCommand } from '../src/queries/widget-library';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '../src/testing/fixtures';
import type { CoreEnvironment } from '../src/commands/types';

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function dispatch(state: CoreStateSlice, env: CoreEnvironment, command: CoreCommand): CommandResult {
	return dispatchCommand(state, env, command);
}

function ensureHome(
	state: CoreStateSlice,
	env: CoreEnvironment,
): { state: CoreStateSlice; homeSceneId: string } {
	const result = accept(
		dispatch(state, env, { type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} }),
	);
	const homeSceneId = result.nextState.commandCenter.homeSceneId;
	if (!homeSceneId) throw new Error('missing home Scene');
	return { state: result.nextState, homeSceneId };
}

// ---------------------------------------------------------------------------------------------
// Finding 1 — the Dice widget's `dice.roll`, dispatched through the durable widget-command
// envelope, must reach the shared dice engine and record a roll (it previously fell through to a
// catch-all reject), and a retry under the same idempotency key must not double-roll.
// ---------------------------------------------------------------------------------------------
describe('Dice widget command (finding 1)', () => {
	function placeDiceAndActivate(): {
		state: CoreStateSlice;
		env: CoreEnvironment;
		homeSceneId: string;
		diceId: string;
		revision: number;
	} {
		const env = makeEnvironment();
		const { state, homeSceneId } = ensureHome(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		const diceEntry = listWidgetLibrary(state.widgets, state.permissions, DM_ACTOR.id, {
			profileId: 'desktop',
		}).find((entry) => entry.type === 'dice');
		if (!diceEntry) throw new Error('dice widget not in library');
		const resolvedAdd = resolveAddWidgetCommand(diceEntry, homeSceneId);
		if (!resolvedAdd) throw new Error('dice library entry is not available');
		const addDice: CoreCommand = { ...resolvedAdd, actorId: DM_ACTOR.id };
		const added = accept(dispatch(state, env, addDice));
		const dice = added.nextState.scenes.scenes[homeSceneId]?.widgets.find((w) => w.type === 'dice');
		if (!dice) throw new Error('dice widget was not added');
		const active = accept(
			dispatch(added.nextState, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'active', activeSceneId: homeSceneId },
			}),
		).nextState;
		return {
			state: active,
			env,
			homeSceneId,
			diceId: dice.id,
			revision: active.scenes.scenes[homeSceneId]!.ownership.revision,
		};
	}

	it('records a roll to the session dice history', () => {
		const { state, env, homeSceneId, diceId, revision } = placeDiceAndActivate();
		const before = state.session.diceHistory.length;
		const rolled = accept(
			dispatch(state, env, {
				type: 'widget.dispatch-command',
				actorId: DM_ACTOR.id,
				idempotencyKey: 'dice-roll-1',
				payload: {
					sceneId: homeSceneId,
					widgetInstanceId: diceId,
					commandType: 'dice.roll',
					payload: { expression: 'd20' },
					expectedRevision: revision,
				},
			}),
		);
		expect(rolled.nextState.session.diceHistory.length).toBe(before + 1);
		const record = rolled.nextState.session.diceHistory.at(-1);
		// The shared dice engine computed and recorded a real outcome (it normalizes `d20` → `1d20`).
		expect(record?.expression).toContain('20');
		expect(typeof record?.total).toBe('number');
	});

	it('does not double-roll on an idempotent retry under the same key', () => {
		const { state, env, homeSceneId, diceId, revision } = placeDiceAndActivate();
		const envelope: CoreCommand = {
			type: 'widget.dispatch-command',
			actorId: DM_ACTOR.id,
			idempotencyKey: 'dice-roll-retry',
			payload: {
				sceneId: homeSceneId,
				widgetInstanceId: diceId,
				commandType: 'dice.roll',
				payload: { expression: '2d6' },
				expectedRevision: revision,
			},
		};
		const first = accept(dispatch(state, env, envelope));
		const firstLen = first.nextState.session.diceHistory.length;
		const retry = accept(dispatch(first.nextState, env, envelope));
		expect(retry.nextState.session.diceHistory.length).toBe(firstLen);
	});
});

// ---------------------------------------------------------------------------------------------
// Finding 2 — a persisted (possibly stale-shaped) system package must NOT shadow the in-code
// definition, but the DM's persisted enable/remove decision for it must still stick.
// ---------------------------------------------------------------------------------------------
describe('mergeSystemWidgetPackages precedence (finding 2)', () => {
	it('takes the code definition over a stale persisted system package', () => {
		const systemRecord = SYSTEM_WIDGET_PACKAGE_STATE.packages['system.scene-widgets']!;
		const stale: WidgetPackageRecord = {
			...systemRecord,
			enabled: false,
			package: {
				...systemRecord.package,
				// Simulate an older persisted shape: a dice widget with NO render entrypoint.
				widgets: systemRecord.package.widgets.map((widget) =>
					widget.type === 'dice' ? { ...widget, renderEntrypoint: undefined } : widget,
				) as WidgetDefinition[],
			},
		};
		const persisted: WidgetPackageState = {
			schemaVersion: WIDGET_PACKAGE_STATE_SCHEMA_VERSION,
			packages: { 'system.scene-widgets': stale },
		};

		const merged = mergeSystemWidgetPackages(persisted);
		const dice = merged.packages['system.scene-widgets']?.package.widgets.find(
			(w) => w.type === 'dice',
		);
		// Code wins: the shipped definition's render entrypoint is restored.
		expect(dice?.renderEntrypoint?.runtime).toBe('template');
		// But the persisted user decision (disabled) is preserved.
		expect(merged.packages['system.scene-widgets']?.enabled).toBe(false);
	});

	it('uses the shipped record verbatim when nothing is persisted', () => {
		const merged = mergeSystemWidgetPackages({
			schemaVersion: WIDGET_PACKAGE_STATE_SCHEMA_VERSION,
			packages: {},
		});
		expect(merged.packages['system.scene-widgets']?.enabled).toBe(true);
		expect(merged.packages['system.command-center-widgets']).toBeDefined();
	});
});

// ---------------------------------------------------------------------------------------------
// Finding 3 — style token values / cssVariables flow onto a non-sandboxed style attribute, so a
// value carrying a declaration/markup terminator must be dropped and a non-custom-property key
// must be ignored.
// ---------------------------------------------------------------------------------------------
describe('resolveWidgetStyleVariables sanitization (finding 3)', () => {
	const styleDef = {
		style: {
			isolation: 'host-scoped' as const,
			capabilities: [],
			tokens: [
				{ name: 'accent', value: 'red; position:fixed; inset:0' },
				{ name: 'text', value: 'var(--color-text-primary)' },
			],
			cssVariables: {
				'--ok': 'blue',
				'evil}': 'x',
				'--bad': 'a{b}',
			},
		},
	};

	it('drops unsafe values and non-custom-property keys, keeps safe ones', () => {
		const vars = resolveWidgetStyleVariables(styleDef);
		expect(vars['--widget-accent']).toBeUndefined(); // contains ';'
		expect(vars['--widget-text']).toBe('var(--color-text-primary)');
		expect(vars['--ok']).toBe('blue');
		expect(vars['evil}']).toBeUndefined(); // not a custom property name
		expect(vars['--bad']).toBeUndefined(); // contains '{'
	});

	it('sanitizes per-instance overrides the same way', () => {
		expect(resolveWidgetStyleVariables(styleDef, { styleTokens: { text: 'green;' } })['--widget-text']).toBe(
			'var(--color-text-primary)',
		);
		expect(resolveWidgetStyleVariables(styleDef, { styleTokens: { text: 'green' } })['--widget-text']).toBe(
			'green',
		);
	});
});

// ---------------------------------------------------------------------------------------------
// Finding 4 — the privileged `builtin` render runtime is reserved for first-party system widgets;
// an installed (untrusted) package declaring it must be rejected at the install/upgrade boundary.
// ---------------------------------------------------------------------------------------------
describe('builtin runtime is reserved for system packages (finding 4)', () => {
	const EMPTY_SCHEMA = { type: 'object' as const, additionalProperties: true };
	function builtinPackage(): WidgetPackageDefinition {
		return {
			id: 'workspace.impostor',
			version: '1.0.0',
			displayName: 'Impostor',
			authoring: {
				source: 'generated',
				llmProvider: 'local-placeholder',
				promptSummary: 'Pretend to be the session widget.',
			},
			widgets: [
				{
					type: 'impostor-session',
					version: '1.0.0',
					displayName: 'Impostor Session',
					author: 'workspace',
					// The exploit: claim the privileged first-party 'session' renderer by name.
					renderEntrypoint: { runtime: 'builtin', exportName: 'session', hostApiVersion: 1 },
					style: { isolation: 'host-scoped', capabilities: ['css-variables'], tokens: [] },
					supportedProfiles: ['desktop', 'tablet', 'web'],
					defaultSize: { width: 360, height: 240 },
					minSize: { width: 240, height: 160 },
					resizePolicy: 'free',
					requiredBindings: [],
					optionalBindings: [],
					dataQueries: [],
					computedFields: [],
					outputWrites: [],
					configurationSchema: EMPTY_SCHEMA,
					runtimeStateSchema: EMPTY_SCHEMA,
					capabilitySets: ['manager', 'operator', 'viewer'],
					commands: [],
					events: [],
					hostPermissions: [],
					networkDestinationClasses: [],
				},
			],
			migrations: [],
			assets: [],
			portabilityWarnings: [],
		};
	}

	it('rejects installing a non-system package that declares the builtin runtime', () => {
		const state = buildInitialState(DM_ACTOR);
		const env = makeEnvironment();
		const result = dispatch(state, env, {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: builtinPackage() },
		});
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.issues).toContainEqual(
			expect.objectContaining({ path: 'schema.builtin-runtime-reserved' }),
		);
	});
});

// ---------------------------------------------------------------------------------------------
// Finding 5 — render surfaces must resolve a definition only when its package is active; a
// disabled or removed package's widget must not resolve (so it cannot be drawn / executed).
// ---------------------------------------------------------------------------------------------
describe('findActiveWidgetDefinition (finding 5)', () => {
	function withScenePackage(patch: Partial<WidgetPackageRecord>): WidgetPackageState {
		const record = SYSTEM_WIDGET_PACKAGE_STATE.packages['system.scene-widgets']!;
		return {
			schemaVersion: WIDGET_PACKAGE_STATE_SCHEMA_VERSION,
			packages: { 'system.scene-widgets': { ...record, ...patch } },
		};
	}

	it('resolves a definition when the package is enabled and present', () => {
		expect(findActiveWidgetDefinition(withScenePackage({}), 'dice')?.type).toBe('dice');
	});

	it('returns undefined when the package is disabled', () => {
		expect(findActiveWidgetDefinition(withScenePackage({ enabled: false }), 'dice')).toBeUndefined();
	});

	it('returns undefined when the package is removed', () => {
		expect(
			findActiveWidgetDefinition(withScenePackage({ removedAt: '2026-01-01T00:00:00.000Z' }), 'dice'),
		).toBeUndefined();
	});
});
