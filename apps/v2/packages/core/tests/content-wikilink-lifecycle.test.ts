import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	applyLinkRepair,
	buildWikilinkCandidatesForActor,
	contentItemById,
	createWikilink,
	detectBrokenLinks,
	detectBrokenLinksForActor,
	dispatchCommand,
	propagateRenameForActor,
	renamePropagateInBody,
	resolveWikilink,
	resolveWikilinkForActor,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type WikilinkTarget,
} from '../src';

/**
 * CONTENT-006 — the WIKILINK LIFECYCLE: create / resolve / rename-propagation / repair, ACTOR-FILTERED and
 * fail-closed, PRESERVING per-source conventions. Tests are the primary evidence. Both the pure engine and
 * the durable command path are covered, including the offline `source-unavailable` non-destructive guard.
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

function rejected(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	expect(result.status).toBe('rejected');
	if (result.status !== 'rejected') throw new Error('expected rejected');
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

const LOCAL = { source: 'local-markdown' as const, available: true };

function target(overrides: Partial<WikilinkTarget> & Pick<WikilinkTarget, 'id' | 'title'>): WikilinkTarget {
	return {
		aliases: [],
		sections: [],
		source: 'local-markdown',
		available: true,
		...overrides,
	};
}

describe('CONTENT-006 — RESOLVE (AC1: resolve note + section where available)', () => {
	const candidates: WikilinkTarget[] = [
		target({ id: 'n-1', title: 'Highmoor', aliases: ['The Keep'], sections: ['History', 'Defenses'] }),
		target({ id: 'n-2', title: 'Bane' }),
	];

	it('resolves [[Location#Section]] to the target note and section', () => {
		const res = resolveWikilink({ target: 'Highmoor', section: 'Defenses' }, candidates);
		expect(res).toEqual({ status: 'resolved', targetId: 'n-1', matchedSection: 'Defenses', sectionMissing: false });
	});

	it('resolves the note but flags a missing section (resolve where available)', () => {
		const res = resolveWikilink({ target: 'Highmoor', section: 'Nope' }, candidates);
		expect(res.status).toBe('resolved');
		if (res.status === 'resolved') {
			expect(res.targetId).toBe('n-1');
			expect(res.sectionMissing).toBe(true);
		}
	});

	it('resolves through an alias, case-insensitively', () => {
		expect(resolveWikilink({ target: 'the keep' }, candidates).status).toBe('resolved');
	});

	it('is unresolved for an unknown target', () => {
		expect(resolveWikilink({ target: 'Nowhere' }, candidates).status).toBe('unresolved');
	});
});

describe('CONTENT-006 — CREATE (preserve source conventions)', () => {
	it('renders a native [[...]] token for sources that preserve wikilinks', () => {
		expect(createWikilink({ target: 'Highmoor' }, 'local-markdown')).toBe('[[Highmoor]]');
		expect(createWikilink({ target: 'Highmoor', section: 'History', alias: 'the keep' }, 'obsidian')).toBe(
			'[[Highmoor#History|the keep]]',
		);
	});

	it('falls back to non-destructive plain text for a source that cannot represent wikilinks (Google Docs)', () => {
		expect(createWikilink({ target: 'Highmoor', alias: 'the keep' }, 'google-docs')).toBe('the keep');
		expect(createWikilink({ target: 'Highmoor' }, 'google-docs')).toBe('Highmoor');
	});
});

describe('CONTENT-006 — RENAME-PROPAGATION (deterministic, preserves section/alias)', () => {
	it('rewrites matching links while preserving #section, |alias, and surrounding text', () => {
		const body = 'See [[Highmoor]] and [[Highmoor#History|the keep]]; ignore [[Bane]].';
		const { body: next, rewritten } = renamePropagateInBody(body, 'Highmoor', 'Castle Highmoor');
		expect(rewritten).toBe(2);
		expect(next).toBe(
			'See [[Castle Highmoor]] and [[Castle Highmoor#History|the keep]]; ignore [[Bane]].',
		);
	});

	it('is idempotent — re-running with the same rename is a no-op', () => {
		const body = 'Link to [[Highmoor]].';
		const once = renamePropagateInBody(body, 'Highmoor', 'Castle Highmoor');
		const twice = renamePropagateInBody(once.body, 'Highmoor', 'Castle Highmoor');
		expect(twice.rewritten).toBe(0);
		expect(twice.body).toBe(once.body);
	});
});

describe('CONTENT-006 — REPAIR detection + apply (fail closed offline)', () => {
	const candidates: WikilinkTarget[] = [
		target({ id: 'n-1', title: 'Highmoor', sections: ['History'] }),
		target({ id: 'n-3', title: 'Old Ruins', source: 'google-docs', available: false }),
	];

	it('detects unresolved, missing-section, and source-unavailable broken links', () => {
		const body = '[[Highmoor]] [[Highmoor#Gone]] [[Nowhere]] [[Old Ruins]]';
		const broken = detectBrokenLinks(body, candidates);
		const reasons = broken.map((b) => b.reason).sort();
		expect(reasons).toEqual(['section-missing', 'source-unavailable', 'unresolved']);
	});

	it('repairs a broken link to a visible, available fix target', () => {
		const result = applyLinkRepair('Travel to [[Nowhere]].', 'Nowhere', 'Highmoor', candidates);
		expect(result.status).toBe('repaired');
		if (result.status === 'repaired') {
			expect(result.body).toBe('Travel to [[Highmoor]].');
			expect(result.rewritten).toBe(1);
		}
	});

	it('REFUSES to rewrite when the broken source is unavailable + uncached (AC3 — no destructive offline rewrite)', () => {
		const result = applyLinkRepair('See [[Old Ruins]].', 'Old Ruins', 'Highmoor', candidates);
		expect(result.status).toBe('source-unavailable');
	});

	it('REFUSES a fix that does not resolve to a visible, available target', () => {
		const result = applyLinkRepair('See [[Nowhere]].', 'Nowhere', 'Phantom', candidates);
		expect(result.status).toBe('fix-unresolved');
	});
});

describe('CONTENT-006 — actor-filtered resolution (never resolve/suggest a hidden target)', () => {
	const env = makeEnvironment();

	it('omits a dm-only note from a player candidate index, so it is unresolvable to that player', () => {
		let state = base();
		state = createNote(state, env, { title: 'Secret Lair', visibility: 'dm-only' }).state;
		state = createNote(state, env, { title: 'Town Square', visibility: 'player-visible' }).state;

		const dmCandidates = buildWikilinkCandidatesForActor(state.content, state.permissions, DM_ACTOR.id);
		expect(dmCandidates.map((c) => c.title).sort()).toEqual(['Secret Lair', 'Town Square']);

		const playerCandidates = buildWikilinkCandidatesForActor(
			state.content,
			state.permissions,
			PLAYER_ACTOR.id,
		);
		expect(playerCandidates.map((c) => c.title)).toEqual(['Town Square']);

		// The player can never resolve the hidden target (fail closed).
		expect(
			resolveWikilinkForActor(state.content, state.permissions, PLAYER_ACTOR.id, {
				target: 'Secret Lair',
			}).status,
		).toBe('unresolved');
		// The DM can.
		expect(
			resolveWikilinkForActor(state.content, state.permissions, DM_ACTOR.id, {
				target: 'Secret Lair',
			}).status,
		).toBe('resolved');
	});

	it('an unknown actor gets an empty candidate index (fail closed)', () => {
		const state = base();
		expect(buildWikilinkCandidatesForActor(state.content, state.permissions, 'ghost')).toEqual([]);
	});
});

describe('CONTENT-006 — durable rename command propagates across the actor-visible graph', () => {
	const env = makeEnvironment();

	it('renames a target note and rewrites every referring visible note (proves propagation)', () => {
		let state = base();
		const target1 = createNote(state, env, { title: 'Highmoor', body: '# Highmoor' });
		state = target1.state;
		const refA = createNote(state, env, {
			title: 'Travel Log',
			body: 'We marched to [[Highmoor]] at dawn.',
		});
		state = refA.state;
		const refB = createNote(state, env, {
			title: 'Lore',
			body: 'The keep [[Highmoor#History|Highmoor]] is ancient.',
		});
		state = refB.state;
		const targetId = target1.id;
		const refAId = refA.id;
		const refBId = refB.id;

		const result = accepted(
			dispatchCommand(
				state,
				env,
				cmd('content.rename-wikilink-target', { itemId: targetId, newTitle: 'Castle Highmoor' }),
			),
		);
		const event = result.events[0] as {
			kind: string;
			toTitle: string;
			rewrittenItemIds: string[];
			linksRewritten: number;
		};
		expect(event.kind).toBe('content.wikilink-target-renamed');
		expect(event.toTitle).toBe('Castle Highmoor');
		expect(event.linksRewritten).toBe(2);
		expect(event.rewrittenItemIds.sort()).toEqual([refAId, refBId].sort());

		// The target note title is renamed and the referring bodies are rewritten (section/alias preserved).
		expect(contentItemById(result.nextState.content, targetId)!.title).toBe('Castle Highmoor');
		expect(contentItemById(result.nextState.content, refAId)!.body).toContain('[[Castle Highmoor]]');
		expect(contentItemById(result.nextState.content, refBId)!.body).toContain(
			'[[Castle Highmoor#History|Highmoor]]',
		);
	});

	it('does not rename links inside a note the actor cannot see (fail closed)', () => {
		let state = base();
		const target1 = createNote(state, env, { title: 'Highmoor' });
		state = target1.state;
		// A dm-only referring note. A player rename (granted) must NOT read or rewrite it.
		const hidden = createNote(state, env, {
			title: 'DM Secret',
			body: 'Hidden link to [[Highmoor]].',
			visibility: 'dm-only',
		});
		state = hidden.state;
		const targetId = target1.id;
		const hiddenId = hidden.id;

		// The DM rename sees everything — confirm propagation includes the hidden note for the DM.
		const dmProp = propagateRenameForActor(
			state.content,
			state.permissions,
			DM_ACTOR.id,
			'Highmoor',
			'Castle Highmoor',
		);
		expect(dmProp.map((p) => p.itemId)).toContain(hiddenId);
		// A PLAYER's propagation never includes the hidden note (it is not in their candidate set).
		const playerProp = propagateRenameForActor(
			state.content,
			state.permissions,
			PLAYER_ACTOR.id,
			'Highmoor',
			'Castle Highmoor',
		);
		expect(playerProp.map((p) => p.itemId)).not.toContain(hiddenId);
		expect(targetId).toBeTruthy();
	});
});

describe('CONTENT-006 — durable repair command (fail closed offline)', () => {
	const env = makeEnvironment();

	it('repairs a broken link to a visible fix target, rewriting the body', () => {
		let state = base();
		state = createNote(state, env, { title: 'Highmoor' }).state;
		const journal = createNote(state, env, { title: 'Journal', body: 'Visited [[Higmoor]] (typo).' });
		state = journal.state;
		const noteId = journal.id;

		const result = accepted(
			dispatchCommand(
				state,
				env,
				cmd('content.repair-wikilink', {
					itemId: noteId,
					brokenTarget: 'Higmoor',
					fixTargetTitle: 'Highmoor',
				}),
			),
		);
		const event = result.events[0] as { kind: string; linksRewritten: number };
		expect(event.kind).toBe('content.wikilink-repaired');
		expect(event.linksRewritten).toBe(1);
		expect(contentItemById(result.nextState.content, noteId)!.body).toContain('[[Highmoor]]');
	});

	it('REJECTS a repair whose fix target does not resolve (no new broken link written)', () => {
		let state = base();
		const journal = createNote(state, env, { title: 'Journal', body: 'Visited [[Higmoor]].' });
		state = journal.state;
		const noteId = journal.id;
		const before = contentItemById(state.content, noteId)!.body;
		const result = rejected(
			dispatchCommand(
				state,
				env,
				cmd('content.repair-wikilink', {
					itemId: noteId,
					brokenTarget: 'Higmoor',
					fixTargetTitle: 'Phantom',
				}),
			),
		);
		expect(result.rejection.code).toBe('wikilink-fix-unresolved');
		// The local draft (note body) is unchanged.
		expect(contentItemById(result.nextState.content, noteId)!.body).toBe(before);
	});

	it('REJECTS a repair when the broken note source is unavailable (AC3 — no destructive write via command)', () => {
		let state = base();
		// A note marked as from an unavailable (offline) source.
		const unavailableNote = createNote(state, env, {
			title: 'Old Ruins',
			fields: { 'dndtools.source': 'obsidian', 'dndtools.sourceUnavailable': true },
		});
		state = unavailableNote.state;
		const journal = createNote(state, env, {
			title: 'Journal',
			body: 'Visited [[Old Ruins]] (source offline).',
		});
		state = journal.state;
		const noteId = journal.id;
		const before = contentItemById(state.content, noteId)!.body;

		// Attempting to repair [[Old Ruins]] when its source is unavailable is refused (AC3).
		const result = rejected(
			dispatchCommand(
				state,
				env,
				cmd('content.repair-wikilink', {
					itemId: noteId,
					brokenTarget: 'Old Ruins',
					fixTargetTitle: 'Highmoor',
				}),
			),
		);
		expect(result.rejection.code).toBe('wikilink-source-unavailable');
		// The note body is unchanged — no destructive offline rewrite.
		expect(contentItemById(result.nextState.content, noteId)!.body).toBe(before);
	});
});

describe('CONTENT-006 — actor-filtered broken-link detection', () => {
	const env = makeEnvironment();

	it('reports a link as unresolved when its target is hidden from the actor', () => {
		let state = base();
		state = createNote(state, env, { title: 'Secret Lair', visibility: 'dm-only' }).state;
		const broken = detectBrokenLinksForActor(
			state.content,
			state.permissions,
			PLAYER_ACTOR.id,
			'Heading to [[Secret Lair]].',
		);
		expect(broken).toHaveLength(1);
		expect(broken[0]!.reason).toBe('unresolved');
		// The DM resolves it (not broken).
		expect(
			detectBrokenLinksForActor(state.content, state.permissions, DM_ACTOR.id, 'Heading to [[Secret Lair]].'),
		).toHaveLength(0);
	});
});
