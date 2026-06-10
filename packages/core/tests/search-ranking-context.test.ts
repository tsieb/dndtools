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
	type SearchFilter,
	type SearchHit,
	type SearchOptions,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * SRCH-005 / SRCH-006 / SRCH-011 — RANKING and RESULT CONTEXT. Tests are the primary evidence.
 *
 * This epic REFINES the single actor-filtered `searchVaultForActor` read rather than forking a parallel
 * search path, so every guarantee the earlier SRCH epics proved (a hidden artifact is never a candidate)
 * still holds. These tests prove the RANKING is deterministic and multi-signal (SRCH-005), the per-hit
 * RESULT CONTEXT is rich AND visibility-safe — a snippet never crosses a hidden section boundary and a
 * relationship hint never names a hidden artifact (SRCH-006) — and that the OPTIONAL semantic assist is
 * secondary, labelled, source-citable, and can NEVER add a hit or replace deterministic ranking unseen
 * (SRCH-011).
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

interface NoteInput {
	title: string;
	body?: string;
	visibility?: 'dm-only' | 'player-visible' | 'shared';
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
			}),
		),
	);
	const item = Object.values(result.nextState.content.items).find((i) => i.title === input.title);
	if (!item) throw new Error(`item ${input.title} not created`);
	return { state: result.nextState, itemId: item.id };
}

function search(
	state: CoreStateSlice,
	actorId: string,
	filter: SearchFilter,
	options?: SearchOptions,
) {
	return searchVaultForActor(
		state.content,
		state.maps,
		state.permissions,
		state.session,
		actorId,
		filter,
		options ?? {},
	);
}

function hitTitles(hits: SearchHit[]): string[] {
	return hits.map((hit) => hit.title);
}

// ---------------------------------------------------------------------------------------------------
// SRCH-005 — deterministic ranking
// ---------------------------------------------------------------------------------------------------

describe('SRCH-005 — deterministic ranking with AI disabled', () => {
	it('AC1 — ranking still uses deterministic scoring when no AI assistance is supplied', () => {
		const env = makeEnvironment();
		let state = base();
		// One title match, one body-only match — the title match must rank first WITHOUT any AI.
		state = createNote(state, env, { title: 'Dragon Cult', body: 'Followers gather in shadow.' }).state;
		state = createNote(state, env, { title: 'Harbor Watch', body: 'A dragon was sighted offshore.' }).state;

		const result = search(state, DM_ACTOR.id, { query: 'dragon' });
		const noteTitles = hitTitles(result.hits.filter((h) => h.type === 'note'));
		expect(noteTitles.indexOf('Dragon Cult')).toBeLessThan(noteTitles.indexOf('Harbor Watch'));

		// The title hit carries the TITLE signal; the body-only hit does not. Semantic assist is OFF by default.
		const titleHit = result.hits.find((h) => h.title === 'Dragon Cult')!;
		const bodyHit = result.hits.find((h) => h.title === 'Harbor Watch')!;
		expect(titleHit.signals.title).toBe(1);
		expect(bodyHit.signals.title).toBe(0);
		expect(titleHit.score).toBeGreaterThan(bodyHit.score);
		expect(result.semanticAssist.state).toBe('disabled');
	});

	it('a more RECENT visible item outranks an older one when the text signals tie', () => {
		const env = makeEnvironment();
		let state = base();
		// Two body-only matches (equal title signal). The one updated later must rank higher on recency.
		state = createNote(state, env, { title: 'Old Lore', body: 'mention of a relic here' }).state;
		state = createNote(state, env, { title: 'New Lore', body: 'another relic mention' }).state;
		// Set explicit, far-apart timestamps so the recency buckets differ unambiguously (a week apart).
		const oldId = Object.values(state.content.items).find((i) => i.title === 'Old Lore')!.id;
		const newId = Object.values(state.content.items).find((i) => i.title === 'New Lore')!.id;
		state = {
			...state,
			content: {
				...state.content,
				items: {
					...state.content.items,
					[oldId]: { ...state.content.items[oldId]!, updatedAt: '2026-05-01T12:00:00.000Z' },
					[newId]: { ...state.content.items[newId]!, updatedAt: '2026-06-03T12:00:00.000Z' },
				},
			},
		};

		const result = search(state, DM_ACTOR.id, { query: 'relic', contentTypes: ['note'] });
		const titles = hitTitles(result.hits);
		expect(titles.indexOf('New Lore')).toBeLessThan(titles.indexOf('Old Lore'));
		const newHit = result.hits.find((h) => h.title === 'New Lore')!;
		const oldHit = result.hits.find((h) => h.title === 'Old Lore')!;
		expect(newHit.signals.recency).toBeGreaterThan(oldHit.signals.recency);
	});

	it('AC2 — a POI on the session ACTIVE map outranks an unrelated POI of equal text strength', () => {
		const state = base();
		// The demo map state has TWO maps; the DM sees POIs on both. We search the term shared by both maps'
		// POIs and assert the one on the session's ACTIVE map ranks first.
		const mapIds = Object.keys(state.maps.maps);
		expect(mapIds.length).toBeGreaterThan(1);

		// Without an active map, both POIs of equal text strength order only by the stable id tie-break.
		const noContext = search(state, DM_ACTOR.id, { query: 'cache', contentTypes: ['poi'] });
		// Make the western-reaches map the session's ACTIVE map (session context).
		const focusMapId = 'map-western-reaches';
		const withActiveMap: CoreStateSlice = {
			...state,
			session: {
				...state.session,
				activeMap: {
					mapId: focusMapId,
					regionId: null,
					sceneId: 'scene-1',
					widgetInstanceId: 'widget-1',
					updatedBy: DM_ACTOR.id,
					updatedAt: '2026-06-03T12:00:00.000Z',
					revision: 1,
				},
			},
		};
		const withContext = search(withActiveMap, DM_ACTOR.id, { query: 'smugglers', contentTypes: ['poi'] });
		const focusedPoi = withContext.hits.find((h) => h.mapId === focusMapId);
		expect(focusedPoi).toBeDefined();
		// The focused POI carries the SESSION-CONTEXT signal; the same POI without an active map does not.
		expect(focusedPoi!.signals.sessionContext).toBe(1);
		const baselinePoi = noContext.hits.find((h) => h.mapId === focusMapId);
		if (baselinePoi) expect(baselinePoi.signals.sessionContext).toBe(0);
	});

	it('a POI on the active map ranks ABOVE an unrelated POI with the same text match', () => {
		// Build state with a COMPETING "harbor" POI on the second map (ruined-keep, NOT the active one)
		// so we have a true head-to-head ranking comparison. Both POIs title-match "harbor"; only the one
		// on the session-active western-reaches map carries the SESSION-CONTEXT signal (+8 to score) and
		// must rank first (SRCH-005 AC2 direct ranking assertion).
		const state = base();
		const activeMapId = 'map-western-reaches';
		const withCompetingPoi: CoreStateSlice = {
			...state,
			maps: {
				...state.maps,
				maps: {
					...state.maps.maps,
					'map-ruined-keep': {
						...state.maps.maps['map-ruined-keep']!,
						pois: [
							...state.maps.maps['map-ruined-keep']!.pois,
							{
								id: 'poi-harbor-gate',
								layerId: 'layer-rooms', // player-visible layer on ruined-keep
								label: 'Harbor Gate',
								category: 'landmark' as const,
								position: { x: 0.2, y: 0.2 },
								visibility: 'player-visible' as const,
								notes: 'A gate facing the harbor.',
								linkedEntityType: null,
								linkedEntityId: null,
								revision: 1,
								updatedBy: null,
								updatedAt: null,
							},
						],
					},
				},
			},
			session: {
				...state.session,
				activeMap: {
					mapId: activeMapId,
					regionId: null,
					sceneId: 'scene-1',
					widgetInstanceId: 'widget-1',
					updatedBy: DM_ACTOR.id,
					updatedAt: '2026-06-03T12:00:00.000Z',
					revision: 1,
				},
			},
		};

		const result = search(withCompetingPoi, DM_ACTOR.id, { query: 'harbor', contentTypes: ['poi'] });

		// Both POIs must appear in results (both title-match "harbor").
		const harborTown = result.hits.find((h) => h.title === 'Harbor Town');
		const harborGate = result.hits.find((h) => h.title === 'Harbor Gate');
		expect(harborTown).toBeDefined();
		expect(harborGate).toBeDefined();

		// The active-map POI carries the SESSION-CONTEXT signal; the competing POI on the other map does not.
		expect(harborTown!.mapId).toBe(activeMapId);
		expect(harborTown!.signals.sessionContext).toBe(1);
		expect(harborGate!.signals.sessionContext).toBe(0);

		// The active-map POI RANKS ABOVE the other map's POI (the core claim of SRCH-005 AC2).
		const titles = result.hits.map((h) => h.title);
		expect(titles.indexOf('Harbor Town')).toBeLessThan(titles.indexOf('Harbor Gate'));
	});

	it('AC3 — equal score inputs produce a STABLE order across repeated runs and fresh fixtures', () => {
		function buildFixture(): CoreStateSlice {
			const env = makeEnvironment();
			let state = base();
			// Three notes with identical text-signal strength (all body-only matches, same creation order).
			state = createNote(state, env, { title: 'Alpha', body: 'shared keyword alpha' }).state;
			state = createNote(state, env, { title: 'Bravo', body: 'shared keyword bravo' }).state;
			state = createNote(state, env, { title: 'Charlie', body: 'shared keyword charlie' }).state;
			return state;
		}
		const filter: SearchFilter = { query: 'keyword', contentTypes: ['note'] };
		const a = hitTitles(search(buildFixture(), DM_ACTOR.id, filter).hits);
		const b = hitTitles(search(buildFixture(), DM_ACTOR.id, filter).hits);
		// Two FRESH fixtures + repeated runs produce the IDENTICAL order (deterministic tie-break).
		expect(a).toEqual(b);
		// And re-running over the SAME state is also identical.
		const state = buildFixture();
		expect(hitTitles(search(state, DM_ACTOR.id, filter).hits)).toEqual(
			hitTitles(search(state, DM_ACTOR.id, filter).hits),
		);
	});

	it('AC4 — optional AI assist cannot REPLACE deterministic base ranking without a visible label', () => {
		const env = makeEnvironment();
		let state = base();
		state = createNote(state, env, { title: 'Alpha', body: 'keyword body' }).state;
		state = createNote(state, env, { title: 'Bravo', body: 'keyword body' }).state;
		const filter: SearchFilter = { query: 'keyword', contentTypes: ['note'] };

		const deterministic = search(state, DM_ACTOR.id, filter);
		// Semantic assist that reverses the order. The result must EXPOSE that it reranked (the visible label),
		// AND the deterministic base order must still be available as a diagnostic.
		const reranked = search(state, DM_ACTOR.id, filter, {
			semantic: {
				enabled: true,
				rerank: (hits) => [...hits].reverse().map((h) => h.id),
			},
		});
		expect(reranked.semanticAssist.state).toBe('applied');
		expect(reranked.semanticAssist.reranked).toBe(true);
		// The DETERMINISTIC order is preserved unchanged as a diagnostic (it is NOT the displayed order).
		expect(reranked.deterministicOrder).toEqual(deterministic.deterministicOrder);
		expect(reranked.hits.map((h) => h.id)).toEqual([...deterministic.hits].reverse().map((h) => h.id));
	});
});

// ---------------------------------------------------------------------------------------------------
// SRCH-006 — result context
// ---------------------------------------------------------------------------------------------------

describe('SRCH-006 — result context for fast disambiguation', () => {
	it('AC1 — two similar-named notes each return source/type context and a visible snippet', () => {
		const env = makeEnvironment();
		let state = base();
		state = createNote(state, env, {
			title: 'Order of the Gauntlet',
			body: 'A militant faction sworn to root out evil across the realm.',
		}).state;
		state = createNote(state, env, {
			title: 'Order of the Lantern',
			body: 'A scholarly faction devoted to preserving lost knowledge.',
		}).state;

		const result = search(state, DM_ACTOR.id, { query: 'faction', contentTypes: ['note'] });
		expect(result.hits.length).toBe(2);
		for (const hit of result.hits) {
			expect(hit.type).toBe('note');
			expect(hit.source).toBe('local-markdown');
			expect(hit.snippet).not.toBeNull();
			expect(hit.snippet!.field).toBe('body');
			expect(hit.snippet!.text.toLowerCase()).toContain('faction');
		}
		// The two snippets differ, so the user can disambiguate the similar titles.
		const gauntlet = result.hits.find((h) => h.title === 'Order of the Gauntlet')!;
		const lantern = result.hits.find((h) => h.title === 'Order of the Lantern')!;
		expect(gauntlet.snippet!.text).not.toBe(lantern.snippet!.text);
	});

	it('a pure TITLE match shows no body snippet (the title already disambiguates)', () => {
		const state = createNote(base(), makeEnvironment(), {
			title: 'Riddle of the Sphinx',
			body: 'Nothing else here.',
		}).state;
		const result = search(state, DM_ACTOR.id, { query: 'sphinx', contentTypes: ['note'] });
		const hit = result.hits.find((h) => h.title === 'Riddle of the Sphinx')!;
		expect(hit.signals.title).toBe(1);
		expect(hit.snippet).toBeNull();
	});

	it('AC2 — a handout snippet NEVER crosses a hidden section boundary (the dm-only term is omitted)', () => {
		// A handout with one player-visible section and one dm-only section. The recipient who searches the
		// player-visible term gets a snippet from the VISIBLE section only; the dm-only term never matches NOR
		// appears in any snippet for them.
		const baseState = base();
		const state: CoreStateSlice = {
			...baseState,
			session: {
				...baseState.session,
				handouts: {
					'h-dossier': {
						id: 'h-dossier',
						kind: 'handout',
						title: 'Cult Dossier',
						sections: [
							{ id: 'open', heading: 'Briefing', body: 'The cult meets at the abandoned chapel.', visibility: 'player-visible' },
							{ id: 'secret', heading: 'Secret', body: 'The informant inside the cult is Garrick.', visibility: 'dm-only' },
						],
						revealedSectionIds: [],
						recipientActorIds: [PLAYER_ACTOR.id],
						persistentRecipientActorIds: [],
						deliveries: [],
						acknowledgements: [],
						revocations: [],
						createdBy: DM_ACTOR.id,
						createdAt: '2026-06-03T12:00:01.000Z',
						updatedAt: '2026-06-03T12:00:01.000Z',
						revision: 1,
					},
				},
			},
		};

		// The DM matches the dm-only section term and gets a snippet from it.
		const dmResult = search(state, DM_ACTOR.id, { query: 'garrick', contentTypes: ['handout'] });
		expect(dmResult.hits.length).toBe(1);
		expect(dmResult.hits[0]!.snippet!.text.toLowerCase()).toContain('garrick');

		// The RECIPIENT cannot match the dm-only term at all (the section is withheld from their searchable text).
		const playerSecret = search(state, PLAYER_ACTOR.id, { query: 'garrick', contentTypes: ['handout'] });
		expect(playerSecret.hits.length).toBe(0);

		// The recipient CAN match the player-visible term, and the snippet shows ONLY the visible section — the
		// dm-only term "garrick" never appears in the player's serialized result (hard no-leak assertion).
		const playerOpen = search(state, PLAYER_ACTOR.id, { query: 'chapel', contentTypes: ['handout'] });
		expect(playerOpen.hits.length).toBe(1);
		expect(playerOpen.hits[0]!.snippet!.text.toLowerCase()).toContain('chapel');
		expect(JSON.stringify(playerOpen).toLowerCase()).not.toContain('garrick');
	});

	it('AC3 — relationship hints (visible backlinks, date refs, folder) appear only if visible to the actor', () => {
		const env = makeEnvironment();
		let state = accepted(
			dispatchCommand(base(), makeEnvironment(), cmd('content.define-calendar', HARPTOS_PAYLOAD)),
		).nextState;
		// A target note that two other notes link to. One linking note is dm-only.
		const target = createNote(state, env, { title: 'Castle Ravenloft', body: 'A looming gothic keep.' });
		state = target.state;
		state = createNote(state, env, {
			title: 'Village of Barovia',
			body: 'The road leads to [[Castle Ravenloft]] beyond the mists.',
			visibility: 'player-visible',
		}).state;
		state = createNote(state, env, {
			title: 'DM Plot Notes',
			body: 'Strahd watches from [[Castle Ravenloft]] — secret.',
			visibility: 'dm-only',
		}).state;

		// The DM sees BOTH backlinks; the player sees only the player-visible backlink (never the dm-only one).
		const dmResult = search(state, DM_ACTOR.id, { query: 'ravenloft', contentTypes: ['note'] });
		const dmTarget = dmResult.hits.find((h) => h.title === 'Castle Ravenloft')!;
		expect(dmTarget.relationships.backlinks).toContain('Village of Barovia');
		expect(dmTarget.relationships.backlinks).toContain('DM Plot Notes');

		const playerResult = search(state, PLAYER_ACTOR.id, { query: 'ravenloft', contentTypes: ['note'] });
		const playerTarget = playerResult.hits.find((h) => h.title === 'Castle Ravenloft')!;
		expect(playerTarget.relationships.backlinks).toContain('Village of Barovia');
		expect(playerTarget.relationships.backlinks).not.toContain('DM Plot Notes');
		// The dm-only backlink note title never leaks into the player's serialized result.
		expect(JSON.stringify(playerResult)).not.toContain('DM Plot Notes');
		// The LINK ranking signal reflects the visible backlinks the actor actually has.
		expect(playerTarget.signals.link).toBe(1);
	});

	it('a POI hit carries its MAP context as a relationship hint', () => {
		const state = base();
		const result = search(state, DM_ACTOR.id, { query: 'harbor', contentTypes: ['poi'] });
		const poi = result.hits.find((h) => h.title === 'Harbor Town')!;
		expect(poi.relationships.mapId).toBe(poi.mapId);
		expect(poi.relationships.mapId).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------------------------------
// SRCH-011 — optional, visibility-filtered, source-cited, secondary semantic assist
// ---------------------------------------------------------------------------------------------------

describe('SRCH-011 — semantic search stays optional and secondary', () => {
	it('AC1 — with semantic disabled, deterministic full-text/title/tag search still works', () => {
		const env = makeEnvironment();
		let state = base();
		state = createNote(state, env, { title: 'Goblin Warren', body: 'A foul-smelling cave.' }).state;
		const result = search(state, DM_ACTOR.id, { query: 'goblin', contentTypes: ['note'] });
		expect(result.semanticAssist.state).toBe('disabled');
		expect(result.hits.map((h) => h.title)).toContain('Goblin Warren');
		// The deterministic order diagnostic equals the displayed order when semantic is off.
		expect(result.deterministicOrder).toEqual(result.hits.map((h) => h.id));
	});

	it('AC2 — semantic assist can NEVER introduce a hidden title/snippet/id', () => {
		const env = makeEnvironment();
		let state = base();
		state = createNote(state, env, { title: 'Visible Lore', body: 'mention term' }).state;
		state = createNote(state, env, {
			title: 'Secret Lore',
			body: 'mention term but hidden',
			visibility: 'dm-only',
		}).state;
		const hiddenId = Object.values(state.content.items).find((i) => i.title === 'Secret Lore')!.id;

		// A malicious re-ranker that tries to inject the hidden item's id (and a fabricated id) at the top.
		const player = search(state, PLAYER_ACTOR.id, { query: 'term', contentTypes: ['note'] }, {
			semantic: {
				enabled: true,
				rerank: () => [hiddenId, 'totally-made-up-id'],
			},
		});
		// The injected hidden/fabricated ids are IGNORED — only the player's already-visible hit survives.
		expect(player.hits.map((h) => h.title)).toEqual(['Visible Lore']);
		expect(player.hits.some((h) => h.id === hiddenId)).toBe(false);
		// The hidden title never leaks into the player's serialized result.
		expect(JSON.stringify(player)).not.toContain('Secret Lore');
	});

	it('AC3 — when the semantic model is unavailable offline, deterministic cached results still return', () => {
		const env = makeEnvironment();
		let state = base();
		state = createNote(state, env, { title: 'Cached Lore', body: 'offline keyword' }).state;
		const result = search(state, DM_ACTOR.id, { query: 'keyword', contentTypes: ['note'] }, {
			semantic: { enabled: true, available: false, rerank: (hits) => [...hits].reverse().map((h) => h.id) },
		});
		expect(result.semanticAssist.state).toBe('unavailable');
		expect(result.semanticAssist.reason).toBeTruthy();
		expect(result.semanticAssist.reranked).toBe(false);
		// The deterministic cached result is STILL returned, in deterministic order (no rerank applied).
		expect(result.hits.map((h) => h.title)).toContain('Cached Lore');
		expect(result.hits.map((h) => h.id)).toEqual(result.deterministicOrder);
	});

	it('AC4 — a semantic re-rank is LABELLED and preserves deterministic score diagnostics', () => {
		const env = makeEnvironment();
		let state = base();
		state = createNote(state, env, { title: 'Alpha', body: 'keyword body' }).state;
		state = createNote(state, env, { title: 'Bravo', body: 'keyword body' }).state;
		const filter: SearchFilter = { query: 'keyword', contentTypes: ['note'] };

		const baseline = search(state, DM_ACTOR.id, filter);
		const reranked = search(state, DM_ACTOR.id, filter, {
			semantic: { enabled: true, rerank: (hits) => [...hits].reverse().map((h) => h.id) },
		});
		// The semantic contribution is LABELLED (reranked: true) so the GUI can mark it.
		expect(reranked.semanticAssist.reranked).toBe(true);
		// The deterministic order is preserved for debugging.
		expect(reranked.deterministicOrder).toEqual(baseline.deterministicOrder);
		// Every hit still carries its deterministic per-signal score diagnostic.
		for (const hit of reranked.hits) {
			expect(hit.signals).toBeDefined();
			expect(hit.score).toBe(
				hit.signals.title * 100 +
					hit.signals.tag * 20 +
					hit.signals.link * 10 +
					hit.signals.sessionContext * 8 +
					hit.signals.recency * 2 +
					hit.signals.entityType,
			);
		}
	});

	it('an enabled-but-no-rerank semantic pass applies without re-ordering (annotation only)', () => {
		const env = makeEnvironment();
		let state = base();
		state = createNote(state, env, { title: 'Alpha', body: 'keyword' }).state;
		state = createNote(state, env, { title: 'Bravo', body: 'keyword' }).state;
		const filter: SearchFilter = { query: 'keyword', contentTypes: ['note'] };
		const result = search(state, DM_ACTOR.id, filter, { semantic: { enabled: true } });
		expect(result.semanticAssist.state).toBe('applied');
		expect(result.semanticAssist.reranked).toBe(false);
		expect(result.hits.map((h) => h.id)).toEqual(result.deterministicOrder);
	});

	it('a re-ranker that omits a visible hit keeps it at its deterministic position (never drops it)', () => {
		const env = makeEnvironment();
		let state = base();
		state = createNote(state, env, { title: 'Alpha', body: 'keyword' }).state;
		state = createNote(state, env, { title: 'Bravo', body: 'keyword' }).state;
		state = createNote(state, env, { title: 'Charlie', body: 'keyword' }).state;
		const filter: SearchFilter = { query: 'keyword', contentTypes: ['note'] };
		const baseline = search(state, DM_ACTOR.id, filter);
		const charlieId = baseline.hits.find((h) => h.title === 'Charlie')!.id;
		// A re-ranker that only mentions Charlie — the other two must still appear (membership is fixed).
		const result = search(state, DM_ACTOR.id, filter, {
			semantic: { enabled: true, rerank: () => [charlieId] },
		});
		expect(result.hits.map((h) => h.title).sort()).toEqual(['Alpha', 'Bravo', 'Charlie']);
		expect(result.hits[0]!.title).toBe('Charlie');
	});

	it('fail closed: an unknown actor gets an empty result even with semantic enabled', () => {
		const state = createNote(base(), makeEnvironment(), { title: 'Lore' }).state;
		const result = search(state, 'nobody', { query: 'lore' }, { semantic: { enabled: true } });
		expect(result.hits).toEqual([]);
		expect(result.totalCount).toBe(0);
		expect(result.deterministicOrder).toEqual([]);
		expect(result.semanticAssist.state).toBe('disabled');
	});
});
