import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	MCP_BASELINE_TOOL_IDS,
	VAULT_OBJECT_SUBTYPE_KEY,
	contentItemById,
	createBaselineMcpToolRegistry,
	createContentItemInputSchema,
	dispatchCommand,
	invokeMcpToolAsAgent,
	quickCreateCharacterInputSchema,
	updateContentItemInputSchema,
	type CommandResult,
	type CoreStateSlice,
} from '../src';

/**
 * ADR-025 — the agentic-run WRITE tools (`table.create`, `character.create`, `note.update`).
 *
 * The load-bearing invariant these tests protect: a STAGED write must carry the MAPPED command
 * payload (the same transform the direct-write path applies), because approval re-dispatches
 * `proposal.payload` verbatim. `table.create` is the tool that proves it — its input (`{title, dice,
 * entries}`) differs from the `content.create-item` payload (`{kind, title, fields:{…}}`), so if the
 * staged payload were the raw tool input, an approved table would be dispatched with an invalid shape.
 */

const env = makeEnvironment();

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

/** DM-bound agent (`agent-dm`) under `strict_review` (everything stages) with the full baseline surface. */
function seedAgent(): CoreStateSlice {
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	state = accepted(
		dispatchCommand(state, env, {
			type: 'mcp.set-enabled',
			actorId: DM_ACTOR.id,
			payload: { enabled: true },
		}),
	).nextState;
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
			payload: {
				agentId: 'agent-dm',
				mode: 'strict_review',
				allowedToolIds: [...MCP_BASELINE_TOOL_IDS],
			},
		}),
	).nextState;
	return state;
}

function stage(
	state: CoreStateSlice,
	toolId: string,
	input: unknown,
): { state: CoreStateSlice; proposalId: string } {
	const registry = createBaselineMcpToolRegistry();
	const { result, nextState } = invokeMcpToolAsAgent(state, env, registry, {
		agentId: 'agent-dm',
		toolId,
		input,
	});
	expect(result.status, JSON.stringify(result)).toBe('staged');
	if (result.status !== 'staged') throw new Error('expected staged');
	return { state: nextState, proposalId: result.proposalId };
}

function approve(state: CoreStateSlice, proposalId: string): CoreStateSlice {
	return accepted(
		dispatchCommand(state, env, {
			type: 'mcp.approve-proposal',
			actorId: DM_ACTOR.id,
			payload: { proposalId },
		}),
	).nextState;
}

describe('table.create — staged payload is the mapped dice-table, and approval yields a rollable table', () => {
	it.each([
		[
			'a multi-die expression',
			{ title: 'Bad', dice: '2d6', entries: ['1', '2', '3', '4', '5', '6'] },
		],
		['a modified expression', { title: 'Bad', dice: '1d4+1', entries: ['1', '2', '3', '4'] }],
		['a row-count mismatch', { title: 'Bad', dice: '1d4', entries: ['1', '2', '3'] }],
	] as const)('denies %s before a proposal is staged', (_label, input) => {
		const seeded = seedAgent();
		const { result, nextState } = invokeMcpToolAsAgent(
			seeded,
			env,
			createBaselineMcpToolRegistry(),
			{ agentId: 'agent-dm', toolId: 'table.create', input },
		);
		expect(result.status).toBe('denied');
		if (result.status !== 'denied') throw new Error('expected denied');
		expect(result.reason).toBe('invalid-input');
		expect(nextState).toBe(seeded);
		expect(Object.values(nextState.mcp.proposals)).toHaveLength(0);
	});

	it('stages the {kind:object, fields:{dice-table}} payload — not the raw tool input', () => {
		const seeded = seedAgent();
		const { state, proposalId } = stage(seeded, 'table.create', {
			title: 'Swamp sounds',
			dice: '1d4',
			entries: ['a croak', 'a splash', 'a whisper', 'silence'],
		});
		const proposal = state.mcp.proposals[proposalId]!;
		// The stored payload validates as a real content.create-item payload (approval dispatches it as-is).
		expect(createContentItemInputSchema.safeParse(proposal.payload).success).toBe(true);
		const payload = proposal.payload as { kind: string; fields: Record<string, unknown> };
		expect(payload.kind).toBe('object');
		expect(payload.fields[VAULT_OBJECT_SUBTYPE_KEY]).toBe('dice-table');
		expect(payload.fields.dice).toBe('1d4');
		expect(payload.fields.entries).toEqual(['a croak', 'a splash', 'a whisper', 'silence']);
		// It carries NO top-level dice/entries and NO visibility (fails closed to dm-only).
		expect(payload).not.toHaveProperty('dice');
		expect(payload).not.toHaveProperty('visibility');
	});

	it('approval creates a live dice-table content item', () => {
		const seeded = seedAgent();
		const staged = stage(seeded, 'table.create', {
			title: 'Swamp sounds',
			dice: '1d4',
			entries: ['a croak', 'a splash', 'a whisper', 'silence'],
		});
		const after = approve(staged.state, staged.proposalId);
		const item = Object.values(after.content.items).find((i) => i.title === 'Swamp sounds');
		expect(item).toBeDefined();
		expect(item!.fields[VAULT_OBJECT_SUBTYPE_KEY]).toBe('dice-table');
		expect(item!.fields.entries).toEqual(['a croak', 'a splash', 'a whisper', 'silence']);
		expect(item!.visibility).toBe('dm-only');
	});

	it('an approved table can be drawn through the real dice-table command', () => {
		const staged = stage(seedAgent(), 'table.create', {
			title: 'Swamp sounds',
			dice: '1d4',
			entries: ['a croak', 'a splash', 'a whisper', 'silence'],
		});
		let state = approve(staged.state, staged.proposalId);
		const table = Object.values(state.content.items).find((item) => item.title === 'Swamp sounds')!;

		state = accepted(
			dispatchCommand(state, env, {
				type: 'command-center.ensure-home',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		).nextState;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'active', activeSceneId: state.commandCenter.homeSceneId },
			}),
		).nextState;
		const drawn = accepted(
			dispatchCommand(state, env, {
				type: 'dice.roll-table',
				actorId: DM_ACTOR.id,
				payload: { tableItemId: table.id, seed: 'agent-table-test' },
			}),
		);

		expect(drawn.nextState.session.diceHistory).toHaveLength(1);
		expect(drawn.nextState.session.diceHistory[0]).toMatchObject({
			sourceKind: 'table',
			tableItemId: table.id,
		});
	});
});

describe('character.create — staged NPC statblock', () => {
	it('stages a schema-valid quick-create payload and approval commits it', () => {
		const seeded = seedAgent();
		const { state, proposalId } = stage(seeded, 'character.create', {
			kind: 'npc',
			name: 'Gralk the Fen-Witch',
			abilityScores: { int: 14 },
			combat: { hp: 27, maxHp: 27, ac: 13 },
			data: { class: 'druid', level: 5 },
		});
		const proposal = state.mcp.proposals[proposalId]!;
		expect(quickCreateCharacterInputSchema.safeParse(proposal.payload).success).toBe(true);
		expect(proposal.payload).not.toHaveProperty('visibility'); // fails closed to dm-only
		const after = approve(state, proposalId);
		const character = Object.values(after.characters.characters).find(
			(c) => c.name === 'Gralk the Fen-Witch',
		);
		expect(character).toBeDefined();
		expect(character!.kind).toBe('npc');
	});
});

describe('note.update — staged revision of an existing note', () => {
	it('stages title/body only and approval applies them', () => {
		let state = seedAgent();
		// Seed a note to revise.
		const created = accepted(
			dispatchCommand(state, env, {
				type: 'content.create-item',
				actorId: DM_ACTOR.id,
				payload: { kind: 'note', title: 'Draft', body: 'old body' },
			}),
		);
		state = created.nextState;
		const changed = created.events.find((e) => e.kind === 'content.item-changed');
		if (!changed || changed.kind !== 'content.item-changed') throw new Error('no note id');
		const itemId = changed.itemId;

		const baseRevision = contentItemById(state.content, itemId)!.revision;
		const staged = stage(state, 'note.update', {
			itemId,
			baseRevision,
			title: 'Revised',
			body: 'new body',
		});
		const proposal = staged.state.mcp.proposals[staged.proposalId]!;
		expect(updateContentItemInputSchema.safeParse(proposal.payload).success).toBe(true);
		expect(proposal.payload).not.toHaveProperty('fields'); // no fields/visibility widening

		const after = approve(staged.state, staged.proposalId);
		const item = contentItemById(after.content, itemId)!;
		expect(item.title).toBe('Revised');
		expect(item.body).toBe('new body');
	});

	it('does not clobber a newer human edit when an older proposal is approved', () => {
		let state = seedAgent();
		const created = accepted(
			dispatchCommand(state, env, {
				type: 'content.create-item',
				actorId: DM_ACTOR.id,
				payload: { kind: 'note', title: 'Draft', body: 'original' },
			}),
		);
		state = created.nextState;
		const itemId = Object.values(state.content.items).find((item) => item.title === 'Draft')!.id;
		const baseRevision = contentItemById(state.content, itemId)!.revision;
		const staged = stage(state, 'note.update', {
			itemId,
			baseRevision,
			body: 'agent proposal',
		});

		const humanEdit = accepted(
			dispatchCommand(staged.state, env, {
				type: 'content.update-item',
				actorId: DM_ACTOR.id,
				payload: { itemId, baseRevision, body: 'newer human edit' },
			}),
		);
		const after = approve(humanEdit.nextState, staged.proposalId);

		expect(contentItemById(after.content, itemId)!.body).toBe('newer human edit');
		expect(
			after.sync.operations.some((operation) => operation.opType === 'content.item-conflict'),
		).toBe(true);
	});
});
