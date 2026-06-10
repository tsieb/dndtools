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
	getCharacterForActor,
	invokeMcpTool,
	listCharactersForActor,
	type CommandResult,
	type CoreStateSlice,
	type McpToolResult,
} from '../src';

/**
 * MCP-004 — MCP READ AND WRITE TOOLS USE PROCESSING CORE QUERIES AND COMMANDS, so visibility,
 * permission, schema, revision, and sync policies are enforced CENTRALLY. These tests prove the two
 * acceptance criteria with HARD assertions, plus the adversarial cases the epic demands:
 *
 *   - AC1: an MCP tool reading character data as a non-DM actor gets hidden fields OMITTED BY THE
 *     DATA LAYER (the tool returns exactly what the actor-filtered query returns — never more).
 *   - AC2: an MCP write command that fails schema validation accepts NO staged or direct durable
 *     mutation (no op appended, no state change).
 *
 *   - PRIVILEGE ESCALATION: a player-scoped agent cannot invoke a DM-only command (the bound command
 *     rejects it through the SAME dispatch a human player hits) and cannot publish content to players.
 *   - EXFILTRATION: a player-scoped agent reading character/notes never receives dm-only data; a
 *     hidden entity is absent, not redacted-but-listed.
 *   - FORGED ACTOR / TOOL ID: an unregistered actor or an unknown tool is denied fail-closed BEFORE
 *     any query/command runs, with a generic message that leaks nothing.
 */

const env = makeEnvironment();

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

/**
 * Seed a vault with: a DM-authored `dm-only` NPC carrying a dm-only field, a player-visible PC, a
 * `dm-only` note, and a `player-visible` note. Returns the state plus the seeded ids.
 */
function seedVault(): {
	state: CoreStateSlice;
	hiddenNpcId: string;
	playerPcId: string;
	dmOnlyNoteId: string;
	playerNoteId: string;
} {
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);

	// A DM-only NPC with a dm-only secret field.
	let result = accepted(
		dispatchCommand(state, env, {
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: {
				kind: 'npc',
				name: 'Hidden Villain',
				visibility: 'dm-only',
				data: { secretWeakness: 'fire' },
				dmOnlyFields: ['data.secretWeakness'],
			},
		}),
	);
	state = result.nextState;
	const hiddenNpcId = Object.keys(state.characters.characters).find(
		(id) => state.characters.characters[id]!.name === 'Hidden Villain',
	)!;

	// A player-visible character with a dm-only field (so a player sees the character but not the secret).
	result = accepted(
		dispatchCommand(state, env, {
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: {
				kind: 'npc',
				name: 'Visible Hero',
				visibility: 'player-visible',
				data: { publicBio: 'A hero', dmSecret: 'is actually a spy' },
				dmOnlyFields: ['data.dmSecret'],
			},
		}),
	);
	state = result.nextState;
	const playerPcId = Object.keys(state.characters.characters).find(
		(id) => state.characters.characters[id]!.name === 'Visible Hero',
	)!;

	// A dm-only note and a player-visible note.
	result = accepted(
		dispatchCommand(state, env, {
			type: 'content.create-item',
			actorId: DM_ACTOR.id,
			payload: { kind: 'note', title: 'Secret Plot', body: 'The twist', visibility: 'dm-only' },
		}),
	);
	state = result.nextState;
	const dmOnlyNoteId = Object.values(state.content.items).find((i) => i.title === 'Secret Plot')!.id;

	result = accepted(
		dispatchCommand(state, env, {
			type: 'content.create-item',
			actorId: DM_ACTOR.id,
			payload: { kind: 'note', title: 'Town Notice', body: 'Public', visibility: 'player-visible' },
		}),
	);
	state = result.nextState;
	const playerNoteId = Object.values(state.content.items).find((i) => i.title === 'Town Notice')!.id;

	return { state, hiddenNpcId, playerPcId, dmOnlyNoteId, playerNoteId };
}

const baseInvocation = { agentId: 'agent-claude', input: {} } as const;

describe('MCP-004 AC1 — read tools omit hidden fields/entities by the data layer', () => {
	it('character.query as a player returns exactly the actor-filtered roster (hidden NPC omitted)', () => {
		const { state, hiddenNpcId } = seedVault();
		const registry = createBaselineMcpToolRegistry();

		const result = readOk(
			invokeMcpTool(state, env, registry, {
				...baseInvocation,
				toolId: 'character.query',
				actorId: PLAYER_ACTOR.id,
			}),
		);

		// The tool result IS the actor-filtered query result — never more.
		expect(result.data).toEqual(listCharactersForActor(state.characters, state.permissions, PLAYER_ACTOR.id));
		const names = (result.data as Array<{ id: string; name: string }>).map((c) => c.name);
		expect(names).toContain('Visible Hero');
		expect(names).not.toContain('Hidden Villain'); // dm-only NPC is OMITTED ENTIRELY
		expect((result.data as Array<{ id: string }>).some((c) => c.id === hiddenNpcId)).toBe(false);
	});

	it('character.query strips a dm-only field from a player-visible character for a player', () => {
		const { state, playerPcId } = seedVault();
		const registry = createBaselineMcpToolRegistry();

		const result = readOk(
			invokeMcpTool(state, env, registry, {
				...baseInvocation,
				toolId: 'character.query',
				actorId: PLAYER_ACTOR.id,
			}),
		);
		const hero = (result.data as Array<{ id: string; data: Record<string, unknown> }>).find(
			(c) => c.id === playerPcId,
		)!;
		expect(hero.data.publicBio).toBe('A hero');
		expect('dmSecret' in hero.data).toBe(false); // dm-only field stripped by the data layer
	});

	it('character.query as the DM sees the hidden NPC and its dm-only field', () => {
		const { state, hiddenNpcId } = seedVault();
		const registry = createBaselineMcpToolRegistry();

		const result = readOk(
			invokeMcpTool(state, env, registry, {
				...baseInvocation,
				toolId: 'character.query',
				actorId: DM_ACTOR.id,
			}),
		);
		const villain = (result.data as Array<{ id: string; data: Record<string, unknown> }>).find(
			(c) => c.id === hiddenNpcId,
		)!;
		expect(villain).toBeDefined();
		expect(villain.data.secretWeakness).toBe('fire'); // DM bypasses visibility by role
	});

	it('the read tool returns IDENTICALLY to the underlying query (no MCP side-channel widens it)', () => {
		const { state, hiddenNpcId } = seedVault();
		const registry = createBaselineMcpToolRegistry();

		// A direct query and the MCP tool must agree exactly for the SAME actor — the agent gets no more.
		const direct = getCharacterForActor(state.characters, state.permissions, PLAYER_ACTOR.id, hiddenNpcId);
		expect(direct).toBeNull(); // player cannot read the hidden NPC directly
		const viaTool = readOk(
			invokeMcpTool(state, env, registry, {
				...baseInvocation,
				toolId: 'character.query',
				actorId: PLAYER_ACTOR.id,
			}),
		);
		expect((viaTool.data as Array<{ id: string }>).some((c) => c.id === hiddenNpcId)).toBe(false);
	});

	it('note.read of a dm-only note as a player returns a non-visible detail (no body/title leak)', () => {
		const { state, dmOnlyNoteId } = seedVault();
		const registry = createBaselineMcpToolRegistry();

		const result = readOk(
			invokeMcpTool(state, env, registry, {
				...baseInvocation,
				toolId: 'note.read',
				actorId: PLAYER_ACTOR.id,
				input: { entityId: dmOnlyNoteId },
			}),
		);
		// After fix: hidden entity is indistinguishable from not-found — no title/body/id/visibility
		// leaks to an MCP agent acting as a player (PERM-002 AC1 + "existence not probeable by id").
		// PERM-010 AC2: the MCP response strips `accessDenialAudit` so the DM-facing denial reason
		// (`not-visible`) is never exposed to a player-scoped agent.
		const detail = result.data as { visible: boolean; reason?: string };
		expect(detail.visible).toBe(false);
		expect(detail.reason).toBe('hidden');
		expect('title' in detail).toBe(false);
		expect('body' in detail).toBe(false);
		expect('id' in detail).toBe(false);
		expect('visibility' in detail).toBe(false);
		// The audit record must NOT be in the MCP response data (DM-facing only).
		expect('accessDenialAudit' in detail).toBe(false);
	});

	it('vault.summary / note.list as a player omit the dm-only note entirely', () => {
		const { state, dmOnlyNoteId, playerNoteId } = seedVault();
		const registry = createBaselineMcpToolRegistry();

		for (const toolId of ['vault.summary', 'note.list'] as const) {
			const result = readOk(
				invokeMcpTool(state, env, registry, { ...baseInvocation, toolId, actorId: PLAYER_ACTOR.id }),
			);
			const ids = (result.data as Array<{ id: string }>).map((i) => i.id);
			expect(ids).toContain(playerNoteId);
			expect(ids).not.toContain(dmOnlyNoteId); // exfiltration blocked: hidden note omitted
		}
	});
});

describe('MCP-004 AC2 — a write that fails schema validation accepts no durable mutation', () => {
	it('note.create with invalid input is denied; no op appended, state unchanged', () => {
		const { state } = seedVault();
		const registry = createBaselineMcpToolRegistry();
		const opsBefore = state.sync.operations.length;

		const result = invokeMcpTool(state, env, registry, {
			...baseInvocation,
			toolId: 'note.create',
			actorId: DM_ACTOR.id,
			input: { title: '' }, // empty title fails the tool schema (min length 1)
		});

		expect(result.status).toBe('denied');
		if (result.status !== 'denied') throw new Error('expected denial');
		expect(result.reason).toBe('invalid-input');
		expect((result.issues?.length ?? 0)).toBeGreaterThan(0);
		// No durable mutation — the dispatch was never reached.
		expect(state.sync.operations.length).toBe(opsBefore);
	});

	it('a valid note.create as the DM dispatches the command and appends a durable op', () => {
		const { state } = seedVault();
		const registry = createBaselineMcpToolRegistry();
		const itemsBefore = Object.keys(state.content.items).length;

		const result = invokeMcpTool(state, env, registry, {
			...baseInvocation,
			toolId: 'note.create',
			actorId: DM_ACTOR.id,
			input: { title: 'Agent Note', body: 'drafted by the agent' },
		});

		expect(result.status).toBe('write');
		if (result.status !== 'write') throw new Error('expected write');
		const cmd = accepted(result.commandResult);
		expect(cmd.operationIds.length).toBeGreaterThan(0); // went through op-logging
		expect(Object.keys(cmd.nextState.content.items).length).toBe(itemsBefore + 1);
		// Fail-closed visibility: the agent did NOT supply a visibility, so the new note defaults dm-only.
		const created = Object.values(cmd.nextState.content.items).find((i) => i.title === 'Agent Note')!;
		expect(created.visibility).toBe('dm-only');
	});
});

describe('MCP-004 — privilege escalation is blocked through the same dispatch a human hits', () => {
	it('a player-scoped agent cannot create a note (the bound command is DM-only)', () => {
		const { state } = seedVault();
		const registry = createBaselineMcpToolRegistry();

		const result = invokeMcpTool(state, env, registry, {
			...baseInvocation,
			toolId: 'note.create',
			actorId: PLAYER_ACTOR.id,
			input: { title: 'Sneaky', body: 'should be rejected' },
		});

		// The schema passes, so it reaches dispatch — which REJECTS the player exactly as for a human.
		expect(result.status).toBe('write');
		if (result.status !== 'write') throw new Error('expected write');
		expect(result.commandResult.status).toBe('rejected');
		if (result.commandResult.status !== 'rejected') throw new Error('expected rejection');
		expect(result.commandResult.rejection.code).toBe('actor-not-authorized');
	});

	it('an observer-scoped agent is rejected by the dispatch observer write-gate', () => {
		const { state } = seedVault();
		const registry = createBaselineMcpToolRegistry();

		const result = invokeMcpTool(state, env, registry, {
			...baseInvocation,
			toolId: 'note.create',
			actorId: OBSERVER_ACTOR.id,
			input: { title: 'Observer write', body: 'nope' },
		});
		expect(result.status).toBe('write');
		if (result.status !== 'write') throw new Error('expected write');
		expect(result.commandResult.status).toBe('rejected');
		if (result.commandResult.status !== 'rejected') throw new Error('expected rejection');
		expect(result.commandResult.rejection.code).toBe('actor-not-authorized');
	});
});

describe('MCP-004 — forged / under-scoped actor and unknown tool fail closed', () => {
	it('an unregistered (forged) actor is denied before any query runs, with a generic message', () => {
		const { state } = seedVault();
		const registry = createBaselineMcpToolRegistry();

		const result = invokeMcpTool(state, env, registry, {
			...baseInvocation,
			toolId: 'character.query',
			actorId: 'actor-forged-9999',
		});
		expect(result.status).toBe('denied');
		if (result.status !== 'denied') throw new Error('expected denial');
		expect(result.reason).toBe('unknown-actor');
		// Generic message — reveals nothing about what exists.
		expect(result.message).not.toContain('Hidden');
	});

	it('an unknown tool id is denied before anything runs', () => {
		const { state } = seedVault();
		const registry = createBaselineMcpToolRegistry();

		const result = invokeMcpTool(state, env, registry, {
			...baseInvocation,
			toolId: 'vault.exfiltrate-everything',
			actorId: DM_ACTOR.id,
		});
		expect(result.status).toBe('denied');
		if (result.status !== 'denied') throw new Error('expected denial');
		expect(result.reason).toBe('unknown-tool');
	});

	it('a forged actor cannot reach a write either (denied before dispatch, no op)', () => {
		const { state } = seedVault();
		const registry = createBaselineMcpToolRegistry();
		const opsBefore = state.sync.operations.length;

		const result = invokeMcpTool(state, env, registry, {
			...baseInvocation,
			toolId: 'note.create',
			actorId: 'actor-forged-write',
			input: { title: 'forged', body: 'x' },
		});
		expect(result.status).toBe('denied');
		if (result.status !== 'denied') throw new Error('expected denial');
		expect(result.reason).toBe('unknown-actor');
		expect(state.sync.operations.length).toBe(opsBefore);
	});
});

describe('MCP-004 — determinism', () => {
	it('the same invocation yields the same result envelope', () => {
		const { state } = seedVault();
		const registry = createBaselineMcpToolRegistry();
		const invocation = { ...baseInvocation, toolId: 'note.list', actorId: PLAYER_ACTOR.id } as const;
		const a = invokeMcpTool(state, env, registry, invocation);
		const b = invokeMcpTool(state, env, registry, invocation);
		expect(a).toEqual(b);
	});
});
