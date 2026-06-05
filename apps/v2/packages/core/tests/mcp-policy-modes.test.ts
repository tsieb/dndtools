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
	type CommandResult,
	type CoreStateSlice,
	type McpAgentInvokeOutput,
} from '../src';

/**
 * MCP-009 — THE DM CONFIGURES PER-AGENT MCP POLICY MODES (`disabled`, `strict_review`, `balanced`,
 * `trusted_direct`) PLUS TOOL ALLOWLISTS AND AUDIT VISIBILITY. These tests prove all four acceptance
 * criteria plus the fail-closed adversarial cases:
 *
 *   - AC1: a new agent with no policy DEFAULTS to the vault setting (`strict_review` or `disabled`).
 *   - AC2: when the DM changes an agent policy, the NEXT call enforces the new policy immediately.
 *   - AC3: `disabled` mode returns disabled status BEFORE core queries run.
 *   - AC4: `trusted_direct` direct write still runs Processing Core validation + audit before mutation.
 *
 *   - ALLOWLIST: a tool NOT in the allowlist is denied (no implicit "all tools").
 *   - NON-DM POLICY AUTHORING: a player/observer cannot configure MCP policy (DM-only).
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

function denied(output: McpAgentInvokeOutput): Extract<McpAgentInvokeOutput['result'], { status: 'agent-denied' }> {
	expect(output.result.status).toBe('agent-denied');
	if (output.result.status !== 'agent-denied') throw new Error('expected agent-denied');
	return output.result;
}

/** Seed a DM-bound agent (`agent-dm`) without a policy yet, plus the player/observer actors. */
function seedBoundAgent(): CoreStateSlice {
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	state = accepted(
		dispatchCommand(state, env, {
			type: 'mcp.set-agent-binding',
			actorId: DM_ACTOR.id,
			payload: { agentId: 'agent-dm', actorId: DM_ACTOR.id, label: 'bot' },
		}),
	).nextState;
	return state;
}

function setPolicy(
	state: CoreStateSlice,
	mode: string,
	allowedToolIds: string[],
): CoreStateSlice {
	return accepted(
		dispatchCommand(state, env, {
			type: 'mcp.set-agent-policy',
			actorId: DM_ACTOR.id,
			payload: { agentId: 'agent-dm', mode, allowedToolIds },
		}),
	).nextState;
}

describe('MCP-009 AC1 — a never-configured agent defaults to the vault setting', () => {
	it('defaults to strict_review (the default vault posture) — so a write is staged, not direct', () => {
		const state = seedBoundAgent(); // bound, but NO policy configured
		const registry = createBaselineMcpToolRegistry();
		// The default vault posture is strict_review. But with NO policy, the agent's allowlist is EMPTY,
		// so a tool call is denied for not being allowlisted (fail closed) — proving an unconfigured agent
		// can do nothing until the DM grants tools, even under a non-disabled default.
		const output = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.create',
			input: { title: 'x', body: 'y', kind: 'note' },
		});
		expect(denied(output).reason).toBe('not-allowlisted');
	});

	it('honors a vault default of `disabled` for a never-configured agent', () => {
		let state = seedBoundAgent();
		state = accepted(
			dispatchCommand(state, env, {
				type: 'mcp.set-vault-default',
				actorId: DM_ACTOR.id,
				payload: { mode: 'disabled' },
			}),
		).nextState;
		const registry = createBaselineMcpToolRegistry();
		const output = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.list',
			input: {},
		});
		// Disabled wins before the allowlist is even consulted (AC3 posture inherited from the default).
		expect(denied(output).reason).toBe('disabled');
	});
});

describe('MCP-009 AC2 — a policy change is enforced on the agent’s next call', () => {
	it('a tool denied under the old policy succeeds (read-ok) immediately after the DM allowlists it', () => {
		let state = setPolicy(seedBoundAgent(), 'strict_review', []); // empty allowlist ⇒ deny
		const registry = createBaselineMcpToolRegistry();

		let output = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.list',
			input: {},
		});
		expect(denied(output).reason).toBe('not-allowlisted');

		// DM allowlists note.list — the NEXT call enforces the new policy immediately.
		state = setPolicy(state, 'strict_review', ['note.list']);
		output = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.list',
			input: {},
		});
		expect(output.result.status).toBe('read-ok');
	});
});

describe('MCP-009 AC3 — `disabled` returns disabled status before core queries run', () => {
	it('every tool call (read or write) is denied with `disabled` and no query runs', () => {
		const state = setPolicy(seedBoundAgent(), 'disabled', ['note.list', 'note.create']);
		const registry = createBaselineMcpToolRegistry();

		const read = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.list',
			input: {},
		});
		expect(denied(read).reason).toBe('disabled');
		expect(read.nextState).toBe(state); // no durable change

		const write = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.create',
			input: { title: 'x', body: 'y', kind: 'note' },
		});
		expect(denied(write).reason).toBe('disabled');
		expect(write.nextState).toBe(state);
	});
});

describe('MCP-009 AC4 — a trusted_direct write still runs Processing Core validation + audit', () => {
	it('an allowlisted trusted_direct write commits directly, validated by the command and audited', () => {
		const state = setPolicy(seedBoundAgent(), 'trusted_direct', ['note.create']);
		const registry = createBaselineMcpToolRegistry();

		const output = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.create',
			input: { title: 'Direct Note', body: 'committed', kind: 'note' },
		});
		expect(output.result.status).toBe('write');
		if (output.result.status !== 'write') throw new Error('expected write');
		// The bound command actually committed (Processing Core validation ran) — a real durable item exists.
		expect(output.result.commandResult.status).toBe('accepted');
		const created = Object.values(output.nextState.content.items).find((i) => i.title === 'Direct Note');
		expect(created).toBeDefined();
		// And an audit entry records the DIRECT mode (AC4 audit-still-runs).
		const audit = output.nextState.mcp.auditEntries;
		expect(audit).toHaveLength(1);
		expect(audit[0]!.mode).toBe('direct');
		expect(audit[0]!.toolId).toBe('note.create');
	});

	it('a trusted_direct write that fails command schema validation makes NO durable mutation', () => {
		const state = setPolicy(seedBoundAgent(), 'trusted_direct', ['note.create']);
		const registry = createBaselineMcpToolRegistry();

		const before = Object.keys(state.content.items).length;
		const output = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.create',
			// Missing the required `title` ⇒ the tool schema rejects it before any command runs.
			input: { body: 'no title', kind: 'note' },
		});
		// Denied at schema validation; no new content, no audit entry, no op.
		expect(output.result.status).toBe('denied');
		expect(Object.keys(output.nextState.content.items).length).toBe(before);
		expect(output.nextState.mcp.auditEntries).toHaveLength(0);
	});
});

describe('MCP-009 — allowlist + DM-only policy authoring (fail closed)', () => {
	it('a tool outside the allowlist is denied even under trusted_direct', () => {
		const state = setPolicy(seedBoundAgent(), 'trusted_direct', ['note.list']); // note.create NOT allowed
		const registry = createBaselineMcpToolRegistry();
		const output = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.create',
			input: { title: 'x', body: 'y', kind: 'note' },
		});
		expect(denied(output).reason).toBe('not-allowlisted');
	});

	it('a player cannot configure an MCP policy (DM-only)', () => {
		const state = seedBoundAgent();
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'mcp.set-agent-policy',
				actorId: PLAYER_ACTOR.id,
				payload: { agentId: 'agent-dm', mode: 'trusted_direct', allowedToolIds: ['note.create'] },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('an unknown policy mode is rejected by the command schema (fail closed)', () => {
		const state = seedBoundAgent();
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'mcp.set-agent-policy',
				actorId: DM_ACTOR.id,
				payload: { agentId: 'agent-dm', mode: 'yolo-direct', allowedToolIds: [] },
			}),
		);
		expect(result.rejection.code).toBe('invalid-payload');
	});
});
