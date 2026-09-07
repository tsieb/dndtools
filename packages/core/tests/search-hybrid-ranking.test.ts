import { describe, expect, it } from 'vitest';
import {
	DEFAULT_HYBRID_WEIGHTS,
	buildSearchCorpusForActor,
	buildTfIdfIndex,
	cosineSimilarity,
	createDemoMapState,
	createHybridSemanticAssist,
	dispatchCommand,
	measureHitAtK,
	rankHybridSearch,
	scoreTfIdfQuery,
	searchVaultForActor,
	tokenizeSearchText,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type SearchCorpusDocument,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * RC-AI-3.2 — HYBRID (TF-IDF + cosine) RANKING for local semantic search. Tests are the evidence.
 *
 * What has to be true for this to be a safe search path, and is proved below:
 *   - the corpus the shell embeds is the ACTOR-VISIBLE corpus and nothing else, so a hidden note is
 *     never sent to any embedding endpoint and can never be returned by a semantic hit;
 *   - the cache address changes with the note REVISION, so an edited note can never be scored on its
 *     old vector;
 *   - scoring is pure and deterministic, and ties break identically run to run;
 *   - the semantic half FAILS SOFT and SAYS so — no query vector, no cached vectors, or vectors from
 *     another model all degrade to the deterministic lexical ranking rather than to nonsense;
 *   - bound onto the SRCH-011 seam, the ranker can only PERMUTE the hits deterministic search already
 *     produced. It can never add one.
 */

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

function createNote(
	state: CoreStateSlice,
	env: CoreEnvironment,
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

function corpus(state: CoreStateSlice, actorId: string): SearchCorpusDocument[] {
	return buildSearchCorpusForActor(
		state.content,
		state.maps,
		state.permissions,
		state.session,
		actorId,
	);
}

/**
 * A deterministic stand-in for a real embedding backend: hashed bag-of-words projected onto a fixed
 * number of dimensions. It is not a language model — it is a second, DIFFERENT retriever with a real
 * vector geometry, which is exactly what the fusion needs to be exercised against offline.
 */
function stubEmbed(text: string, dimensions = 64): Float32Array {
	const vector = new Float32Array(dimensions);
	for (const term of tokenizeSearchText(text)) {
		let hash = 2166136261;
		for (let i = 0; i < term.length; i += 1) {
			hash = Math.imul(hash ^ term.charCodeAt(i), 16777619) >>> 0;
		}
		const slot = hash % dimensions;
		vector[slot] = (vector[slot] ?? 0) + 1;
	}
	return vector;
}

function stubVectors(docs: readonly SearchCorpusDocument[]): Map<string, Float32Array> {
	const vectors = new Map<string, Float32Array>();
	for (const doc of docs) vectors.set(doc.key, stubEmbed(doc.text));
	return vectors;
}

// ---------------------------------------------------------------------------------------------------
// The corpus: actor-filtered, per-revision addressed, deterministic
// ---------------------------------------------------------------------------------------------------

describe('buildSearchCorpusForActor — what may be embedded', () => {
	it('omits a dm-only note from a player corpus, so it is never sent to an embedding backend', () => {
		const env = makeEnvironment();
		let state = base();
		state = createNote(state, env, {
			title: 'The Bell rings twice',
			body: 'The cult drowns a witness on the second toll.',
			visibility: 'dm-only',
		}).state;
		state = createNote(state, env, { title: 'Harbor Watch', visibility: 'player-visible' }).state;

		const dmTitles = corpus(state, DM_ACTOR.id).map((doc) => doc.title);
		const playerTitles = corpus(state, PLAYER_ACTOR.id).map((doc) => doc.title);
		expect(dmTitles).toContain('The Bell rings twice');
		expect(playerTitles).not.toContain('The Bell rings twice');
		// And the hidden body text is nowhere in the player's embeddable text either.
		expect(
			corpus(state, PLAYER_ACTOR.id)
				.map((doc) => doc.text)
				.join(' '),
		).not.toContain('drowns');
	});

	it('returns an empty corpus for an unknown actor (fail closed — nothing is embeddable)', () => {
		const env = makeEnvironment();
		let state = base();
		state = createNote(state, env, { title: 'Harbor Watch' }).state;
		expect(corpus(state, 'actor-nobody')).toEqual([]);
	});

	it('changes a document key when the note is edited, so a stale vector can never be served', () => {
		const env = makeEnvironment();
		let state = base();
		const created = createNote(state, env, { title: 'Tide Schedule', body: 'First draft.' });
		state = created.state;
		const before = corpus(state, DM_ACTOR.id).find((doc) => doc.id === created.itemId)!;

		state = accepted(
			dispatchCommand(
				state,
				env,
				cmd('content.update-item', {
					itemId: created.itemId,
					body: 'Second draft, with the leak.',
				}),
			),
		).nextState;
		const after = corpus(state, DM_ACTOR.id).find((doc) => doc.id === created.itemId)!;

		expect(after.revision).toBeGreaterThan(before.revision);
		expect(after.key).not.toBe(before.key);
		expect(after.text).toContain('leak');
	});

	it('is deterministic: the same state and actor always yield the same documents in the same order', () => {
		const env = makeEnvironment();
		let state = base();
		state = createNote(state, env, { title: 'Brine Hand' }).state;
		state = createNote(state, env, { title: 'Ashen Hand' }).state;
		const first = corpus(state, DM_ACTOR.id);
		const second = corpus(state, DM_ACTOR.id);
		expect(second.map((d) => d.key)).toEqual(first.map((d) => d.key));
	});
});

// ---------------------------------------------------------------------------------------------------
// The two retrievers
// ---------------------------------------------------------------------------------------------------

describe('lexical + cosine scoring', () => {
	it('BM25 scores a document that carries the query terms and leaves untouched documents unscored', () => {
		const docs: SearchCorpusDocument[] = [
			doc('a', 'Brine Hand', 'The cult is led by Sild beneath the harbor.'),
			doc('b', 'Market Day', 'Fishmongers argue about the price of eels.'),
		];
		const scores = scoreTfIdfQuery(buildTfIdfIndex(docs), 'Sild leads cult');
		expect(scores.get('note::a@1')).toBeGreaterThan(0);
		expect(scores.has('note::b@1')).toBe(false);
	});

	it('cosine returns 0 rather than NaN for a zero vector, a length mismatch, or a non-finite value', () => {
		expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
		expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
		expect(cosineSimilarity([Number.NaN, 1], [1, 1])).toBe(0);
		expect(cosineSimilarity([], [])).toBe(0);
	});

	it('cosine is 1 for identical direction and stays inside [-1, 1]', () => {
		expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10);
		expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 10);
	});
});

// ---------------------------------------------------------------------------------------------------
// Fusion
// ---------------------------------------------------------------------------------------------------

describe('rankHybridSearch — fusion, fail-soft and determinism', () => {
	const docs: SearchCorpusDocument[] = [
		doc('a', 'Brine Hand', 'Sild leads the cult from the drowned chapel beneath the harbor.'),
		doc('b', 'Saltmarsh Watch', 'The watch patrols the docks at every tide.'),
		doc('c', 'Campaign Primer', 'Saltreach is a harbor town twenty-five years after the flood.'),
	];

	it('degrades to the lexical half and says so when no query vector is supplied', () => {
		const outcome = rankHybridSearch(docs, { queryText: 'who leads the cult' });
		expect(outcome.mode).toBe('lexical-only');
		expect(outcome.skipped).toBe('no-query-vector');
		expect(outcome.hits[0]?.id).toBe('a');
		expect(outcome.hits.every((hit) => hit.semanticScore === 0)).toBe(true);
	});

	it('degrades to the lexical half when no document has been embedded yet', () => {
		const outcome = rankHybridSearch(docs, {
			queryText: 'cult',
			queryVector: stubEmbed('cult'),
			vectorsByKey: new Map(),
		});
		expect(outcome.mode).toBe('lexical-only');
		expect(outcome.skipped).toBe('no-document-vectors');
	});

	it('refuses vectors of another dimension instead of scoring nonsense', () => {
		const mismatched = new Map<string, Float32Array>();
		for (const document of docs) mismatched.set(document.key, stubEmbed(document.text, 32));
		const outcome = rankHybridSearch(docs, {
			queryText: 'cult',
			queryVector: stubEmbed('cult', 64),
			vectorsByKey: mismatched,
		});
		expect(outcome.mode).toBe('lexical-only');
		expect(outcome.skipped).toBe('dimension-mismatch');
		expect(outcome.vectorCoverage).toBe(0);
	});

	it('runs both retrievers and reports coverage when vectors are present', () => {
		const vectors = stubVectors(docs);
		const outcome = rankHybridSearch(docs, {
			queryText: 'who leads the cult',
			queryVector: stubEmbed('who leads the cult'),
			vectorsByKey: vectors,
		});
		expect(outcome.mode).toBe('hybrid');
		expect(outcome.skipped).toBeNull();
		expect(outcome.vectorCoverage).toBe(1);
		expect(outcome.hits[0]?.id).toBe('a');
		expect(outcome.hits[0]?.semanticRank).not.toBeNull();
	});

	it('still ranks a document whose vector is missing, on its lexical half alone', () => {
		const vectors = stubVectors(docs);
		vectors.delete(docs[0]!.key);
		const outcome = rankHybridSearch(docs, {
			queryText: 'Sild drowned chapel',
			queryVector: stubEmbed('Sild drowned chapel'),
			vectorsByKey: vectors,
		});
		const first = outcome.hits.find((hit) => hit.id === 'a');
		expect(first).toBeDefined();
		expect(first?.semanticRank).toBeNull();
		expect(first?.lexicalScore).toBeGreaterThan(0);
		expect(outcome.vectorCoverage).toBeCloseTo(2 / 3, 10);
	});

	it('finds a document by vector alone when the words do not match at all', () => {
		// The query shares NO term with the target, so the lexical retriever cannot see it. An oracle
		// vector (the document's own embedding) must still surface it — the semantic path really runs.
		const outcome = rankHybridSearch(docs, {
			queryText: 'zzzz',
			queryVector: stubEmbed(docs[0]!.text),
			vectorsByKey: stubVectors(docs),
		});
		expect(outcome.mode).toBe('hybrid');
		expect(outcome.hits[0]?.id).toBe('a');
	});

	it('is deterministic and honours the limit', () => {
		const input = {
			queryText: 'harbor tide watch',
			queryVector: stubEmbed('harbor tide watch'),
			vectorsByKey: stubVectors(docs),
		};
		const first = rankHybridSearch(docs, input);
		const second = rankHybridSearch(docs, input);
		expect(second.hits.map((h) => h.key)).toEqual(first.hits.map((h) => h.key));
		expect(rankHybridSearch(docs, { ...input, limit: 1 }).hits).toHaveLength(1);
	});

	it('weights the lexical half above the semantic half by default', () => {
		expect(DEFAULT_HYBRID_WEIGHTS.lexical).toBeGreaterThan(DEFAULT_HYBRID_WEIGHTS.semantic);
	});
});

// ---------------------------------------------------------------------------------------------------
// SRCH-011 seam: the ranker may reorder visible hits, never add one
// ---------------------------------------------------------------------------------------------------

describe('createHybridSemanticAssist — bound onto the SRCH-011 seam', () => {
	it('re-ranks only hits the deterministic search already returned, and adds none', () => {
		const env = makeEnvironment();
		let state = base();
		state = createNote(state, env, {
			title: 'Harbor Watch',
			body: 'A dragon was sighted offshore last night.',
		}).state;
		state = createNote(state, env, {
			title: 'Dragon Cult',
			body: 'Followers gather in shadow.',
		}).state;
		state = createNote(state, env, {
			title: 'The Bell rings twice',
			body: 'A dragon banner hangs in the drowned chapel.',
			visibility: 'dm-only',
		}).state;

		const playerDocs = corpus(state, PLAYER_ACTOR.id);
		const assist = createHybridSemanticAssist(playerDocs, {
			queryText: 'dragon',
			queryVector: stubEmbed('dragon sighted offshore'),
			vectorsByKey: stubVectors(playerDocs),
		});
		const result = searchVaultForActor(
			state.content,
			state.maps,
			state.permissions,
			state.session,
			PLAYER_ACTOR.id,
			{ query: 'dragon' },
			{ semantic: assist },
		);

		expect(result.semanticAssist.state).toBe('applied');
		expect(result.hits.map((hit) => hit.title)).not.toContain('The Bell rings twice');
		// Membership is unchanged: the assisted result is a PERMUTATION of the deterministic one.
		expect([...result.hits.map((hit) => hit.id)].sort()).toEqual(
			[...result.deterministicOrder].sort(),
		);
	});

	it('reports unavailable — leaving the deterministic order untouched — when nothing is embedded', () => {
		const env = makeEnvironment();
		let state = base();
		state = createNote(state, env, { title: 'Harbor Watch', body: 'A dragon offshore.' }).state;
		const docs = corpus(state, DM_ACTOR.id);

		const assist = createHybridSemanticAssist(docs, { queryText: 'dragon' });
		expect(assist.available).toBe(false);
		const result = searchVaultForActor(
			state.content,
			state.maps,
			state.permissions,
			state.session,
			DM_ACTOR.id,
			{ query: 'dragon' },
			{ semantic: assist },
		);
		expect(result.semanticAssist.state).toBe('unavailable');
		expect(result.hits.map((hit) => hit.id)).toEqual(result.deterministicOrder);
	});
});

describe('measureHitAtK', () => {
	it('counts a question as answered when the expected document is inside the top k', () => {
		const rankings = [
			[hit('a'), hit('b'), hit('c')],
			[hit('x'), hit('y'), hit('target')],
			[hit('p'), hit('q'), hit('r'), hit('target')],
		];
		const measured = measureHitAtK(rankings, (h, index) =>
			index === 0 ? h.id === 'a' : h.id === 'target',
		);
		expect(measured).toEqual({ hits: 2, total: 3, rate: 2 / 3 });
	});
});

// --- local helpers ----------------------------------------------------------------------------------

function doc(id: string, title: string, body: string): SearchCorpusDocument {
	return {
		key: `note::${id}@1`,
		id,
		type: 'note',
		mapId: null,
		title,
		body,
		tags: [],
		revision: 1,
		updatedAt: null,
		text: `${title}. ${body}`,
	};
}

function hit(id: string) {
	return {
		key: `note::${id}@1`,
		id,
		type: 'note' as const,
		mapId: null,
		title: id,
		lexicalScore: 0,
		lexicalRank: null,
		semanticScore: 0,
		semanticRank: null,
		score: 0,
	};
}
