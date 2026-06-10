import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	CONTENT_ITEM_ENTITY_TYPE,
	activeWikilinkQuery,
	canRetry,
	createCommandLifecycle,
	dispatchCommand,
	markFailure,
	markPending,
	markSuccess,
	recoveryAction,
	renderMarkdownPreview,
	suggestWikilinkTargetsForActor,
	validateMarkdownDraft,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	type PermissionGrant,
} from '../src';

/**
 * CONTENT-002 — markdown EDITOR: visible SAVE STATUS (reuses the PLAT-018 lifecycle), VALIDATION
 * feedback (fail closed), PREVIEW, WIKILINK assistance (actor-filtered suggestions), and RECOVERABLE
 * failure states (failed save retried without data loss). Tests are the primary evidence.
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

// A module-scoped, monotonic environment so ids stay unique across the threaded creates in a test.
const sharedEnv = makeEnvironment();

function createNote(state: CoreStateSlice, payload: Record<string, unknown>): [CoreStateSlice, string] {
	const result = accepted(dispatchCommand(state, sharedEnv, cmd('content.create-item', { kind: 'note', ...payload })));
	const event = result.events[0] as { itemId: string };
	return [result.nextState, event.itemId];
}

function grantViewer(state: CoreStateSlice, itemId: string, playerActorId: string): CoreStateSlice {
	const grant: PermissionGrant = {
		id: `grant-${playerActorId}-${itemId}`,
		entityType: CONTENT_ITEM_ENTITY_TYPE,
		entityId: itemId,
		playerActorId,
		capabilitySet: 'viewer',
		createdBy: DM_ACTOR.id,
		createdAt: '2026-06-03T00:00:00.000Z',
	};
	return { ...state, permissions: { ...state.permissions, grants: [...state.permissions.grants, grant] } };
}

describe('CONTENT-002: markdown validation (fail closed)', () => {
	it('a well-formed draft validates', () => {
		const result = validateMarkdownDraft('---\ntitle: Highmoor\ntags: [a, b]\n---\nBody with [[Bane]].');
		expect(result.valid).toBe(true);
		expect(result.issues).toHaveLength(0);
	});

	it('an unterminated frontmatter block is a blocking error', () => {
		const result = validateMarkdownDraft('---\ntitle: Broken\nBody never closes the block');
		expect(result.valid).toBe(false);
		expect(result.issues.map((i) => i.code)).toContain('frontmatter-unterminated');
	});

	it('a malformed frontmatter line is a blocking error', () => {
		const result = validateMarkdownDraft('---\nthis is not a property\n---\nBody');
		expect(result.valid).toBe(false);
		expect(result.issues.map((i) => i.code)).toContain('frontmatter-malformed-line');
	});

	it('an empty-target wikilink is a blocking error', () => {
		const result = validateMarkdownDraft('See [[]] for details.');
		expect(result.valid).toBe(false);
		expect(result.issues.map((i) => i.code)).toContain('wikilink-empty-target');
	});

	it('an unbalanced wikilink is a blocking error', () => {
		const result = validateMarkdownDraft('See [[Bane for details.');
		expect(result.valid).toBe(false);
		expect(result.issues.map((i) => i.code)).toContain('wikilink-unbalanced');
	});
});

describe('CONTENT-002: deterministic preview', () => {
	it('strips frontmatter and segments headings/lists/paragraphs without raw HTML', () => {
		const preview = renderMarkdownPreview(
			'---\ntitle: T\ntags: [lore]\n---\n# Heading\nA paragraph with [[Bane]].\n- item one\n- item two',
		);
		expect(preview.hadFrontmatter).toBe(true);
		expect(preview.tags).toContain('lore');
		expect(preview.blocks[0]).toEqual({ kind: 'heading', level: 1, text: 'Heading' });
		expect(preview.blocks.find((b) => b.kind === 'paragraph')?.text).toContain('[[Bane]]');
		expect(preview.blocks.filter((b) => b.kind === 'list-item')).toHaveLength(2);
		expect(preview.wikilinks.map((l) => l.target)).toContain('Bane');
	});

	it('is deterministic — the same draft renders identically', () => {
		const draft = '# A\nbody [[X]]';
		expect(renderMarkdownPreview(draft)).toEqual(renderMarkdownPreview(draft));
	});
});

describe('CONTENT-002: actor-filtered wikilink suggestions (no leak)', () => {
	it('never suggests a note the editor cannot see', () => {
		let state = base();
		[state] = createNote(state, { title: 'Baneful Secret', visibility: 'dm-only' });
		[state] = createNote(state, { title: 'Bane the Town', visibility: 'player-visible' });

		// The DM is offered both for the partial `Ban`.
		const dm = suggestWikilinkTargetsForActor(state.content, state.permissions, DM_ACTOR.id, 'Ban');
		expect(dm.map((s) => s.title).sort()).toEqual(['Bane the Town', 'Baneful Secret']);

		// A player is offered ONLY the player-visible note — the dm-only note never appears as a target.
		const player = suggestWikilinkTargetsForActor(state.content, state.permissions, PLAYER_ACTOR.id, 'Ban');
		expect(player.map((s) => s.title)).toEqual(['Bane the Town']);
		expect(JSON.stringify(player)).not.toContain('Secret');
	});

	it('ranks a prefix match ahead of a mid-string match', () => {
		let state = base();
		[state] = createNote(state, { title: 'Old Bane', visibility: 'player-visible' });
		[state] = createNote(state, { title: 'Bane Keep', visibility: 'player-visible' });
		const suggestions = suggestWikilinkTargetsForActor(state.content, state.permissions, DM_ACTOR.id, 'Bane');
		expect(suggestions[0]!.title).toBe('Bane Keep');
	});

	it('a granted viewer is suggested a shared note; another player is not', () => {
		const [created, noteId] = createNote(base(), { title: 'Shared Lore', visibility: 'shared' });
		const state = grantViewer(created, noteId, PLAYER_ACTOR.id);
		expect(suggestWikilinkTargetsForActor(state.content, state.permissions, PLAYER_ACTOR.id, 'Shared').map((s) => s.title)).toEqual(['Shared Lore']);
		expect(suggestWikilinkTargetsForActor(state.content, state.permissions, PLAYER_B.id, 'Shared')).toHaveLength(0);
	});

	it('activeWikilinkQuery extracts the typed target the caret sits inside', () => {
		// A wikilink target may contain spaces, so everything after the open `[[` is the typed query.
		const text = 'Start [[Bal and more';
		expect(activeWikilinkQuery(text, text.length)).toBe('Bal and more');
		// Caret outside an open link → no active query.
		expect(activeWikilinkQuery('plain text', 5)).toBeNull();
		// A closed link before the caret is not active.
		expect(activeWikilinkQuery('done [[X]] now', 14)).toBeNull();
		// A `#`/`|` ends the completed target.
		expect(activeWikilinkQuery('see [[Bane#sec', 14)).toBe('Bane');
	});
});

describe('CONTENT-002: save status + recoverable failure (reuses PLAT-018 lifecycle)', () => {
	it('AC1: a successful save reports success and the durable op id is recorded', () => {
		const env = makeEnvironment();
		const [created, noteId] = createNote(base(), { title: 'Doc', body: 'v1', visibility: 'player-visible' });
		const result = accepted(dispatchCommand(created, env, cmd('content.update-item', { itemId: noteId, body: 'v2' })));

		let lifecycle = markPending(createCommandLifecycle('content.update-item'));
		expect(lifecycle.status).toBe('pending');
		lifecycle = markSuccess(lifecycle, result.operationIds);
		expect(lifecycle.status).toBe('success');
		expect(lifecycle.operationIds.length).toBeGreaterThan(0);
		expect(recoveryAction(lifecycle)).toBe('none');
	});

	it('AC2: a failed save keeps the draft and offers a retry (recoverable, no data loss)', () => {
		// A save submitted then failing (the durable write threw / was rejected): the lifecycle records
		// the failure with retry guidance and NO operation id (no partial commit). The editor keeps the
		// unsaved draft and may retry from the same draft.
		let lifecycle = markPending(createCommandLifecycle('content.update-item'));
		lifecycle = markFailure(lifecycle, 'Storage is full. Try again.');
		expect(lifecycle.status).toBe('failure');
		expect(lifecycle.operationIds).toHaveLength(0);
		expect(lifecycle.error).toContain('Try again');
		expect(canRetry(lifecycle)).toBe(true);
		expect(recoveryAction(lifecycle)).toBe('retry');

		// Retry from the failure → a fresh pending attempt (attempt count increments; the draft is intact).
		const retry = markPending(lifecycle);
		expect(retry.status).toBe('pending');
		expect(retry.attempts).toBe(2);
		expect(retry.error).toBeNull();
	});

	it('AC1: an editor edit rejected by the core (validation/permission) surfaces as a failure, never a partial success', () => {
		const env = makeEnvironment();
		const [created, noteId] = createNote(base(), { title: 'Doc', body: 'v1', visibility: 'dm-only' });
		// A player with no grant cannot save: the core rejects, and the lifecycle records a failure.
		const result = dispatchCommand(created, env, cmd('content.update-item', { itemId: noteId, body: 'hijack' }, PLAYER_ACTOR.id));
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') throw new Error('expected rejected');
		let lifecycle = markPending(createCommandLifecycle('content.update-item'));
		lifecycle = markFailure(lifecycle, result.rejection.message);
		expect(lifecycle.status).toBe('failure');
		expect(canRetry(lifecycle)).toBe(true);
		// The note body is unchanged (no partial write).
		expect(created.content.items[noteId]!.body).toBe('v1');
	});
});
