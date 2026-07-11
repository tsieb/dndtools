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
	createBaselineMcpToolRegistry,
	dispatchCommand,
	invokeMcpTool,
	invokeMcpToolAsAgent,
	rollExpression,
	type CommandResult,
	type CoreStateSlice,
	type McpToolResult,
} from '../src';

/**
 * MCP-002 — THE MCP LAYER SHIPS THE BASELINE READ TOOLS the requirement names: vault summary, note
 * read/list/search, graph context, character query, DICE ROLL, and SESSION PREP bundles. The vault
 * summary / note / graph / character read tools are proven by `mcp-core-enforcement.test.ts` (the
 * actor-filtered visibility keystone) and `mcp-tool-coverage.test.ts` (the MCP-005 gate). This file
 * proves the two tools THIS branch ADDS to complete the baseline set — `dice.roll` and `session.prep` —
 * with hard assertions across the MCP-002 acceptance criteria:
 *
 *   - AC1: an enabled DM agent requesting a (vault summary / prep) bundle gets STRUCTURED context from core.
 *   - AC2: a player-scoped context is VISIBILITY-FILTERED before output (the DM-only prep bundle is empty
 *     for a player; no hidden source content leaks).
 *
 * Each tool is permission-gated (it reuses an existing actor-filtered read) and tested for determinism /
 * failure handling. Reads never mutate durable state.
 */

const env = makeEnvironment();
const registry = createBaselineMcpToolRegistry();

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

function readOk(result: McpToolResult): Extract<McpToolResult, { status: 'read-ok' }> {
	expect(result.status).toBe('read-ok');
	if (result.status !== 'read-ok') throw new Error('expected read-ok');
	return result;
}

describe('MCP-002 — the baseline tool set includes dice.roll and session.prep', () => {
	it('the canonical baseline tool ids enumerate every read tool the requirement names + the staged write', () => {
		expect([...MCP_BASELINE_TOOL_IDS].sort()).toEqual(
			[
				'vault.summary',
				'note.read',
				'note.list',
				'note.search',
				'graph.context',
				'character.query',
				'dice.roll',
				'session.prep',
				// MCP-006 / MCP-013 — the semantic bundle read tools added by this branch.
				'bundle.session-prep',
				'bundle.session-recap',
				'bundle.continuity',
				'bundle.open-threads',
				'bundle.coverage-gaps',
				'bundle.campaign-health',
				'note.create',
				// I11 S11.2.1 — the staged scene-card create write tool.
				'create_scene_card',
			].sort(),
		);
	});

	it('the registry resolves dice.roll and session.prep as read tools', () => {
		expect(registry.get('dice.roll')?.kind).toBe('read');
		expect(registry.get('session.prep')?.kind).toBe('read');
	});
});

describe('MCP-002 — dice.roll is deterministic and fails closed on a bad expression', () => {
	it('returns the recorded roll for a valid expression + seed, matching the pure engine (determinism)', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const result = readOk(
			invokeMcpTool(state, env, registry, {
				toolId: 'dice.roll',
				actorId: DM_ACTOR.id,
				agentId: 'agent-test',
				input: { expression: '2d20kh1+5', seed: 7 },
			}),
		);
		const data = result.data as { ok: boolean; result: { total: number; seed: number } };
		expect(data.ok).toBe(true);
		// The tool composes the pure engine: the same (expression, seed) yields the IDENTICAL result.
		const direct = rollExpression('2d20kh1+5', 7);
		expect(direct.ok).toBe(true);
		if (direct.ok) {
			expect(data.result).toEqual(direct.result);
			expect(data.result.seed).toBe(7);
		}
	});

	it('is reproducible — two invocations with the same seed return identical totals', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const invoke = () =>
			readOk(
				invokeMcpTool(state, env, registry, {
					toolId: 'dice.roll',
					actorId: DM_ACTOR.id,
					agentId: 'agent-test',
					input: { expression: '3d6', seed: 'campaign-1' },
				}),
			).data;
		expect(invoke()).toEqual(invoke());
	});

	it('a malformed expression returns a structured engine error in the data envelope (not a throw)', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const result = readOk(
			invokeMcpTool(state, env, registry, {
				toolId: 'dice.roll',
				actorId: DM_ACTOR.id,
				agentId: 'agent-test',
				input: { expression: '2d20++', seed: 1 },
			}),
		);
		const data = result.data as { ok: boolean; error?: { code: string; message: string } };
		expect(data.ok).toBe(false);
		expect(typeof data.error?.code).toBe('string');
	});

	it('a missing seed is rejected at the tool schema (the roll must be reproducible)', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const result = invokeMcpTool(state, env, registry, {
			toolId: 'dice.roll',
			actorId: DM_ACTOR.id,
			agentId: 'agent-test',
			input: { expression: '2d20' },
		});
		expect(result.status).toBe('denied');
		if (result.status !== 'denied') throw new Error('expected denied');
		expect(result.reason).toBe('invalid-input');
	});

	it('a player-scoped dice.roll is identical to a DM one — dice carry no vault visibility', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const dm = readOk(
			invokeMcpTool(state, env, registry, {
				toolId: 'dice.roll',
				actorId: DM_ACTOR.id,
				agentId: 'agent-test',
				input: { expression: '1d20', seed: 42 },
			}),
		).data;
		const player = readOk(
			invokeMcpTool(state, env, registry, {
				toolId: 'dice.roll',
				actorId: PLAYER_ACTOR.id,
				agentId: 'agent-test',
				input: { expression: '1d20', seed: 42 },
			}),
		).data;
		expect(dm).toEqual(player);
	});
});

describe('MCP-002 AC1/AC2 — session.prep returns DM structured context but is empty + filtered for a player', () => {
	/** Seed a session with a DM-only note (a recent change) so the DM prep digest has source content. */
	function seedSession(): CoreStateSlice {
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		state = accepted(
			dispatchCommand(state, env, {
				type: 'content.create-item',
				actorId: DM_ACTOR.id,
				payload: { kind: 'note', title: 'Secret Plot', body: 'twist', visibility: 'dm-only' },
			}),
		).nextState;
		return state;
	}

	it('a DM agent receives a structured prep bundle from core indexes (AC1)', () => {
		const state = seedSession();
		const result = readOk(
			invokeMcpTool(state, env, registry, {
				toolId: 'session.prep',
				actorId: DM_ACTOR.id,
				agentId: 'agent-test',
				input: { mode: 'prep' },
			}),
		);
		const digest = result.data as { mode: string; dmOnly: boolean; recentChanges: unknown[] };
		expect(digest.mode).toBe('prep');
		expect(digest.dmOnly).toBe(true);
		// The DM-only note's creation is a recent change in the structured bundle (computed from core indexes).
		expect(digest.recentChanges.length).toBeGreaterThan(0);
	});

	it('a player agent receives an EMPTY, visibility-filtered prep bundle — no hidden content leaks (AC2)', () => {
		const state = seedSession();
		const result = readOk(
			invokeMcpTool(state, env, registry, {
				toolId: 'session.prep',
				actorId: PLAYER_ACTOR.id,
				agentId: 'agent-test',
				input: { mode: 'prep' },
			}),
		);
		const digest = result.data as {
			dmOnly: boolean;
			recentChanges: unknown[];
			unresolvedThreads: unknown[];
			continuityPrompts: unknown[];
		};
		// The DM-only prep surface is empty for a non-DM: it leaks nothing about the hidden note/session state.
		expect(digest.dmOnly).toBe(false);
		expect(digest.recentChanges).toEqual([]);
		expect(digest.unresolvedThreads).toEqual([]);
		expect(digest.continuityPrompts).toEqual([]);
	});

	it('an unknown digest mode is rejected at the tool schema (fail closed)', () => {
		const state = seedSession();
		const result = invokeMcpTool(state, env, registry, {
			toolId: 'session.prep',
			actorId: DM_ACTOR.id,
			agentId: 'agent-test',
			input: { mode: 'forecast' },
		});
		expect(result.status).toBe('denied');
		if (result.status !== 'denied') throw new Error('expected denied');
		expect(result.reason).toBe('invalid-input');
	});

	it('a recap mode is accepted (the bundle looks back at the just-ended session)', () => {
		const state = seedSession();
		const result = readOk(
			invokeMcpTool(state, env, registry, {
				toolId: 'session.prep',
				actorId: DM_ACTOR.id,
				agentId: 'agent-test',
				input: { mode: 'recap' },
			}),
		);
		expect((result.data as { mode: string }).mode).toBe('recap');
	});
});

describe('MCP-002 — the new tools are permission-gated through the agent pipeline (allowlist + enable)', () => {
	/** Bind a DM agent with dice.roll + session.prep allowlisted, MCP enabled. */
	function seedAgent(): CoreStateSlice {
		let state = withMcpEnabled(buildInitialState(DM_ACTOR, PLAYER_ACTOR));
		state = accepted(
			dispatchCommand(state, env, {
				type: 'mcp.set-agent-binding',
				actorId: DM_ACTOR.id,
				payload: { agentId: 'agent-dm', actorId: DM_ACTOR.id, label: 'bot' },
			}),
		).nextState;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'mcp.set-agent-policy',
				actorId: DM_ACTOR.id,
				payload: { agentId: 'agent-dm', mode: 'strict_review', allowedToolIds: ['dice.roll'] },
			}),
		).nextState;
		return state;
	}

	it('an allowlisted dice.roll resolves read-ok through the agent pipeline', () => {
		const output = invokeMcpToolAsAgent(seedAgent(), env, registry, {
			agentId: 'agent-dm',
			toolId: 'dice.roll',
			input: { expression: '1d20', seed: 3 },
		});
		expect(output.result.status).toBe('read-ok');
	});

	it('session.prep is denied when it is NOT in the agent allowlist (no implicit access)', () => {
		const output = invokeMcpToolAsAgent(seedAgent(), env, registry, {
			agentId: 'agent-dm',
			toolId: 'session.prep',
			input: { mode: 'prep' },
		});
		expect(output.result.status).toBe('agent-denied');
		if (output.result.status !== 'agent-denied') throw new Error('expected agent-denied');
		expect(output.result.reason).toBe('not-allowlisted');
	});
});
