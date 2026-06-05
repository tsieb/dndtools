import { describe, expect, it } from 'vitest';
import {
	createDemoMapState,
	diagnoseSavedSearchPortability,
	diagnoseSearchResult,
	dispatchCommand,
	headingAnchors,
	searchVaultForActor,
	slugifyHeading,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type SearchFilter,
} from '../src';
import { sequentialIds } from '../src/testing/fixtures';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * SRCH-008 — search indexes NORMALIZE unstable IDs + source-specific metadata so test artifacts, saved
 * searches, and DIAGNOSTICS remain DETERMINISTIC across fresh vault fixtures. Tests are the primary evidence.
 *
 * In production every entity id is a volatile `crypto.randomUUID()`, so generating the SAME fixture content
 * twice yields structurally-identical results whose ids differ entirely. These tests prove:
 *   - AC1: the diagnostic FINGERPRINT of a search result is IDENTICAL across two fresh vaults with the same
 *     visible content (different ids) — volatile ids do not create unrelated fingerprint churn.
 *   - AC2: exporting/importing a saved search preserves its STABLE criteria verbatim, and surfaces an
 *     explicit REMAPPING diagnostic for any criterion that references a volatile entity id.
 *   - No-leak: the diagnostics summarize only the actor-visible result/filter, never hidden content.
 */

/** Build a fresh state whose generated ids carry the given prefix (to simulate two distinct vaults). */
function freshVault(idPrefix: string): { state: CoreStateSlice; env: CoreEnvironment } {
	const env = makeEnvironment({ ids: sequentialIds(idPrefix) });
	const state = { ...buildInitialState(DM_ACTOR, PLAYER_ACTOR), maps: createDemoMapState() };
	return { state, env };
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
	env: CoreEnvironment,
	input: { title: string; body?: string; visibility?: 'dm-only' | 'player-visible' | 'shared' },
): CoreStateSlice {
	return accepted(
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
	).nextState;
}

/** Seed the SAME visible content into a vault (the notes the diagnostics fingerprint). */
function seedContent(state: CoreStateSlice, env: CoreEnvironment): CoreStateSlice {
	let next = state;
	next = createNote(next, env, { title: 'Dragon Cult', body: 'A secretive order of dragon worshippers.' });
	next = createNote(next, env, { title: 'Harbor Watch', body: 'A dragon was sighted off the coast.' });
	return next;
}

function search(state: CoreStateSlice, actorId: string, filter: SearchFilter) {
	return searchVaultForActor(state.content, state.maps, state.permissions, state.session, actorId, filter);
}

describe('SRCH-008 AC1 — volatile ids do not churn the diagnostic fingerprint', () => {
	it('two fresh vaults with the same visible content produce the SAME fingerprint', () => {
		const a = freshVault('vault-a');
		const b = freshVault('vault-b');
		const stateA = seedContent(a.state, a.env);
		const stateB = seedContent(b.state, b.env);

		const resultA = search(stateA, DM_ACTOR.id, { query: 'dragon', contentTypes: ['note'] });
		const resultB = search(stateB, DM_ACTOR.id, { query: 'dragon', contentTypes: ['note'] });

		// The raw result ids DIFFER between vaults (different id prefixes) ...
		const idsA = resultA.hits.map((h) => h.id);
		const idsB = resultB.hits.map((h) => h.id);
		expect(idsA).not.toEqual(idsB);

		// ... but the NORMALIZED diagnostic fingerprint is IDENTICAL (no unrelated churn — SRCH-008 AC1).
		const diagA = diagnoseSearchResult(resultA);
		const diagB = diagnoseSearchResult(resultB);
		expect(diagA.fingerprint).toBe(diagB.fingerprint);
		expect(diagA.hits.map((h) => h.key)).toEqual(diagB.hits.map((h) => h.key));
		// The fingerprint preserves the deterministic ORDER (title match ranks above body-only match).
		expect(diagA.hits[0]!.key).toBe('note:dragon cult');
		expect(diagA.hits[1]!.key).toBe('note:harbor watch');
	});

	it('the same vault fingerprints identically across repeated runs (stable, inspectable)', () => {
		const { state, env } = freshVault('vault-stable');
		const seeded = seedContent(state, env);
		const first = diagnoseSearchResult(search(seeded, DM_ACTOR.id, { query: 'dragon' }));
		const second = diagnoseSearchResult(search(seeded, DM_ACTOR.id, { query: 'dragon' }));
		expect(first.fingerprint).toBe(second.fingerprint);
		// The fingerprint is human-inspectable: rank=key@score rows.
		expect(first.fingerprint).toContain('1=note:dragon cult@');
	});

	it('a player and the DM fingerprint only their OWN visible hits (no hidden leak)', () => {
		const { state, env } = freshVault('vault-leak');
		let next = seedContent(state, env);
		// A dm-only note whose term ("phylactery") exists ONLY in dm-only content.
		next = createNote(next, env, {
			title: 'Lich Phylactery',
			body: 'The phylactery hides the dragon lich soul.',
			visibility: 'dm-only',
		});

		const dmDiag = diagnoseSearchResult(search(next, DM_ACTOR.id, { query: 'phylactery' }));
		const playerDiag = diagnoseSearchResult(search(next, PLAYER_ACTOR.id, { query: 'phylactery' }));

		// The DM sees the dm-only hit in the fingerprint; the player's fingerprint is EMPTY and the term
		// never appears in the player's serialized diagnostic (no hidden hit, key, or count leaks).
		expect(dmDiag.hits.some((h) => h.key.includes('lich phylactery'))).toBe(true);
		expect(playerDiag.hits).toEqual([]);
		expect(playerDiag.totalCount).toBe(0);
		expect(JSON.stringify(playerDiag).toLowerCase()).not.toContain('phylactery');
	});
});

describe('SRCH-008 — deterministic heading anchors (stable slugs across fixtures)', () => {
	it('slugifies headings deterministically (id-free, url-safe)', () => {
		expect(slugifyHeading('Hidden Cove')).toBe('hidden-cove');
		expect(slugifyHeading('The Dragon’s Lair!')).toBe('the-dragons-lair');
		expect(slugifyHeading('  Multiple   Spaces  ')).toBe('multiple-spaces');
	});

	it('disambiguates duplicate headings deterministically', () => {
		const anchors = headingAnchors('# Notes\n\ntext\n\n# Notes\n\nmore');
		expect(anchors.map((a) => a.anchor)).toEqual(['notes', 'notes-2']);
	});

	it('ignores `#` inside fenced code blocks', () => {
		const anchors = headingAnchors('# Real\n\n```\n# not a heading\n```\n\n## Also Real');
		expect(anchors.map((a) => a.anchor)).toEqual(['real', 'also-real']);
	});
});

describe('SRCH-008 AC2 — saved-search export/import portability + remapping diagnostics', () => {
	it('preserves stable criteria verbatim across vaults (fully portable)', () => {
		const filter: SearchFilter = {
			query: 'Dragon',
			contentTypes: ['note'],
			tags: ['Lore', 'lore'],
			folder: 'Campaign',
			sources: ['local-markdown'],
		};
		const report = diagnoseSavedSearchPortability(filter);
		expect(report.portable).toBe(true);
		expect(report.remappings).toEqual([]);
		// The stable filter is the normalized, vault-independent criteria (lowercased/deduped tags).
		expect(report.stableFilter.query).toBe('Dragon');
		expect(report.stableFilter.tags).toEqual(['lore']);
		expect(report.stableFilter.folder).toBe('Campaign');
		expect(report.stableFilter.contentTypes).toEqual(['note']);
		// No relationship criterion survives onto the stable filter.
		expect(report.stableFilter.relationship).toBeUndefined();
	});

	it('emits an explicit remapping diagnostic for a relationship-anchor (volatile id)', () => {
		const filter: SearchFilter = {
			query: 'related',
			relationship: { anchorKind: 'content', anchorId: 'vault-a-note-0007' },
		};
		const report = diagnoseSavedSearchPortability(filter);
		expect(report.portable).toBe(false);
		expect(report.remappings).toHaveLength(1);
		const remap = report.remappings[0]!;
		expect(remap.criterion).toBe('relationship-anchor');
		expect(remap.anchorKind).toBe('content');
		expect(remap.sourceId).toBe('vault-a-note-0007');
		// The stable filter strips the volatile-id criterion so the imported search does not match a
		// coincidental id; the text criterion still carries across.
		expect(report.stableFilter.relationship).toBeUndefined();
		expect(report.stableFilter.query).toBe('related');
	});

	it('a remapping diagnostic names no content (no leak) — only the criterion + dangling id', () => {
		const report = diagnoseSavedSearchPortability({
			relationship: { anchorKind: 'poi', anchorId: 'poi-secret-id' },
		});
		const remap = report.remappings[0]!;
		// The message is a generic instruction; it never carries a title/snippet of the (possibly hidden)
		// related item — the saved search stored only the id, and the diagnostic echoes only that id.
		expect(remap.message).toMatch(/imported vault/i);
		expect(remap.anchorKind).toBe('poi');
		expect(remap.sourceId).toBe('poi-secret-id');
	});

	it('an empty/undefined filter is fully portable', () => {
		expect(diagnoseSavedSearchPortability(undefined).portable).toBe(true);
		expect(diagnoseSavedSearchPortability({}).remappings).toEqual([]);
	});
});
