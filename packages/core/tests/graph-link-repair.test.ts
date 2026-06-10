import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
	sequentialIds,
} from '../src/testing/fixtures';
import {
	authorizeLinkRepairForActor,
	buildBulkRepairPreview,
	buildLinkPickerSuggestions,
	deadLinksInBody,
	dispatchCommand,
	getLinkPickerSuggestionsForActor,
	previewBulkLinkRepairForActor,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type DeadLinkOccurrence,
	type WikilinkTarget,
} from '../src';

/**
 * GRAPH-010 — an authorized editor repairs dead links, bulk-previews repairs, and disambiguates
 * link-picker suggestions ONLY within content their capability grants cover, WITHOUT exposing hidden
 * targets. Tests are the primary evidence: the pure engine + the actor-filtered, capability-scoped query
 * path are covered, including the hidden-target non-leak (AC1, AC4), the bulk preview (AC2), the single-link
 * disambiguated repair (AC3), and the section-editor scope rejection BEFORE mutation (AC5).
 */

const PLAYER_B: Actor = { id: 'actor-player-b', role: 'player', displayName: 'Player B' };
const CONTENT_ITEM_ENTITY_TYPE = 'content-item';

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

function grantSectionEditor(
	state: CoreStateSlice,
	env: CoreEnvironment,
	itemId: string,
	playerActorId: string,
): CoreStateSlice {
	return accepted(
		dispatchCommand(
			state,
			env,
			cmd('permission.grant-capability-set', {
				entityType: CONTENT_ITEM_ENTITY_TYPE,
				entityId: itemId,
				playerActorId,
				capabilitySet: 'section-editor',
			}),
		),
	).nextState;
}

function target(
	overrides: Partial<WikilinkTarget> & Pick<WikilinkTarget, 'id' | 'title'>,
): WikilinkTarget {
	return { aliases: [], sections: [], source: 'local-markdown', available: true, ...overrides };
}

function occurrence(
	overrides: Partial<DeadLinkOccurrence> & Pick<DeadLinkOccurrence, 'itemId' | 'itemTitle' | 'target'>,
): DeadLinkOccurrence {
	return { source: 'local-markdown', ...overrides };
}

// --- The PURE engine (deterministic functions of explicit candidates / occurrences) ------------------

describe('GRAPH-010 — pure engine: link picker (AC1/AC4 — only visible candidates, non-revealing labels)', () => {
	const candidates: WikilinkTarget[] = [
		target({ id: 'n-1', title: 'Highmoor', aliases: ['The Keep'] }),
		target({ id: 'n-2', title: 'Highcliff' }),
		target({ id: 'n-3', title: 'Baldur' }),
	];

	it('suggests visible candidates close to the broken target, exact-first then by distance', () => {
		const suggestions = buildLinkPickerSuggestions('Highmor', candidates);
		expect(suggestions[0]!.title).toBe('Highmoor');
		// Every suggestion carries only an id + visible title — no hidden labels.
		expect(suggestions.every((s) => typeof s.title === 'string' && s.itemId.length > 0)).toBe(true);
	});

	it('marks an exact title/alias match as exactName', () => {
		const suggestions = buildLinkPickerSuggestions('the keep', candidates);
		expect(suggestions[0]).toMatchObject({ title: 'Highmoor', exactName: true });
	});
});

describe('GRAPH-010 — pure engine: bulk-repair preview (AC2)', () => {
	const candidates: WikilinkTarget[] = [
		target({ id: 'n-1', title: 'Highmoor' }),
		target({ id: 'n-2', title: 'Highcliff' }),
	];

	it('lists each proposed rewrite, affected source, ambiguity, and unsupported-source limitation', () => {
		const occurrences: DeadLinkOccurrence[] = [
			occurrence({ itemId: 'i-1', itemTitle: 'Quest Log', target: 'highmor' }), // close to ONE → applicable
			occurrence({ itemId: 'i-2', itemTitle: 'Atlas', target: 'high' }), // close to BOTH → ambiguous
			occurrence({
				itemId: 'i-3',
				itemTitle: 'Doc',
				source: 'google-docs', // cannot represent wikilinks → blocked: unsupported-source
				target: 'highmoor',
			}),
			occurrence({ itemId: 'i-4', itemTitle: 'Lore', target: 'zzzxqq' }), // nothing close → blocked: no-candidate
		];
		const preview = buildBulkRepairPreview(occurrences, candidates);
		const byItem = new Map(preview.rows.map((r) => [r.itemId, r]));
		expect(byItem.get('i-1')).toMatchObject({ proposedTitle: 'Highmoor', ambiguous: false, blocked: null });
		expect(byItem.get('i-2')).toMatchObject({ ambiguous: true, blocked: null });
		expect(byItem.get('i-2')!.candidates.sort()).toEqual(['Highcliff', 'Highmoor']);
		expect(byItem.get('i-3')).toMatchObject({ blocked: 'unsupported-source', proposedTitle: null });
		expect(byItem.get('i-4')).toMatchObject({ blocked: 'no-candidate', proposedTitle: null });
		expect(preview.applicableCount).toBe(1);
		expect(preview.ambiguousCount).toBe(1);
		expect(preview.blockedCount).toBe(2);
	});
});

describe('GRAPH-010 — pure engine: dead-link detection + DETERMINISM', () => {
	it('finds the dead links in a body (unresolved/unavailable), deduped per target', () => {
		const candidates: WikilinkTarget[] = [target({ id: 'n-1', title: 'Highmoor' })];
		const dead = deadLinksInBody(
			'i-1',
			'Quest Log',
			'local-markdown',
			'Go to [[Highmoor]], then [[Ghost]] and again [[Ghost]].',
			candidates,
		);
		expect(dead.map((d) => d.target)).toEqual(['ghost']);
	});

	it('produces identical previews across repeated runs (byte-identical)', () => {
		const candidates: WikilinkTarget[] = [target({ id: 'n-1', title: 'Highmoor' })];
		const occurrences: DeadLinkOccurrence[] = [
			occurrence({ itemId: 'i-z', itemTitle: 'Zephyr', target: 'highmor' }),
			occurrence({ itemId: 'i-a', itemTitle: 'Alpha', target: 'ghost' }),
		];
		expect(JSON.stringify(buildBulkRepairPreview(occurrences, candidates))).toBe(
			JSON.stringify(buildBulkRepairPreview(occurrences, candidates)),
		);
	});
});

// --- The ACTOR-FILTERED + CAPABILITY-SCOPED query -----------------------------------------------------

describe('GRAPH-010 — actor-filtered: a hidden note is never a picker suggestion (AC1, AC4)', () => {
	const env = makeEnvironment();

	it("a player's link picker offers only visible candidate targets, never a dm-only note", () => {
		let state = base();
		state = createNote(state, env, { title: 'Highmoor', visibility: 'player-visible' }).state;
		state = createNote(state, env, { title: 'Hidden Vault', visibility: 'dm-only' }).state;

		const playerSuggestions = getLinkPickerSuggestionsForActor(
			state.content,
			state.permissions,
			PLAYER_ACTOR.id,
			'Hi',
		);
		const titles = playerSuggestions.map((s) => s.title);
		expect(titles).toContain('Highmoor');
		expect(titles).not.toContain('Hidden Vault'); // the hidden title/id is omitted (AC4)

		// The DM, who can see the hidden note, IS offered it.
		const dmSuggestions = getLinkPickerSuggestionsForActor(
			state.content,
			state.permissions,
			DM_ACTOR.id,
			'Hi',
		);
		expect(dmSuggestions.map((s) => s.title)).toContain('Hidden Vault');
	});
});

describe('GRAPH-010 — actor-filtered: bulk preview scoped to editable content (AC2/AC5)', () => {
	const env = makeEnvironment();

	it('the DM bulk preview lists dead links across all visible notes', () => {
		let state = base();
		state = createNote(state, env, { title: 'Highmoor', visibility: 'player-visible' }).state;
		state = createNote(state, env, {
			title: 'Quest Log',
			visibility: 'player-visible',
			body: 'Onward to [[Highmoor]] then to [[Ghost Town]].',
		}).state;
		const preview = previewBulkLinkRepairForActor(state.content, state.permissions, DM_ACTOR.id);
		expect(preview.rows.map((r) => r.brokenTarget)).toEqual(['ghost town']);
	});

	it("a section-editor's preview covers ONLY their granted item, not another source", () => {
		let state = base();
		const granted = createNote(state, env, {
			title: 'My Note',
			visibility: 'player-visible',
			body: 'Refers to [[Ghost A]].',
		});
		state = granted.state;
		const other = createNote(state, env, {
			title: 'Other Note',
			visibility: 'player-visible',
			body: 'Refers to [[Ghost B]].',
		});
		state = other.state;
		state = grantSectionEditor(state, env, granted.id, PLAYER_ACTOR.id);

		const preview = previewBulkLinkRepairForActor(state.content, state.permissions, PLAYER_ACTOR.id);
		// Only the GRANTED item's dead link is in the player's preview — the other source is out of scope.
		expect(preview.rows.map((r) => r.itemId)).toEqual([granted.id]);
		expect(preview.rows.map((r) => r.brokenTarget)).toEqual(['ghost a']);
	});

	it('a player with no edit grant gets an empty preview (fail closed)', () => {
		let state = base();
		state = createNote(state, env, {
			title: 'Note',
			visibility: 'player-visible',
			body: 'A [[Ghost]] link.',
		}).state;
		const preview = previewBulkLinkRepairForActor(state.content, state.permissions, PLAYER_ACTOR.id);
		expect(preview.rows).toEqual([]);
	});
});

describe('GRAPH-010 — actor-filtered: authorize a single chosen repair (AC3) + scope rejection (AC5)', () => {
	const env = makeEnvironment();

	it('an authorized editor repairs one chosen link; only that link changes', () => {
		let state = base();
		state = createNote(state, env, { title: 'Highmoor', visibility: 'player-visible' }).state;
		const host = createNote(state, env, {
			title: 'Quest Log',
			visibility: 'player-visible',
			body: 'Set out for [[Highmor]] at dawn.', // typo, unresolved
		});
		state = host.state;
		state = grantSectionEditor(state, env, host.id, PLAYER_ACTOR.id);

		const result = authorizeLinkRepairForActor(
			state.content,
			state.permissions,
			PLAYER_ACTOR.id,
			host.id,
			'Highmor',
			'Highmoor',
		);
		expect(result.status).toBe('authorized');
		if (result.status !== 'authorized') throw new Error('expected authorized');
		expect(result.result.status).toBe('repaired');
		if (result.result.status !== 'repaired') throw new Error('expected repaired');
		// AC3 — only the one broken link is rewritten; the surrounding text is preserved.
		expect(result.result.body).toContain('[[Highmoor]]');
		expect(result.result.rewritten).toBe(1);
	});

	it("REJECTS a section-editor's repair of an item they were not granted, BEFORE mutation (AC5)", () => {
		let state = base();
		state = createNote(state, env, { title: 'Highmoor', visibility: 'player-visible' }).state;
		const granted = createNote(state, env, { title: 'Mine', visibility: 'player-visible' });
		state = granted.state;
		const other = createNote(state, env, {
			title: 'Theirs',
			visibility: 'player-visible',
			body: 'A [[Highmor]] typo.',
		});
		state = other.state;
		// The player is granted section-editor on `granted`, NOT on `other`.
		state = grantSectionEditor(state, env, granted.id, PLAYER_ACTOR.id);

		const result = authorizeLinkRepairForActor(
			state.content,
			state.permissions,
			PLAYER_ACTOR.id,
			other.id, // attempt to rewrite a DIFFERENT item/source
			'Highmor',
			'Highmoor',
		);
		expect(result).toEqual({ status: 'rejected', reason: 'not-authorized' });

		// The DM, with inherent authority, CAN repair the same item.
		const dmResult = authorizeLinkRepairForActor(
			state.content,
			state.permissions,
			DM_ACTOR.id,
			other.id,
			'Highmor',
			'Highmoor',
		);
		expect(dmResult.status).toBe('authorized');
	});

	it('rejects an unknown actor and a hidden/non-visible item (fail closed)', () => {
		let state = base();
		const hidden = createNote(state, env, {
			title: 'Secret',
			visibility: 'dm-only',
			body: 'A [[Ghost]] link.',
		});
		state = hidden.state;
		expect(
			authorizeLinkRepairForActor(state.content, state.permissions, 'ghost-actor', hidden.id, 'Ghost', 'X'),
		).toEqual({ status: 'rejected', reason: 'unknown-actor' });
		// The player cannot see the dm-only item ⇒ item-not-visible (indistinguishable from not-found).
		expect(
			authorizeLinkRepairForActor(state.content, state.permissions, PLAYER_ACTOR.id, hidden.id, 'Ghost', 'X'),
		).toEqual({ status: 'rejected', reason: 'item-not-visible' });
	});
});

describe('GRAPH-010 — DETERMINISM (stable picker across fresh fixtures)', () => {
	it('the picker order is identical across fresh fixtures whose ids differ', () => {
		const build = (): CoreStateSlice => {
			const e = makeEnvironment({ ids: sequentialIds(`r-${Math.random()}`) });
			let state = base();
			state = createNote(state, e, { title: 'Highmoor', visibility: 'player-visible' }).state;
			state = createNote(state, e, { title: 'Highcliff', visibility: 'player-visible' }).state;
			return state;
		};
		const titlesOf = (state: CoreStateSlice): string[] =>
			getLinkPickerSuggestionsForActor(state.content, state.permissions, PLAYER_ACTOR.id, 'High').map(
				(s) => s.title,
			);
		expect(titlesOf(build())).toEqual(titlesOf(build()));
	});
});
