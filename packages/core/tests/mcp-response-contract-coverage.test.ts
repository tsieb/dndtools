import { describe, expect, it } from 'vitest';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '../src/testing/fixtures';
import {
	MCP_RESPONSE_ENVELOPE_SCHEMA,
	buildCertifiedMcpResponse,
	certifyMcpResponse,
	createBaselineMcpToolRegistry,
	invokeMcpTool,
	toMcpResponseEnvelope,
	type McpToolResult,
} from '../src';

/**
 * MCP-010 + MCP-005 — THE PER-TOOL RESPONSE-CONTRACT COVERAGE GATE. MCP-005 already requires every
 * registered tool to have dedicated behavior tests; MCP-010 requires every tool's RESPONSE to conform to
 * the declared contract. This file is the mechanical gate that ties the two together: it drives EVERY
 * tool in the live registry (the single source of truth) and asserts that the response it produces —
 * for both VALID and INVALID input — projects to a contract-conformant, certified envelope.
 *
 * Because it iterates the registry rather than a hand-maintained list, a NEW tool added without a
 * conforming response turns this gate red (a tool can never ship returning an out-of-contract response).
 */

const env = makeEnvironment();
const registry = createBaselineMcpToolRegistry();

/** A valid input per tool (mirrors the MCP-005 coverage manifest's accepted inputs). */
const VALID_INPUT: Record<string, unknown> = {
	'vault.summary': {},
	'note.read': { entityId: 'item-anything' },
	'note.list': {},
	'note.search': { query: 'orc' },
	'graph.context': { nodeId: 'node-1' },
	'character.query': {},
	'dice.roll': { expression: '2d20kh1+5', seed: 7 },
	'session.prep': { mode: 'prep' },
	// MCP-006 / MCP-013 — the semantic bundle read tools (the bundle kind is fixed by the tool id).
	'bundle.session-prep': { referenceInstant: '2026-06-05T00:00:00.000Z' },
	'bundle.session-recap': { referenceInstant: '2026-06-05T00:00:00.000Z' },
	'bundle.continuity': { referenceInstant: '2026-06-05T00:00:00.000Z' },
	'bundle.open-threads': { referenceInstant: '2026-06-05T00:00:00.000Z' },
	'bundle.coverage-gaps': { referenceInstant: '2026-06-05T00:00:00.000Z' },
	'bundle.campaign-health': { referenceInstant: '2026-06-05T00:00:00.000Z' },
	'note.create': { title: 'Drafted', body: 'by the agent' },
	'create_scene_card': { title: 'Ambush at the Bridge', mood: 'combat', flavorText: 'Steel rings.' },
};

/** An invalid input per tool (mirrors the MCP-005 coverage manifest's rejected inputs). */
const INVALID_INPUT: Record<string, unknown> = {
	'vault.summary': { unexpected: true },
	'note.read': {},
	'note.list': { entityId: 'x' },
	'note.search': { query: 'orc', limit: -3 },
	'graph.context': { nodeId: '' },
	'character.query': { roster: 'all' },
	'dice.roll': { expression: '2d20' },
	'session.prep': { mode: 'forecast' },
	'bundle.session-prep': {}, // missing required referenceInstant
	'bundle.session-recap': { referenceInstant: '2026-06-05T00:00:00.000Z', itemBudget: -1 },
	'bundle.continuity': { referenceInstant: '' },
	'bundle.open-threads': { referenceInstant: '2026-06-05T00:00:00.000Z', extra: true },
	'bundle.coverage-gaps': {}, // missing required referenceInstant
	'bundle.campaign-health': { referenceInstant: 123 },
	'note.create': { title: '' },
	'create_scene_card': { title: '' },
};

function run(toolId: string, input: unknown, actorId: string): McpToolResult {
	return invokeMcpTool(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env, registry, {
		toolId,
		actorId,
		agentId: 'agent-test',
		input,
	});
}

describe('MCP-010 — the valid-input list covers every registered tool (no tool is unmapped)', () => {
	it('every registered tool has a valid + invalid input entry (the list cannot drift from the registry)', () => {
		for (const toolId of registry.ids()) {
			expect(VALID_INPUT, `valid input missing for ${toolId}`).toHaveProperty(toolId);
			expect(INVALID_INPUT, `invalid input missing for ${toolId}`).toHaveProperty(toolId);
		}
	});
});

describe('MCP-010 — every tool projects a contract-conformant response for VALID input', () => {
	for (const toolId of registry.ids()) {
		it(`${toolId} returns a certified, contract-conformant envelope on valid input`, () => {
			const result = run(toolId, VALID_INPUT[toolId], DM_ACTOR.id);
			const envelope = toMcpResponseEnvelope(result, `resp-${toolId}-ok`);
			// The raw projection conforms...
			expect(MCP_RESPONSE_ENVELOPE_SCHEMA.safeParse(envelope).success).toBe(true);
			// ...and the certification gate passes it through unchanged (no replacement).
			const certified = certifyMcpResponse(envelope);
			expect(certified.conformant, `${toolId} produced a non-conforming response`).toBe(true);
			// A read/accepted-write is `ok`; the staged note.create write is also `ok` (DM direct-style
			// invokeMcpTool dispatches the command). Either way it is a non-terminal success here.
			expect(['ok'], `${toolId} valid input should succeed`).toContain(certified.envelope.status);
		});
	}
});

describe('MCP-010 — every tool projects a structured error response for INVALID input', () => {
	for (const toolId of registry.ids()) {
		it(`${toolId} returns a certified denied envelope with a structured error on invalid input`, () => {
			const envelope = buildCertifiedMcpResponse(
				run(toolId, INVALID_INPUT[toolId], DM_ACTOR.id),
				`resp-${toolId}-bad`,
			);
			expect(envelope.status).toBe('denied');
			expect(envelope.error?.code).toBe('invalid-input');
			expect(envelope.data).toBeNull();
			// Structured + actionable: per-field issues + a remediation action.
			expect((envelope.error?.issues?.length ?? 0)).toBeGreaterThan(0);
			expect(envelope.remediation.length).toBeGreaterThan(0);
		});
	}
});
