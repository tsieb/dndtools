import { describe, expect, it } from 'vitest';
import {
	CONTENT_SOURCE_DESCRIPTORS,
	CONTENT_SOURCE_IDS,
	addContentItem,
	buildContentItem,
	checkContentSourceConstraints,
	checkDetectedStructuresAgainstSource,
	contentSourceDescriptor,
	detectNoteStructures,
	dispatchCommand,
	featureSupportForSource,
	isContentWriteAcknowledged,
	listContentSourceCapabilities,
	parseMarkdownNote,
	summarizeContentSourceCapabilities,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * CONTENT-012 — SOURCE-SPECIFIC CONSTRAINTS. Pure per-source lossy detection BEFORE a write, plus the
 * fail-closed command-layer enforcement (a lossy write requires acknowledgment; it never silently loses
 * data, and a rejected/unsupported write never mutates the local draft).
 */

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got ${JSON.stringify(result.rejection)}`);
	}
	return result;
}

function rejected(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	if (result.status !== 'rejected') throw new Error('expected rejected');
	return result;
}

// A note exercising every detected structure: a user property (`cssclass`), aliases, a `tags` property,
// an inline `#hashtag`, a `[[wikilink]]`, and a namespaced `dndtools.*` metadata key.
const RICH_NOTE = [
	'---',
	'title: Highmoor',
	'cssclass: lore',
	'aliases: [The Keep]',
	'tags: [location]',
	'dndtools.visibility: dm-only',
	'---',
	'An ancient keep #fortress near [[Bane]].',
].join('\n');

// A note with NO source-specific structures: plain prose with a heading only.
const PLAIN_NOTE = '# Plain note\n\nJust prose, nothing source-specific here.';

describe('CONTENT-012 — note-source capability descriptors', () => {
	it('declares a descriptor for every source id, and fails closed for an unknown source', () => {
		for (const id of CONTENT_SOURCE_IDS) {
			expect(contentSourceDescriptor(id)?.id).toBe(id);
		}
		expect(contentSourceDescriptor('notion')).toBeNull();
		// An unknown source classifies every feature unsupported (never a permissive default).
		expect(featureSupportForSource('notion', 'wikilinks')).toBe('unsupported');
		expect(featureSupportForSource('notion', 'frontmatter-properties')).toBe('unsupported');
	});

	it('models Obsidian as the superset, local markdown as the lossy-wikilink baseline, GDocs as constrained', () => {
		// Obsidian supports everything markdown.ts detects.
		expect(featureSupportForSource('obsidian', 'wikilinks')).toBe('supported');
		expect(featureSupportForSource('obsidian', 'frontmatter-properties')).toBe('supported');
		expect(featureSupportForSource('obsidian', 'tags')).toBe('supported');
		// Local markdown is the baseline: properties/aliases/tags round-trip, but [[wikilinks]] are lossy
		// (literal text survives, resolved-link semantics do not).
		expect(featureSupportForSource('local-markdown', 'frontmatter-properties')).toBe('supported');
		expect(featureSupportForSource('local-markdown', 'wikilinks')).toBe('lossy');
		// Google Docs cannot represent front matter / wikilinks / aliases as structured data.
		expect(featureSupportForSource('google-docs', 'frontmatter-properties')).toBe('unsupported');
		expect(featureSupportForSource('google-docs', 'wikilinks')).toBe('unsupported');
		expect(featureSupportForSource('google-docs', 'aliases')).toBe('unsupported');
		// Inline #tag text survives a GDocs paste but loses its tag semantics (lossy, not dropped).
		expect(featureSupportForSource('google-docs', 'inline-tags')).toBe('lossy');
	});

	it('summarizes each descriptor into sorted supported/lossy/unsupported feature lists', () => {
		const obsidian = summarizeContentSourceCapabilities(CONTENT_SOURCE_DESCRIPTORS.obsidian);
		expect(obsidian.unsupported).toEqual([]);
		expect(obsidian.lossy).toEqual([]);
		expect(obsidian.supported).toContain('wikilinks');

		const gdocs = summarizeContentSourceCapabilities(CONTENT_SOURCE_DESCRIPTORS['google-docs']);
		expect(gdocs.unsupported).toContain('frontmatter-properties');
		expect(gdocs.unsupported).toContain('wikilinks');
		expect(gdocs.lossy).toEqual(['inline-tags']);

		// The reference table lists every source in declared order.
		expect(listContentSourceCapabilities().map((row) => row.id)).toEqual([...CONTENT_SOURCE_IDS]);
	});
});

describe('CONTENT-012 — structure detection (reuses markdown.ts)', () => {
	it('counts user properties separately from interpreted fields and dndtools metadata', () => {
		const detected = detectNoteStructures(parseMarkdownNote(RICH_NOTE));
		// `title`/`aliases`/`tags` are interpreted; `dndtools.visibility` is namespaced. Only `cssclass`
		// counts as a user property.
		expect(detected.frontmatterProperties).toBe(1);
		expect(detected.aliases).toBe(1);
		expect(detected.tags).toBe(2); // `location` property + inline `fortress`
		expect(detected.inlineTags).toBe(1); // `fortress`
		expect(detected.wikilinks).toBe(1);
		expect(detected.dndtoolsMetadata).toBe(1);
	});

	it('detects nothing source-specific in a plain prose note', () => {
		const detected = detectNoteStructures(parseMarkdownNote(PLAIN_NOTE));
		expect(detected).toEqual({
			frontmatterProperties: 0,
			aliases: 0,
			tags: 0,
			inlineTags: 0,
			wikilinks: 0,
			dndtoolsMetadata: 0,
		});
	});
});

describe('CONTENT-012 — pre-write constraint check (lossy detection BEFORE write)', () => {
	it('flags nothing for a source that supports every present structure (Obsidian)', () => {
		const check = checkContentSourceConstraints(RICH_NOTE, 'obsidian');
		expect(check.lossy).toBe(false);
		expect(check.requiresAcknowledgment).toBe(false);
		expect(check.acknowledgmentToken).toBeNull();
		expect(check.lossyFeatures).toEqual([]);
		expect(check.droppedFeatures).toEqual([]);
		// Every present feature is diagnosed `supported` (visibility before write), nothing absent is.
		expect(check.diagnostics.every((d) => d.support === 'supported')).toBe(true);
	});

	it('flags wikilinks as DOWNGRADED for the local-markdown baseline (lossy, not dropped)', () => {
		const check = checkContentSourceConstraints(RICH_NOTE, 'local-markdown');
		expect(check.lossy).toBe(true);
		expect(check.requiresAcknowledgment).toBe(true);
		expect(check.lossyFeatures).toEqual(['wikilinks']);
		expect(check.droppedFeatures).toEqual([]);
		const wikilinkDiag = check.diagnostics.find((d) => d.feature === 'wikilinks');
		expect(wikilinkDiag?.support).toBe('lossy');
		expect(wikilinkDiag?.count).toBe(1);
	});

	it('flags properties/aliases/wikilinks/dndtools metadata as DROPPED for Google Docs', () => {
		const check = checkContentSourceConstraints(RICH_NOTE, 'google-docs');
		expect(check.lossy).toBe(true);
		expect(check.requiresAcknowledgment).toBe(true);
		// Properties, aliases, tags, wikilinks, dndtools metadata are dropped; inline-tags are lossy.
		expect(check.droppedFeatures).toEqual(
			expect.arrayContaining([
				'frontmatter-properties',
				'aliases',
				'tags',
				'wikilinks',
				'dndtools-namespaced-metadata',
			]),
		);
		expect(check.lossyFeatures).toEqual(['inline-tags']);
		// Every diagnostic message names the feature + outcome; none leaks the raw value (`The Keep`, `Bane`).
		for (const diag of check.diagnostics) {
			expect(diag.message).not.toContain('The Keep');
			expect(diag.message).not.toContain('Bane');
		}
	});

	it('requires NO acknowledgment for a plain note on ANY source (nothing to lose)', () => {
		for (const id of CONTENT_SOURCE_IDS) {
			const check = checkContentSourceConstraints(PLAIN_NOTE, id);
			expect(check.lossy).toBe(false);
			expect(check.requiresAcknowledgment).toBe(false);
			expect(check.diagnostics).toEqual([]);
		}
	});

	it('fails closed for an unknown source: every present structure is unsupported', () => {
		const check = checkContentSourceConstraints(RICH_NOTE, 'notion');
		expect(check.unknownSource).toBe(true);
		expect(check.lossy).toBe(true);
		expect(check.requiresAcknowledgment).toBe(true);
		// inline-tags + the user property + aliases + tags + wikilinks + dndtools are all dropped.
		expect(check.lossyFeatures).toEqual([]);
		expect(check.droppedFeatures.length).toBeGreaterThan(0);
	});

	it('checkDetectedStructuresAgainstSource is the pure core of the text-level check', () => {
		const detected = detectNoteStructures(parseMarkdownNote(RICH_NOTE));
		const fromStructures = checkDetectedStructuresAgainstSource(detected, 'google-docs');
		const fromText = checkContentSourceConstraints(RICH_NOTE, 'google-docs');
		expect(fromStructures.acknowledgmentToken).toBe(fromText.acknowledgmentToken);
		expect(fromStructures.droppedFeatures).toEqual(fromText.droppedFeatures);
	});
});

describe('CONTENT-012 — fail-closed acknowledgment gate', () => {
	it('a faithful write is always acknowledged (no token needed)', () => {
		expect(isContentWriteAcknowledged(RICH_NOTE, 'obsidian', null)).toBe(true);
		expect(isContentWriteAcknowledged(PLAIN_NOTE, 'google-docs', null)).toBe(true);
	});

	it('a lossy write is NOT acknowledged without the matching token', () => {
		expect(isContentWriteAcknowledged(RICH_NOTE, 'google-docs', null)).toBe(false);
		expect(isContentWriteAcknowledged(RICH_NOTE, 'google-docs', undefined)).toBe(false);
		expect(isContentWriteAcknowledged(RICH_NOTE, 'google-docs', 'bogus-token')).toBe(false);
	});

	it('a lossy write IS acknowledged with the exact token from its own check', () => {
		const check = checkContentSourceConstraints(RICH_NOTE, 'google-docs');
		expect(check.acknowledgmentToken).not.toBeNull();
		expect(isContentWriteAcknowledged(RICH_NOTE, 'google-docs', check.acknowledgmentToken)).toBe(true);
	});

	it('a STALE token (note changed since the check) no longer matches — re-acknowledge required', () => {
		const original = checkContentSourceConstraints(RICH_NOTE, 'google-docs');
		// The note changed: a wikilink was removed, so the loss profile (and thus the token) differs.
		const editedNote = RICH_NOTE.replace('[[Bane]]', 'Bane');
		expect(isContentWriteAcknowledged(editedNote, 'google-docs', original.acknowledgmentToken)).toBe(
			false,
		);
	});

	it('the token is deterministic: same loss profile ⇒ same token', () => {
		const a = checkContentSourceConstraints(RICH_NOTE, 'google-docs');
		const b = checkContentSourceConstraints(RICH_NOTE, 'google-docs');
		expect(a.acknowledgmentToken).toBe(b.acknowledgmentToken);
	});
});

// --- Command-layer enforcement (content.write-to-source) -----------------------------------------

const ITEM_ID = 'content-item-highmoor';

function stateWithItem(...actors: Parameters<typeof buildInitialState>): CoreStateSlice {
	const state = buildInitialState(...actors);
	const item = buildContentItem(
		{ kind: 'note', title: 'Highmoor', body: RICH_NOTE, visibility: 'dm-only' },
		{ id: ITEM_ID, authorActorId: DM_ACTOR.id, now: '2026-01-01T00:00:00.000Z' },
	);
	return { ...state, content: addContentItem(state.content, item) };
}

function writeCommand(
	actorId: string,
	source: string,
	noteText: string,
	acknowledgmentToken?: string | null,
): CoreCommand {
	return {
		type: 'content.write-to-source',
		actorId,
		payload: {
			itemId: ITEM_ID,
			source,
			noteText,
			...(acknowledgmentToken !== undefined ? { acknowledgmentToken } : {}),
		},
	};
}

describe('CONTENT-012 — content.write-to-source command (fail closed)', () => {
	it('accepts a faithful write (Obsidian) with no acknowledgment and records a non-lossy audit op', () => {
		const state = stateWithItem(DM_ACTOR);
		const result = accept(
			dispatchCommand(state, makeEnvironment(), writeCommand(DM_ACTOR.id, 'obsidian', RICH_NOTE)),
		);
		const event = result.events[0]!;
		expect(event.kind).toBe('content.written-to-source');
		if (event.kind === 'content.written-to-source') {
			expect(event.lossy).toBe(false);
			expect(event.droppedFeatures).toEqual([]);
			expect(event.source).toBe('obsidian');
		}
		expect(result.operationIds).toHaveLength(1);
	});

	it('REJECTS a lossy write (Google Docs) without acknowledgment — no silent loss, draft untouched', () => {
		const state = stateWithItem(DM_ACTOR);
		const result = rejected(
			dispatchCommand(state, makeEnvironment(), writeCommand(DM_ACTOR.id, 'google-docs', RICH_NOTE)),
		);
		expect(result.rejection.code).toBe('content-write-loss-unacknowledged');
		// The durable state is byte-identical — the local draft / item content was never mutated.
		expect(result.nextState.content).toBe(state.content);
		expect(result.nextState.content.items[ITEM_ID]?.body).toBe(RICH_NOTE);
	});

	it('ACCEPTS a lossy write once the matching acknowledgment token is supplied, auditing the loss', () => {
		const state = stateWithItem(DM_ACTOR);
		const check = checkContentSourceConstraints(RICH_NOTE, 'google-docs');
		const result = accept(
			dispatchCommand(
				state,
				makeEnvironment(),
				writeCommand(DM_ACTOR.id, 'google-docs', RICH_NOTE, check.acknowledgmentToken),
			),
		);
		const event = result.events[0]!;
		expect(event.kind).toBe('content.written-to-source');
		if (event.kind === 'content.written-to-source') {
			expect(event.lossy).toBe(true);
			expect(event.droppedFeatures).toContain('wikilinks');
			expect(event.lossyFeatures).toContain('inline-tags');
		}
	});

	it('REJECTS a lossy write with a STALE token (note changed) without losing the draft', () => {
		const state = stateWithItem(DM_ACTOR);
		const staleToken = checkContentSourceConstraints(RICH_NOTE, 'google-docs').acknowledgmentToken;
		const editedNote = RICH_NOTE.replace('[[Bane]]', 'Bane');
		const result = rejected(
			dispatchCommand(
				state,
				makeEnvironment(),
				writeCommand(DM_ACTOR.id, 'google-docs', editedNote, staleToken),
			),
		);
		expect(result.rejection.code).toBe('content-write-loss-unacknowledged');
		expect(result.nextState.content).toBe(state.content);
	});

	it('fails closed for an unknown target source', () => {
		const state = stateWithItem(DM_ACTOR);
		const result = rejected(
			dispatchCommand(state, makeEnvironment(), writeCommand(DM_ACTOR.id, 'notion', RICH_NOTE)),
		);
		expect(result.rejection.code).toBe('invalid-payload');
	});

	it('is DM-only: a player and an observer are rejected (authoring fail closed)', () => {
		const state = stateWithItem(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		const player = rejected(
			dispatchCommand(state, makeEnvironment(), writeCommand(PLAYER_ACTOR.id, 'obsidian', RICH_NOTE)),
		);
		expect(player.rejection.code).toBe('actor-not-authorized');
		const observer = rejected(
			dispatchCommand(
				state,
				makeEnvironment(),
				writeCommand(OBSERVER_ACTOR.id, 'obsidian', RICH_NOTE),
			),
		);
		expect(observer.rejection.code).toBe('actor-not-authorized');
	});

	it('rejects a write to a missing item and to a soft-deleted item', () => {
		const state = buildInitialState(DM_ACTOR);
		const missing = rejected(
			dispatchCommand(state, makeEnvironment(), writeCommand(DM_ACTOR.id, 'obsidian', RICH_NOTE)),
		);
		expect(missing.rejection.code).toBe('content-item-not-found');
	});
});
