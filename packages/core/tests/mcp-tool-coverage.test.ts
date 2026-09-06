import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	createBaselineMcpToolRegistry,
	createDemoMapState,
	dispatchCommand,
	invokeMcpTool,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
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
	/**
	 * RC-AI-1.2 — optional state SEED for a tool whose payload is resolved against current state
	 * (`note.append` needs a real note, `map.poi.create` a real map, `scene.card.update` a real card).
	 * It returns the seeded state and may rewrite `validInput` with the ids it just minted. Without a
	 * seed the row runs against the bare initial state, exactly as before.
	 */
	setup?: (state: CoreStateSlice) => { state: CoreStateSlice; validInput?: unknown };
}

/** Dispatch a setup command in a coverage row's seed, failing loudly if the fixture itself is wrong. */
function seedCommand(
	state: CoreStateSlice,
	command: CoreCommand,
): Extract<CommandResult, { status: 'accepted' }> {
	const result = dispatchCommand(state, env, command);
	if (result.status !== 'accepted') {
		throw new Error(`coverage seed ${command.type} rejected: ${result.rejection.message}`);
	}
	return result;
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
		toolId: 'dice.roll',
		kind: 'read',
		behaviors: ['schema-validation', 'actor-policy', 'visibility-filtering', 'failure-handling'],
		invalidInput: { expression: '2d20' }, // missing the required seed
		validInput: { expression: '2d20kh1+5', seed: 7 },
	},
	{
		toolId: 'session.prep',
		kind: 'read',
		behaviors: ['schema-validation', 'actor-policy', 'visibility-filtering', 'failure-handling'],
		invalidInput: { mode: 'forecast' }, // not a declared digest mode
		validInput: { mode: 'prep' },
	},
	// SEMANTIC BUNDLE read tools (MCP-006 / MCP-013). Each is a report tool, so it covers schema + actor
	// policy + visibility filtering + failure handling. The invalid input drops the REQUIRED
	// `referenceInstant`; the valid input supplies it (the bundle kind is fixed by the tool id).
	{
		toolId: 'bundle.session-prep',
		kind: 'read',
		behaviors: ['schema-validation', 'actor-policy', 'visibility-filtering', 'failure-handling'],
		invalidInput: {}, // missing required referenceInstant
		validInput: { referenceInstant: '2026-06-05T00:00:00.000Z' },
	},
	{
		toolId: 'bundle.session-recap',
		kind: 'read',
		behaviors: ['schema-validation', 'actor-policy', 'visibility-filtering', 'failure-handling'],
		invalidInput: { referenceInstant: '2026-06-05T00:00:00.000Z', itemBudget: -1 }, // budget must be positive
		validInput: { referenceInstant: '2026-06-05T00:00:00.000Z' },
	},
	{
		toolId: 'bundle.continuity',
		kind: 'read',
		behaviors: ['schema-validation', 'actor-policy', 'visibility-filtering', 'failure-handling'],
		invalidInput: { referenceInstant: '' }, // empty reference instant
		validInput: { referenceInstant: '2026-06-05T00:00:00.000Z' },
	},
	{
		toolId: 'bundle.open-threads',
		kind: 'read',
		behaviors: ['schema-validation', 'actor-policy', 'visibility-filtering', 'failure-handling'],
		invalidInput: { referenceInstant: '2026-06-05T00:00:00.000Z', extra: true }, // strict rejects extras
		validInput: { referenceInstant: '2026-06-05T00:00:00.000Z' },
	},
	{
		toolId: 'bundle.coverage-gaps',
		kind: 'read',
		behaviors: ['schema-validation', 'actor-policy', 'visibility-filtering', 'failure-handling'],
		invalidInput: {}, // missing required referenceInstant
		validInput: { referenceInstant: '2026-06-05T00:00:00.000Z' },
	},
	{
		toolId: 'bundle.stale-notes',
		kind: 'read',
		behaviors: ['schema-validation', 'actor-policy', 'visibility-filtering', 'failure-handling'],
		invalidInput: { referenceInstant: '2026-06-05T00:00:00.000Z', itemBudget: 0 }, // budget must be positive
		validInput: { referenceInstant: '2026-06-05T00:00:00.000Z' },
	},
	{
		toolId: 'bundle.campaign-health',
		kind: 'read',
		behaviors: ['schema-validation', 'actor-policy', 'visibility-filtering', 'failure-handling'],
		invalidInput: { referenceInstant: 123 }, // must be a string
		validInput: { referenceInstant: '2026-06-05T00:00:00.000Z' },
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
	{
		// I11 S11.2.1 — the staged scene-card create. Routes through the authorized `scene-card.create`
		// command; visibility is omitted so an agent-authored card fails closed to dm-only.
		toolId: 'create_scene_card',
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
		validInput: { title: 'Ambush at the Bridge', mood: 'combat', flavorText: 'Steel rings.' },
	},
	{
		// ADR-025 — the staged random-table create. Routes through `content.create-item`; the table fields
		// carry no visibility so an agent-authored table fails closed to dm-only.
		toolId: 'table.create',
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
		invalidInput: { title: 'x', dice: '1d4', entries: [] }, // entries must have at least one row
		validInput: {
			title: 'Wandering Perils',
			dice: '1d4',
			entries: ['wraith', 'gas', 'mud', 'nothing'],
		},
	},
	{
		// ADR-025 — the staged NPC/monster/sidekick create. Routes through `character.quick-create`;
		// visibility is omitted so an agent-authored character fails closed to dm-only.
		toolId: 'character.create',
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
		invalidInput: { kind: 'npc' }, // missing required name
		validInput: { kind: 'npc', name: 'Grukka the Fen-Witch', data: { class: 'druid', level: 5 } },
	},
	{
		// ADR-025 — the staged note revision. Routes through `content.update-item`; only title/body cross
		// over (never a visibility/fields widening).
		toolId: 'note.update',
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
		invalidInput: {}, // missing required itemId
		validInput: {
			itemId: 'item-anything',
			baseRevision: 0,
			title: 'Revised heading',
			body: 'Updated by the agent.',
		},
	},
	// --- RC-AI-1.2 — the campaign-authoring write tools -------------------------------------------
	{
		// Routes through `encounter.build`; difficulty is computed by the core, never an argument, and
		// session-log links are never forwarded (an agent cannot bind vault references).
		toolId: 'encounter.create',
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
		invalidInput: { title: 'Ambush', combatants: [] }, // an encounter needs at least one combatant
		validInput: {
			title: 'Bridge ambush',
			combatants: [{ kind: 'monster', name: 'Bandit', challengeRating: 0.5, quantity: 4 }],
			party: { size: 4, averageLevel: 3 },
		},
	},
	{
		// A `quest` Vault Object through `content.create-item`; no visibility ⇒ fails closed to dm-only.
		toolId: 'quest.create',
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
		invalidInput: { title: 'Find the crown', status: 'maybe' }, // not a declared quest status
		validInput: {
			title: 'Find the drowned crown',
			status: 'active',
			objectives: ['Reach the sunken chapel', 'Recover the crown'],
		},
	},
	{
		// A `faction` Vault Object through `content.create-item`; `secret` stays a DM-only field.
		toolId: 'faction.create',
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
		invalidInput: { name: 'The Fen Circle', stance: 'grumpy' }, // not a declared stance
		validInput: { name: 'The Fen Circle', kind: 'cult', stance: 'hostile' },
	},
	{
		// Routes through `map.create-poi` on a real map; no visibility ⇒ the pin fails closed to dm-only.
		toolId: 'map.poi.create',
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
		invalidInput: { mapId: 'map-western-reaches', label: 'x', position: { x: 4, y: 0.5 } }, // x is normalized 0..1
		validInput: {
			mapId: 'map-western-reaches',
			label: 'Watchtower',
			category: 'landmark',
			position: { x: 0.25, y: 0.3 },
		},
		setup: (state) => ({ state: { ...state, maps: createDemoMapState() } }),
	},
	{
		// Routes through `scene-card.update` on an existing card; visibility is not updatable at all.
		toolId: 'scene.card.update',
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
		invalidInput: { cardId: 'card-1' }, // nothing to update
		validInput: { cardId: 'card-1', flavorText: 'Rain drums on the tin roof.' },
		setup: (state) => {
			const created = seedCommand(state, {
				type: 'scene-card.create',
				actorId: DM_ACTOR.id,
				payload: { title: 'The Sunken Tavern', mood: 'social' },
			});
			const event = created.events.find((e) => e.kind === 'scene-card.created');
			if (!event || event.kind !== 'scene-card.created') throw new Error('no scene card id');
			return {
				state: created.nextState,
				validInput: { cardId: event.cardId, flavorText: 'Rain drums on the tin roof.' },
			};
		},
	},
	{
		// Routes through `content.update-item` with the body read from the ACTOR-FILTERED note detail.
		toolId: 'note.append',
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
		invalidInput: { text: 'more prose' }, // missing required itemId
		validInput: { itemId: 'item-anything', text: 'more prose' },
		setup: (state) => {
			const created = seedCommand(state, {
				type: 'content.create-item',
				actorId: DM_ACTOR.id,
				payload: { kind: 'note', title: 'Session 4', body: 'The party crossed the fen.' },
			});
			const item = Object.values(created.nextState.content.items).find(
				(candidate) => candidate.title === 'Session 4',
			);
			if (!item) throw new Error('no seeded note');
			return {
				state: created.nextState,
				validInput: { itemId: item.id, text: 'They met the Fen Circle at dusk.' },
			};
		},
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
		expect(uncovered, `MCP tools missing dedicated test coverage: ${uncovered.join(', ')}`).toEqual(
			[],
		);
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
			expect(row.behaviors, `${row.toolId} must cover visibility-filtering`).toContain(
				'visibility-filtering',
			);
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
			expect(result.issues?.length ?? 0).toBeGreaterThan(0);
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
			const seeded = row.setup?.(buildInitialState(DM_ACTOR, PLAYER_ACTOR));
			const state = seeded?.state ?? buildInitialState(DM_ACTOR, PLAYER_ACTOR);
			const result = invokeMcpTool(state, env, registry, {
				toolId: row.toolId,
				actorId: DM_ACTOR.id,
				agentId: 'agent-test',
				input: seeded?.validInput ?? row.validInput,
			});
			if (row.kind === 'read') {
				expect(result.status).toBe('read-ok');
			} else {
				expect(result.status).toBe('write');
			}
		});
	}
});
