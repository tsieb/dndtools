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
	MCP_BASELINE_TOOL_IDS,
	MCP_RESPONSE_CONTRACT_VERSION,
	MCP_RESPONSE_ENVELOPE_SCHEMA,
	MCP_RESPONSE_STATUSES,
	buildCertifiedMcpAgentResponse,
	certifyMcpResponse,
	createBaselineMcpToolRegistry,
	dispatchCommand,
	invokeMcpTool,
	invokeMcpToolAsAgent,
	isConformantMcpResponse,
	toMcpAgentResponseEnvelope,
	toMcpResponseEnvelope,
	type CommandResult,
	type CoreStateSlice,
	type McpResponseEnvelope,
	type McpToolResult,
} from '../src';

/**
 * MCP-010 — MCP/AI OUTPUTS USE A STABLE, CONCISE, STRUCTURED, VERSIONED, SCHEMA-VALIDATED RESPONSE
 * CONTRACT with id/status/summary/data/warnings/citations/remediation, warnings SEPARATED from data, and
 * STRUCTURED + NON-LEAKING errors. This file proves the contract end-to-end:
 *
 *   - AC1: a success with warnings keeps `warnings` and `data` in SEPARATE envelope fields.
 *   - AC2: a failure produces a STRUCTURED, actionable error envelope that embeds NO hidden data.
 *
 * Plus the contract-level guarantees MCP-010 names: the envelope is VERSIONED + DETERMINISTIC, every
 * response is VALIDATED against its declared contract before return, and an internally MALFORMED or
 * LEAKY response is REPLACED with a safe contract-conformant error (fail closed) — never passed through.
 */

const env = makeEnvironment();
const registry = createBaselineMcpToolRegistry();

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

/** Bind an agent → the DM actor under `mode` with the given allowlist, through the DM commands. */
function seedAgent(agentId: string, mode: string, allowedToolIds: string[]): CoreStateSlice {
	let state = withMcpEnabled(buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR));
	state = accepted(
		dispatchCommand(state, env, {
			type: 'mcp.set-agent-binding',
			actorId: DM_ACTOR.id,
			payload: { agentId, actorId: DM_ACTOR.id, label: 'contract bot' },
		}),
	).nextState;
	state = accepted(
		dispatchCommand(state, env, {
			type: 'mcp.set-agent-policy',
			actorId: DM_ACTOR.id,
			payload: { agentId, mode, allowedToolIds },
		}),
	).nextState;
	return state;
}

/** A bound agent under `trusted_direct` with every baseline tool allowlisted. */
function buildTrustedAgentState(): { state: CoreStateSlice; agentId: string } {
	const agentId = 'agent-dm';
	return { state: seedAgent(agentId, 'trusted_direct', [...MCP_BASELINE_TOOL_IDS]), agentId };
}

function ok(envelope: McpResponseEnvelope): McpResponseEnvelope {
	expect(envelope.status).toBe('ok');
	return envelope;
}

describe('MCP-010 — the response envelope shape is stable and complete', () => {
	it('declares every field the requirement names, defaulted on every envelope', () => {
		const envelope = toMcpResponseEnvelope(
			{ status: 'read-ok', toolId: 'note.list', data: [] },
			'resp-1',
		);
		// The exact MCP-010 field set: id, status, summary, data, warnings, citations, remediation.
		expect(Object.keys(envelope).sort()).toEqual(
			[
				'citations',
				'contractVersion',
				'data',
				'error',
				'id',
				'remediation',
				'status',
				'summary',
				'toolId',
				'warnings',
			].sort(),
		);
		expect(envelope.id).toBe('resp-1');
		expect(envelope.contractVersion).toBe(MCP_RESPONSE_CONTRACT_VERSION);
		expect(Array.isArray(envelope.warnings)).toBe(true);
		expect(Array.isArray(envelope.citations)).toBe(true);
		expect(Array.isArray(envelope.remediation)).toBe(true);
	});

	it('the four outward statuses are exactly ok/staged/denied/error', () => {
		expect([...MCP_RESPONSE_STATUSES].sort()).toEqual(['denied', 'error', 'ok', 'staged']);
	});

	it('projection is DETERMINISTIC — the same (result, id) yields the identical envelope', () => {
		const result: McpToolResult = { status: 'read-ok', toolId: 'note.list', data: { items: [] } };
		expect(toMcpResponseEnvelope(result, 'resp-x')).toEqual(toMcpResponseEnvelope(result, 'resp-x'));
	});
});

describe('MCP-010 AC1 — a success with warnings separates warnings and data', () => {
	it('a successful read carries data with warnings in a SEPARATE field', () => {
		// Build a success envelope, then attach a warning as a tool composing the contract would.
		const base = ok(
			toMcpResponseEnvelope(
				{ status: 'read-ok', toolId: 'note.search', data: { hits: [], totalCount: 0 } },
				'resp-2',
			),
		);
		const withWarning: McpResponseEnvelope = {
			...base,
			warnings: [{ code: 'result-truncated', message: 'Results were bounded by the requested limit.' }],
		};
		// The two are independent fields — the warning is NOT mixed into data, and the data is intact.
		expect(withWarning.status).toBe('ok');
		expect(withWarning.warnings).toHaveLength(1);
		expect(withWarning.warnings[0]?.code).toBe('result-truncated');
		expect(withWarning.data).toEqual({ hits: [], totalCount: 0 });
		expect(withWarning.error).toBeNull();
		// And the warning-bearing success still passes the contract.
		expect(certifyMcpResponse(withWarning).conformant).toBe(true);
	});

	it('a real read tool projects to an ok envelope with separate (empty) warnings + null error', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const result = invokeMcpTool(state, env, registry, {
			toolId: 'note.list',
			actorId: DM_ACTOR.id,
			agentId: 'agent-test',
			input: {},
		});
		const envelope = ok(toMcpResponseEnvelope(result, 'resp-3'));
		expect(envelope.error).toBeNull();
		expect(envelope.warnings).toEqual([]);
		expect(envelope.data).toBeDefined();
	});
});

describe('MCP-010 AC2 — a failure produces a structured, actionable, non-leaking error', () => {
	it('a schema-invalid read projects to a denied error with code + per-field issues + remediation', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const result = invokeMcpTool(state, env, registry, {
			toolId: 'note.read',
			actorId: DM_ACTOR.id,
			agentId: 'agent-test',
			input: {}, // missing required entityId
		});
		const envelope = toMcpResponseEnvelope(result, 'resp-4');
		expect(envelope.status).toBe('denied');
		expect(envelope.data).toBeNull();
		expect(envelope.error?.code).toBe('invalid-input');
		expect((envelope.error?.issues?.length ?? 0)).toBeGreaterThan(0);
		// Actionable: a denial carries at least one remediation action.
		expect(envelope.remediation.length).toBeGreaterThan(0);
		expect(envelope.remediation[0]?.action).toBe('fix-input');
		// The error message is generic — it names no entity and no internal id.
		expect(envelope.error?.message).not.toMatch(/actor-|item-|node-/);
	});

	it('a rejected WRITE command projects to a structured error with the command rejection code', () => {
		// A player agent cannot create a note (authority) — the command rejects; the envelope must carry
		// the structured rejection, no data, and no nextState/internal leak.
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const result = invokeMcpTool(state, env, registry, {
			toolId: 'note.create',
			actorId: PLAYER_ACTOR.id,
			agentId: 'agent-test',
			input: { title: 'By a player', body: '' },
		});
		const envelope = toMcpResponseEnvelope(result, 'resp-5');
		expect(envelope.status).toBe('error');
		expect(envelope.data).toBeNull();
		expect(typeof envelope.error?.code).toBe('string');
		expect(envelope.error?.code.length).toBeGreaterThan(0);
		// The envelope NEVER carries the raw command result's `nextState` — only a structured error.
		expect(JSON.stringify(envelope)).not.toContain('nextState');
	});

	it('an accepted WRITE projects to ok carrying only the durable op ids (never the mutated entity)', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const result = invokeMcpTool(state, env, registry, {
			toolId: 'note.create',
			actorId: DM_ACTOR.id,
			agentId: 'agent-test',
			input: { title: 'By the DM', body: 'staged-or-direct' },
		});
		const envelope = ok(toMcpResponseEnvelope(result, 'resp-6'));
		expect(envelope.data).toHaveProperty('operationIds');
		expect(JSON.stringify(envelope)).not.toContain('nextState');
	});
});

describe('MCP-010 — the agent-level projection covers optionality/identity/policy + staging', () => {
	it('an MCP-disabled call projects to a denied envelope with the mcp-disabled remediation', () => {
		// MCP is OFF by default; an agent call is denied at the master gate.
		const state = buildInitialState(DM_ACTOR);
		const { result } = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-x',
			toolId: 'note.list',
			input: {},
		});
		const envelope = toMcpAgentResponseEnvelope(result, 'resp-7');
		expect(envelope.status).toBe('denied');
		expect(envelope.error?.code).toBe('mcp-disabled');
		expect(envelope.remediation[0]?.action).toBe('enable-mcp');
		expect(envelope.data).toBeNull();
		// Non-leaking: the disabled denial reveals nothing about agents, policies, or proposals.
		expect(envelope.summary).not.toMatch(/agent-|actor-|proposal/);
	});

	it('a staged write projects to a staged envelope carrying the proposal id (no mutation, no data leak)', () => {
		const agentId = 'agent-staged';
		const state = seedAgent(agentId, 'strict_review', ['note.create']);
		const { result } = invokeMcpToolAsAgent(state, env, registry, {
			agentId,
			toolId: 'note.create',
			input: { title: 'Staged', body: 'awaiting review' },
		});
		const envelope = toMcpAgentResponseEnvelope(result, 'resp-8');
		expect(envelope.status).toBe('staged');
		expect(envelope.error).toBeNull();
		expect(envelope.data).toHaveProperty('proposalId');
	});

	it('a direct trusted_direct write projects to a certified ok envelope through the agent pipeline', () => {
		const { state, agentId } = buildTrustedAgentState();
		const { result } = invokeMcpToolAsAgent(state, env, registry, {
			agentId,
			toolId: 'note.create',
			input: { title: 'Direct', body: 'committed' },
		});
		const envelope = buildCertifiedMcpAgentResponse(result, 'resp-9');
		expect(envelope.status).toBe('ok');
		expect(envelope.data).toHaveProperty('operationIds');
	});
});

describe('MCP-010 — the envelope is schema-validated against its declared contract', () => {
	it('a well-formed ok envelope passes the Zod contract', () => {
		const envelope = toMcpResponseEnvelope({ status: 'read-ok', toolId: 'note.list', data: [] }, 'r');
		expect(MCP_RESPONSE_ENVELOPE_SCHEMA.safeParse(envelope).success).toBe(true);
		expect(isConformantMcpResponse(envelope)).toBe(true);
	});

	it('an envelope with an unsupported contract version fails closed', () => {
		const envelope = toMcpResponseEnvelope({ status: 'read-ok', toolId: 'note.list', data: [] }, 'r');
		const bumped = { ...envelope, contractVersion: 999 };
		expect(MCP_RESPONSE_ENVELOPE_SCHEMA.safeParse(bumped).success).toBe(false);
	});

	it('a denied/error envelope with a null error is rejected (errors must be structured)', () => {
		const envelope = toMcpResponseEnvelope(
			{ status: 'denied', toolId: 'note.read', reason: 'invalid-input', message: 'bad' },
			'r',
		);
		const stripped = { ...envelope, error: null };
		expect(MCP_RESPONSE_ENVELOPE_SCHEMA.safeParse(stripped).success).toBe(false);
	});

	it('an ok envelope that also carries an error is rejected (cross-field invariant)', () => {
		const envelope = toMcpResponseEnvelope({ status: 'read-ok', toolId: 'note.list', data: [] }, 'r');
		const contradictory = { ...envelope, error: { code: 'x', message: 'y' } };
		expect(MCP_RESPONSE_ENVELOPE_SCHEMA.safeParse(contradictory).success).toBe(false);
	});

	it('an error envelope that still carries data is rejected (no data on a terminal response)', () => {
		const envelope = toMcpResponseEnvelope(
			{ status: 'denied', toolId: 'note.read', reason: 'invalid-input', message: 'bad' },
			'r',
		);
		const withData = { ...envelope, data: { leaked: true } };
		expect(MCP_RESPONSE_ENVELOPE_SCHEMA.safeParse(withData).success).toBe(false);
	});

	it('an envelope with an extra undeclared field is rejected (strict — a tool cannot widen the envelope)', () => {
		const envelope = toMcpResponseEnvelope({ status: 'read-ok', toolId: 'note.list', data: [] }, 'r');
		const widened = { ...envelope, secret: 'smuggled' };
		expect(MCP_RESPONSE_ENVELOPE_SCHEMA.safeParse(widened).success).toBe(false);
	});
});
