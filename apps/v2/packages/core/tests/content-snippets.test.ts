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
	contentSnippet,
	dispatchCommand,
	inheritedSnippetVisibility,
	insertSnippet,
	listContentSnippets,
	previewInsertedSnippet,
	renderMarkdownPreview,
	snippetCanInsertIntoVisibility,
	validateMarkdownDraft,
	type Actor,
	type CommandResult,
	type ContentSnippet,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
} from '../src';

/**
 * CONTENT-004 — SNIPPETS, the SECURITY CRUX: a snippet MUST NOT bypass note validation, visibility metadata,
 * or markdown sanitization. Tests are the primary evidence, with HARD negative assertions:
 *
 *   - a snippet that would be SANITIZED when typed is equally sanitized when inserted (the render path is
 *     the SAME safe block model — no raw HTML);
 *   - a snippet that would be REJECTED by validation when typed is equally rejected when inserted (no free
 *     pass); and
 *   - an inserted snippet INHERITS the note's visibility — it cannot widen it.
 */

const PLAYER_B: Actor = { id: 'actor-player-b', role: 'player', displayName: 'Player B' };

function base(...actors: Actor[]): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR, PLAYER_B, ...actors);
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

/** DM creates a note with the given visibility; returns state + the item id. */
function withNote(
	body: string,
	visibility: 'dm-only' | 'player-visible' | 'shared',
): { state: CoreStateSlice; env: CoreEnvironment; itemId: string } {
	const env = makeEnvironment();
	const created = accepted(
		dispatchCommand(
			base(),
			env,
			cmd('content.create-item', { kind: 'note', title: 'Host', body, visibility }),
		),
	);
	const itemId = Object.values(created.nextState.content.items)[0]!.id;
	return { state: created.nextState, env, itemId };
}

const READ_ALOUD = contentSnippet('read-aloud')!;

describe('CONTENT-004 — snippet library', () => {
	it('publishes the built-in snippets', () => {
		const summaries = listContentSnippets();
		expect(summaries.length).toBeGreaterThan(0);
		expect(summaries.some((s) => s.id === 'read-aloud')).toBe(true);
	});

	it('resolves an unknown snippet to null (fail closed)', () => {
		expect(contentSnippet('nope')).toBeNull();
	});
});

describe('CONTENT-004 AC1 — an inserted snippet is saved as note content via the unified pipeline', () => {
	it('inserts the snippet body and validates the result through the EXISTING validator', () => {
		const result = insertSnippet('Existing prose.', READ_ALOUD, 'after');
		expect(result.text).toContain('Existing prose.');
		expect(result.text).toContain('Read this aloud:');
		expect(result.valid).toBe(true);
	});

	it('the insert command saves the result as the note body (durable write via the update path)', () => {
		const { state, env, itemId } = withNote('Existing prose.', 'dm-only');
		const result = accepted(
			dispatchCommand(state, env, cmd('content.insert-snippet', { itemId, snippetId: 'read-aloud' })),
		);
		const item = result.nextState.content.items[itemId]!;
		expect(item.body).toContain('Existing prose.');
		expect(item.body).toContain('Read this aloud:');
		// The durable write went through the existing update-item command.
		expect(result.nextState.sync.operations.at(-1)!.opType).toBe('content.update-item');
	});
});

describe('CONTENT-004 AC2 — SANITIZATION is the SAME for inserted and hand-typed content (no smuggling)', () => {
	// A snippet carrying disallowed raw HTML / script-like content.
	const UNSAFE: ContentSnippet = {
		id: 'unsafe',
		name: 'Unsafe',
		description: 'Carries raw HTML/script.',
		body: '<script>steal()</script>\n\n<img src=x onerror=alert(1)>\n\nSafe paragraph.',
	};

	it('the render path NEVER emits raw HTML — a snippet cannot smuggle unsanitized markdown', () => {
		const host = 'A clean intro.';
		const insertedPreview = previewInsertedSnippet(host, UNSAFE, 'after');
		// Equivalent hand-typed content: the host with the same body appended.
		const typedPreview = renderMarkdownPreview(`${host}\n\n${UNSAFE.body}`);

		// The block model is identical whether the unsafe content is inserted as a snippet or typed.
		expect(insertedPreview.blocks).toEqual(typedPreview.blocks);

		// No block carries an executable script element — the renderer reduces it to inert text. We assert
		// no rendered block VALUE contains a live `<script>` open tag as structure; it is plain text content.
		const allText = insertedPreview.blocks.map((b) => b.text).join('\n');
		// The dangerous markup survives only as inert TEXT in a paragraph block (never an HTML element the
		// GUI would mount), and the safe paragraph is present. The GUI maps the block model to elements, so
		// the script can never reach the rendered output.
		expect(insertedPreview.blocks.every((b) => b.kind === 'heading' || b.kind === 'paragraph' || b.kind === 'list-item')).toBe(true);
		expect(allText).toContain('Safe paragraph.');
	});

	it('the SAME safe block model results from snippet insertion and hand-typed entry (parity)', () => {
		const host = '# Intro';
		const a = previewInsertedSnippet(host, READ_ALOUD, 'after');
		const b = renderMarkdownPreview(insertSnippet(host, READ_ALOUD, 'after').text);
		expect(a).toEqual(b);
	});
});

describe('CONTENT-004 — a snippet cannot SKIP VALIDATION (no free pass)', () => {
	// A snippet whose body makes the draft invalid (an unbalanced wikilink) — the SAME content typed by hand
	// is rejected by the validator, so the inserted snippet must be too.
	const INVALID: ContentSnippet = {
		id: 'invalid',
		name: 'Invalid',
		description: 'Produces an unbalanced wikilink.',
		body: 'See [[Unclosed Link',
	};

	it('inserting a snippet that would make the draft invalid yields valid:false (same as typed)', () => {
		const host = 'A clean note.';
		const inserted = insertSnippet(host, INVALID, 'after');
		const typed = validateMarkdownDraft(`${host}\n\n${INVALID.body}`);
		// The inserted result and the equivalent hand-typed draft validate identically.
		expect(inserted.valid).toBe(typed.valid);
		expect(inserted.valid).toBe(false);
	});

	it('the insert command REJECTS an invalid result fail-closed; the note body is unchanged', () => {
		// The command only inserts BUILT-IN snippets, so prove the unified validator blocks an invalid
		// RESULT: a note whose body already carries an unbalanced wikilink stays invalid when a built-in
		// snippet is appended, and the command must reject rather than write the invalid result.
		const { state, env, itemId } = withNote('Dangling [[ open', 'dm-only');
		const result = rejected(
			dispatchCommand(state, env, cmd('content.insert-snippet', { itemId, snippetId: 'read-aloud' })),
		);
		expect(result.rejection.code).toBe('snippet-content-invalid');
		// The note body is unchanged (no partial write) and no op was appended.
		expect(result.nextState.content.items[itemId]!.body).toBe('Dangling [[ open');
		expect(result.nextState.sync.operations).toHaveLength(state.sync.operations.length);
	});
});

describe('CONTENT-004 — a snippet INHERITS, never widens, the note visibility', () => {
	it('snippetCanInsertIntoVisibility permits a narrower-or-equal result, refuses a wider one', () => {
		// Equal is allowed (insertion preserves the note visibility).
		expect(snippetCanInsertIntoVisibility('dm-only', 'dm-only')).toBe(true);
		expect(snippetCanInsertIntoVisibility('player-visible', 'player-visible')).toBe(true);
		// Narrower than the host is allowed.
		expect(snippetCanInsertIntoVisibility('player-visible', 'dm-only')).toBe(true);
		expect(snippetCanInsertIntoVisibility('player-visible', 'shared')).toBe(true);
		// WIDER than the host is refused fail-closed.
		expect(snippetCanInsertIntoVisibility('dm-only', 'player-visible')).toBe(false);
		expect(snippetCanInsertIntoVisibility('dm-only', 'shared')).toBe(false);
		expect(snippetCanInsertIntoVisibility('shared', 'player-visible')).toBe(false);
	});

	it('an unknown visibility coerces fail-closed to dm-only on both sides', () => {
		// A wider request expressed as an unknown value collapses to dm-only, so it never widens.
		expect(snippetCanInsertIntoVisibility('dm-only', 'totally-public')).toBe(true);
		// An unknown HOST collapses to dm-only, so a player-visible request is refused.
		expect(snippetCanInsertIntoVisibility('totally-public', 'player-visible')).toBe(false);
	});

	it('inheritedSnippetVisibility returns the note visibility (insertion is visibility-preserving)', () => {
		expect(inheritedSnippetVisibility('dm-only')).toBe('dm-only');
		expect(inheritedSnippetVisibility('player-visible')).toBe('player-visible');
		expect(inheritedSnippetVisibility('shared')).toBe('shared');
		// Fail closed.
		expect(inheritedSnippetVisibility('totally-public')).toBe('dm-only');
	});

	it('inserting a snippet into a dm-only note keeps it dm-only (the snippet cannot escape it)', () => {
		const { state, env, itemId } = withNote('Secret prose.', 'dm-only');
		const before = state.content.items[itemId]!.visibility;
		const result = accepted(
			dispatchCommand(state, env, cmd('content.insert-snippet', { itemId, snippetId: 'secret-door' })),
		);
		expect(result.nextState.content.items[itemId]!.visibility).toBe('dm-only');
		expect(before).toBe('dm-only');
	});

	it('inserting a snippet into a player-visible note keeps its exact visibility (no widening, no narrowing)', () => {
		const { state, env, itemId } = withNote('Public prose.', 'player-visible');
		const result = accepted(
			dispatchCommand(state, env, cmd('content.insert-snippet', { itemId, snippetId: 'stat-line' })),
		);
		expect(result.nextState.content.items[itemId]!.visibility).toBe('player-visible');
	});
});

describe('CONTENT-004 — authoring authority + lifecycle (fail closed)', () => {
	it('rejects an unknown snippet id', () => {
		const { state, env, itemId } = withNote('Prose.', 'dm-only');
		const result = rejected(
			dispatchCommand(state, env, cmd('content.insert-snippet', { itemId, snippetId: 'nope' })),
		);
		expect(result.rejection.code).toBe('snippet-not-found');
	});

	it('rejects inserting into a missing item', () => {
		const env = makeEnvironment();
		const result = rejected(
			dispatchCommand(base(), env, cmd('content.insert-snippet', { itemId: 'nope', snippetId: 'stat-line' })),
		);
		expect(result.rejection.code).toBe('content-item-not-found');
	});

	it('a granted authorized editor (player) may insert a snippet', () => {
		const { state, env, itemId } = withNote('Prose.', 'dm-only');
		const granted = accepted(
			dispatchCommand(
				state,
				env,
				cmd('permission.grant-capability-set', {
					entityType: CONTENT_ITEM_ENTITY_TYPE,
					entityId: itemId,
					playerActorId: PLAYER_ACTOR.id,
					capabilitySet: 'section-editor',
				}),
			),
		).nextState;
		const result = accepted(
			dispatchCommand(
				granted,
				env,
				cmd('content.insert-snippet', { itemId, snippetId: 'stat-line' }, PLAYER_ACTOR.id),
			),
		);
		expect(result.nextState.content.items[itemId]!.body).toContain('STR');
		// Visibility still preserved even for the granted editor.
		expect(result.nextState.content.items[itemId]!.visibility).toBe('dm-only');
	});

	it('fails closed: a player WITHOUT a grant cannot insert a snippet', () => {
		const { state, env, itemId } = withNote('Prose.', 'dm-only');
		const result = rejected(
			dispatchCommand(
				state,
				env,
				cmd('content.insert-snippet', { itemId, snippetId: 'stat-line' }, PLAYER_B.id),
			),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
		expect(result.nextState.content.items[itemId]!.body).toBe('Prose.');
	});

	it('fails closed: an observer cannot insert a snippet', () => {
		const { state, env, itemId } = withNote('Prose.', 'player-visible');
		const result = rejected(
			dispatchCommand(
				state,
				env,
				cmd('content.insert-snippet', { itemId, snippetId: 'stat-line' }, OBSERVER_ACTOR.id),
			),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});
});
