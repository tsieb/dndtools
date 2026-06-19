import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	filterCombatStreamForRecipient,
	getSharedCombatView,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	type SyncOperation,
} from '../src';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '../src/testing/fixtures';
import type { CoreEnvironment } from '../src/commands/types';
import type { Actor } from '../src/state/permission-state';

/**
 * Two combat NO-LEAK fixes:
 *  - #1 (PERM-004): a combat-participant grant with an EXPIRY must be inert once expired. The combat
 *    read models gate hidden-combatant visibility on that grant, so they MUST be passed `now` — an
 *    expired grant must not keep revealing a hidden combatant's identity/stats.
 *  - #3 (COLLAB-006/009): a combat-level op replicated to a non-DM must not leak an AGGREGATE count that
 *    betrays hidden combatants — `combat.add-combatants.addedCount` and `combat.end.logEntries`.
 */

// The grant command validates expiry against its own clock (fixedClock starts 2026-06-03T12:00:00Z),
// so the expiry must be in the future at grant time; the read clock then crosses it.
const EXPIRES_AT = '2026-06-03T13:00:00.000Z';
const BEFORE_EXPIRY = '2026-06-03T12:30:00.000Z';
const AFTER_EXPIRY = '2026-06-03T14:00:00.000Z';

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') throw new Error(`expected accepted: ${result.rejection.message}`);
	return result;
}

function cmd(type: CoreCommand['type'], payload: unknown, actorId = DM_ACTOR.id): CoreCommand {
	return { type, actorId, payload } as CoreCommand;
}

function activeCombat(env: CoreEnvironment): CoreStateSlice {
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	const home = accept(dispatchCommand(base, env, cmd('command-center.ensure-home', {}))).nextState;
	const active = accept(
		dispatchCommand(home, env, cmd('session.set-workflow', { workflow: 'active', activeSceneId: home.commandCenter.homeSceneId })),
	).nextState;
	return accept(
		dispatchCommand(
			active,
			env,
			cmd('combat.start', {
				combatants: [
					{ kind: 'npc', name: 'Goblin', ac: 13, initiative: 12, maxHp: 7, hidden: false },
					{ kind: 'character', name: 'Spy', characterId: 'char-spy', ac: 14, initiative: 18, maxHp: 20, hidden: true },
				],
			}),
		),
	).nextState;
}

describe('#1 — an EXPIRED combat-participant grant stops revealing a hidden combatant', () => {
	it('honors expiry when now is passed; the grant works before expiry and is inert after', () => {
		const env = makeEnvironment();
		const combat = activeCombat(env);
		const granted = accept(
			dispatchCommand(
				combat,
				env,
				cmd('permission.grant-capability-set', {
					playerActorId: PLAYER_ACTOR.id,
					entityType: 'character',
					entityId: 'char-spy',
					capabilitySet: 'combat-participant',
					expiresAt: EXPIRES_AT,
				}),
			),
		).nextState;

		const seesSpy = (now?: string): boolean =>
			getSharedCombatView(granted.session.combat, granted.permissions, PLAYER_ACTOR.id, 'live', now)
				.tracker.combatants.some((c) => c.name === 'Spy');

		// Before expiry: the grant is live, so the player sees the hidden Spy combatant.
		expect(seesSpy(BEFORE_EXPIRY)).toBe(true);
		// After expiry: the grant is inert — the hidden combatant must no longer be revealed (the fix).
		expect(seesSpy(AFTER_EXPIRY)).toBe(false);
	});
});

describe('#4 — combat.start refuses to clobber a running combat', () => {
	it('rejects starting a second combat and preserves the in-progress one', () => {
		const env = makeEnvironment();
		const running = activeCombat(env); // combat already started + running
		const before = running.session.combat;
		const result = dispatchCommand(
			running,
			env,
			cmd('combat.start', { combatants: [{ kind: 'npc', name: 'Latecomer', ac: 10, initiative: 1, maxHp: 5, hidden: false }] }),
		);
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') throw new Error('expected rejected');
		expect(result.rejection.code).toBe('invalid-state');
		// The original running combat is untouched (no data loss).
		expect(result.nextState.session.combat).toBe(before);
		expect(result.nextState.session.combat.status).toBe('running');
	});
});

describe('#3 — combat-level ops do not leak hidden-activity aggregate counts to a non-DM', () => {
	function opOfType(state: CoreStateSlice, opType: string): SyncOperation {
		const op = [...state.sync.operations].reverse().find((o) => o.opType === opType);
		if (!op) throw new Error(`no ${opType} op found`);
		return op;
	}

	it('strips addedCount from a combat.add-combatants op and filters the order for a player', () => {
		const env = makeEnvironment();
		const combat = activeCombat(env);
		const added = accept(
			dispatchCommand(
				combat,
				env,
				cmd('combat.add-combatants', {
					combatants: [{ kind: 'npc', name: 'Reinforcement', ac: 12, initiative: 5, maxHp: 9, hidden: true }],
				}),
			),
		).nextState;
		const op = opOfType(added, 'combat.add-combatants');
		// The DM op carries the full aggregate count.
		expect((op.value as { addedCount?: number }).addedCount).toBeDefined();

		const [forPlayer] = filterCombatStreamForRecipient([op], added.session.combat, added.permissions, PLAYER_ACTOR as Actor);
		const value = forPlayer!.value as Record<string, unknown>;
		expect('addedCount' in value).toBe(false);
		// The order delivered to the player excludes the hidden combatants.
		expect((value.order as string[]).length).toBeLessThan((op.value as { order: string[] }).order.length);
	});

	it('strips logEntries from a combat.end op for a player', () => {
		const env = makeEnvironment();
		const ended = accept(dispatchCommand(activeCombat(env), env, cmd('combat.end', {}))).nextState;
		const op = opOfType(ended, 'combat.end');
		expect((op.value as { logEntries?: number }).logEntries).toBeDefined();

		const [forPlayer] = filterCombatStreamForRecipient([op], ended.session.combat, ended.permissions, PLAYER_ACTOR as Actor);
		expect('logEntries' in (forPlayer!.value as Record<string, unknown>)).toBe(false);
	});
});
