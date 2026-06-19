import { describe, expect, it } from 'vitest';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '../src/testing/fixtures';
import {
	createBaselineMcpToolRegistry,
	dispatchCommand,
	invokeMcpToolAsAgent,
	type CommandResult,
	type CoreStateSlice,
} from '../src';

/**
 * MCP-011 AC2 — when audit history is inspected, agent id, actor id, policy mode, tool id, and the
 * staged/direct mode MUST be recorded for a DM-scoped agent write. Previously a policy with
 * `auditVisible: false` SKIPPED recording the entry entirely, so a direct/staged write produced NO
 * durable attribution — a gap in the audit trail. The attribution is now ALWAYS recorded; the
 * `auditVisible` flag only governs the entry's `visible` (surfacing) flag, never its existence.
 */

const env = makeEnvironment();

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') throw new Error(`expected accepted: ${result.rejection.message}`);
	return result;
}

/** Bind an agent to the DM and set a trusted_direct policy with the given audit visibility. */
function agentWithPolicy(auditVisible: boolean): CoreStateSlice {
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	state = accepted(dispatchCommand(state, env, { type: 'mcp.set-enabled', actorId: DM_ACTOR.id, payload: { enabled: true } })).nextState;
	state = accepted(
		dispatchCommand(state, env, {
			type: 'mcp.set-agent-binding',
			actorId: DM_ACTOR.id,
			payload: { agentId: 'agent-dm', actorId: DM_ACTOR.id, label: 'bot' },
		}),
	).nextState;
	return accepted(
		dispatchCommand(state, env, {
			type: 'mcp.set-agent-policy',
			actorId: DM_ACTOR.id,
			payload: { agentId: 'agent-dm', mode: 'trusted_direct', allowedToolIds: ['note.create'], auditVisible },
		}),
	).nextState;
}

describe('MCP-011 AC2 — a DM-scoped agent write is ALWAYS attributed in audit history', () => {
	it('records a direct-write entry even when auditVisible is false (marked not visible)', () => {
		const output = invokeMcpToolAsAgent(agentWithPolicy(false), env, createBaselineMcpToolRegistry(), {
			agentId: 'agent-dm',
			toolId: 'note.create',
			input: { title: 'Quiet Note', body: 'committed', kind: 'note' },
		});
		expect(output.result.status).toBe('write');
		const audit = output.nextState.mcp.auditEntries;
		// The attribution exists despite auditVisible:false (MCP-011 AC2) — and carries all required fields.
		expect(audit).toHaveLength(1);
		expect(audit[0]).toMatchObject({
			agentId: 'agent-dm',
			actorId: DM_ACTOR.id,
			toolId: 'note.create',
			mode: 'direct',
			visible: false,
		});
	});

	it('records a visible direct-write entry when auditVisible is true', () => {
		const output = invokeMcpToolAsAgent(agentWithPolicy(true), env, createBaselineMcpToolRegistry(), {
			agentId: 'agent-dm',
			toolId: 'note.create',
			input: { title: 'Loud Note', body: 'committed', kind: 'note' },
		});
		expect(output.result.status).toBe('write');
		const audit = output.nextState.mcp.auditEntries;
		expect(audit).toHaveLength(1);
		expect(audit[0]).toMatchObject({ mode: 'direct', visible: true });
	});
});
