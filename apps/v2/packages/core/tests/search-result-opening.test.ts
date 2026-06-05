import { describe, expect, it } from 'vitest';
import {
	createDemoMapState,
	dispatchCommand,
	resolveDeepLink,
	resolveSearchResultOpen,
	searchVaultForActor,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	type DeepLinkStateView,
	type SearchResultOpenTarget,
} from '../src';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * SRCH-007 — a user can OPEN a search result into the correct route, Scene, map viewport, note heading, or
 * object view while preserving browser history and search parameters. Tests are the primary evidence.
 *
 * The opening surface COMPOSES the single deep-link resolver: a chosen hit's domain maps to a
 * {@link DeepLinkTarget}, visibility is RE-CHECKED at open time through the same actor-filtered reads, and a
 * now-hidden/now-deleted target degrades to the generic unavailable. These tests prove:
 *   - AC1: a POI result focuses the map viewport on the POI's `x`/`y` and preserves the map+poi parameters.
 *   - AC2: a note-heading result opens the note and restores the heading hash + scroll anchor.
 *   - Open-time re-check + fail-closed: a hidden/deleted target opens to the generic unavailable (no leak).
 */

const env = makeEnvironment();

function base(): CoreStateSlice {
	const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	return { ...state, maps: createDemoMapState() };
}

function cmd(type: CoreCommand['type'], payload: unknown, actorId = DM_ACTOR.id): CoreCommand {
	return { type, actorId, payload } as CoreCommand;
}

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got ${JSON.stringify(result.rejection)}`);
	}
	return result;
}

function createNote(
	state: CoreStateSlice,
	input: { title: string; body?: string; visibility?: 'dm-only' | 'player-visible' | 'shared' },
): { state: CoreStateSlice; itemId: string } {
	const result = accepted(
		dispatchCommand(
			state,
			env,
			cmd('content.create-item', {
				kind: 'note',
				title: input.title,
				body: input.body ?? `Body of ${input.title}`,
				visibility: input.visibility ?? 'player-visible',
			}),
		),
	);
	const item = Object.values(result.nextState.content.items).find((i) => i.title === input.title);
	if (!item) throw new Error(`item ${input.title} not created`);
	return { state: result.nextState, itemId: item.id };
}

/** The full deep-link state view a result-open resolution reads (content + session included). */
function view(state: CoreStateSlice): DeepLinkStateView {
	return {
		scenes: state.scenes,
		maps: state.maps,
		permissions: state.permissions,
		content: state.content,
		session: state.session,
	};
}

describe('SRCH-007 AC1 — a POI result focuses the map viewport and preserves parameters', () => {
	it('opens a visible POI result onto its map, focusing the POI coordinate', () => {
		const state = base();
		// Harbor Town is a player-visible POI on the player-visible Western Reaches map at (0.62, 0.34).
		const open: SearchResultOpenTarget = { type: 'poi', id: 'poi-harbor-town', mapId: 'map-western-reaches' };
		const result = resolveSearchResultOpen(view(state), DM_ACTOR.id, open);
		expect(result.kind).toBe('restore');
		if (result.kind === 'restore') {
			expect(result.type).toBe('poi');
			expect(result.route).toBe('/atlas/');
			expect(result.entityId).toBe('map-western-reaches');
			expect(result.selectionId).toBe('poi-harbor-town');
			// AC1 — the viewport focus carries the POI's normalized x/y so the GUI centers on it.
			expect(result.viewport).toEqual({ mapId: 'map-western-reaches', x: 0.62, y: 0.34 });
		}
	});

	it('the chosen hit descriptor comes straight from the rendered search result (round-trip)', () => {
		const state = base();
		// The DM searches; the POI hit it renders is opened by its OWN type/id/mapId — no re-derivation.
		const search = searchVaultForActor(
			state.content,
			state.maps,
			state.permissions,
			state.session,
			DM_ACTOR.id,
			{ query: 'harbor', contentTypes: ['poi'] },
		);
		const hit = search.hits.find((h) => h.id === 'poi-harbor-town');
		expect(hit).toBeDefined();
		const result = resolveSearchResultOpen(view(state), DM_ACTOR.id, {
			type: hit!.type,
			id: hit!.id,
			mapId: hit!.mapId,
		});
		expect(result.kind).toBe('restore');
		if (result.kind === 'restore') expect(result.viewport?.mapId).toBe('map-western-reaches');
	});

	it('a player cannot open a dm-only POI result — it fails closed to the generic unavailable', () => {
		const state = base();
		// Smugglers' Cache is a dm-only POI on the player-visible map — never resolvable for a player.
		const result = resolveSearchResultOpen(view(state), PLAYER_ACTOR.id, {
			type: 'poi',
			id: 'poi-smugglers-cache',
			mapId: 'map-western-reaches',
		});
		expect(result.kind).toBe('unavailable');
		if (result.kind === 'unavailable') {
			// The generic message names no entity (no leak of the hidden POI).
			expect(result.message).not.toContain('Smugglers');
		}
	});

	it('a POI result without a map id opens the Atlas section rather than guessing', () => {
		const state = base();
		const result = resolveSearchResultOpen(view(state), DM_ACTOR.id, {
			type: 'poi',
			id: 'poi-harbor-town',
			mapId: null,
		});
		// No map id ⇒ we cannot address the POI; the user still lands on the right section (fail closed).
		expect(result.kind).toBe('restore');
		if (result.kind === 'restore') expect(result.route).toBe('/atlas/');
	});
});

describe('SRCH-007 AC2 — a note-heading result restores hash navigation + scroll semantics', () => {
	it('opens a note result with a matching heading anchor restored as the hash', () => {
		const { state } = createNote(base(), {
			title: 'Harbor Lore',
			body: '# Overview\n\nThe harbor glows.\n\n## Hidden Cove\n\nA quiet inlet.',
		});
		const item = Object.values(state.content.items).find((i) => i.title === 'Harbor Lore')!;
		const open: SearchResultOpenTarget = { type: 'note', id: item.id, headingAnchor: 'hidden-cove' };
		const result = resolveSearchResultOpen(view(state), DM_ACTOR.id, open);
		expect(result.kind).toBe('restore');
		if (result.kind === 'restore') {
			expect(result.type).toBe('note');
			expect(result.route).toBe('/knowledge/');
			// AC2 — the heading hash + scroll target are restored (a deterministic slug + its label).
			expect(result.hashAnchor).toBe('hidden-cove');
			expect(result.selectionId).toBe('hidden-cove');
			expect(result.selectionLabel).toBe('Hidden Cove');
		}
	});

	it('a stale heading anchor degrades to the note root rather than 404-ing', () => {
		const { state } = createNote(base(), { title: 'Trail Notes', body: '# Day One\n\nWe set out.' });
		const item = Object.values(state.content.items).find((i) => i.title === 'Trail Notes')!;
		const result = resolveSearchResultOpen(view(state), DM_ACTOR.id, {
			type: 'note',
			id: item.id,
			headingAnchor: 'a-heading-that-was-removed',
		});
		expect(result.kind).toBe('restore');
		if (result.kind === 'restore') {
			// The note still opens; the unmatched anchor is dropped (graceful degrade, NAV-005 AC3).
			expect(result.route).toBe('/knowledge/');
			expect(result.hashAnchor).toBeNull();
		}
	});

	it('opens a note result with no anchor at the note root', () => {
		const { state } = createNote(base(), { title: 'Plain Note', body: 'No headings here.' });
		const item = Object.values(state.content.items).find((i) => i.title === 'Plain Note')!;
		const result = resolveSearchResultOpen(view(state), DM_ACTOR.id, { type: 'note', id: item.id });
		expect(result.kind).toBe('restore');
		if (result.kind === 'restore') {
			expect(result.route).toBe('/knowledge/');
			expect(result.hashAnchor).toBeNull();
			expect(result.entityName).toBe('Plain Note');
		}
	});
});

describe('SRCH-007 — open-time visibility re-check fails closed', () => {
	it('a dm-only note result is generic-unavailable to a player (no title leak)', () => {
		const { state } = createNote(base(), {
			title: 'Secret Cache',
			body: '# Loot\n\nA pile of gold.',
			visibility: 'dm-only',
		});
		const item = Object.values(state.content.items).find((i) => i.title === 'Secret Cache')!;
		const result = resolveSearchResultOpen(view(state), PLAYER_ACTOR.id, {
			type: 'note',
			id: item.id,
			headingAnchor: 'loot',
		});
		expect(result.kind).toBe('unavailable');
		if (result.kind === 'unavailable') {
			expect(result.message).not.toContain('Secret Cache');
			expect(result.message).not.toContain('Loot');
		}
	});

	it('a note that has since been deleted opens to the generic unavailable (no crash)', () => {
		const created = createNote(base(), { title: 'Doomed Note', body: 'Soon gone.' });
		const item = Object.values(created.state.content.items).find((i) => i.title === 'Doomed Note')!;
		const deleted = accepted(
			dispatchCommand(created.state, env, cmd('content.remove-item', { itemId: item.id })),
		);
		const result = resolveSearchResultOpen(view(deleted.nextState), DM_ACTOR.id, {
			type: 'note',
			id: item.id,
		});
		// The deleted (tombstoned) note is absent from the actor-filtered read ⇒ generic unavailable.
		expect(result.kind).toBe('unavailable');
	});

	it('an unknown actor cannot open any result (fail closed)', () => {
		const state = base();
		const result = resolveSearchResultOpen(view(state), 'actor-nobody', {
			type: 'poi',
			id: 'poi-harbor-town',
			mapId: 'map-western-reaches',
		});
		expect(result.kind).toBe('unavailable');
	});

	it('a note/object hit whose declared type mismatches the stored kind does not resolve', () => {
		const { state } = createNote(base(), { title: 'Real Note', body: 'A note.' });
		const item = Object.values(state.content.items).find((i) => i.title === 'Real Note')!;
		// Opening the note id but claiming it is an `object` must not resolve (no cross-kind leak).
		const result = resolveSearchResultOpen(view(state), DM_ACTOR.id, { type: 'object', id: item.id });
		expect(result.kind).toBe('unavailable');
	});
});

describe('SRCH-007 — the deep-link resolver itself resolves POI + note targets', () => {
	it('resolveDeepLink focuses a POI viewport directly (the composed primitive)', () => {
		const state = base();
		const result = resolveDeepLink(view(state), DM_ACTOR.id, {
			type: 'poi',
			entityId: 'map-western-reaches',
			selectionId: 'poi-harbor-town',
			sectionId: 'atlas',
		});
		expect(result.kind).toBe('restore');
		if (result.kind === 'restore') expect(result.viewport).toEqual({
			mapId: 'map-western-reaches',
			x: 0.62,
			y: 0.34,
		});
	});

	it('a note deep link without a content slice reports not-cached (offline / not provided)', () => {
		const state = base();
		const result = resolveDeepLink(
			{ scenes: state.scenes, maps: state.maps, permissions: state.permissions },
			DM_ACTOR.id,
			{ type: 'note', entityId: 'note-anything', sectionId: 'knowledge' },
		);
		expect(result.kind).toBe('unavailable');
		if (result.kind === 'unavailable') expect(result.reason).toBe('not-cached');
	});
});
