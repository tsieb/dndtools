import { describe, expect, it } from 'vitest';
import { dispatchCommand } from '../src/commands/dispatch';
import type { CommandResult, CoreCommand, CoreEnvironment, CoreStateSlice } from '../src/commands/types';
import {
	listCommandActions,
	resolveCommandAction,
	searchCommandActions,
} from '../src/queries/command-actions';
import { resolveAddWidgetCommand, listWidgetLibrary } from '../src/queries/widget-library';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '../src/testing/fixtures';

function dispatch(state: CoreStateSlice, env: CoreEnvironment, command: CoreCommand): CommandResult {
	return dispatchCommand(state, env, command);
}

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function withConfiguredHome(): {
	env: CoreEnvironment;
	state: CoreStateSlice;
	homeSceneId: string;
} {
	const env = makeEnvironment();
	const created = accept(
		dispatch(buildInitialState(DM_ACTOR), env, {
			type: 'command-center.ensure-home',
			actorId: DM_ACTOR.id,
			payload: {},
		}),
	);
	return { env, state: created.nextState, homeSceneId: created.nextState.commandCenter.homeSceneId! };
}

describe('CMD-008 command palette actions', () => {
	it('hides all actions from non-DM actors (fail closed, no leak)', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		expect(listCommandActions(state, PLAYER_ACTOR.id, { profileId: 'desktop' })).toEqual([]);
	});

	it('exposes a save-preset action and add-widget actions once a home is configured', () => {
		const { state } = withConfiguredHome();
		const actions = listCommandActions(state, DM_ACTOR.id, { profileId: 'desktop' });

		const save = actions.find((a) => a.id === 'cc.preset.save');
		expect(save).toMatchObject({
			commandType: 'command-center.save-preset',
			availability: { status: 'available' },
			input: { field: 'name' },
		});

		// Every available library widget is offered as an add action via the same
		// scene.add-widget command the library button uses.
		expect(actions.some((a) => a.id === 'cc.widget.add:dice')).toBe(true);
	});

	it('dispatches the identical command a visible control issues (AC1)', () => {
		const { env, state, homeSceneId } = withConfiguredHome();

		// Save a preset so an "apply" action exists.
		const saved = accept(
			dispatch(state, env, {
				type: 'command-center.save-preset',
				actorId: DM_ACTOR.id,
				payload: { name: 'Combat Night' },
			}),
		);
		const presetId = Object.keys(saved.nextState.commandCenter.presets)[0]!;

		const actions = listCommandActions(saved.nextState, DM_ACTOR.id, { profileId: 'desktop' });

		// Apply-preset: palette resolves to the exact command the visible Apply button dispatches.
		const apply = actions.find((a) => a.id === `cc.preset.apply:${presetId}`);
		expect(apply?.availability).toEqual({ status: 'available' });
		expect(resolveCommandAction(apply!)).toEqual({
			type: 'command-center.apply-preset',
			payload: { presetId },
		});

		// Save-preset: palette collects the name, then dispatches the same save command.
		const save = actions.find((a) => a.id === 'cc.preset.save')!;
		expect(resolveCommandAction(save, { name: 'Boss Fight' })).toEqual({
			type: 'command-center.save-preset',
			payload: { name: 'Boss Fight' },
		});

		// Add-widget: palette payload equals the library Add button's resolved command.
		const diceEntry = listWidgetLibrary(saved.nextState.widgets, saved.nextState.permissions, DM_ACTOR.id, {
			profileId: 'desktop',
		}).find((e) => e.type === 'dice')!;
		const addDice = actions.find((a) => a.id === 'cc.widget.add:dice')!;
		expect(resolveCommandAction(addDice)).toEqual(resolveAddWidgetCommand(diceEntry, homeSceneId));
	});

	it('an applied palette command produces the same accepted result as the visible control', () => {
		const { env, state } = withConfiguredHome();
		const saved = accept(
			dispatch(state, env, {
				type: 'command-center.save-preset',
				actorId: DM_ACTOR.id,
				payload: { name: 'Default Board' },
			}),
		);
		const presetId = Object.keys(saved.nextState.commandCenter.presets)[0]!;
		const actions = listCommandActions(saved.nextState, DM_ACTOR.id, { profileId: 'desktop' });
		const apply = actions.find((a) => a.id === `cc.preset.apply:${presetId}`)!;
		const command = resolveCommandAction(apply)!;

		const result = dispatch(saved.nextState, env, {
			type: command.type,
			actorId: DM_ACTOR.id,
			payload: command.payload,
		});
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		expect(result.events.some((e) => e.kind === 'command-center.preset-restored')).toBe(true);
	});

	it('shows save/add actions disabled with a non-leaking reason when no home is configured (AC2)', () => {
		const state = buildInitialState(DM_ACTOR);
		const actions = listCommandActions(state, DM_ACTOR.id, { profileId: 'desktop' });

		const save = actions.find((a) => a.id === 'cc.preset.save')!;
		expect(save.availability).toEqual({ status: 'unavailable', reason: 'Set up the Command Center first.' });
		// A disabled action can never be dispatched.
		expect(resolveCommandAction(save, { name: 'whatever' })).toBeNull();

		const addDice = actions.find((a) => a.id === 'cc.widget.add:dice')!;
		expect(addDice.availability).toEqual({
			status: 'unavailable',
			reason: 'Set up the Command Center first.',
		});
		expect(resolveCommandAction(addDice)).toBeNull();
	});

	it('refuses to resolve a save action without the required input', () => {
		const { state } = withConfiguredHome();
		const save = listCommandActions(state, DM_ACTOR.id, { profileId: 'desktop' }).find(
			(a) => a.id === 'cc.preset.save',
		)!;
		expect(resolveCommandAction(save, { name: '   ' })).toBeNull();
		expect(resolveCommandAction(save)).toBeNull();
	});

	it('searches actions by title and keyword', () => {
		const { env, state } = withConfiguredHome();
		const saved = accept(
			dispatch(state, env, {
				type: 'command-center.save-preset',
				actorId: DM_ACTOR.id,
				payload: { name: 'Combat Night' },
			}),
		);
		const actions = listCommandActions(saved.nextState, DM_ACTOR.id, { profileId: 'desktop' });
		const byTitle = searchCommandActions(actions, 'Combat');
		expect(byTitle.every((a) => a.title.toLowerCase().includes('combat'))).toBe(true);
		expect(byTitle.some((a) => a.title === 'Apply preset: Combat Night')).toBe(true);

		const byKeyword = searchCommandActions(actions, 'snapshot');
		expect(byKeyword.map((a) => a.id)).toContain('cc.preset.save');
	});
});
