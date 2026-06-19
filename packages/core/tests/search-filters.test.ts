import { describe, expect, it } from 'vitest';
import {
	createDemoMapState,
	dispatchCommand,
	searchVaultForActor,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type CustomDate,
	type SearchFilter,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * SRCH-003 — FACETED SEARCH: filter search by source, content type, tag, folder, date, and a
 * VISIBILITY-SAFE RELATIONSHIP. Tests are the primary evidence.
 *
 * The search is composed from the EXISTING actor-filtered reads (content CONTENT-011, maps MAP-018), so a
 * `dm-only` note/object/POI is never even a candidate. These tests prove the FACET layer preserves the
 * no-leak guarantee — a player never sees a hidden hit, a hidden facet, a hidden relationship match, or a
 * count revealing one (AC1, AC4) — that all facets combine (AC3), that the active filters are echoed (AC3),
 * and that a referenced unavailable source is marked WITHOUT failing the whole search (AC2).
 */

const HARPTOS_PAYLOAD = {
	id: 'cal-harptos',
	name: 'Calendar of Harptos',
	months: [
		{ id: 'm1', name: 'Hammer', days: 30 },
		{ id: 'm2', name: 'Alturiak', days: 28 },
		{ id: 'm3', name: 'Ches', days: 31 },
	],
	epochLabel: 'DR',
};

function base(...actors: Actor[]): CoreStateSlice {
	const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR, ...actors);
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

function dateOf(month: number, day: number, year = 1372): CustomDate {
	return { calendarId: 'cal-harptos', year, month, day };
}

function withCalendar(state: CoreStateSlice, env: CoreEnvironment): CoreStateSlice {
	return accepted(dispatchCommand(state, env, cmd('content.define-calendar', HARPTOS_PAYLOAD))).nextState;
}

interface NoteInput {
	title: string;
	body?: string;
	visibility?: 'dm-only' | 'player-visible' | 'shared';
	fields?: Record<string, unknown>;
	date?: CustomDate;
	kind?: 'note' | 'object';
}

function createNote(
	state: CoreStateSlice,
	env: CoreEnvironment,
	input: NoteInput,
): { state: CoreStateSlice; itemId: string } {
	const result = accepted(
		dispatchCommand(
			state,
			env,
			cmd('content.create-item', {
				kind: input.kind ?? 'note',
				title: input.title,
				body: input.body ?? `Body of ${input.title}`,
				visibility: input.visibility ?? 'player-visible',
				...(input.fields ? { fields: input.fields } : {}),
				...(input.date ? { dateFields: { occursOn: input.date } } : {}),
			}),
		),
	);
	const item = Object.values(result.nextState.content.items).find((i) => i.title === input.title);
	if (!item) throw new Error(`item ${input.title} not created`);
	return { state: result.nextState, itemId: item.id };
}

function search(state: CoreStateSlice, actorId: string, filter: SearchFilter) {
	return searchVaultForActor(state.content, state.maps, state.permissions, state.session, actorId, filter);
}

describe('SRCH-003 faceted search — fail-closed basics', () => {
	it('returns an empty result for an unknown actor (fail closed)', () => {
		const env = makeEnvironment();
		const state = createNote(base(), env, { title: 'Visible Lore' }).state;
		const result = search(state, 'nobody', {});
		expect(result.hits).toEqual([]);
		expect(result.totalCount).toBe(0);
	});

	it('an empty filter matches all of the actor visible content + POIs, echoing no active facets', () => {
		const env = makeEnvironment();
		let state = base();
		state = createNote(state, env, { title: 'Town of Highmoor' }).state;
		const result = search(state, DM_ACTOR.id, {});
		// At least the note + the demo POIs the DM can see.
		expect(result.hits.some((h) => h.title === 'Town of Highmoor')).toBe(true);
		expect(result.hits.some((h) => h.type === 'poi')).toBe(true);
		expect(result.activeFilters.query).toBeNull();
		expect(result.activeFilters.sources).toEqual([]);
	});
});

describe('SRCH-003 AC1/AC4 — visibility is enforced before search and counts never leak', () => {
	it('a dm-only note is omitted for a player AND not counted (no leak)', () => {
		const env = makeEnvironment();
		let state = base();
		state = createNote(state, env, { title: 'Public Festival', visibility: 'player-visible' }).state;
		state = createNote(state, env, { title: 'Secret Ritual', visibility: 'dm-only' }).state;

		const dm = search(state, DM_ACTOR.id, { contentTypes: ['note'] });
		expect(dm.hits.map((h) => h.title).sort()).toEqual(['Public Festival', 'Secret Ritual']);
		expect(dm.countsByType.note).toBe(2);

		const player = search(state, PLAYER_ACTOR.id, { contentTypes: ['note'] });
		expect(player.hits.map((h) => h.title)).toEqual(['Public Festival']);
		expect(player.countsByType.note).toBe(1);
		// The hidden title appears NOWHERE in the player's result (no facet/hint/count leak).
		expect(JSON.stringify(player)).not.toContain('Secret Ritual');
	});

	it('a dm-only POI (on the demo dm-only layer) never appears in a player search', () => {
		const state = base();
		// The DM sees the hidden-camp POI on `layer-hidden-camps`; the player does not.
		const dm = search(state, DM_ACTOR.id, { contentTypes: ['poi'] });
		const player = search(state, PLAYER_ACTOR.id, { contentTypes: ['poi'] });
		expect(dm.hits.length).toBeGreaterThan(player.hits.length);
		// Whatever the DM-only POI labels are, the player's serialized result never carries a dm-only POI.
		const dmPoiIds = new Set(dm.hits.map((h) => h.id));
		const playerPoiIds = new Set(player.hits.map((h) => h.id));
		expect([...playerPoiIds].every((id) => dmPoiIds.has(id))).toBe(true);
		expect(player.countsByType.poi).toBe(player.hits.length);
	});
});

describe('SRCH-003 AC3 — facets combine and the active filters are listed', () => {
	it('combines source + content type + tag + folder + date + text, all applied together', () => {
		const env = makeEnvironment();
		let state = withCalendar(base(), env);
		// The target: a local-markdown note, in the "lore" folder, tagged #ancient, dated Hammer 5, matching "rune".
		state = createNote(state, env, {
			title: 'The Rune Stone',
			body: 'An ancient rune is carved here. #ancient',
			fields: { 'dndtools.source': 'local-markdown', 'dndtools.folder': 'lore' },
			date: dateOf(1, 5),
		}).state;
		// Decoys that each fail exactly one facet.
		state = createNote(state, env, {
			title: 'Rune Stone (wrong folder)',
			body: 'An ancient rune. #ancient',
			fields: { 'dndtools.source': 'local-markdown', 'dndtools.folder': 'quests' },
			date: dateOf(1, 5),
		}).state;
		state = createNote(state, env, {
			title: 'Rune Stone (wrong date)',
			body: 'An ancient rune. #ancient',
			fields: { 'dndtools.source': 'local-markdown', 'dndtools.folder': 'lore' },
			date: dateOf(3, 20),
		}).state;
		state = createNote(state, env, {
			title: 'Rune Stone (wrong tag)',
			body: 'An ancient rune.',
			fields: { 'dndtools.source': 'local-markdown', 'dndtools.folder': 'lore' },
			date: dateOf(1, 5),
		}).state;

		const filter: SearchFilter = {
			query: 'rune',
			sources: ['local-markdown'],
			contentTypes: ['note'],
			tags: ['ancient'],
			folder: 'lore',
			dateRange: { calendarId: 'cal-harptos', from: dateOf(1, 1), to: dateOf(1, 30) },
		};
		const result = search(state, DM_ACTOR.id, filter);
		expect(result.hits.map((h) => h.title)).toEqual(['The Rune Stone']);
		expect(result.totalCount).toBe(1);
		// AC3 — the active filters are echoed in the metadata.
		expect(result.activeFilters.query).toBe('rune');
		expect(result.activeFilters.sources).toEqual(['local-markdown']);
		expect(result.activeFilters.tags).toEqual(['ancient']);
		expect(result.activeFilters.folder).toBe('lore');
		expect(result.activeFilters.dateRange).not.toBeNull();
	});

	it('requires ALL listed tags to match (tag facet is AND, not OR)', () => {
		const env = makeEnvironment();
		let state = base();
		state = createNote(state, env, { title: 'Both', body: 'x #red #blue' }).state;
		state = createNote(state, env, { title: 'OnlyRed', body: 'x #red' }).state;
		const result = search(state, DM_ACTOR.id, { tags: ['red', 'blue'], contentTypes: ['note'] });
		expect(result.hits.map((h) => h.title)).toEqual(['Both']);
	});
});

describe('SRCH-003 AC2 — a referenced unavailable source is marked, not failed', () => {
	it('marks an offline source stale-cached while still returning its + other sources cached hits', () => {
		const env = makeEnvironment();
		let state = base();
		// A local note (available) + an obsidian note marked source-unavailable.
		state = createNote(state, env, {
			title: 'Local Note',
			fields: { 'dndtools.source': 'local-markdown' },
		}).state;
		state = createNote(state, env, {
			title: 'Obsidian Note',
			fields: { 'dndtools.source': 'obsidian', 'dndtools.sourceUnavailable': true },
		}).state;

		const result = search(state, DM_ACTOR.id, { contentTypes: ['note'] });
		// The whole search did NOT fail: both cached notes are returned.
		expect(result.hits.map((h) => h.title).sort()).toEqual(['Local Note', 'Obsidian Note']);
		const obsidian = result.sourceStatus.find((s) => s.source === 'obsidian');
		expect(obsidian?.freshness).toBe('stale-cached');
		const local = result.sourceStatus.find((s) => s.source === 'local-markdown');
		expect(local?.freshness).toBe('fresh');
	});

	it('a source the user filtered OUT does not appear in sourceStatus even if it has content', () => {
		const env = makeEnvironment();
		let state = createNote(base(), env, {
			title: 'Local Note',
			fields: { 'dndtools.source': 'local-markdown' },
		}).state;
		state = createNote(state, env, {
			title: 'Obsidian Note',
			fields: { 'dndtools.source': 'obsidian' },
		}).state;

		// Filter the search to local-markdown only.
		const result = search(state, DM_ACTOR.id, { sources: ['local-markdown'], contentTypes: ['note'] });
		expect(result.hits.map((h) => h.title)).toEqual(['Local Note']);
		// obsidian was filtered OUT — it must not appear in sourceStatus despite having visible content.
		expect(result.sourceStatus.find((s) => s.source === 'obsidian')).toBeUndefined();
		expect(result.sourceStatus.find((s) => s.source === 'local-markdown')).toBeDefined();
	});

	it('reports an explicitly-requested source with no visible content as unavailable', () => {
		const env = makeEnvironment();
		const state = createNote(base(), env, {
			title: 'Local Only',
			fields: { 'dndtools.source': 'local-markdown' },
		}).state;
		// Request google-docs, which has no content: the search still runs over the (empty) set.
		const result = search(state, DM_ACTOR.id, { sources: ['google-docs'], contentTypes: ['note'] });
		expect(result.hits).toEqual([]);
		const drive = result.sourceStatus.find((s) => s.source === 'google-docs');
		expect(drive?.freshness).toBe('unavailable');
	});
});

describe('SRCH-003 AC4 — the visibility-safe relationship filter', () => {
	it('restricts to notes the visible anchor wikilinks to (visible graph only)', () => {
		const env = makeEnvironment();
		let state = base();
		// Anchor links to two targets; one target is dm-only so it is NOT in the player visible graph.
		const visible = createNote(state, env, { title: 'Allied Town', visibility: 'player-visible' });
		state = visible.state;
		const hidden = createNote(state, env, { title: 'Secret Cult', visibility: 'dm-only' });
		state = hidden.state;
		const anchor = createNote(state, env, {
			title: 'Quest Hub',
			body: 'See [[Allied Town]] and [[Secret Cult]].',
			visibility: 'player-visible',
		});
		state = anchor.state;

		// The DM relationship search from the anchor includes BOTH linked notes.
		const dm = search(state, DM_ACTOR.id, {
			relationship: { anchorKind: 'content', anchorId: anchor.itemId },
		});
		expect(dm.hits.map((h) => h.title).sort()).toEqual(['Allied Town', 'Secret Cult']);

		// The player relationship search includes ONLY the visible linked note — the dm-only target is not
		// a candidate (the link resolves to no visible note), so it never appears as a result/hint/count.
		const player = search(state, PLAYER_ACTOR.id, {
			relationship: { anchorKind: 'content', anchorId: anchor.itemId },
		});
		expect(player.hits.map((h) => h.title)).toEqual(['Allied Town']);
		expect(JSON.stringify(player)).not.toContain('Secret Cult');
	});

	it('a relationship anchored on a HIDDEN entity resolves to nothing (no leak of related content)', () => {
		const env = makeEnvironment();
		let state = base();
		const target = createNote(state, env, { title: 'Linked Note', visibility: 'player-visible' });
		state = target.state;
		// A dm-only anchor that links to a visible note.
		const anchor = createNote(state, env, {
			title: 'DM Only Hub',
			body: 'See [[Linked Note]].',
			visibility: 'dm-only',
		});
		state = anchor.state;

		// The player anchors a relationship on a saved/ad-hoc filter referencing the dm-only anchor id.
		// Because the anchor is not in the player's visible graph, the relationship resolves to nothing —
		// the player cannot use a relationship filter to discover what a hidden anchor links to.
		const player = search(state, PLAYER_ACTOR.id, {
			relationship: { anchorKind: 'content', anchorId: anchor.itemId },
		});
		expect(player.hits).toEqual([]);
	});
});

describe('SRCH-003 — deterministic ordering', () => {
	it('orders title-matches first then by stable type + id, reproducibly across runs', () => {
		const env = makeEnvironment();
		let state = base();
		state = createNote(state, env, { title: 'Alpha rune', body: 'plain' }).state; // title match
		state = createNote(state, env, { title: 'Zeta', body: 'has a rune in body' }).state; // body match
		const a = search(state, DM_ACTOR.id, { query: 'rune', contentTypes: ['note'] });
		const b = search(state, DM_ACTOR.id, { query: 'rune', contentTypes: ['note'] });
		expect(a.hits.map((h) => h.title)).toEqual(['Alpha rune', 'Zeta']);
		expect(a.hits.map((h) => h.id)).toEqual(b.hits.map((h) => h.id));
	});
});
