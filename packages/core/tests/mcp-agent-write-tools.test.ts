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
	buildEncounterInputSchema,
	contentItemById,
	createBaselineMcpToolRegistry,
	createContentItemInputSchema,
	createDemoMapState,
	dispatchCommand,
	invokeMcpToolAsAgent,
	quickCreateCharacterInputSchema,
	updateContentItemInputSchema,
	updateSceneCardInputSchema,
	type CommandResult,
	type CoreStateSlice,
} from '../src';
import { createMapPoiInputSchema } from '../src/schemas/commands';

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

// --- RC-AI-1.2 — the campaign-authoring write tools ------------------------------------------------
//
// Same load-bearing invariant as above (a staged proposal must carry the MAPPED command payload,
// because approval re-dispatches `proposal.payload` verbatim) plus the two RC-AI-1.2 additions:
// every tool fails CLOSED to `dm-only` because it accepts no `visibility` argument, and the two
// state-resolved tools (`map.poi.create`, `note.append`) deny when the target is not visible to the
// bound actor — with the same generic envelope a missing target produces, so an agent cannot probe.

/** Deny a tool call outright (never staged), returning the tool-level denial envelope. */
function deniedCall(
	state: CoreStateSlice,
	toolId: string,
	input: unknown,
): { reason: string; message: string } {
	const { result, nextState } = invokeMcpToolAsAgent(state, env, createBaselineMcpToolRegistry(), {
		agentId: 'agent-dm',
		toolId,
		input,
	});
	expect(nextState).toBe(state);
	expect(Object.values(nextState.mcp.proposals)).toHaveLength(0);
	expect(result.status, JSON.stringify(result)).toBe('denied');
	if (result.status !== 'denied') throw new Error('expected denied');
	return { reason: result.reason, message: result.message };
}

/** Seed a note owned by the DM and return its id (the append/attach target for the tests below). */
function seedNote(
	state: CoreStateSlice,
	title: string,
	body: string,
): { state: CoreStateSlice; itemId: string } {
	const created = accepted(
		dispatchCommand(state, env, {
			type: 'content.create-item',
			actorId: DM_ACTOR.id,
			payload: { kind: 'note', title, body },
		}),
	);
	const item = Object.values(created.nextState.content.items).find((i) => i.title === title)!;
	return { state: created.nextState, itemId: item.id };
}

describe('encounter.create — staged encounter build', () => {
	it('stages a schema-valid encounter.build payload and approval commits the encounter', () => {
		const { state, proposalId } = stage(seedAgent(), 'encounter.create', {
			title: 'Bridge ambush',
			combatants: [
				{ kind: 'monster', name: 'Bandit', challengeRating: 0.5, quantity: 4, maxHp: 11, ac: 12 },
			],
			party: { size: 4, averageLevel: 3 },
			terrainNotes: 'A rope bridge over a gorge; difficult terrain on the far bank.',
		});
		const proposal = state.mcp.proposals[proposalId]!;
		expect(proposal.commandType).toBe('encounter.build');
		expect(buildEncounterInputSchema.safeParse(proposal.payload).success).toBe(true);
		// An agent binds no vault references and never states a difficulty (the core computes it).
		expect(proposal.payload).toMatchObject({ sessionLogLinks: [] });
		expect(proposal.payload).not.toHaveProperty('difficulty');

		const after = approve(state, proposalId);
		const encounter = Object.values(after.encounters.encounters).find(
			(e) => e.title === 'Bridge ambush',
		);
		expect(encounter).toBeDefined();
		expect(encounter!.combatants).toHaveLength(1);
		expect(encounter!.combatants[0]!.quantity).toBe(4);
	});

	it('denies an encounter with no combatants before a proposal is staged', () => {
		const denial = deniedCall(seedAgent(), 'encounter.create', { title: 'Empty', combatants: [] });
		expect(denial.reason).toBe('invalid-input');
	});
});

describe('quest.create — staged quest Vault Object', () => {
	it('stages the mapped {kind:object, fields:{quest}} payload and approval yields a dm-only quest', () => {
		const { state, proposalId } = stage(seedAgent(), 'quest.create', {
			title: 'Find the drowned crown',
			status: 'active',
			objectives: ['Reach the sunken chapel', 'Recover the crown'],
			body: 'The reeve offers 200gp.',
		});
		const proposal = state.mcp.proposals[proposalId]!;
		expect(createContentItemInputSchema.safeParse(proposal.payload).success).toBe(true);
		const payload = proposal.payload as { kind: string; fields: Record<string, unknown> };
		expect(payload.kind).toBe('object');
		expect(payload.fields[VAULT_OBJECT_SUBTYPE_KEY]).toBe('quest');
		expect(payload.fields.status).toBe('active');
		expect(payload.fields.objectives).toEqual([
			{ id: 'objective-1', text: 'Reach the sunken chapel', done: false },
			{ id: 'objective-2', text: 'Recover the crown', done: false },
		]);
		expect(payload).not.toHaveProperty('visibility');

		const after = approve(state, proposalId);
		const item = Object.values(after.content.items).find(
			(i) => i.title === 'Find the drowned crown',
		)!;
		expect(item.fields[VAULT_OBJECT_SUBTYPE_KEY]).toBe('quest');
		expect(item.visibility).toBe('dm-only');
	});
});

describe('faction.create — staged faction dossier', () => {
	it('stages the mapped faction fields and approval yields a dm-only dossier', () => {
		const { state, proposalId } = stage(seedAgent(), 'faction.create', {
			name: 'The Fen Circle',
			kind: 'cult',
			stance: 'hostile',
			leader: 'Mother Grell',
			goals: ['Drown the reeve', 'Wake the crown'],
			secret: 'Mother Grell is already dead.',
			body: 'Founded after the flood.',
		});
		const proposal = state.mcp.proposals[proposalId]!;
		expect(createContentItemInputSchema.safeParse(proposal.payload).success).toBe(true);
		const payload = proposal.payload as { title: string; fields: Record<string, unknown> };
		expect(payload.title).toBe('The Fen Circle');
		expect(payload.fields[VAULT_OBJECT_SUBTYPE_KEY]).toBe('faction');
		expect(payload.fields.stance).toBe('hostile');
		expect(payload.fields.secret).toBe('Mother Grell is already dead.');
		expect(payload).not.toHaveProperty('visibility');

		const after = approve(state, proposalId);
		const item = Object.values(after.content.items).find((i) => i.title === 'The Fen Circle')!;
		expect(item.visibility).toBe('dm-only');
	});
});

describe('map.poi.create — staged pin, layer resolved from actor-visible state', () => {
	function seedMap(): CoreStateSlice {
		const state = seedAgent();
		return { ...state, maps: createDemoMapState() };
	}

	it('resolves the layer, stages a dm-only pin, and approval places it', () => {
		const { state, proposalId } = stage(seedMap(), 'map.poi.create', {
			mapId: 'map-western-reaches',
			label: 'Watchtower',
			category: 'landmark',
			position: { x: 0.25, y: 0.3 },
			notes: 'Half-collapsed; a signal fire still burns.',
		});
		const proposal = state.mcp.proposals[proposalId]!;
		expect(createMapPoiInputSchema.safeParse(proposal.payload).success).toBe(true);
		const payload = proposal.payload as { layerId: string };
		expect(payload.layerId).not.toBe('');
		// No visibility ⇒ dm-only; no linkedEntity* ⇒ an agent cannot bind the pin to a vault entity.
		expect(proposal.payload).not.toHaveProperty('visibility');
		expect(proposal.payload).not.toHaveProperty('linkedEntityId');

		const after = approve(state, proposalId);
		const poi = after.maps.maps['map-western-reaches']!.pois.find((p) => p.label === 'Watchtower')!;
		expect(poi.position).toEqual({ x: 0.25, y: 0.3 });
		expect(poi.visibility).toBe('dm-only');
	});

	it('denies a map the agent cannot see with the SAME message a missing map produces (no probe)', () => {
		const seeded = seedMap();
		const missing = deniedCall(seeded, 'map.poi.create', {
			mapId: 'map-does-not-exist',
			label: 'Nowhere',
			position: { x: 0.5, y: 0.5 },
		});
		// Bind the agent to the PLAYER actor: the demo map's layers are not all player-visible, so a
		// player-scoped agent resolves nothing on a dm-only map.
		let playerScoped = accepted(
			dispatchCommand(seeded, env, {
				type: 'mcp.set-agent-binding',
				actorId: DM_ACTOR.id,
				payload: { agentId: 'agent-dm', actorId: PLAYER_ACTOR.id, label: 'bot' },
			}),
		).nextState;
		playerScoped = {
			...playerScoped,
			maps: {
				...playerScoped.maps,
				maps: {
					...playerScoped.maps.maps,
					'map-western-reaches': {
						...playerScoped.maps.maps['map-western-reaches']!,
						visibility: 'dm-only',
					},
				},
			},
		};
		const hidden = deniedCall(playerScoped, 'map.poi.create', {
			mapId: 'map-western-reaches',
			label: 'Watchtower',
			position: { x: 0.25, y: 0.3 },
		});
		expect(hidden.reason).toBe(missing.reason);
		expect(hidden.message).toBe(missing.message);
	});
});

describe('scene.card.update — staged revision of an existing card', () => {
	it('stages presentation fields only and approval applies them', () => {
		let state = seedAgent();
		const created = accepted(
			dispatchCommand(state, env, {
				type: 'scene-card.create',
				actorId: DM_ACTOR.id,
				payload: { title: 'The Sunken Tavern', mood: 'social' },
			}),
		);
		state = created.nextState;
		const event = created.events.find((e) => e.kind === 'scene-card.created');
		if (!event || event.kind !== 'scene-card.created') throw new Error('no card id');

		const staged = stage(state, 'scene.card.update', {
			cardId: event.cardId,
			mood: 'mystery',
			flavorText: 'Rain drums on the tin roof; nobody meets your eye.',
		});
		const proposal = staged.state.mcp.proposals[staged.proposalId]!;
		expect(updateSceneCardInputSchema.safeParse(proposal.payload).success).toBe(true);
		// An agent cannot bind vault assets, and a revision can never change who may see the card.
		expect(proposal.payload).not.toHaveProperty('heroImage');
		expect(proposal.payload).not.toHaveProperty('audioAssociationId');
		expect(proposal.payload).not.toHaveProperty('visibility');

		const after = approve(staged.state, staged.proposalId);
		const card = after.session.sceneCards.cards[event.cardId]!;
		expect(card.mood).toBe('mystery');
		expect(card.flavorText).toBe('Rain drums on the tin roof; nobody meets your eye.');
		expect(card.visibility).toBe('dm-only');
	});
});

describe('note.append — adds to a note instead of replacing it', () => {
	it('stages the CURRENT body plus the new section and approval keeps the original prose', () => {
		const seeded = seedNote(seedAgent(), 'Session 4', 'The party crossed the fen.');
		const staged = stage(seeded.state, 'note.append', {
			itemId: seeded.itemId,
			heading: 'Aftermath',
			text: 'They met the Fen Circle at dusk.',
		});
		const proposal = staged.state.mcp.proposals[staged.proposalId]!;
		expect(updateContentItemInputSchema.safeParse(proposal.payload).success).toBe(true);
		const payload = proposal.payload as { body: string; baseRevision: number };
		expect(payload.body).toBe(
			'The party crossed the fen.\n\n## Aftermath\n\nThey met the Fen Circle at dusk.',
		);
		expect(payload.baseRevision).toBe(
			contentItemById(seeded.state.content, seeded.itemId)!.revision,
		);
		expect(proposal.payload).not.toHaveProperty('title');
		expect(proposal.payload).not.toHaveProperty('fields');

		const after = approve(staged.state, staged.proposalId);
		const item = contentItemById(after.content, seeded.itemId)!;
		expect(item.body.startsWith('The party crossed the fen.')).toBe(true);
		expect(item.body).toContain('They met the Fen Circle at dusk.');
	});

	it('appends without a heading when none is given', () => {
		const seeded = seedNote(seedAgent(), 'Session 5', 'First line.');
		const staged = stage(seeded.state, 'note.append', {
			itemId: seeded.itemId,
			text: 'Second line.',
		});
		const payload = staged.state.mcp.proposals[staged.proposalId]!.payload as { body: string };
		expect(payload.body).toBe('First line.\n\nSecond line.');
	});

	it('records a conflict rather than clobbering a human edit made after staging', () => {
		const seeded = seedNote(seedAgent(), 'Session 6', 'original');
		const staged = stage(seeded.state, 'note.append', {
			itemId: seeded.itemId,
			text: 'agent addition',
		});
		const baseRevision = contentItemById(seeded.state.content, seeded.itemId)!.revision;
		const humanEdit = accepted(
			dispatchCommand(staged.state, env, {
				type: 'content.update-item',
				actorId: DM_ACTOR.id,
				payload: { itemId: seeded.itemId, baseRevision, body: 'newer human edit' },
			}),
		);
		const after = approve(humanEdit.nextState, staged.proposalId);

		expect(contentItemById(after.content, seeded.itemId)!.body).toBe('newer human edit');
		expect(
			after.sync.operations.some((operation) => operation.opType === 'content.item-conflict'),
		).toBe(true);
	});

	it('denies a note the agent cannot see exactly like a missing one (no existence probe)', () => {
		const seeded = seedNote(seedAgent(), 'Secret plans', 'The reeve is a doppelganger.');
		const missing = deniedCall(seeded.state, 'note.append', {
			itemId: 'item-does-not-exist',
			text: 'nope',
		});
		// The same call, bound to the PLAYER actor: the note is dm-only, so it resolves to nothing.
		const playerScoped = accepted(
			dispatchCommand(seeded.state, env, {
				type: 'mcp.set-agent-binding',
				actorId: DM_ACTOR.id,
				payload: { agentId: 'agent-dm', actorId: PLAYER_ACTOR.id, label: 'bot' },
			}),
		).nextState;
		const hidden = deniedCall(playerScoped, 'note.append', {
			itemId: seeded.itemId,
			text: 'nope',
		});
		expect(hidden.reason).toBe(missing.reason);
		expect(hidden.message).toBe(missing.message);
	});
});
