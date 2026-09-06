import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	MCP_RESPONSE_ENVELOPE_SCHEMA,
	buildCertifiedMcpResponse,
	certifyMcpResponse,
	createBaselineMcpToolRegistry,
	createDemoMapState,
	dispatchCommand,
	invokeMcpTool,
	toMcpResponseEnvelope,
	type CoreStateSlice,
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

/** Placeholder in VALID_INPUT['note.update'] swapped for the real seeded note id inside `run`. */
const SEEDED_NOTE = '__seeded_note__';

/** Placeholder in VALID_INPUT['scene.card.update'] swapped for the real seeded card id inside `run`. */
const SEEDED_CARD = '__seeded_card__';

/**
 * Build a fresh DM/player state pre-seeded with the targets the state-resolved write tools need: one
 * note (`note.update`, `note.append`), the demo maps (`map.poi.create`), and one scene card
 * (`scene.card.update`). Returns the state plus the real ids the sentinels are swapped for.
 */
function stateWithSeededTargets(): { state: CoreStateSlice; noteId: string; cardId: string } {
	const created = dispatchCommand(
		{ ...buildInitialState(DM_ACTOR, PLAYER_ACTOR), maps: createDemoMapState() },
		env,
		{
			type: 'content.create-item',
			actorId: DM_ACTOR.id,
			payload: { kind: 'note', title: 'Seed note', body: 'seed body' },
		},
	);
	if (created.status !== 'accepted') throw new Error('failed to seed a note for coverage');
	const changed = created.events.find((e) => e.kind === 'content.item-changed');
	if (!changed || changed.kind !== 'content.item-changed') throw new Error('no seeded note id');

	const card = dispatchCommand(created.nextState, env, {
		type: 'scene-card.create',
		actorId: DM_ACTOR.id,
		payload: { title: 'Seed card', mood: 'social' },
	});
	if (card.status !== 'accepted') throw new Error('failed to seed a scene card for coverage');
	const cardEvent = card.events.find((e) => e.kind === 'scene-card.created');
	if (!cardEvent || cardEvent.kind !== 'scene-card.created') throw new Error('no seeded card id');

	return { state: card.nextState, noteId: changed.itemId, cardId: cardEvent.cardId };
}

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
	'bundle.stale-notes': { referenceInstant: '2026-06-05T00:00:00.000Z' },
	'bundle.campaign-health': { referenceInstant: '2026-06-05T00:00:00.000Z' },
	'note.create': { title: 'Drafted', body: 'by the agent' },
	create_scene_card: { title: 'Ambush at the Bridge', mood: 'combat', flavorText: 'Steel rings.' },
	// ADR-025 agentic-run write tools. `note.update` targets a note seeded into each run's state (the
	// SEEDED_NOTE sentinel is swapped for the real id in `run`).
	'table.create': {
		title: 'Wandering Perils',
		dice: '1d4',
		entries: ['bog wraith', 'gas', 'quick mud', 'nothing'],
	},
	'character.create': {
		kind: 'npc',
		name: 'Grukka the Fen-Witch',
		abilityScores: { int: 14 },
		combat: { hp: 27, maxHp: 27, ac: 13 },
		data: { class: 'druid', level: 5 },
	},
	'note.update': {
		itemId: SEEDED_NOTE,
		baseRevision: 1,
		title: 'Revised heading',
		body: 'Updated by the agent.',
	},
	// RC-AI-1.2 campaign-authoring write tools. `map.poi.create` addresses the demo map state and
	// `scene.card.update`/`note.append` address the seeded card/note (sentinels swapped in `run`).
	'encounter.create': {
		title: 'Bridge ambush',
		combatants: [{ kind: 'monster', name: 'Bandit', challengeRating: 0.5, quantity: 4 }],
		party: { size: 4, averageLevel: 3 },
	},
	'quest.create': {
		title: 'Find the drowned crown',
		status: 'active',
		objectives: ['Reach the sunken chapel'],
	},
	'faction.create': { name: 'The Fen Circle', kind: 'cult', stance: 'hostile' },
	'map.poi.create': {
		mapId: 'map-western-reaches',
		label: 'Watchtower',
		category: 'landmark',
		position: { x: 0.25, y: 0.3 },
	},
	'scene.card.update': { cardId: SEEDED_CARD, flavorText: 'Rain drums on the tin roof.' },
	'note.append': { itemId: SEEDED_NOTE, text: 'They met the Fen Circle at dusk.' },
	'widget.package.propose': {
		displayName: 'Party loot ledger',
		prompt: 'Make me a loot ledger widget.',
		template: 'data-table',
		dataQueries: [{ id: 'loot', label: 'Loot items', source: 'content-objects' }],
	},
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
	'bundle.stale-notes': { referenceInstant: '2026-06-05T00:00:00.000Z', itemBudget: 0 },
	'bundle.campaign-health': { referenceInstant: 123 },
	'note.create': { title: '' },
	create_scene_card: { title: '' },
	'table.create': { title: 'Broken', dice: '1d4', entries: [] }, // empty entries fail the min(1) schema
	'character.create': { kind: 'npc' }, // missing required name
	'note.update': {}, // missing required itemId
	'encounter.create': { title: 'Empty', combatants: [] }, // an encounter needs a combatant
	'quest.create': { title: 'Find the crown', status: 'maybe' }, // not a declared quest status
	'faction.create': { name: 'The Fen Circle', stance: 'grumpy' }, // not a declared stance
	'map.poi.create': { mapId: 'map-western-reaches', label: 'x', position: { x: 4, y: 0.5 } }, // x is 0..1
	'scene.card.update': { cardId: 'card-1' }, // nothing to update
	'note.append': { text: 'more prose' }, // missing required itemId
	// Not one of the eight declared template renderers.
	'widget.package.propose': {
		displayName: 'Timeline',
		prompt: 'Make me a timeline.',
		template: 'timeline',
	},
};

function run(toolId: string, input: unknown, actorId: string): McpToolResult {
	// Seed the note/map/card targets so the state-resolved coverage cases address something real; the
	// sentinel ids are swapped for the ids the seeding actually minted.
	const { state, noteId, cardId } = stateWithSeededTargets();
	let resolvedInput = input;
	if (input && typeof input === 'object') {
		const record = input as { itemId?: unknown; cardId?: unknown };
		if (record.itemId === SEEDED_NOTE) resolvedInput = { ...(input as object), itemId: noteId };
		else if (record.cardId === SEEDED_CARD) resolvedInput = { ...(input as object), cardId };
	}
	return invokeMcpTool(state, env, registry, {
		toolId,
		actorId,
		agentId: 'agent-test',
		input: resolvedInput,
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
			expect(envelope.error?.issues?.length ?? 0).toBeGreaterThan(0);
			expect(envelope.remediation.length).toBeGreaterThan(0);
		});
	}
});
