import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
	withMcpEnabled,
} from '../src/testing/fixtures';
import {
	EMPTY_MCP_POLICY_STATE,
	createBaselineMcpToolRegistry,
	dispatchCommand,
	ensureMcpPolicyState,
	getContentItemsForActor,
	invokeMcpToolAsAgent,
	isMcpEnabled,
	listCharactersForActor,
	type CommandResult,
	type CoreStateSlice,
	type McpAgentInvokeOutput,
} from '../src';

/**
 * MCP-001 — THE DM CAN DISABLE MCP COMPLETELY WITHOUT LOSING CORE APP FUNCTIONALITY. This file proves the
 * OPTIONALITY contract: MCP is OFF BY DEFAULT and fully optional. With MCP disabled (the default) NO agent
 * tool resolves, no agent identity grants access, and there is no side-channel; enabling is an EXPLICIT DM
 * action; disabling cleanly removes agent capability (fail-closed, default-off). Both acceptance criteria
 * plus the adversarial cases the epic demands are asserted with hard assertions:
 *
 *   - AC1: with MCP disabled, the DM edits notes / runs a session — core workflows continue, unaffected.
 *   - AC2: an MCP-only call while disabled returns disabled status WITHOUT affecting core state.
 *
 *   - DEFAULT-OFF: a brand-new vault has MCP disabled; no tool resolves until the DM enables it.
 *   - NO SIDE-CHANNEL: every call (read, write, unknown tool, even a fully-bound + allowlisted agent) is
 *     denied at the master gate BEFORE identity/policy/queries run while MCP is off.
 *   - ENABLE/DISABLE ROUND-TRIP: enabling grants access; disabling removes it again, with bindings/policies
 *     left intact (re-enabling restores them).
 *   - DM-ONLY: a player/observer cannot flip the master switch.
 *   - HYDRATION: an older/corrupt vault restores with MCP OFF.
 */

const env = makeEnvironment();
const registry = createBaselineMcpToolRegistry();

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

function agentDenied(
	output: McpAgentInvokeOutput,
): Extract<McpAgentInvokeOutput['result'], { status: 'agent-denied' }> {
	expect(output.result.status).toBe('agent-denied');
	if (output.result.status !== 'agent-denied') throw new Error('expected agent-denied');
	return output.result;
}

function setEnabled(state: CoreStateSlice, enabled: boolean): CoreStateSlice {
	return accepted(
		dispatchCommand(state, env, {
			type: 'mcp.set-enabled',
			actorId: DM_ACTOR.id,
			payload: { enabled },
		}),
	).nextState;
}

/** Fully wire a DM-bound, allowlisted agent — the MOST permissive an agent can ever be — to prove the */
/** master gate denies even THIS agent while MCP is off (no policy/allowlist can re-open the side-channel). */
function bindAllowlistedDmAgent(state: CoreStateSlice): CoreStateSlice {
	let next = accepted(
		dispatchCommand(state, env, {
			type: 'mcp.set-agent-binding',
			actorId: DM_ACTOR.id,
			payload: { agentId: 'agent-dm', actorId: DM_ACTOR.id, label: 'prep bot' },
		}),
	).nextState;
	next = accepted(
		dispatchCommand(next, env, {
			type: 'mcp.set-agent-policy',
			actorId: DM_ACTOR.id,
			payload: {
				agentId: 'agent-dm',
				mode: 'trusted_direct',
				allowedToolIds: ['note.list', 'note.create'],
			},
		}),
	).nextState;
	return next;
}

describe('MCP-001 — MCP is OFF by default (default-off optionality)', () => {
	it('a brand-new vault has the MCP master switch disabled', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		expect(state.mcp.enabled).toBe(false);
		expect(isMcpEnabled(state.mcp)).toBe(false);
		expect(EMPTY_MCP_POLICY_STATE.enabled).toBe(false);
	});

	it('no agent tool resolves while MCP is disabled, even a fully-bound + allowlisted DM agent', () => {
		// The agent is bound to the DM actor AND its tool is allowlisted under trusted_direct — the most
		// access an agent can be granted. With MCP off, the master gate still denies it before anything runs.
		const state = bindAllowlistedDmAgent(buildInitialState(DM_ACTOR, PLAYER_ACTOR));
		expect(state.mcp.enabled).toBe(false);

		const read = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.list',
			input: {},
		});
		expect(agentDenied(read).reason).toBe('mcp-disabled');
		// No side-channel: state is returned UNCHANGED (no audit entry, no proposal, no op).
		expect(read.nextState).toBe(state);

		const write = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.create',
			input: { title: 'x', body: 'y', kind: 'note' },
		});
		expect(agentDenied(write).reason).toBe('mcp-disabled');
		expect(write.nextState).toBe(state);
		expect(Object.keys(write.nextState.content.items).length).toBe(0);
		expect(write.nextState.mcp.proposals).toEqual({});
		expect(write.nextState.mcp.auditEntries).toEqual([]);
	});
});

describe('MCP-001 AC2 — an MCP-only call while disabled returns disabled status without affecting core state', () => {
	it('the master gate fires BEFORE identity, even for an UNKNOWN tool / UNMAPPED agent (no leak)', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);

		// An unknown tool while disabled — denied `mcp-disabled` (the master gate beats unknown-tool, so the
		// disabled status never reveals whether a tool exists or whether the agent is mapped).
		const unknownTool = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-never-bound',
			toolId: 'totally.unknown.tool',
			input: {},
		});
		expect(agentDenied(unknownTool).reason).toBe('mcp-disabled');

		// A known tool with an UNMAPPED agent — also `mcp-disabled` (not `no-binding`): the master gate
		// short-circuits before identity resolution, so a disabled vault leaks nothing about bindings.
		const unmapped = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-never-bound',
			toolId: 'note.list',
			input: {},
		});
		expect(agentDenied(unmapped).reason).toBe('mcp-disabled');
		expect(unmapped.nextState).toBe(state);
	});

	it('core state is byte-identical before and after a disabled agent call', () => {
		const state = bindAllowlistedDmAgent(buildInitialState(DM_ACTOR, PLAYER_ACTOR));
		const snapshot = JSON.stringify(state);
		const output = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.create',
			input: { title: 'should-never-exist', body: 'x', kind: 'note' },
		});
		expect(output.result.status).toBe('agent-denied');
		// The returned next state is the SAME object and the original is unmutated.
		expect(output.nextState).toBe(state);
		expect(JSON.stringify(state)).toBe(snapshot);
	});
});

describe('MCP-001 AC1 — core app functionality continues with MCP disabled (no MCP processes)', () => {
	it('the DM edits notes and the content surface stays fully usable while MCP is off', () => {
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		expect(state.mcp.enabled).toBe(false);

		// Notes: the core content command works with MCP disabled.
		state = accepted(
			dispatchCommand(state, env, {
				type: 'content.create-item',
				actorId: DM_ACTOR.id,
				payload: { kind: 'note', title: 'Session Notes', body: 'no MCP needed', visibility: 'dm-only' },
			}),
		).nextState;
		expect(Object.values(state.content.items).some((i) => i.title === 'Session Notes')).toBe(true);

		// The non-MCP read surface returns the note for the DM — no MCP layer involved.
		const items = getContentItemsForActor(state.content, state.permissions, DM_ACTOR.id);
		expect(items.some((i) => i.title === 'Session Notes')).toBe(true);
		// MCP is still off — disabling did not impair the core read/write path.
		expect(state.mcp.enabled).toBe(false);
	});

	it('the DM runs a session (workflow transition) with MCP disabled', () => {
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const result = dispatchCommand(state, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'prep' },
		});
		state = accepted(result).nextState;
		expect(state.session.workflow).toBe('prep');
		expect(state.mcp.enabled).toBe(false);
	});
});

describe('MCP-001 — enable / disable round-trip (explicit DM action)', () => {
	it('enabling grants agent access; disabling removes it again with bindings/policies intact', () => {
		// Bind + allowlist, then ENABLE — the agent can now read.
		let state = bindAllowlistedDmAgent(buildInitialState(DM_ACTOR, PLAYER_ACTOR));
		state = setEnabled(state, true);
		expect(isMcpEnabled(state.mcp)).toBe(true);

		let read = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.list',
			input: {},
		});
		expect(read.result.status).toBe('read-ok');

		// DISABLE again — the SAME agent is now denied at the master gate, but its binding + policy survive.
		state = setEnabled(state, false);
		expect(isMcpEnabled(state.mcp)).toBe(false);
		expect(state.mcp.bindings['agent-dm']).toBeDefined();
		expect(state.mcp.policies['agent-dm']).toBeDefined();

		read = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.list',
			input: {},
		});
		expect(agentDenied(read).reason).toBe('mcp-disabled');

		// RE-ENABLE — access is restored from the still-present binding/policy (no re-configuration needed).
		state = setEnabled(state, true);
		read = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.list',
			input: {},
		});
		expect(read.result.status).toBe('read-ok');
	});

	it('the set-enabled command appends a durable op and emits the audit event', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const result = accepted(
			dispatchCommand(state, env, {
				type: 'mcp.set-enabled',
				actorId: DM_ACTOR.id,
				payload: { enabled: true },
			}),
		);
		expect(result.nextState.mcp.enabled).toBe(true);
		expect(result.operationIds.length).toBe(1);
		expect(result.events).toContainEqual({ kind: 'mcp.enabled-changed', enabled: true, actorId: DM_ACTOR.id });
	});
});

describe('MCP-001 — flipping the master switch is DM-only (fail closed)', () => {
	it('a player cannot enable MCP', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'mcp.set-enabled',
				actorId: PLAYER_ACTOR.id,
				payload: { enabled: true },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
		expect(result.nextState.mcp.enabled).toBe(false);
	});

	it('an observer cannot enable MCP', () => {
		const state = buildInitialState(DM_ACTOR, OBSERVER_ACTOR);
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'mcp.set-enabled',
				actorId: OBSERVER_ACTOR.id,
				payload: { enabled: true },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('a non-boolean enabled payload is rejected by the schema (fail closed)', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'mcp.set-enabled',
				actorId: DM_ACTOR.id,
				payload: { enabled: 'yes' },
			}),
		);
		expect(result.rejection.code).toBe('invalid-payload');
	});
});

describe('MCP-001 — hydration fails closed to OFF', () => {
	it('an older vault with NO enabled flag restores with MCP disabled', () => {
		const hydrated = ensureMcpPolicyState({ bindings: {}, policies: {} });
		expect(hydrated.enabled).toBe(false);
	});

	it('a corrupt non-boolean enabled flag restores with MCP disabled (only literal true enables)', () => {
		const hydrated = ensureMcpPolicyState({ enabled: 'true' as unknown as boolean });
		expect(hydrated.enabled).toBe(false);
	});

	it('a persisted enabled:true round-trips as enabled (an explicitly-enabled vault stays enabled)', () => {
		const hydrated = ensureMcpPolicyState({ enabled: true });
		expect(hydrated.enabled).toBe(true);
	});
});

describe('MCP-001 — withMcpEnabled test helper turns the switch on (parity with the command)', () => {
	it('a state enabled via the helper behaves identically to one enabled via the command for tool access', () => {
		const helper = bindAllowlistedDmAgent(withMcpEnabled(buildInitialState(DM_ACTOR, PLAYER_ACTOR)));
		const read = invokeMcpToolAsAgent(helper, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.list',
			input: {},
		});
		expect(read.result.status).toBe('read-ok');
		// And listing characters through the same actor-filtered query the tool composes still works.
		expect(listCharactersForActor(helper.characters, helper.permissions, DM_ACTOR.id)).toBeDefined();
	});
});
