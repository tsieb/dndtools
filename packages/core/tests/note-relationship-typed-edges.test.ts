import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	computeTypedRelationshipEdges,
	dispatchCommand,
	getTypedRelationshipEdgesForActor,
	parseRelationDeclarations,
	serializeRelationDeclaration,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type NoteRelationshipRecord,
} from '../src';

/**
 * RC-KNW-3.3 — the RELATIONSHIP EDITOR's typed-edge engine: `relations:` front-matter declarations
 * resolved into a graph of typed edges (faction↔NPC, NPC↔location, or any other authored pair), built
 * entirely on the SAME actor-visible note set GRAPH-002 uses. Tests are the primary evidence: the pure
 * parser + engine (fail-closed on an unresolved/hidden target, dedup, deterministic order) and the
 * actor-filtered query path (a hidden source/target note never contributes an edge).
 */

function base(...actors: Actor[]): CoreStateSlice {
	return buildInitialState(...actors);
}

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

function cmd(type: CoreCommand['type'], payload: unknown, actorId = DM_ACTOR.id): CoreCommand {
	return { type, actorId, payload } as CoreCommand;
}

function createNote(
	state: CoreStateSlice,
	env: CoreEnvironment,
	payload: Record<string, unknown>,
	actorId = DM_ACTOR.id,
): { state: CoreStateSlice; id: string } {
	const result = accepted(
		dispatchCommand(state, env, cmd('content.create-item', { kind: 'note', ...payload }, actorId)),
	);
	const id = (result.events[0] as { itemId: string }).itemId;
	return { state: result.nextState, id };
}

function record(
	overrides: Partial<NoteRelationshipRecord> & Pick<NoteRelationshipRecord, 'id' | 'title'>,
): NoteRelationshipRecord {
	return {
		aliases: [],
		sectionAnchors: [],
		body: '',
		snippetable: true,
		relations: [],
		...overrides,
	};
}

describe('parseRelationDeclarations', () => {
	it('parses the `<verb> :: <target>` grammar, lowercasing the verb and trimming both sides', () => {
		expect(parseRelationDeclarations(['Leads ::  Marrow Vane  '])).toEqual([
			{ verb: 'leads', targetName: 'Marrow Vane' },
		]);
	});

	it('skips a line missing the separator, an empty verb, or an empty target rather than throwing', () => {
		expect(parseRelationDeclarations(['no separator here', ' :: Nameless', 'ally-of :: '])).toEqual(
			[],
		);
	});

	it('round-trips through serializeRelationDeclaration', () => {
		const declaration = { verb: 'located-in', targetName: 'The Sunken Crypt' };
		expect(parseRelationDeclarations([serializeRelationDeclaration(declaration)])).toEqual([
			declaration,
		]);
	});
});

describe('computeTypedRelationshipEdges', () => {
	it('resolves a declaration against a visible title or alias into one typed edge', () => {
		const faction = record({
			id: 'faction-1',
			title: 'The Ashen Hand',
			relations: [{ verb: 'leads', targetName: 'marrow vane' }],
		});
		const npc = record({ id: 'npc-1', title: 'Marrow Vane', aliases: ['The Hollow King'] });
		const edges = computeTypedRelationshipEdges([faction, npc]);
		expect(edges).toEqual([
			{
				sourceId: 'faction-1',
				sourceTitle: 'The Ashen Hand',
				verb: 'leads',
				targetId: 'npc-1',
				targetTitle: 'Marrow Vane',
			},
		]);
	});

	it('drops a declaration whose target does not resolve to any visible record (fail closed)', () => {
		const faction = record({
			id: 'faction-1',
			title: 'The Ashen Hand',
			relations: [{ verb: 'leads', targetName: 'Nobody Here' }],
		});
		expect(computeTypedRelationshipEdges([faction])).toEqual([]);
	});

	it('drops a self-edge (a note declaring a relationship to itself)', () => {
		const faction = record({
			id: 'faction-1',
			title: 'The Ashen Hand',
			relations: [{ verb: 'rules', targetName: 'The Ashen Hand' }],
		});
		expect(computeTypedRelationshipEdges([faction])).toEqual([]);
	});

	it('dedupes a (source, verb, target) triple declared twice', () => {
		const faction = record({
			id: 'faction-1',
			title: 'The Ashen Hand',
			relations: [
				{ verb: 'leads', targetName: 'Marrow Vane' },
				{ verb: 'leads', targetName: 'Marrow Vane' },
			],
		});
		const npc = record({ id: 'npc-1', title: 'Marrow Vane' });
		expect(computeTypedRelationshipEdges([faction, npc])).toHaveLength(1);
	});

	it('sorts deterministically by source title, verb, then target title', () => {
		const a = record({
			id: 'a',
			title: 'Zephyr Company',
			relations: [{ verb: 'enemy-of', targetName: 'The Ashen Hand' }],
		});
		const b = record({
			id: 'b',
			title: 'The Ashen Hand',
			relations: [{ verb: 'allied-with', targetName: 'Zephyr Company' }],
		});
		const edges = computeTypedRelationshipEdges([a, b]);
		expect(edges.map((e) => e.sourceTitle)).toEqual(['The Ashen Hand', 'Zephyr Company']);
	});
});

describe('getTypedRelationshipEdgesForActor', () => {
	const PLAYER_B = { id: 'actor-player-b', role: 'player' as const, displayName: 'Player B' };

	it('surfaces a typed edge declared through the real content.update-item write path', () => {
		const env: CoreEnvironment = makeEnvironment();
		let state = base(DM_ACTOR, PLAYER_ACTOR, PLAYER_B, OBSERVER_ACTOR);
		let created = createNote(state, env, { title: 'Marrow Vane', body: 'An NPC.' });
		state = created.state;
		const npcId = created.id;
		created = createNote(state, env, { title: 'The Ashen Hand', body: 'A faction.' });
		state = created.state;
		const factionId = created.id;

		const update = accepted(
			dispatchCommand(
				state,
				env,
				cmd('content.update-item', {
					itemId: factionId,
					body: '---\nrelations:\n  - leads :: Marrow Vane\n---\n\nA faction.',
				}),
			),
		);
		state = update.nextState;

		const edges = getTypedRelationshipEdgesForActor(state.content, state.permissions, DM_ACTOR.id);
		expect(edges).toEqual([
			{
				sourceId: factionId,
				sourceTitle: 'The Ashen Hand',
				verb: 'leads',
				targetId: npcId,
				targetTitle: 'Marrow Vane',
			},
		]);
	});

	it('drops an edge whose target is a DM-only note when read as a player (no leak)', () => {
		const env: CoreEnvironment = makeEnvironment();
		let state = base(DM_ACTOR, PLAYER_ACTOR, PLAYER_B, OBSERVER_ACTOR);
		let created = createNote(state, env, {
			title: 'The Sunken Crypt — DM notes',
			body: 'Secret.',
			visibility: 'dm-only',
		});
		state = created.state;
		created = createNote(state, env, {
			title: 'Marrow Vane',
			body: '---\nrelations:\n  - located-in :: The Sunken Crypt — DM notes\n---\n\nAn NPC.',
			visibility: 'player-visible',
		});
		state = created.state;

		const dmEdges = getTypedRelationshipEdgesForActor(
			state.content,
			state.permissions,
			DM_ACTOR.id,
		);
		expect(dmEdges).toHaveLength(1);

		const playerEdges = getTypedRelationshipEdgesForActor(
			state.content,
			state.permissions,
			PLAYER_ACTOR.id,
		);
		expect(playerEdges).toEqual([]);
	});

	it('returns an empty graph for an unknown actor (fail closed)', () => {
		const state = base(DM_ACTOR, PLAYER_ACTOR, PLAYER_B, OBSERVER_ACTOR);
		expect(getTypedRelationshipEdgesForActor(state.content, state.permissions, 'nobody')).toEqual(
			[],
		);
	});
});
