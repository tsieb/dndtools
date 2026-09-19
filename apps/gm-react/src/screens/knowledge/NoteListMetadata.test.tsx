// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DM_ACTOR, OBSERVER_ACTOR, PLAYER_ACTOR, buildInitialState } from '@dndtools/core/testing';
import {
	applyContentImport,
	getContentItemsForActor,
	planContentImport,
	type ContentItemView,
	type ImportArchiveFile,
} from '@dndtools/core';
import { NoteListMetadata, noteListFacets } from './NoteListMetadata';

/**
 * RC-KNW-2.2 — the list card's scent line is derived from the ACTOR-FILTERED projection, so it can
 * never say more than the note's own detail view would.
 *
 * The regression this guards is specific and was found by reproduction, not by reading: an imported
 * note's `fields.tags` is built from the AUTHORED markdown, and `projectItem` copies `fields` to
 * every actor verbatim. A card that read `fields.tags` printed the DM's `[!Secret]` hashtags on a
 * player's screen while the note body beneath them was correctly stripped. These tests run the real
 * import and the real projection rather than a hand-built view, so they fail if either side of that
 * pipeline changes shape.
 */

const SECRET_TAG = 'mayoristhetraitor';

/** A shared note whose only secret is inside a `[!Secret]` callout — tag included. */
const IMPORTED_NOTE: ImportArchiveFile = {
	path: 'Campaign Bible/Session Prep/Highmoor Keep.md',
	text: [
		'---',
		'title: Highmoor Keep',
		'tags: [location, ruins]',
		'dndtools.folder: Lore/Ruins',
		'dndtools.visibility: player-visible',
		'---',
		'',
		'The keep leans over the tarn, its gate long since rusted open. #keep',
		'',
		`> [!Secret] Do not read aloud`,
		`> The reeve sold the gate key a season ago. #${SECRET_TAG}`,
		'',
		'Rooks nest in the upper hall.',
	].join('\n'),
};

function importedNoteFor(actorId: string): ContentItemView {
	const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	const plan = planContentImport(state.content, [IMPORTED_NOTE], 'obsidian-vault', 'skip');
	const { nextState } = applyContentImport(
		state.content,
		plan,
		DM_ACTOR.id,
		'2026-09-16T00:00:00.000Z',
	);
	const view = getContentItemsForActor(nextState, state.permissions, actorId).find(
		(item) => item.title === 'Highmoor Keep',
	);
	if (!view) throw new Error(`the imported note is not visible to ${actorId}`);
	return view;
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	container = document.createElement('div');
	document.body.append(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

function render(note: ContentItemView): void {
	act(() => root.render(<NoteListMetadata note={note} />));
}

describe('RC-KNW-2.2 note list information scent', () => {
	it('keeps a secret callout tag off the projection a player holds', () => {
		const player = importedNoteFor(PLAYER_ACTOR.id);

		// The leak was in the raw field, which the projection still carries — so this asserts the
		// hazard is real and that the card is what declines to read it.
		expect(JSON.stringify(player.fields)).toContain(SECRET_TAG);
		expect(player.body).not.toContain(SECRET_TAG);
		expect(noteListFacets(player).tags).not.toContain(SECRET_TAG);
	});

	it('renders no secret tag on a player card', () => {
		render(importedNoteFor(PLAYER_ACTOR.id));

		expect(container.textContent).not.toContain(SECRET_TAG);
		expect(
			[...container.querySelectorAll('[data-testid="note-tag"]')].map((n) => n.textContent),
		).toEqual(['#keep']);
	});

	it('still shows the DM the secret tag they authored', () => {
		render(importedNoteFor(DM_ACTOR.id));

		expect(
			[...container.querySelectorAll('[data-testid="note-tag"]')].map((n) => n.textContent),
		).toEqual(['#keep', `#${SECRET_TAG}`]);
	});

	it('breadcrumbs the declared folder rather than the import path', () => {
		const player = importedNoteFor(PLAYER_ACTOR.id);
		render(player);

		expect(container.querySelector('[data-testid="note-folder"]')?.textContent).toBe(
			'Lore / Ruins',
		);
		// `sourcePath` is the DM's archive layout and is not what the folder filter matches.
		expect(player.fields['sourcePath']).toBe(IMPORTED_NOTE.path);
		expect(container.textContent).not.toContain('Session Prep');
	});

	it('caps the scent line at two tags so it cannot crowd a 320px card', () => {
		const note = importedNoteFor(DM_ACTOR.id);
		const crowded: ContentItemView = {
			...note,
			body: 'Everything at once. #one #two #three #four',
		};

		expect(noteListFacets(crowded).tags).toEqual(['one', 'two']);
	});

	it('renders nothing for a note with neither a folder nor a tag', () => {
		const note = importedNoteFor(DM_ACTOR.id);
		render({ ...note, body: 'Just prose.', fields: {} });

		expect(container.textContent).toBe('');
	});
});
