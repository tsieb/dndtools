import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	WIDGET_COUNTER_RESTORE_COMMAND,
	buildWidgetCommandInverse,
	buildWidgetInverse,
	inferWidgetCommandExecutor,
	widgetCommandHasExecutor,
	dispatchCommand,
	readWidgetCounter,
	readWidgetLastRoll,
	readWidgetShownMessage,
	widgetCommandAvailability,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	type WidgetCommandDescriptor,
	type WidgetDefinition,
	type WidgetPackageDefinition,
} from '../src';

/**
 * RC-WID-6.1 — COMMANDS THAT CANNOT RUN ARE NEVER INSTALLED. Each catalogue verb a template widget
 * can declare has an executor in the core, and each is exercised here through the real
 * `widget.dispatch-command` envelope: roll (the session dice engine), advance/tick/reset/set-value
 * (a per-instance counter, undoable), show (a message kept on the placed widget), write-note-line
 * and mark-complete (the bound entity through its own commands), start/pause/resume (the timer).
 * Install refuses a template command with no executor, with the reason.
 */

const env = makeEnvironment();

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function run(state: CoreStateSlice, command: CoreCommand): CoreStateSlice {
	return accept(dispatchCommand(state, env, command)).nextState;
}

const object = (properties: Record<string, 'string' | 'number'> = {}) => ({
	type: 'object' as const,
	properties: Object.fromEntries(Object.entries(properties).map(([key, type]) => [key, { type }])),
});

function command(
	verb: string,
	executor: WidgetCommandDescriptor['executor'],
	payload: Record<string, 'string' | 'number'> = {},
): WidgetCommandDescriptor {
	return {
		type: `table-panel.${verb}`,
		displayName: verb,
		requiredCapability: verb === 'set-config' ? 'manager' : 'operator',
		payloadSchema: object(payload),
		writesTo: 'scene',
		destinationClass: 'scene',
		...(executor ? { executor } : {}),
	};
}

const COMMANDS: WidgetCommandDescriptor[] = [
	command('roll', 'roll', { formula: 'string' }),
	command('advance', 'advance', { by: 'number' }),
	command('tick', 'tick'),
	command('reset', 'reset'),
	command('set-config', 'set-value', { value: 'string' }),
	command('show', 'show', { text: 'string' }),
	command('write-note-line', 'write-note-line', { line: 'string' }),
	command('mark-complete', 'mark-complete'),
	command('start', 'start', { durationSeconds: 'number' }),
	command('pause', 'pause'),
	command('resume', 'resume'),
	// Run by name, not by executor: the Loot Ledger starter's write to its bound note.
	{
		type: 'content.update-item',
		displayName: 'Write the ledger',
		requiredCapability: 'operator',
		payloadSchema: object({ itemId: 'string', body: 'string' }),
		writesTo: 'entity',
		destinationClass: 'entity',
	},
];

function templatePackage(commands: WidgetCommandDescriptor[]): WidgetPackageDefinition {
	const widget: WidgetDefinition = {
		type: 'table-panel',
		version: '1.0.0',
		displayName: 'Table panel',
		author: 'workspace',
		renderEntrypoint: { runtime: 'template', template: 'action-panel', hostApiVersion: 1 },
		supportedProfiles: ['desktop', 'mobile'],
		defaultSize: { width: 320, height: 200 },
		minSize: { width: 200, height: 120 },
		resizePolicy: 'free',
		requiredBindings: [],
		optionalBindings: [
			{
				id: 'target',
				label: 'Target',
				entityTypes: ['note', 'quest'],
				mode: 'operate',
				requiredCapability: 'operator',
			},
		],
		configurationSchema: { type: 'object', additionalProperties: true },
		capabilitySets: ['manager', 'operator', 'viewer'],
		commands,
		events: [],
		hostPermissions: [],
	};
	return {
		id: 'workspace.table-panel',
		version: '1.0.0',
		displayName: 'Table panel',
		widgets: [widget],
		migrations: [],
		assets: [],
		portabilityWarnings: [],
	};
}

function install(state: CoreStateSlice, pkg: WidgetPackageDefinition): CommandResult {
	return dispatchCommand(state, env, {
		type: 'widget.package.install',
		actorId: DM_ACTOR.id,
		payload: { package: pkg },
	});
}

interface Table {
	state: CoreStateSlice;
	sceneId: string;
	widgetId: string;
	noteId: string;
	questId: string;
}

/** A vault with the panel installed, enabled and placed, plus a note and a quest to bind it to. */
function table(binding: 'note' | 'quest' | null = null, configuration = {}): Table {
	let state = accept(
		install(buildInitialState(DM_ACTOR, PLAYER_ACTOR), templatePackage(COMMANDS)),
	).nextState;
	state = run(state, {
		type: 'widget.package.enable',
		actorId: DM_ACTOR.id,
		payload: { packageId: 'workspace.table-panel' },
	});
	state = run(state, {
		type: 'content.create-item',
		actorId: DM_ACTOR.id,
		payload: { kind: 'note', title: 'Session notes', body: 'Arrived at dusk.', fields: {} },
	} as CoreCommand);
	const noteId = Object.values(state.content.items).find((i) => i.title === 'Session notes')!.id;
	state = run(state, {
		type: 'content.create-object',
		actorId: DM_ACTOR.id,
		payload: {
			subtype: 'quest',
			title: 'Find the bell',
			fields: { title: 'Find the bell', status: 'active' },
		},
	} as CoreCommand);
	const questId = Object.values(state.content.items).find((i) => i.title === 'Find the bell')!.id;
	state = run(state, {
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Bell tower', description: '', visibility: 'dm-only', tags: [] },
	} as CoreCommand);
	const sceneId = Object.values(state.scenes.scenes).find((s) => s.name === 'Bell tower')!.id;
	const boundId = binding === 'note' ? noteId : binding === 'quest' ? questId : null;
	state = run(state, {
		type: 'scene.add-widget',
		actorId: DM_ACTOR.id,
		payload: {
			sceneId,
			widget: {
				type: 'table-panel',
				version: '1.0.0',
				layout: { x: 0, y: 0, w: 320, h: 200 },
				configuration,
				localState: {},
				binding: boundId
					? {
							source: { entityType: binding, entityId: boundId },
							mode: 'operate',
							requiredCapability: 'operator',
						}
					: null,
			},
		},
	} as CoreCommand);
	const widgetId = state.scenes.scenes[sceneId]!.widgets.find((w) => w.type === 'table-panel')!.id;
	return { state, sceneId, widgetId, noteId, questId };
}

let keyCounter = 0;

function pressCommand(t: Table, state: CoreStateSlice, verb: string, payload = {}, key?: string) {
	return {
		type: 'widget.dispatch-command' as const,
		actorId: DM_ACTOR.id,
		idempotencyKey: key ?? `press-${++keyCounter}`,
		payload: {
			sceneId: t.sceneId,
			widgetInstanceId: t.widgetId,
			commandType: verb === WIDGET_COUNTER_RESTORE_COMMAND ? verb : `table-panel.${verb}`,
			payload,
			expectedRevision: state.scenes.scenes[t.sceneId]!.ownership.revision,
		},
	};
}

function press(t: Table, state: CoreStateSlice, verb: string, payload = {}, key?: string) {
	return dispatchCommand(state, env, pressCommand(t, state, verb, payload, key));
}

function widgetOf(t: Table, state: CoreStateSlice) {
	return state.scenes.scenes[t.sceneId]!.widgets.find((w) => w.id === t.widgetId)!;
}

describe('RC-WID-6.1: install refuses a template command that nothing can run', () => {
	it.each(['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty'])(
		'refuses inherited object member %s as an executor',
		(verb) => {
			const descriptor = command(verb, undefined);
			expect(inferWidgetCommandExecutor(descriptor.type)).toBeNull();
			expect(widgetCommandHasExecutor(descriptor)).toBe(false);
			const state = buildInitialState(DM_ACTOR);
			const result = install(state, templatePackage([descriptor]));
			expect(result.status).toBe('rejected');
			if (result.status !== 'rejected') return;
			expect(result.rejection.issues).toEqual(
				expect.arrayContaining([expect.objectContaining({ path: 'schema.command-no-executor' })]),
			);
			expect(() => structuredClone(state)).not.toThrow();
		},
	);

	it('rejects a template widget declaring a command with no executor, naming the command', () => {
		const result = install(
			buildInitialState(DM_ACTOR),
			templatePackage([
				command('roll', 'roll', { formula: 'string' }),
				command('action-1', undefined),
			]),
		);
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		const issue = result.rejection.issues?.find((i) => i.path === 'schema.command-no-executor');
		expect(issue?.message).toContain('table-panel.action-1');
		expect(issue?.message).toContain('has nothing in the core to run it');
	});

	it('refuses the same command on upgrade', () => {
		const installed = accept(
			install(buildInitialState(DM_ACTOR), templatePackage([command('tick', 'tick')])),
		).nextState;
		const next = templatePackage([command('tick', 'tick'), command('draw', undefined)]);
		const result = dispatchCommand(installed, env, {
			type: 'widget.package.upgrade',
			actorId: DM_ACTOR.id,
			payload: { package: { ...next, version: '1.1.0' } },
		});
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.issues?.map((i) => i.path)).toContain('schema.command-no-executor');
	});

	it('accepts every catalogue executor, and the commands the core runs by name', () => {
		expect(install(buildInitialState(DM_ACTOR), templatePackage(COMMANDS)).status).toBe('accepted');
		const named: WidgetCommandDescriptor = {
			type: 'dice.roll',
			displayName: 'Roll',
			requiredCapability: 'operator',
			payloadSchema: object({ expression: 'string' }),
			writesTo: 'session',
		};
		expect(install(buildInitialState(DM_ACTOR), templatePackage([named])).status).toBe('accepted');
	});

	it('refuses an executor outside the closed set at the schema', () => {
		const pkg = templatePackage([
			{
				...command('juggle', undefined),
				executor: 'juggle' as WidgetCommandDescriptor['executor'],
			},
		]);
		expect(install(buildInitialState(DM_ACTOR), pkg).status).toBe('rejected');
	});
});

describe('RC-WID-6.1: install records the executor a verb names', () => {
	it('writes the inferred executor onto a template command that declared none', () => {
		const installed = accept(
			install(
				buildInitialState(DM_ACTOR),
				templatePackage([
					command('roll', undefined, { formula: 'string' }),
					command('mark-complete', undefined),
				]),
			),
		).nextState;
		const commands =
			installed.widgets.packages['workspace.table-panel']!.package.widgets[0]!.commands;
		expect(commands.map((c) => c.executor)).toEqual(['roll', 'mark-complete']);
	});

	it('leaves a command the core runs by name without one', () => {
		const installed = accept(
			install(buildInitialState(DM_ACTOR), templatePackage(COMMANDS.slice(-1))),
		).nextState;
		const [write] =
			installed.widgets.packages['workspace.table-panel']!.package.widgets[0]!.commands;
		expect(write!.type).toBe('content.update-item');
		expect(write!.executor).toBeUndefined();
	});
});

describe('RC-WID-6.1: content.update-item writes only the bound note', () => {
	const write = (t: Table, itemId: string) =>
		dispatchCommand(t.state, env, {
			type: 'widget.dispatch-command',
			actorId: DM_ACTOR.id,
			idempotencyKey: `ledger-${++keyCounter}`,
			payload: {
				sceneId: t.sceneId,
				widgetInstanceId: t.widgetId,
				commandType: 'content.update-item',
				payload: { itemId, body: 'Split: 40 gp each.' },
				expectedRevision: t.state.scenes.scenes[t.sceneId]!.ownership.revision,
			},
		});

	it('updates the bound note through its own command', () => {
		const t = table('note');
		const next = accept(write(t, t.noteId)).nextState;
		expect(next.content.items[t.noteId]!.body).toBe('Split: 40 gp each.');
	});

	it('refuses any other item, and a widget with no bound note', () => {
		const t = table('note');
		const elsewhere = write(t, t.questId);
		expect(elsewhere.status).toBe('rejected');
		if (elsewhere.status === 'rejected')
			expect(elsewhere.rejection.code).toBe('actor-not-authorized');
		const unbound = table();
		const none = write(unbound, unbound.noteId);
		expect(none.status).toBe('rejected');
		if (none.status === 'rejected')
			expect(none.rejection.message).toBe('Bind a note to this widget first.');
	});
});

describe('RC-WID-6.1: roll', () => {
	it('rolls the formula on the session dice engine and keeps the result on the widget', () => {
		const t = table();
		const before = t.state.session.diceHistory.length;
		const next = accept(press(t, t.state, 'roll', { formula: '2d6+1' })).nextState;
		expect(next.session.diceHistory).toHaveLength(before + 1);
		const roll = next.session.diceHistory.at(-1)!;
		expect(roll.expression).toBe('2d6+1');
		expect(roll.total).toBeGreaterThanOrEqual(3);
		expect(readWidgetLastRoll(widgetOf(t, next).configuration)).toMatchObject({
			expression: '2d6+1',
			total: roll.total,
		});
	});

	it('does not roll twice when the same press is retried', () => {
		const t = table();
		const first = press(t, t.state, 'roll', { formula: '1d20' }, 'roll-once');
		const once = accept(first).nextState;
		const again = accept(
			dispatchCommand(once, env, {
				...pressCommand(t, t.state, 'roll', { formula: '1d20' }, 'roll-once'),
			}),
		);
		expect(again.nextState.session.diceHistory).toHaveLength(once.session.diceHistory.length);
	});

	it('is unavailable with no formula, or one the dice engine cannot read', () => {
		const t = table();
		const none = press(t, t.state, 'roll', {});
		expect(none.status).toBe('rejected');
		if (none.status === 'rejected') expect(none.rejection.message).toMatch(/dice formula/);
		const bad = press(t, t.state, 'roll', { formula: 'banana' });
		expect(bad.status).toBe('rejected');
		if (bad.status === 'rejected') expect(bad.rejection.message).toMatch(/not a dice formula/);
	});
});

describe('RC-WID-6.1: the per-instance counter', () => {
	it('advance adds `by` (default 1), tick adds 1, set-value sets, reset returns to 0', () => {
		const t = table();
		let state = t.state;
		state = accept(press(t, state, 'advance', {})).nextState;
		expect(readWidgetCounter(widgetOf(t, state).configuration)).toBe(1);
		state = accept(press(t, state, 'advance', { by: 3 })).nextState;
		expect(readWidgetCounter(widgetOf(t, state).configuration)).toBe(4);
		state = accept(press(t, state, 'tick')).nextState;
		expect(readWidgetCounter(widgetOf(t, state).configuration)).toBe(5);
		state = accept(press(t, state, 'set-config', { value: '12' })).nextState;
		expect(readWidgetCounter(widgetOf(t, state).configuration)).toBe(12);
		state = accept(press(t, state, 'reset')).nextState;
		expect(readWidgetCounter(widgetOf(t, state).configuration)).toBe(0);
	});

	it('is scene state: each press moves the scene revision and logs previous and next', () => {
		const t = table();
		const revision = t.state.scenes.scenes[t.sceneId]!.ownership.revision;
		const result = accept(press(t, t.state, 'advance', { by: 2 }));
		expect(result.nextState.scenes.scenes[t.sceneId]!.ownership.revision).toBe(revision + 1);
		const op = result.nextState.sync.operations.find((o) => o.id === result.operationIds[0])!;
		expect(op.entityType).toBe('scene');
		expect(op.value).toMatchObject({ previous: null, next: 2 });
	});

	it('set-value without a value is unavailable', () => {
		const t = table();
		const result = press(t, t.state, 'set-config', {});
		expect(result.status).toBe('rejected');
	});

	it.each([
		{ verb: 'advance', payload: { by: 2 }, value: 7 },
		{ verb: 'tick', payload: {}, value: 6 },
		{ verb: 'reset', payload: {}, value: 0 },
		{ verb: 'set-config', payload: { value: '12' }, value: 12 },
	])('$verb is undoable through the public inverse builder', ({ verb, payload, value }) => {
		const t = table();
		const advanced = accept(press(t, t.state, 'advance', { by: 5 })).nextState;
		const forward = pressCommand(t, advanced, verb, payload);
		const after = accept(dispatchCommand(advanced, env, forward)).nextState;
		expect(readWidgetCounter(widgetOf(t, after).configuration)).toBe(value);

		const inverse = buildWidgetInverse(forward, advanced)!.command;
		expect(inverse.payload).toMatchObject({
			commandType: WIDGET_COUNTER_RESTORE_COMMAND,
			payload: { value: 5 },
		});
		const undone = accept(dispatchCommand(after, env, inverse)).nextState;
		expect(readWidgetCounter(widgetOf(t, undone).configuration)).toBe(5);
		// …and the restore is itself undoable (redo).
		const redo = buildWidgetInverse(inverse, after)!.command;
		const redone = accept(dispatchCommand(undone, env, redo)).nextState;
		expect(readWidgetCounter(widgetOf(t, redone).configuration)).toBe(value);
	});

	it('offers no inverse for a press that is not a counter write', () => {
		const t = table();
		expect(
			buildWidgetCommandInverse(pressCommand(t, t.state, 'roll', { formula: '1d4' }), t.state),
		).toBeNull();
		expect(
			buildWidgetCommandInverse(pressCommand(t, t.state, 'show', { text: 'Hi' }), t.state),
		).toBeNull();
	});

	it('refuses a restore on a widget that declares no counter command', () => {
		let state = accept(
			install(
				buildInitialState(DM_ACTOR),
				templatePackage([command('roll', 'roll', { formula: 'string' })]),
			),
		).nextState;
		state = run(state, {
			type: 'widget.package.enable',
			actorId: DM_ACTOR.id,
			payload: { packageId: 'workspace.table-panel' },
		});
		state = run(state, {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name: 'Plain', description: '', visibility: 'dm-only', tags: [] },
		} as CoreCommand);
		const sceneId = Object.values(state.scenes.scenes).find((s) => s.name === 'Plain')!.id;
		state = run(state, {
			type: 'scene.add-widget',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				widget: {
					type: 'table-panel',
					version: '1.0.0',
					layout: { x: 0, y: 0, w: 320, h: 200 },
					configuration: {},
					localState: {},
					binding: null,
				},
			},
		} as CoreCommand);
		const widgetId = state.scenes.scenes[sceneId]!.widgets[0]!.id;
		const t = { state, sceneId, widgetId, noteId: '', questId: '' };
		const result = press(t, state, WIDGET_COUNTER_RESTORE_COMMAND, { value: 3 });
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') expect(result.rejection.code).toBe('command-not-declared');
	});
});

describe('RC-WID-6.1: show', () => {
	it('keeps the message on the placed widget for the players to see', () => {
		const t = table();
		const next = accept(press(t, t.state, 'show', { text: 'The bell tolls thrice.' })).nextState;
		expect(readWidgetShownMessage(widgetOf(t, next).configuration)).toMatchObject({
			text: 'The bell tolls thrice.',
			shownBy: DM_ACTOR.id,
		});
	});

	it('is unavailable with nothing to show', () => {
		const t = table();
		expect(press(t, t.state, 'show', { text: '   ' }).status).toBe('rejected');
	});
});

describe('RC-WID-6.1: write-note-line and mark-complete write through the bound entity', () => {
	it('appends a line to the bound note through content.update-item', () => {
		const t = table('note');
		const next = accept(press(t, t.state, 'write-note-line', { line: 'Rang the bell.' })).nextState;
		expect(next.content.items[t.noteId]!.body).toBe('Arrived at dusk.\nRang the bell.');
		expect(next.content.items[t.noteId]!.revision).toBe(
			t.state.content.items[t.noteId]!.revision + 1,
		);
	});

	it('writes the line once when the same press is retried', () => {
		const t = table('note');
		const once = accept(
			press(t, t.state, 'write-note-line', { line: 'Once.' }, 'line-once'),
		).nextState;
		const again = accept(
			dispatchCommand(
				once,
				env,
				pressCommand(t, t.state, 'write-note-line', { line: 'Once.' }, 'line-once'),
			),
		).nextState;
		expect(again.content.items[t.noteId]!.body).toBe('Arrived at dusk.\nOnce.');
	});

	it('is unavailable with no bound note, or a bound entity that is not a note', () => {
		const unbound = table();
		const none = press(unbound, unbound.state, 'write-note-line', { line: 'x' });
		expect(none.status).toBe('rejected');
		if (none.status === 'rejected')
			expect(none.rejection.message).toBe('Bind a note to this widget first.');
		const quest = table('quest');
		const wrong = press(quest, quest.state, 'write-note-line', { line: 'x' });
		expect(wrong.status).toBe('rejected');
		if (wrong.status === 'rejected')
			expect(wrong.rejection.message).toBe('The bound entity is not a note.');
	});

	it('marks the bound quest completed through content.update-object', () => {
		const t = table('quest');
		const next = accept(press(t, t.state, 'mark-complete')).nextState;
		expect(next.content.items[t.questId]!.fields.status).toBe('completed');
	});

	it('mark-complete on a note is unavailable', () => {
		const t = table('note');
		const result = press(t, t.state, 'mark-complete');
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected')
			expect(result.rejection.message).toBe('The bound entity is not a quest.');
	});
});

describe('RC-WID-6.1: start, pause and resume drive the timer', () => {
	it('starts for the configured duration, pauses and resumes', () => {
		const t = table(null, { durationSeconds: 90 });
		let state = accept(press(t, t.state, 'start')).nextState;
		expect(state.session.timers[t.widgetId]).toMatchObject({
			status: 'running',
			durationSeconds: 90,
		});
		state = accept(press(t, state, 'pause')).nextState;
		expect(state.session.timers[t.widgetId]!.status).toBe('paused');
		state = accept(press(t, state, 'resume')).nextState;
		expect(state.session.timers[t.widgetId]!.status).toBe('running');
	});

	it('a duration in the payload wins over the configured one', () => {
		const t = table(null, { durationSeconds: 90 });
		const state = accept(press(t, t.state, 'start', { durationSeconds: 30 })).nextState;
		expect(state.session.timers[t.widgetId]!.durationSeconds).toBe(30);
	});

	it('start with no duration anywhere is unavailable', () => {
		const t = table();
		const result = press(t, t.state, 'start');
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') expect(result.rejection.message).toMatch(/how long/);
	});
});

describe('RC-WID-6.1: widgetCommandAvailability is the action panel’s check too', () => {
	it('names why, without the vault, from the payload and the binding alone', () => {
		const roll = command('roll', 'roll', { formula: 'string' });
		expect(
			widgetCommandAvailability({ descriptor: roll, payload: {}, binding: null }),
		).toMatchObject({
			available: false,
			reason: 'no-formula',
		});
		expect(
			widgetCommandAvailability({ descriptor: roll, payload: { formula: '1d8' }, binding: null }),
		).toEqual({ available: true });
		const line = command('write-note-line', 'write-note-line', { line: 'string' });
		expect(
			widgetCommandAvailability({ descriptor: line, payload: { line: 'x' }, binding: null }),
		).toMatchObject({ available: false, reason: 'no-bound-entity' });
		expect(
			widgetCommandAvailability({
				descriptor: line,
				payload: { line: 'x' },
				binding: { entityType: 'note', entityId: 'anything' },
			}),
		).toEqual({ available: true });
		expect(
			widgetCommandAvailability({
				descriptor: command('draw', undefined),
				payload: {},
				binding: null,
			}),
		).toMatchObject({ available: false, reason: 'no-executor' });
	});
});
