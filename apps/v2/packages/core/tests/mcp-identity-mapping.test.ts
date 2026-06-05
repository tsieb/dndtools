import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	createBaselineMcpToolRegistry,
	dispatchCommand,
	invokeMcpToolAsAgent,
	resolveAgentIdentity,
	type CommandResult,
	type CoreStateSlice,
	type McpAgentInvokeOutput,
} from '../src';

/**
 * MCP-011 — EACH MCP AGENT CONNECTION MAPS TO AN AUTHENTICATED VAULT ACTOR, SESSION ROLE, POLICY PROFILE,
 * AND AUDIT IDENTITY BEFORE ANY TOOL CAN READ OR STAGE DATA. These tests prove both acceptance criteria
 * with hard assertions plus the adversarial cases the epic demands:
 *
 *   - AC1: an agent connecting WITHOUT a valid actor mapping has its tool call REJECTED before core
 *     queries run (an unmapped agent, AND a binding pointing at an actor that is not registered).
 *   - AC2: a DM-scoped agent that stages a write records agent id, actor id, policy mode, tool id, and
 *     staged/direct mode in audit history.
 *
 *   - FORGED / STALE BINDING: a binding to an actor that does not exist resolves to NOTHING (fail closed).
 *   - NO ESCALATION: a player-bound agent resolves to the PLAYER role — never the DM — so it can never
 *     resolve to more authority than its bound actor.
 */

const env = makeEnvironment();

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

/**
 * Seed a vault with a DM, player, and observer; bind `agent-dm` → DM and `agent-player` → player; and put
 * both agents on `trusted_direct`/`strict_review` policies with the note.create tool allowlisted. Returns
 * the wired state.
 */
function seedAgents(): CoreStateSlice {
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);

	state = accepted(
		dispatchCommand(state, env, {
			type: 'mcp.set-agent-binding',
			actorId: DM_ACTOR.id,
			payload: { agentId: 'agent-dm', actorId: DM_ACTOR.id, label: 'DM prep bot' },
		}),
	).nextState;
	state = accepted(
		dispatchCommand(state, env, {
			type: 'mcp.set-agent-policy',
			actorId: DM_ACTOR.id,
			payload: { agentId: 'agent-dm', mode: 'strict_review', allowedToolIds: ['note.create', 'note.list'] },
		}),
	).nextState;
	state = accepted(
		dispatchCommand(state, env, {
			type: 'mcp.set-agent-binding',
			actorId: DM_ACTOR.id,
			payload: { agentId: 'agent-player', actorId: PLAYER_ACTOR.id, label: 'Player helper' },
		}),
	).nextState;
	state = accepted(
		dispatchCommand(state, env, {
			type: 'mcp.set-agent-policy',
			actorId: DM_ACTOR.id,
			payload: { agentId: 'agent-player', mode: 'strict_review', allowedToolIds: ['note.list'] },
		}),
	).nextState;
	return state;
}

function denied(output: McpAgentInvokeOutput): Extract<McpAgentInvokeOutput['result'], { status: 'agent-denied' }> {
	expect(output.result.status).toBe('agent-denied');
	if (output.result.status !== 'agent-denied') throw new Error('expected agent-denied');
	return output.result;
}

describe('MCP-011 AC1 — an agent without a valid actor mapping is rejected before core queries run', () => {
	it('an UNMAPPED agent (no binding) is denied with no actor resolution', () => {
		const state = seedAgents();
		const registry = createBaselineMcpToolRegistry();

		const output = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-unknown',
			toolId: 'note.list',
			input: {},
		});
		const result = denied(output);
		expect(result.reason).toBe('no-binding');
		// The message leaks nothing about whether the vault has notes.
		expect(result.message).not.toMatch(/note/i);
		// Fail closed: no durable mutation, no audit entry.
		expect(output.nextState).toBe(state);
	});

	it('a binding to an UNREGISTERED actor (stale/forged) resolves to nothing and is denied', () => {
		let state = seedAgents();
		const registry = createBaselineMcpToolRegistry();
		// Forge a binding to an actor id that is not a registered participant by mutating bindings directly
		// (simulating a binding whose actor was later removed). The resolver must reject it fail-closed.
		state = {
			...state,
			mcp: {
				...state.mcp,
				bindings: {
					...state.mcp.bindings,
					'agent-ghost': {
						agentId: 'agent-ghost',
						actorId: 'actor-does-not-exist',
						label: 'ghost',
						createdBy: DM_ACTOR.id,
						createdAt: '2026-06-03T12:00:00.000Z',
						updatedAt: '2026-06-03T12:00:00.000Z',
						revision: 1,
					},
				},
			},
		};

		const resolution = resolveAgentIdentity(state.permissions, state.mcp, 'agent-ghost');
		expect(resolution.ok).toBe(false);
		if (!resolution.ok) expect(resolution.reason).toBe('unknown-actor');

		const output = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-ghost',
			toolId: 'note.list',
			input: {},
		});
		expect(denied(output).reason).toBe('unknown-actor');
	});

	it('resolution maps a connection to actor + role + policy together (never widened)', () => {
		const state = seedAgents();

		const dm = resolveAgentIdentity(state.permissions, state.mcp, 'agent-dm');
		expect(dm.ok).toBe(true);
		if (dm.ok) {
			expect(dm.identity.actorId).toBe(DM_ACTOR.id);
			expect(dm.identity.role).toBe('dm');
			expect(dm.identity.policyMode).toBe('strict_review');
		}

		// NO ESCALATION: the player-bound agent resolves to the PLAYER role, never the DM.
		const player = resolveAgentIdentity(state.permissions, state.mcp, 'agent-player');
		expect(player.ok).toBe(true);
		if (player.ok) {
			expect(player.identity.actorId).toBe(PLAYER_ACTOR.id);
			expect(player.identity.role).toBe('player');
		}
	});
});

describe('MCP-011 AC2 — a DM-scoped agent that stages a write records full audit identity', () => {
	it('a staged write records agent id, actor id, policy mode, tool id, and staged mode', () => {
		const state = seedAgents();
		const registry = createBaselineMcpToolRegistry();

		const output = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.create',
			input: { title: 'Staged Lore', body: 'a draft', kind: 'note' },
		});
		expect(output.result.status).toBe('staged');
		if (output.result.status !== 'staged') throw new Error('expected staged');

		const audit = output.nextState.mcp.auditEntries;
		expect(audit).toHaveLength(1);
		const entry = audit[0]!;
		expect(entry.agentId).toBe('agent-dm');
		expect(entry.actorId).toBe(DM_ACTOR.id);
		expect(entry.policyMode).toBe('strict_review');
		expect(entry.toolId).toBe('note.create');
		expect(entry.mode).toBe('staged');
		expect(entry.proposalId).toBe(output.result.proposalId);
	});

	it('the proposal binds the SCOPED actor, never a widened one', () => {
		const state = seedAgents();
		const registry = createBaselineMcpToolRegistry();

		// The player-bound agent uses note.list only; bind note.create for this assertion by re-policying.
		const repolicied = accepted(
			dispatchCommand(state, env, {
				type: 'mcp.set-agent-policy',
				actorId: DM_ACTOR.id,
				payload: { agentId: 'agent-player', mode: 'strict_review', allowedToolIds: ['note.create'] },
			}),
		).nextState;

		const output = invokeMcpToolAsAgent(repolicied, env, registry, {
			agentId: 'agent-player',
			toolId: 'note.create',
			input: { title: 'Player draft', body: 'x', kind: 'note' },
		});
		expect(output.result.status).toBe('staged');
		if (output.result.status !== 'staged') throw new Error('expected staged');
		const proposal = output.nextState.mcp.proposals[output.result.proposalId]!;
		// The proposal will commit as the PLAYER — never escalated to the DM.
		expect(proposal.actorId).toBe(PLAYER_ACTOR.id);
	});
});
