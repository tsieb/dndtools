import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	computeNoteRelationships,
	dispatchCommand,
	getNoteRelationshipsForActor,
	noteSectionAnchors,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type NoteRelationshipRecord,
} from '../src';

/**
 * GRAPH-002 — BACKLINKS, CROSS-SECTION links, and RELATED-NOTE jumps with visibility-redacted snippets,
 * ACTOR-FILTERED and fail-closed. Tests are the primary evidence. Both the pure engine and the
 * actor-filtered query path are covered, including the hidden-source non-leak (AC2), the hidden-target
 * fail-closed degrade, and the section-redacted snippet guard.
 */

const PLAYER_B: Actor = { id: 'actor-player-b', role: 'player', displayName: 'Player B' };

function base(...actors: Actor[]): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_B, OBSERVER_ACTOR, ...actors);
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
		...overrides,
	};
}

// --- The PURE engine (deterministic functions of explicit records) -----------------------------------

describe('GRAPH-002 — pure engine: backlinks', () => {
	it('finds visible notes that link TO the target, with a context snippet (AC1)', () => {
		const records: NoteRelationshipRecord[] = [
			record({ id: 'n-target', title: 'Highmoor' }),
			record({
				id: 'n-a',
				title: 'Quest Log',
				body: 'The party marched toward [[Highmoor]] at dawn.',
			}),
			record({ id: 'n-b', title: 'Bane', body: 'No link here.' }),
		];
		const result = computeNoteRelationships('n-target', records);
		expect(result.backlinks).toHaveLength(1);
		const backlink = result.backlinks[0]!;
		expect(backlink.sourceId).toBe('n-a');
		expect(backlink.sourceTitle).toBe('Quest Log');
		expect(backlink.crossSection).toEqual({ status: 'none' });
		expect(backlink.snippet).toContain('marched toward');
		expect(backlink.snippet).toContain('[[Highmoor]]');
	});

	it('matches backlinks through the target ALIAS, case-insensitively', () => {
		const records: NoteRelationshipRecord[] = [
			record({ id: 'n-target', title: 'Highmoor', aliases: ['The Keep'] }),
			record({ id: 'n-a', title: 'Map Notes', body: 'See [[the keep]] for defenses.' }),
		];
		const result = computeNoteRelationships('n-target', records);
		expect(result.backlinks.map((b) => b.sourceId)).toEqual(['n-a']);
	});

	it('dedupes multiple links from one source to a single backlink (first occurrence supplies the snippet)', () => {
		const records: NoteRelationshipRecord[] = [
			record({ id: 'n-target', title: 'Highmoor' }),
			record({
				id: 'n-a',
				title: 'Quest Log',
				body: 'Go to [[Highmoor]] then return to [[Highmoor]] again.',
			}),
		];
		const result = computeNoteRelationships('n-target', records);
		expect(result.backlinks).toHaveLength(1);
		expect(result.backlinks[0]!.snippet).toContain('Go to');
	});

	it('orders backlinks deterministically by source title then id', () => {
		const records: NoteRelationshipRecord[] = [
			record({ id: 'n-target', title: 'Highmoor' }),
			record({ id: 'n-z', title: 'Zephyr', body: '[[Highmoor]]' }),
			record({ id: 'n-a', title: 'Alpha', body: '[[Highmoor]]' }),
			record({ id: 'n-m', title: 'Mid', body: '[[Highmoor]]' }),
		];
		const result = computeNoteRelationships('n-target', records);
		expect(result.backlinks.map((b) => b.sourceTitle)).toEqual(['Alpha', 'Mid', 'Zephyr']);
	});

	it('a target with no inbound links has no backlinks', () => {
		const records: NoteRelationshipRecord[] = [record({ id: 'n-target', title: 'Lonely' })];
		expect(computeNoteRelationships('n-target', records).backlinks).toEqual([]);
	});
});

describe('GRAPH-002 — pure engine: cross-section links', () => {
	it('resolves a [[Target#Section]] backlink to the target heading anchor', () => {
		const records: NoteRelationshipRecord[] = [
			record({ id: 'n-target', title: 'Highmoor', sectionAnchors: noteSectionAnchors('# History\n## Defenses') }),
			record({ id: 'n-a', title: 'Lore', body: 'See [[Highmoor#Defenses]].' }),
		];
		const result = computeNoteRelationships('n-target', records);
		expect(result.backlinks[0]!.crossSection).toEqual({
			status: 'resolved',
			anchor: 'defenses',
			label: 'Defenses',
		});
	});

	it('reports a named section the target LACKS as section-missing (graceful degrade, still navigable)', () => {
		const records: NoteRelationshipRecord[] = [
			record({ id: 'n-target', title: 'Highmoor', sectionAnchors: ['history'] }),
			record({ id: 'n-a', title: 'Lore', body: 'See [[Highmoor#Vaults]].' }),
		];
		const result = computeNoteRelationships('n-target', records);
		expect(result.backlinks[0]!.crossSection).toEqual({ status: 'section-missing', label: 'Vaults' });
	});
});

describe('GRAPH-002 — pure engine: related-note jumps', () => {
	it('finds the visible notes the TARGET links TO (forward edges), deduped + sorted', () => {
		const records: NoteRelationshipRecord[] = [
			record({
				id: 'n-target',
				title: 'Hub',
				body: 'Links to [[Zephyr]], [[Alpha]], and [[Alpha]] again.',
			}),
			record({ id: 'n-z', title: 'Zephyr' }),
			record({ id: 'n-a', title: 'Alpha' }),
			record({ id: 'n-x', title: 'Unlinked' }),
		];
		const result = computeNoteRelationships('n-target', records);
		expect(result.related.map((r) => r.relatedTitle)).toEqual(['Alpha', 'Zephyr']);
	});

	it('does not relate the target to itself via a self-link', () => {
		const records: NoteRelationshipRecord[] = [
			record({ id: 'n-target', title: 'Hub', body: 'A self ref [[Hub]].' }),
		];
		expect(computeNoteRelationships('n-target', records).related).toEqual([]);
	});

	it('a target absent from the visible set yields no relationships (defensive fail closed)', () => {
		const records: NoteRelationshipRecord[] = [record({ id: 'n-a', title: 'A', body: '[[Missing]]' })];
		expect(computeNoteRelationships('n-missing', records)).toEqual({
			targetId: 'n-missing',
			backlinks: [],
			related: [],
		});
	});
});

// --- The ACTOR-FILTERED query (visibility + tombstone choke-point) ------------------------------------

describe('GRAPH-002 — actor-filtered backlinks (AC1: visible backlinks + snippets appear)', () => {
	const env = makeEnvironment();

	it('a player opening a visible note sees the visible backlinks and context snippets', () => {
		let state = base();
		const target = createNote(state, env, { title: 'Highmoor', visibility: 'player-visible' });
		state = target.state;
		state = createNote(state, env, {
			title: 'Quest Log',
			visibility: 'player-visible',
			body: 'The heroes set out for [[Highmoor]] at first light.',
		}).state;

		const rel = getNoteRelationshipsForActor(state.content, state.permissions, PLAYER_ACTOR.id, target.id);
		expect(rel.backlinks).toHaveLength(1);
		expect(rel.backlinks[0]!.sourceTitle).toBe('Quest Log');
		expect(rel.backlinks[0]!.snippet).toContain('set out for');
	});

	it('surfaces THREE visible backlinks with snippets when three notes link to the target (AC1)', () => {
		let state = base();
		const target = createNote(state, env, { title: 'Highmoor', visibility: 'player-visible' });
		state = target.state;
		for (const title of ['Alpha', 'Beta', 'Gamma']) {
			state = createNote(state, env, {
				title,
				visibility: 'player-visible',
				body: `${title} mentions [[Highmoor]] in passing.`,
			}).state;
		}
		const rel = getNoteRelationshipsForActor(state.content, state.permissions, PLAYER_ACTOR.id, target.id);
		expect(rel.backlinks.map((b) => b.sourceTitle)).toEqual(['Alpha', 'Beta', 'Gamma']);
		expect(rel.backlinks.every((b) => b.snippet !== null)).toBe(true);
	});
});

describe('GRAPH-002 — actor-filtered backlinks (AC2: a hidden backlink source is absent)', () => {
	const env = makeEnvironment();

	it('a dm-only source that links to a visible target is absent for a player; present for the DM', () => {
		let state = base();
		const target = createNote(state, env, { title: 'Highmoor', visibility: 'player-visible' });
		state = target.state;
		state = createNote(state, env, {
			title: 'Secret Plot',
			visibility: 'dm-only',
			body: 'The villain hides in [[Highmoor]].',
		}).state;
		state = createNote(state, env, {
			title: 'Town Crier',
			visibility: 'player-visible',
			body: 'News from [[Highmoor]] reaches the square.',
		}).state;

		const playerRel = getNoteRelationshipsForActor(state.content, state.permissions, PLAYER_ACTOR.id, target.id);
		// Only the player-visible source appears — the dm-only source is OMITTED, not redacted (no leak).
		expect(playerRel.backlinks.map((b) => b.sourceTitle)).toEqual(['Town Crier']);

		const dmRel = getNoteRelationshipsForActor(state.content, state.permissions, DM_ACTOR.id, target.id);
		expect(dmRel.backlinks.map((b) => b.sourceTitle)).toEqual(['Secret Plot', 'Town Crier']);
	});

	it('a related-note jump never resolves to a hidden target (forward edge to a dm-only note is dropped)', () => {
		let state = base();
		state = createNote(state, env, { title: 'Vault', visibility: 'dm-only' }).state;
		const hub = createNote(state, env, {
			title: 'Hub',
			visibility: 'player-visible',
			body: 'A door to [[Vault]] and a path to [[Town]].',
		});
		state = hub.state;
		state = createNote(state, env, { title: 'Town', visibility: 'player-visible' }).state;

		const playerRel = getNoteRelationshipsForActor(state.content, state.permissions, PLAYER_ACTOR.id, hub.id);
		// The dm-only [[Vault]] forward edge is dropped for the player; only the visible [[Town]] jump remains.
		expect(playerRel.related.map((r) => r.relatedTitle)).toEqual(['Town']);
	});
});

describe('GRAPH-002 — fail closed at the TARGET (no probe of a hidden note)', () => {
	const env = makeEnvironment();

	it('relationships of a dm-only note return the generic empty set for a player (indistinguishable from none)', () => {
		let state = base();
		const target = createNote(state, env, { title: 'Hidden Lair', visibility: 'dm-only' });
		state = target.state;
		state = createNote(state, env, {
			title: 'Linker',
			visibility: 'player-visible',
			body: 'A rumor of [[Hidden Lair]].',
		}).state;

		const playerRel = getNoteRelationshipsForActor(state.content, state.permissions, PLAYER_ACTOR.id, target.id);
		expect(playerRel).toEqual({ targetId: target.id, backlinks: [], related: [] });
		// The DM can inspect the same target and DOES see the backlink — proving the player result is filtered.
		const dmRel = getNoteRelationshipsForActor(state.content, state.permissions, DM_ACTOR.id, target.id);
		expect(dmRel.backlinks.map((b) => b.sourceTitle)).toEqual(['Linker']);
	});

	it('an unknown/unauthenticated actor gets the generic empty set (fail closed)', () => {
		let state = base();
		const target = createNote(state, env, { title: 'Highmoor', visibility: 'player-visible' });
		state = target.state;
		const rel = getNoteRelationshipsForActor(state.content, state.permissions, 'ghost-actor', target.id);
		expect(rel).toEqual({ targetId: target.id, backlinks: [], related: [] });
	});

	it('a stale link to a now-DELETED target degrades gracefully (target absent ⇒ empty set, no crash)', () => {
		let state = base();
		const target = createNote(state, env, { title: 'Highmoor', visibility: 'player-visible' });
		state = target.state;
		state = createNote(state, env, {
			title: 'Quest Log',
			visibility: 'player-visible',
			body: 'Onward to [[Highmoor]].',
		}).state;
		// Soft-delete the target: it leaves every actor-filtered read.
		state = accepted(
			dispatchCommand(state, env, cmd('content.remove-item', { itemId: target.id })),
		).nextState;

		const dmRel = getNoteRelationshipsForActor(state.content, state.permissions, DM_ACTOR.id, target.id);
		expect(dmRel).toEqual({ targetId: target.id, backlinks: [], related: [] });
	});
});

describe('GRAPH-002 — snippet redaction by SECTION visibility (never quote a hidden section)', () => {
	const env = makeEnvironment();

	it('a backlink from a partially-hidden source still appears, but WITHOUT a snippet (fail closed)', () => {
		let state = base();
		const target = createNote(state, env, { title: 'Highmoor', visibility: 'player-visible' });
		state = target.state;
		const source = createNote(state, env, {
			title: 'Field Report',
			visibility: 'player-visible',
			body: 'Public intro that links [[Highmoor]].',
		});
		state = source.state;
		// Author a dm-only SECTION override on the otherwise player-visible source note.
		state = accepted(
			dispatchCommand(
				state,
				env,
				cmd('content.set-section-visibility', {
					itemId: source.id,
					sectionId: 'classified',
					rule: { level: 'dm-only' },
				}),
			),
		).nextState;

		const playerRel = getNoteRelationshipsForActor(state.content, state.permissions, PLAYER_ACTOR.id, target.id);
		// The visible backlink still appears (AC1) — but its snippet is suppressed so no hidden section leaks.
		expect(playerRel.backlinks.map((b) => b.sourceTitle)).toEqual(['Field Report']);
		expect(playerRel.backlinks[0]!.snippet).toBeNull();

		// The DM sees the same backlink WITH its snippet (no redaction applies to the DM).
		const dmRel = getNoteRelationshipsForActor(state.content, state.permissions, DM_ACTOR.id, target.id);
		expect(dmRel.backlinks[0]!.snippet).toContain('[[Highmoor]]');
	});
});
