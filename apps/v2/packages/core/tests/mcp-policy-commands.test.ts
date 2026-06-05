import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import { dispatchCommand, type CommandResult, type CoreStateSlice } from '../src';

/**
 * MCP-009 / MCP-011 — command-level fail-closed coverage for the DM-only MCP administrative commands
 * (binding, policy, vault default). These commands are the ONLY way durable MCP identity/policy state
 * changes, so every authority + validity gate is asserted here.
 */

const env = makeEnvironment();

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

function rejected(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	expect(result.status).toBe('rejected');
	if (result.status !== 'rejected') throw new Error('expected rejected');
	return result;
}

function base(): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
}

describe('MCP-011 — agent binding commands', () => {
	it('the DM binds an agent to a registered actor', () => {
		const result = accepted(
			dispatchCommand(base(), env, {
				type: 'mcp.set-agent-binding',
				actorId: DM_ACTOR.id,
				payload: { agentId: 'agent-1', actorId: PLAYER_ACTOR.id, label: 'p' },
			}),
		);
		expect(result.nextState.mcp.bindings['agent-1']!.actorId).toBe(PLAYER_ACTOR.id);
		expect(result.operationIds.length).toBe(1);
	});

	it('binding to a NON-REGISTERED actor is rejected fail-closed', () => {
		const result = rejected(
			dispatchCommand(base(), env, {
				type: 'mcp.set-agent-binding',
				actorId: DM_ACTOR.id,
				payload: { agentId: 'agent-1', actorId: 'actor-ghost', label: 'x' },
			}),
		);
		expect(result.rejection.code).toBe('mcp-actor-not-registered');
	});

	it('a player cannot author an agent binding (DM-only)', () => {
		const result = rejected(
			dispatchCommand(base(), env, {
				type: 'mcp.set-agent-binding',
				actorId: PLAYER_ACTOR.id,
				payload: { agentId: 'agent-1', actorId: PLAYER_ACTOR.id, label: 'x' },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('removing a non-existent binding is rejected fail-closed', () => {
		const result = rejected(
			dispatchCommand(base(), env, {
				type: 'mcp.remove-agent-binding',
				actorId: DM_ACTOR.id,
				payload: { agentId: 'agent-unknown' },
			}),
		);
		expect(result.rejection.code).toBe('mcp-agent-not-bound');
	});
});

describe('MCP-009 — policy + vault default commands', () => {
	it('the DM configures a policy with an allowlist; duplicates are deduped', () => {
		const result = accepted(
			dispatchCommand(base(), env, {
				type: 'mcp.set-agent-policy',
				actorId: DM_ACTOR.id,
				payload: {
					agentId: 'agent-1',
					mode: 'balanced',
					allowedToolIds: ['note.list', 'note.list', 'note.create'],
				},
			}),
		);
		expect(result.nextState.mcp.policies['agent-1']!.allowedToolIds).toEqual(['note.list', 'note.create']);
		expect(result.nextState.mcp.policies['agent-1']!.mode).toBe('balanced');
	});

	it('the DM sets the vault default to disabled', () => {
		const result = accepted(
			dispatchCommand(base(), env, {
				type: 'mcp.set-vault-default',
				actorId: DM_ACTOR.id,
				payload: { mode: 'disabled' },
			}),
		);
		expect(result.nextState.mcp.vaultDefaultMode).toBe('disabled');
	});

	it('the vault default rejects a non-safe mode (only strict_review / disabled allowed)', () => {
		const result = rejected(
			dispatchCommand(base(), env, {
				type: 'mcp.set-vault-default',
				actorId: DM_ACTOR.id,
				payload: { mode: 'trusted_direct' },
			}),
		);
		expect(result.rejection.code).toBe('invalid-payload');
	});

	it('an observer cannot author a policy (DM-only)', () => {
		const result = rejected(
			dispatchCommand(base(), env, {
				type: 'mcp.set-agent-policy',
				actorId: OBSERVER_ACTOR.id,
				payload: { agentId: 'agent-1', mode: 'strict_review', allowedToolIds: [] },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});
});

describe('MCP — every administrative command appends a durable operation', () => {
	it('binding, policy, and vault-default each append exactly one op', () => {
		let state = base();
		const sizeBefore = state.sync.operations.length;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'mcp.set-agent-binding',
				actorId: DM_ACTOR.id,
				payload: { agentId: 'a', actorId: PLAYER_ACTOR.id, label: 'x' },
			}),
		).nextState;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'mcp.set-agent-policy',
				actorId: DM_ACTOR.id,
				payload: { agentId: 'a', mode: 'strict_review', allowedToolIds: ['note.list'] },
			}),
		).nextState;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'mcp.set-vault-default',
				actorId: DM_ACTOR.id,
				payload: { mode: 'disabled' },
			}),
		).nextState;
		expect(state.sync.operations.length).toBe(sizeBefore + 3);
	});
});
