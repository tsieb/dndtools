// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
	createBaselineMcpToolRegistry,
	createDemoMapState,
	dispatchCommand,
	findHomeScreen,
	invokeMcpToolAsAgent,
	mergeSystemWidgetPackages,
	resolveFirstSessionGuide,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	type McpAgentInvocation,
} from '@dndtools/core';
import { buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { seedDemoContent } from './demo-seed';

/**
 * RC-UX-6.3 — the first-session guide on the seeded vaults. The base seed (the e2e fixture) and the
 * demo vault (base + showcase) are populated campaigns, so the guide reads what they hold, and the
 * Command Center they provision does not open on it: the guide is placed in a fresh vault only.
 */

const DM: Actor = { id: 'actor-dm', role: 'dm', displayName: 'Demo DM' };
const PARTICIPANTS: Actor[] = [
	{ id: 'actor-player', role: 'player', displayName: 'Demo Player' },
	{ id: 'actor-player-2', role: 'player', displayName: 'Demo Player 2' },
	{ id: 'actor-player-3', role: 'player', displayName: 'Demo Player 3' },
	{ id: 'actor-observer', role: 'observer', displayName: 'Demo Observer' },
];

async function seeded(showcase: boolean): Promise<CoreStateSlice> {
	const base = buildInitialState(DM, ...PARTICIPANTS);
	const env = makeEnvironment();
	const registry = createBaselineMcpToolRegistry();
	const staged = {
		state: {
			...base,
			maps: createDemoMapState(),
			widgets: mergeSystemWidgetPackages(base.widgets),
		} as CoreStateSlice,
		defaultActorId: DM.id,
		async dispatch(command: CoreCommand): Promise<CommandResult> {
			const result = dispatchCommand(staged.state, env, command);
			if (result.status === 'accepted') staged.state = result.nextState;
			return result;
		},
		async invokeAgentTool(invocation: McpAgentInvocation) {
			const { result, nextState } = invokeMcpToolAsAgent(staged.state, env, registry, invocation);
			staged.state = nextState;
			return result;
		},
	};
	await seedDemoContent(staged, { showcase });
	// The Command Center then provisions its home, as on first open.
	const home = dispatchCommand(staged.state, env, {
		type: 'command-center.ensure-home',
		actorId: DM.id,
		payload: {},
	});
	if (home.status !== 'accepted') throw new Error(home.rejection.message);
	return home.nextState;
}

const doneRows = (state: CoreStateSlice) =>
	resolveFirstSessionGuide(state, DM.id)
		.rows.filter((row) => row.done)
		.map((row) => row.id);

describe('RC-UX-6.3 the first-session guide on seeded vaults', () => {
	it('the base seed has a party, maps and notes and screens, and is not named or run yet', async () => {
		const state = await seeded(false);
		expect(doneRows(state)).toEqual(['add-party', 'map-or-note', 'screen-from-template']);
		expect(findHomeScreen(state.scenes)!.widgets.map((widget) => widget.type)).not.toContain(
			'getting-started',
		);
	});

	it('the demo vault reads as a campaign already under way', async () => {
		const state = await seeded(true);
		const guide = resolveFirstSessionGuide(state, DM.id);
		// The showcase's running encounter is a live session, so only the name is left.
		expect(doneRows(state)).toEqual([
			'add-party',
			'map-or-note',
			'screen-from-template',
			'standby-session',
			'open-table',
		]);
		expect(guide.done).toBe(5);
		// Its name comes from the vault catalog when the app opens it (RC-UX-6.2), not from the seed.
		expect(guide.rows.find((row) => row.id === 'name-campaign')!.done).toBe(false);
		expect(guide.placedWidgetId).toBeNull();
		// Help can still put the guide on the demo's Command Center.
		expect(guide.restore).not.toBeNull();
	});
});
