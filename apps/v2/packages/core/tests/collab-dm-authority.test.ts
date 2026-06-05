import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SESSION_FIELD_AUTHORITY,
	resolveSessionFieldAuthority,
	type PermissionGrant,
	type SessionFieldCommand,
} from '../src';
import { DM_ACTOR, OBSERVER_ACTOR, PLAYER_ACTOR, buildPermissionState } from '../src/testing/fixtures';

/**
 * COLLAB-008 — authoritative session-command resolution. A VALID DM command supersedes concurrent
 * non-DM commands WHERE policy grants DM authority; where it does not, normal rules apply; an
 * unauthorized non-DM command is rejected, not conflicted; a non-DM can never override a DM.
 */

const TIMER_FIELD = 'timer.durationSeconds';

function command(overrides: Partial<SessionFieldCommand> & Pick<SessionFieldCommand, 'commandId' | 'actorId' | 'value'>): SessionFieldCommand {
	return {
		entityType: 'timer-widget',
		entityId: 'timer-1',
		field: TIMER_FIELD,
		issuedAt: '2026-06-05T00:00:00.000Z',
		...overrides,
	};
}

/** A player who holds an operator grant on the timer (so a non-DM command can be authorized). */
function permissionWithTimerOperator(): { permission: ReturnType<typeof buildPermissionState> } {
	const permission = buildPermissionState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	const grant: PermissionGrant = {
		id: 'grant-timer',
		entityType: 'timer-widget',
		entityId: 'timer-1',
		playerActorId: PLAYER_ACTOR.id,
		capabilitySet: 'operator',
		createdBy: DM_ACTOR.id,
		createdAt: '2026-06-04T00:00:00.000Z',
		expiresAt: null,
	};
	return { permission: { ...permission, grants: [grant] } };
}

describe('COLLAB-008 — DM authority resolution', () => {
	it('the default field authority is dm-authoritative (fail closed — most protective for shared state)', () => {
		expect(DEFAULT_SESSION_FIELD_AUTHORITY).toBe('dm-authoritative');
	});

	describe('AC1 — a valid DM command supersedes a non-DM command where policy grants DM authority', () => {
		it('DM supersedes a permitted player command on the same timer field', () => {
			const { permission } = permissionWithTimerOperator();
			const commands: SessionFieldCommand[] = [
				command({ commandId: 'cmd-player', actorId: PLAYER_ACTOR.id, value: 30, requiredCapability: 'operator' }),
				command({ commandId: 'cmd-dm', actorId: DM_ACTOR.id, value: 60 }),
			];

			const result = resolveSessionFieldAuthority(commands, permission, 'dm-authoritative');

			expect(result.outcome).toBe('dm-supersedes');
			expect(result.winningCommandId).toBe('cmd-dm');
			expect(result.winningActorId).toBe(DM_ACTOR.id);
			expect(result.winningValue).toBe(60); // the DM command determines final state
			// The player command is superseded (dropped), NOT rejected and NOT conflicted.
			expect(result.rejected).toHaveLength(0);
			expect(result.conflictingCommandIds).toHaveLength(0);
		});

		it('a non-DM can NEVER override a valid DM command (fail closed)', () => {
			const { permission } = permissionWithTimerOperator();
			// Even if the player command is issued LATER than the DM command, it does not win.
			const commands: SessionFieldCommand[] = [
				command({ commandId: 'cmd-dm', actorId: DM_ACTOR.id, value: 60, issuedAt: '2026-06-05T00:00:00.000Z' }),
				command({
					commandId: 'cmd-player',
					actorId: PLAYER_ACTOR.id,
					value: 30,
					requiredCapability: 'operator',
					issuedAt: '2026-06-05T00:05:00.000Z',
				}),
			];
			const result = resolveSessionFieldAuthority(commands, permission, 'dm-authoritative');
			expect(result.outcome).toBe('dm-supersedes');
			expect(result.winningActorId).toBe(DM_ACTOR.id);
			expect(result.winningValue).toBe(60);
		});

		it('among multiple DM commands, the latest-issued deterministically wins', () => {
			const permission = buildPermissionState(DM_ACTOR);
			const commands: SessionFieldCommand[] = [
				command({ commandId: 'cmd-dm-early', actorId: DM_ACTOR.id, value: 60, issuedAt: '2026-06-05T00:00:00.000Z' }),
				command({ commandId: 'cmd-dm-late', actorId: DM_ACTOR.id, value: 90, issuedAt: '2026-06-05T00:10:00.000Z' }),
			];
			const result = resolveSessionFieldAuthority(commands, permission, 'dm-authoritative');
			expect(result.outcome).toBe('dm-supersedes');
			expect(result.winningCommandId).toBe('cmd-dm-late');
			expect(result.winningValue).toBe(90);
		});
	});

	describe('AC2 — a command outside grants is rejected rather than conflicted', () => {
		it("a player command with no grant is rejected (not-permitted), not conflicted", () => {
			// Player has NO grant on the timer.
			const permission = buildPermissionState(DM_ACTOR, PLAYER_ACTOR);
			const commands: SessionFieldCommand[] = [
				command({ commandId: 'cmd-dm', actorId: DM_ACTOR.id, value: 60 }),
				command({ commandId: 'cmd-player', actorId: PLAYER_ACTOR.id, value: 30, requiredCapability: 'operator' }),
			];
			const result = resolveSessionFieldAuthority(commands, permission, 'dm-authoritative');
			expect(result.outcome).toBe('dm-supersedes'); // the valid DM command still wins
			expect(result.rejected).toEqual([
				{ commandId: 'cmd-player', actorId: PLAYER_ACTOR.id, reason: 'not-permitted' },
			]);
			expect(result.conflictingCommandIds).toHaveLength(0);
		});

		it('an observer write command is rejected (observer-write) — observers never write', () => {
			const permission = buildPermissionState(DM_ACTOR, OBSERVER_ACTOR);
			const commands: SessionFieldCommand[] = [
				command({ commandId: 'cmd-obs', actorId: OBSERVER_ACTOR.id, value: 30, requiredCapability: 'operator' }),
			];
			const result = resolveSessionFieldAuthority(commands, permission, 'shared-merge');
			expect(result.outcome).toBe('no-valid-command');
			expect(result.rejected[0]?.reason).toBe('observer-write');
			expect(result.winningCommandId).toBeNull();
		});

		it('an unknown actor command is rejected (unknown-actor)', () => {
			const permission = buildPermissionState(DM_ACTOR);
			const commands: SessionFieldCommand[] = [
				command({ commandId: 'cmd-ghost', actorId: 'actor-ghost', value: 30, requiredCapability: 'operator' }),
			];
			const result = resolveSessionFieldAuthority(commands, permission, 'shared-merge');
			expect(result.outcome).toBe('no-valid-command');
			expect(result.rejected[0]?.reason).toBe('unknown-actor');
		});

		it('a non-DM command on a DM-only field (no requiredCapability) is rejected', () => {
			const permission = buildPermissionState(DM_ACTOR, PLAYER_ACTOR);
			const commands: SessionFieldCommand[] = [
				command({ commandId: 'cmd-player', actorId: PLAYER_ACTOR.id, value: 30 }), // no requiredCapability
			];
			const result = resolveSessionFieldAuthority(commands, permission, 'shared-merge');
			expect(result.outcome).toBe('no-valid-command');
			expect(result.rejected[0]?.reason).toBe('not-permitted');
		});
	});

	describe('the non-authority case — normal rules apply where policy does NOT grant DM authority', () => {
		it('shared-merge with a DM and a permitted player command CONFLICTS (no silent DM override)', () => {
			const { permission } = permissionWithTimerOperator();
			const commands: SessionFieldCommand[] = [
				command({ commandId: 'cmd-dm', actorId: DM_ACTOR.id, value: 60 }),
				command({ commandId: 'cmd-player', actorId: PLAYER_ACTOR.id, value: 30, requiredCapability: 'operator' }),
			];
			const result = resolveSessionFieldAuthority(commands, permission, 'shared-merge');
			expect(result.outcome).toBe('conflict');
			expect(result.winningCommandId).toBeNull(); // no command is elevated merely for being the DM's
			expect(result.conflictingCommandIds).toEqual(['cmd-dm', 'cmd-player']);
		});

		it('shared-merge with a single valid command yields sole-valid', () => {
			const { permission } = permissionWithTimerOperator();
			const commands: SessionFieldCommand[] = [
				command({ commandId: 'cmd-player', actorId: PLAYER_ACTOR.id, value: 30, requiredCapability: 'operator' }),
			];
			const result = resolveSessionFieldAuthority(commands, permission, 'shared-merge');
			expect(result.outcome).toBe('sole-valid');
			expect(result.winningCommandId).toBe('cmd-player');
			expect(result.winningValue).toBe(30);
		});

		it('dm-authoritative with NO valid DM command falls back to normal rules (conflict among players)', () => {
			const permission = buildPermissionState(DM_ACTOR, PLAYER_ACTOR);
			const player2 = { id: 'actor-player-2', role: 'player' as const, displayName: 'Player Two' };
			const withTwo = { ...permission, actors: { ...permission.actors, [player2.id]: player2 } };
			const grants: PermissionGrant[] = [
				{ id: 'g1', entityType: 'timer-widget', entityId: 'timer-1', playerActorId: PLAYER_ACTOR.id, capabilitySet: 'operator', createdBy: DM_ACTOR.id, createdAt: '2026-06-04T00:00:00.000Z', expiresAt: null },
				{ id: 'g2', entityType: 'timer-widget', entityId: 'timer-1', playerActorId: player2.id, capabilitySet: 'operator', createdBy: DM_ACTOR.id, createdAt: '2026-06-04T00:00:00.000Z', expiresAt: null },
			];
			const commands: SessionFieldCommand[] = [
				command({ commandId: 'cmd-p1', actorId: PLAYER_ACTOR.id, value: 30, requiredCapability: 'operator' }),
				command({ commandId: 'cmd-p2', actorId: player2.id, value: 45, requiredCapability: 'operator' }),
			];
			const result = resolveSessionFieldAuthority(commands, { ...withTwo, grants }, 'dm-authoritative');
			expect(result.outcome).toBe('conflict');
			expect(result.conflictingCommandIds).toEqual(['cmd-p1', 'cmd-p2']);
		});
	});
});
