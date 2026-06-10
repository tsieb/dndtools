import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	applyContentImport,
	dispatchCommand,
	getContentItemsForActor,
	importEntryIdForPath,
	importItemIdForPath,
	planContentImport,
	previewContentImport,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type ImportArchiveFile,
} from '../src';

/**
 * CONTENT-007 — transactional, resumable import of markdown archives / Obsidian vault content. Tests are
 * the primary evidence: PREVIEW (read-only), CONFLICT POLICY (skip/overwrite/keep-both), RESUMABLE
 * (no double-write), NO-PARTIAL-COMMIT, and PRESERVATION of properties/aliases/tags/wikilinks.
 */

function base(): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
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

const HIGHMOOR: ImportArchiveFile = {
	path: 'lore/Highmoor.md',
	text: [
		'---',
		'title: Highmoor',
		'aliases: [The Keep]',
		'tags: [location, ruins]',
		'cssclass: lore',
		'---',
		'',
		'An ancient keep #fortress. See [[Bane#Worship|the Black Hand]].',
	].join('\n'),
};

const BANE: ImportArchiveFile = {
	path: 'lore/Bane.md',
	text: '---\ntitle: Bane\ndndtools.visibility: player-visible\n---\nThe god of tyranny.',
};

function commitImport(
	state: CoreStateSlice,
	env: CoreEnvironment,
	files: ImportArchiveFile[],
	policy: 'skip' | 'overwrite' | 'keep-both',
	appliedEntryIds: string[] = [],
	actorId = DM_ACTOR.id,
): CommandResult {
	const command: CoreCommand = {
		type: 'content.commit-import',
		actorId,
		payload: { sourceKind: 'obsidian-vault', policy, files, appliedEntryIds },
	};
	return dispatchCommand(state, env, command);
}

describe('CONTENT-007 import — preview (pure, read-only)', () => {
	it('AC1: preview lists collisions and metadata before any write; nothing is mutated', () => {
		const state = base();
		// Seed an existing item that collides with Highmoor's derived id.
		const seeded = accepted(commitImport(state, makeEnvironment(), [HIGHMOOR], 'overwrite'));
		const withExisting = seeded.nextState.content;

		const before = JSON.stringify(withExisting);
		const preview = previewContentImport(withExisting, [HIGHMOOR, BANE], 'obsidian-vault', 'skip');
		// Preview did not mutate the input state.
		expect(JSON.stringify(withExisting)).toBe(before);

		const highmoor = preview.entries.find((e) => e.sourcePath === HIGHMOOR.path)!;
		expect(highmoor.collides).toBe(true);
		expect(highmoor.action).toBe('skip');
		expect(highmoor.preserved).toMatchObject({ aliases: 1, wikilinks: 1 });
		// `cssclass` is an unsupported-but-preserved property — reported, never lost.
		expect(highmoor.unsupportedProperties).toContain('cssclass');

		const bane = preview.entries.find((e) => e.sourcePath === BANE.path)!;
		expect(bane.collides).toBe(false);
		expect(bane.action).toBe('create');
		expect(preview.summary).toMatchObject({ total: 2, skip: 1, create: 1, collisions: 1 });
	});
});

describe('CONTENT-007 import — conflict policy', () => {
	it('skip leaves the existing item byte-identical while still importing new files', () => {
		const env = makeEnvironment();
		const first = accepted(commitImport(base(), env, [HIGHMOOR], 'overwrite'));
		const id = importItemIdForPath(HIGHMOOR.path);
		const existingBefore = JSON.stringify(first.nextState.content.items[id]);

		// Re-import the SAME path with edited text (collides ⇒ skipped) PLUS a new file under `skip`.
		const edited: ImportArchiveFile = { path: HIGHMOOR.path, text: 'Different body.' };
		const result = accepted(commitImport(first.nextState, env, [edited, BANE], 'skip'));
		// The colliding item is untouched; the new file is created.
		expect(JSON.stringify(result.nextState.content.items[id])).toBe(existingBefore);
		expect(result.nextState.content.items[importItemIdForPath(BANE.path)]).toBeDefined();
	});

	it('overwrite replaces content and bumps revision', () => {
		const env = makeEnvironment();
		const first = accepted(commitImport(base(), env, [HIGHMOOR], 'overwrite'));
		const id = importItemIdForPath(HIGHMOOR.path);
		expect(first.nextState.content.items[id]!.revision).toBe(1);

		const edited: ImportArchiveFile = { path: HIGHMOOR.path, text: 'New body.' };
		const result = accepted(commitImport(first.nextState, env, [edited], 'overwrite'));
		const item = result.nextState.content.items[id]!;
		expect(item.body).toBe('New body.');
		expect(item.revision).toBe(2);
	});

	it('keep-both imports a second item under a fresh id, keeping the original', () => {
		const env = makeEnvironment();
		const first = accepted(commitImport(base(), env, [HIGHMOOR], 'overwrite'));
		const id = importItemIdForPath(HIGHMOOR.path);
		const edited: ImportArchiveFile = { path: HIGHMOOR.path, text: 'Variant body.' };
		const result = accepted(commitImport(first.nextState, env, [edited], 'keep-both'));
		const ids = Object.keys(result.nextState.content.items);
		expect(ids).toContain(id);
		expect(ids).toContain(`${id}-2`);
		expect(result.nextState.content.items[id]!.body).not.toBe('Variant body.');
		expect(result.nextState.content.items[`${id}-2`]!.body).toBe('Variant body.');
	});
});

describe('CONTENT-007 import — resumable (AC2: no double-write)', () => {
	it('a resumed import skips already-applied steps so safe writes are not duplicated', () => {
		// The plan is derived ONCE against the original pre-import vault (the resumable contract: the same
		// deterministic plan is replayed; `applyContentImport` skips by recorded entry id).
		const original = base().content;
		const files = [HIGHMOOR, BANE];
		const plan = planContentImport(original, files, 'obsidian-vault', 'skip');
		expect(plan.steps).toHaveLength(2);

		const highmoorEntry = importEntryIdForPath(HIGHMOOR.path);
		const baneEntry = importEntryIdForPath(BANE.path);

		// Simulate a crash AFTER Highmoor's step committed: a recovery records Highmoor as applied. The
		// resume replays the SAME plan against the SAME original state, declaring Highmoor already applied.
		const resumed = applyContentImport(original, plan, DM_ACTOR.id, '2026-06-05T01:00:00.000Z', [
			highmoorEntry,
		]);
		// Highmoor's step is resumed-skipped (not re-written); Bane's step is applied.
		expect(resumed.resumedSkippedEntryIds).toEqual([highmoorEntry]);
		expect(resumed.appliedEntryIds).toEqual([baneEntry]);

		// Re-running the full plan again with BOTH recorded applies nothing (idempotent — no double-write).
		const fullReplay = applyContentImport(original, plan, DM_ACTOR.id, '2026-06-05T02:00:00.000Z', [
			highmoorEntry,
			baneEntry,
		]);
		expect(fullReplay.appliedEntryIds).toHaveLength(0);
		expect(fullReplay.resumedSkippedEntryIds.sort()).toEqual([baneEntry, highmoorEntry].sort());
	});

	it('resume is idempotent across the command path (already-applied entries are not re-created)', () => {
		const env = makeEnvironment();
		const first = accepted(commitImport(base(), env, [HIGHMOOR, BANE], 'overwrite'));
		const appliedIds = (first.events[0] as { appliedEntryIds: string[] }).appliedEntryIds;
		const itemsAfterFirst = Object.keys(first.nextState.content.items).length;

		// Replay the entire commit declaring those entries as already applied — nothing new is written.
		const replay = commitImport(first.nextState, env, [HIGHMOOR, BANE], 'overwrite', appliedIds);
		// All steps were resumed-skipped, so the count is unchanged.
		const acceptedReplay = accepted(replay);
		expect(Object.keys(acceptedReplay.nextState.content.items).length).toBe(itemsAfterFirst);
		const event = acceptedReplay.events[0] as { resumedSkippedEntryIds: string[] };
		expect(event.resumedSkippedEntryIds.sort()).toEqual([...appliedIds].sort());
	});
});

describe('CONTENT-007 import — no partial commit on rejection', () => {
	it('a rejected (player) import leaves prior state byte-identical', () => {
		const env = makeEnvironment();
		const seeded = accepted(commitImport(base(), env, [BANE], 'overwrite'));
		const before = JSON.stringify(seeded.nextState);

		const result = rejected(commitImport(seeded.nextState, env, [HIGHMOOR], 'overwrite', [], PLAYER_ACTOR.id));
		expect(result.rejection.code).toBe('actor-not-authorized');
		// The returned state is the prior state, unchanged.
		expect(JSON.stringify(result.nextState)).toBe(before);
	});

	it('an empty archive is rejected with no write (no silent no-op)', () => {
		const result = rejected(commitImport(base(), makeEnvironment(), [], 'overwrite'));
		expect(result.rejection.code).toBe('invalid-state');
	});

	it('an import where every file is skipped under skip policy is rejected', () => {
		const env = makeEnvironment();
		const seeded = accepted(commitImport(base(), env, [HIGHMOOR], 'overwrite'));
		const result = rejected(commitImport(seeded.nextState, env, [HIGHMOOR], 'skip'));
		expect(result.rejection.code).toBe('invalid-state');
		expect(result.rejection.message).toMatch(/skipped/i);
	});
});

describe('CONTENT-007 import — metadata preservation + visibility', () => {
	it('preserves properties, aliases, tags, and wikilinks on the imported item', () => {
		const result = accepted(commitImport(base(), makeEnvironment(), [HIGHMOOR], 'overwrite'));
		const item = result.nextState.content.items[importItemIdForPath(HIGHMOOR.path)]!;
		expect(item.title).toBe('Highmoor');
		expect(item.fields['aliases']).toEqual(['The Keep']);
		expect(item.fields['tags']).toEqual(['location', 'ruins', 'fortress']);
		expect(item.fields['wikilinks']).toEqual(['[[Bane#Worship|the Black Hand]]']);
		// Unsupported-but-preserved user property survives verbatim.
		expect(item.fields['cssclass']).toBe('lore');
		expect(item.fields['sourcePath']).toBe(HIGHMOOR.path);
	});

	it('fails visibility closed to dm-only unless dndtools.visibility says otherwise', () => {
		const result = accepted(commitImport(base(), makeEnvironment(), [HIGHMOOR, BANE], 'overwrite'));
		const content = result.nextState.content;
		const highmoor = content.items[importItemIdForPath(HIGHMOOR.path)]!;
		const bane = content.items[importItemIdForPath(BANE.path)]!;
		// No dndtools.visibility ⇒ dm-only; explicit player-visible is honored.
		expect(highmoor.visibility).toBe('dm-only');
		expect(bane.visibility).toBe('player-visible');

		// A player sees only the player-visible imported item (the dm-only one is omitted entirely).
		const playerView = getContentItemsForActor(content, result.nextState.permissions, PLAYER_ACTOR.id);
		const titles = playerView.map((v) => v.title);
		expect(titles).toContain('Bane');
		expect(titles).not.toContain('Highmoor');
	});
});
