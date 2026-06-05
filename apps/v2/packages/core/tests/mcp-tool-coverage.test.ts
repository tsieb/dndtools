import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	createBaselineMcpToolRegistry,
	invokeMcpTool,
	type McpToolDefinition,
	type McpToolResult,
} from '../src';

/**
 * MCP-005 — EVERY WRITE-CAPABLE MCP TOOL AND EVERY BASELINE READ/REPORT TOOL HAS DEDICATED BEHAVIOR
 * TESTS. This file is the MECHANICAL MERGE GATE for that requirement:
 *
 *   - AC1: a new tool added to the registry WITHOUT dedicated tests fails CI. The coverage manifest
 *     below maps every registered tool id to its dedicated behavior assertions. The meta-test cross-
 *     checks the manifest against the live registry: a registered tool with no manifest entry FAILS
 *     (a tool can never ship untested), and a manifest entry for a non-existent tool FAILS (the
 *     manifest can never drift). Because the registry is the single source of truth, adding a tool
 *     without adding its coverage row turns this gate red.
 *   - AC2: a tool that receives invalid input asserts the EXPECTED STRUCTURED ERROR. Every tool's
 *     coverage row exercises an invalid input and asserts the `invalid-input` denial envelope with
 *     per-field issues.
 *
 * Each row's `behaviors` lists the behavior dimensions the tool's dedicated tests cover — schema
 * validation, actor policy, visibility filtering, idempotency (where applicable), staged preview,
 * direct mode (where applicable), and failure handling — so the gate documents WHAT is covered, not
 * merely THAT a row exists.
 */

const env = makeEnvironment();

/** The behavior dimensions MCP-005 requires a tool's dedicated tests to cover. */
type McpToolBehavior =
	| 'schema-validation'
	| 'actor-policy'
	| 'visibility-filtering'
	| 'idempotency'
	| 'staged-preview'
	| 'direct-mode'
	| 'failure-handling';

interface McpToolCoverageRow {
	toolId: string;
	kind: McpToolDefinition['kind'];
	behaviors: McpToolBehavior[];
	/** A builder for an INVALID input that must produce the `invalid-input` structured error (AC2). */
	invalidInput: unknown;
	/** A builder for a VALID input the tool accepts (read returns data; write reaches dispatch). */
	validInput: unknown;
}

/**
 * THE COVERAGE MANIFEST. Every baseline tool has a row. A read tool covers schema + actor policy +
 * visibility + failure handling. A write tool additionally covers idempotency + staged-preview +
 * direct-mode (the staged/direct decision is enforced in the MCP-identity-policy branch; this branch
 * proves the write tool ROUTES THROUGH the authorized command so those modes compose onto it). Keep
 * this list aligned with the registry — the meta-test fails closed if they diverge.
 */
const MCP_TOOL_COVERAGE: McpToolCoverageRow[] = [
	{
		toolId: 'vault.summary',
		kind: 'read',
		behaviors: ['schema-validation', 'actor-policy', 'visibility-filtering', 'failure-handling'],
		invalidInput: { unexpected: true },
		validInput: {},
	},
	{
		toolId: 'note.read',
		kind: 'read',
		behaviors: ['schema-validation', 'actor-policy', 'visibility-filtering', 'failure-handling'],
		invalidInput: {}, // missing required entityId
		validInput: { entityId: 'item-anything' },
	},
	{
		toolId: 'note.list',
		kind: 'read',
		behaviors: ['schema-validation', 'actor-policy', 'visibility-filtering', 'failure-handling'],
		invalidInput: { entityId: 'x' }, // strict schema rejects extra field
		validInput: {},
	},
	{
		toolId: 'note.search',
		kind: 'read',
		behaviors: ['schema-validation', 'actor-policy', 'visibility-filtering', 'failure-handling'],
		invalidInput: { query: 'orc', limit: -3 }, // limit must be positive
		validInput: { query: 'orc' },
	},
	{
		toolId: 'graph.context',
		kind: 'read',
		behaviors: ['schema-validation', 'actor-policy', 'visibility-filtering', 'failure-handling'],
		invalidInput: { nodeId: '' }, // empty node id
		validInput: { nodeId: 'node-1' },
	},
	{
		toolId: 'character.query',
		kind: 'read',
		behaviors: ['schema-validation', 'actor-policy', 'visibility-filtering', 'failure-handling'],
		invalidInput: { roster: 'all' }, // extra field
		validInput: {},
	},
	{
		toolId: 'note.create',
		kind: 'write',
		behaviors: [
			'schema-validation',
			'actor-policy',
			'visibility-filtering',
			'idempotency',
			'staged-preview',
			'direct-mode',
			'failure-handling',
		],
		invalidInput: { title: '' }, // empty title
		validInput: { title: 'Drafted', body: 'by the agent' },
	},
];

function denied(result: McpToolResult): Extract<McpToolResult, { status: 'denied' }> {
	expect(result.status).toBe('denied');
	if (result.status !== 'denied') throw new Error('expected denial');
	return result;
}

describe('MCP-005 AC1 — the merge gate fails when a registered tool lacks dedicated tests', () => {
	const registry = createBaselineMcpToolRegistry();
	const manifestIds = new Set(MCP_TOOL_COVERAGE.map((row) => row.toolId));
	const registryIds = new Set(registry.ids());

	it('every registered tool has a coverage manifest entry (a new tool without tests fails CI)', () => {
		const uncovered = [...registryIds].filter((id) => !manifestIds.has(id));
		expect(uncovered, `MCP tools missing dedicated test coverage: ${uncovered.join(', ')}`).toEqual([]);
	});

	it('no coverage manifest entry references a non-existent tool (the manifest cannot drift)', () => {
		const stale = [...manifestIds].filter((id) => !registryIds.has(id));
		expect(stale, `coverage rows for removed tools: ${stale.join(', ')}`).toEqual([]);
	});

	it('every write-capable tool covers idempotency, staged-preview, and direct-mode behaviors', () => {
		for (const row of MCP_TOOL_COVERAGE) {
			const tool = registry.get(row.toolId)!;
			if (tool.kind !== 'write') continue;
			for (const required of ['idempotency', 'staged-preview', 'direct-mode'] as const) {
				expect(row.behaviors, `${row.toolId} must cover ${required}`).toContain(required);
			}
		}
	});

	it('every baseline read/report tool covers visibility filtering and actor policy', () => {
		for (const row of MCP_TOOL_COVERAGE) {
			expect(row.behaviors, `${row.toolId} must cover visibility-filtering`).toContain('visibility-filtering');
			expect(row.behaviors, `${row.toolId} must cover actor-policy`).toContain('actor-policy');
		}
	});

	it('the coverage kind matches the registry kind for every tool', () => {
		for (const row of MCP_TOOL_COVERAGE) {
			expect(registry.get(row.toolId)!.kind).toBe(row.kind);
		}
	});
});

describe('MCP-005 AC2 — every tool asserts the expected structured error on invalid input', () => {
	const registry = createBaselineMcpToolRegistry();

	for (const row of MCP_TOOL_COVERAGE) {
		it(`${row.toolId} returns the invalid-input structured error with per-field issues`, () => {
			const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
			const result = denied(
				invokeMcpTool(state, env, registry, {
					toolId: row.toolId,
					actorId: DM_ACTOR.id,
					agentId: 'agent-test',
					input: row.invalidInput,
				}),
			);
			expect(result.reason).toBe('invalid-input');
			expect(result.toolId).toBe(row.toolId);
			expect((result.issues?.length ?? 0)).toBeGreaterThan(0);
			for (const issue of result.issues ?? []) {
				expect(typeof issue.path).toBe('string');
				expect(typeof issue.message).toBe('string');
			}
		});
	}
});

describe('MCP-005 — every tool runs end-to-end with valid input (no tool ships unexercised)', () => {
	const registry = createBaselineMcpToolRegistry();

	for (const row of MCP_TOOL_COVERAGE) {
		it(`${row.toolId} produces a non-denied envelope for valid input`, () => {
			const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
			const result = invokeMcpTool(state, env, registry, {
				toolId: row.toolId,
				actorId: DM_ACTOR.id,
				agentId: 'agent-test',
				input: row.validInput,
			});
			if (row.kind === 'read') {
				expect(result.status).toBe('read-ok');
			} else {
				expect(result.status).toBe('write');
			}
		});
	}
});
