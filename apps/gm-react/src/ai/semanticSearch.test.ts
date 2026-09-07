import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import {
	buildSearchCorpusForActor,
	buildTfIdfIndex,
	dispatchCommand,
	measureHitAtK,
	rankHybridSearch,
	tokenizeSearchText,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	type HybridSearchHit,
	type SearchCorpusDocument,
} from '@dndtools/core';
import { DM_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { __testing as coreStoreTesting } from '../platform/storage/coreStore';
import { seedDemoContent } from '../runtime/demo-seed';
import { embedCorpus, embedQuery, loadCorpusVectors } from './embeddings';

/**
 * RC-AI-3.2 ACCEPTANCE — hit@3 on the demo vault, offline.
 *
 * The measurement mirrors `docs/development/COPILOT_RAG_DERISK.md`: the real seeded Saltreach campaign,
 * the same twelve questions a DM asks mid-session, graded on whether the artifact holding the answer is
 * in the top three results. The de-risk figures to beat are hit@3 = 92% for the embedding retriever
 * alone and 100% for the lexical one, with the union of both at 100%.
 *
 * TWO DIFFERENCES FROM THE PROTOTYPE, both deliberate and both stated here rather than papered over:
 *
 *  1. The corpus is the ACTOR-VISIBLE SEARCH corpus, not "every text-bearing object in state". That is
 *     the whole point — a search that could retrieve something the actor may not see would be a leak.
 *     One of the twelve questions ("Who is Sera Duskwhisper?") is answered by a CHARACTER SHEET, and
 *     characters are not one of the SRCH-001 search domains, so no search path can reach it. It is
 *     scored, reported and excluded from the "reachable" figure rather than quietly dropped.
 *  2. Vectors come from a stubbed daemon, not from a running Ollama, so this suite stays offline and
 *     deterministic in CI. The stub is a hashed bag-of-words projection: a genuinely different
 *     retriever with a real vector geometry, which is what the FUSION has to be measured against. It
 *     is a floor, not a ceiling — nomic-embed-text is strictly stronger than hashed words.
 */

/** The de-risk figures this run has to match or beat (COPILOT_RAG_DERISK.md § Results). */
// The doc's "92%" is 11 of 12 questions; compare against the fraction, not its rounded print.
const DERISK_EMBEDDING_HIT3 = 11 / 12;
const DERISK_UNION_HIT3 = 1;

/** The twelve mid-session questions from the de-risk QA set, with the artifact that answers each. */
const QA: ReadonlyArray<{ q: string; expect: string; reachable: boolean }> = [
	{ q: 'Who leads the Brine Hand cult?', expect: 'Brine Hand', reachable: true },
	{ q: 'What is the secret about Dockmaster Pell?', expect: 'Dockworkers', reachable: true },
	{
		q: 'What happened twenty-five years ago in Saltreach?',
		expect: 'Drowning of Saltreach',
		reachable: true,
	},
	{ q: 'What is in the Sunken Crypt?', expect: 'Sunken Crypt', reachable: true },
	{ q: 'Who are the Ashen Hand?', expect: 'Ashen Hand', reachable: true },
	{ q: 'What does the Saltmarsh Watch want?', expect: 'Saltmarsh Watch', reachable: true },
	{ q: 'What is the armor class of The Hollow King?', expect: 'Hollow King', reachable: true },
	// Answered by a character sheet; characters are not an SRCH-001 search domain.
	{ q: 'Who is Sera Duskwhisper?', expect: 'Sera Duskwhisper', reachable: false },
	{ q: 'What is the campaign about?', expect: 'Campaign Primer', reachable: true },
	{ q: 'Who leads the Saltmarsh Watch?', expect: 'Saltmarsh Watch', reachable: true },
	{ q: 'What is the Ashen Hand secret?', expect: 'Ashen Hand', reachable: true },
	{ q: 'What happens if the Bell rings twice?', expect: 'Brine Hand', reachable: true },
];

const REACHABLE = QA.filter((qa) => qa.reachable);

const EMBEDDING_DIMENSIONS = 128;

/** The stubbed backend's vector function: hashed bag-of-words onto a fixed number of dimensions. */
function stubEmbed(text: string): number[] {
	const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
	for (const term of tokenizeSearchText(text)) {
		let hash = 2166136261;
		for (let i = 0; i < term.length; i += 1) {
			hash = Math.imul(hash ^ term.charCodeAt(i), 16777619) >>> 0;
		}
		vector[hash % EMBEDDING_DIMENSIONS] += 1;
	}
	return vector;
}

/** A stubbed Ollama daemon answering `POST /api/embeddings`. */
function stubDaemon() {
	return vi.fn(async (_url: string, init?: RequestInit) => {
		const body = JSON.parse(String(init?.body)) as { prompt?: string };
		return {
			ok: true,
			status: 200,
			json: async () => ({ embedding: stubEmbed(body.prompt ?? '') }),
		} as unknown as Response;
	});
}

/** Unplug the network: from here on, any request is a failure rather than a slow path. */
function goOffline(): void {
	vi.stubGlobal(
		'fetch',
		vi.fn(() => {
			throw new Error('offline');
		}),
	);
}

async function seededDemoVault(): Promise<CoreStateSlice> {
	const env = makeEnvironment();
	// The demo seed drafts a character per player, so all three seats must exist for a clean seed.
	let state = buildInitialState(
		DM_ACTOR,
		...['actor-player', 'actor-player-2', 'actor-player-3'].map((id, i) => ({
			id,
			role: 'player' as const,
			displayName: `Player ${i + 1}`,
		})),
	);
	const runtime = {
		get state(): CoreStateSlice {
			return state;
		},
		defaultActorId: DM_ACTOR.id,
		async dispatch(command: CoreCommand): Promise<CommandResult> {
			const result = dispatchCommand(state, env, command);
			state = result.nextState;
			return result;
		},
	};
	await seedDemoContent(runtime as unknown as Parameters<typeof seedDemoContent>[0]);
	return state;
}

function corpusFor(state: CoreStateSlice, actorId: string): SearchCorpusDocument[] {
	return buildSearchCorpusForActor(
		state.content,
		state.maps,
		state.permissions,
		state.session,
		actorId,
	);
}

/** Whether a returned hit is the artifact that holds the answer. */
function answers(hit: HybridSearchHit, expected: string): boolean {
	return hit.title.toLowerCase().includes(expected.toLowerCase());
}

beforeEach(() => {
	const factory = new IDBFactory();
	globalThis.indexedDB = factory;
	Dexie.dependencies.indexedDB = factory;
	Dexie.dependencies.IDBKeyRange = IDBKeyRange;
	const store = new Map<string, string>();
	globalThis.localStorage = {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => void store.set(key, String(value)),
		removeItem: (key: string) => void store.delete(key),
		clear: () => store.clear(),
	} as unknown as Storage;
	localStorage.setItem('dndtools.ai.usage-preference', 'complete');
});

afterEach(async () => {
	await coreStoreTesting.closeDb();
	vi.unstubAllGlobals();
});

describe('RC-AI-3.2 acceptance — hit@3 on the demo vault', () => {
	it('the demo vault seeds a retrievable corpus of visible artifacts', async () => {
		const state = await seededDemoVault();
		const docs = corpusFor(state, DM_ACTOR.id);
		expect(docs.length).toBeGreaterThanOrEqual(9);
		// Faction secrets live in structured FIELDS, not the body. If they were not in the retrievable
		// text, three of the twelve questions would be unanswerable no matter how good the ranker is.
		const brineHand = docs.find((doc) => doc.title.includes('Brine Hand'));
		expect(brineHand?.text).toContain('Bell rings twice');
	}, 30_000);

	it('hybrid ranking reaches every answer that lives in a searchable domain', async () => {
		const state = await seededDemoVault();
		const docs = corpusFor(state, DM_ACTOR.id);
		const index = buildTfIdfIndex(docs);
		const vectors = new Map(docs.map((doc) => [doc.key, Float32Array.from(stubEmbed(doc.text))]));

		const rankings = REACHABLE.map(
			(qa) =>
				rankHybridSearch(docs, {
					queryText: qa.q,
					index,
					queryVector: Float32Array.from(stubEmbed(qa.q)),
					vectorsByKey: vectors,
					limit: 3,
				}).hits,
		);
		const measured = measureHitAtK(rankings, (hit, i) => answers(hit, REACHABLE[i]!.expect));

		expect(measured.rate).toBe(DERISK_UNION_HIT3);
		expect(measured.rate).toBeGreaterThanOrEqual(DERISK_EMBEDDING_HIT3);

		// Over ALL twelve questions — including the one whose answer is a character sheet no search
		// domain covers — the run still clears the de-risk embedding figure.
		const all = QA.map(
			(qa) =>
				rankHybridSearch(docs, {
					queryText: qa.q,
					index,
					queryVector: Float32Array.from(stubEmbed(qa.q)),
					vectorsByKey: vectors,
					limit: 3,
				}).hits,
		);
		expect(measureHitAtK(all, (hit, i) => answers(hit, QA[i]!.expect)).rate).toBeGreaterThanOrEqual(
			DERISK_EMBEDDING_HIT3,
		);
	}, 30_000);

	it('fusing the semantic half never ranks worse than the deterministic half alone', async () => {
		const state = await seededDemoVault();
		const docs = corpusFor(state, DM_ACTOR.id);
		const index = buildTfIdfIndex(docs);
		const vectors = new Map(docs.map((doc) => [doc.key, Float32Array.from(stubEmbed(doc.text))]));

		const lexical = measureHitAtK(
			REACHABLE.map((qa) => rankHybridSearch(docs, { queryText: qa.q, index, limit: 3 }).hits),
			(hit, i) => answers(hit, REACHABLE[i]!.expect),
		);
		const hybrid = measureHitAtK(
			REACHABLE.map(
				(qa) =>
					rankHybridSearch(docs, {
						queryText: qa.q,
						index,
						queryVector: Float32Array.from(stubEmbed(qa.q)),
						vectorsByKey: vectors,
						limit: 3,
					}).hits,
			),
			(hit, i) => answers(hit, REACHABLE[i]!.expect),
		);
		expect(hybrid.rate).toBeGreaterThanOrEqual(lexical.rate);
	}, 30_000);

	it('a player never retrieves a DM-only artifact, however the question is phrased', async () => {
		const state = await seededDemoVault();
		const playerDocs = corpusFor(state, 'actor-player');
		const dmDocs = corpusFor(state, DM_ACTOR.id);
		expect(playerDocs.length).toBeLessThan(dmDocs.length);

		const index = buildTfIdfIndex(playerDocs);
		const vectors = new Map(
			playerDocs.map((doc) => [doc.key, Float32Array.from(stubEmbed(doc.text))]),
		);
		const dmOnlyText = dmDocs
			.filter((doc) => !playerDocs.some((visible) => visible.id === doc.id))
			.map((doc) => doc.text)
			.join(' ');
		expect(dmOnlyText.length).toBeGreaterThan(0);

		// Ask with the hidden text itself as the query — the strongest possible pull toward it.
		const outcome = rankHybridSearch(playerDocs, {
			queryText: dmOnlyText,
			index,
			queryVector: Float32Array.from(stubEmbed(dmOnlyText)),
			vectorsByKey: vectors,
		});
		const visibleIds = new Set(playerDocs.map((doc) => doc.id));
		expect(outcome.hits.every((hit) => visibleIds.has(hit.id))).toBe(true);
	}, 30_000);
});

describe('RC-AI-3.2 acceptance — offline', () => {
	it('embeds once, then ranks from the device-local cache with the daemon unplugged', async () => {
		localStorage.setItem(
			'dndtools.ai.task-routing',
			JSON.stringify({ assistant: 'local', embeddings: 'local' }),
		);
		const daemon = stubDaemon();
		vi.stubGlobal('fetch', daemon);

		const state = await seededDemoVault();
		const docs = corpusFor(state, DM_ACTOR.id);
		const pass = await embedCorpus(docs);
		expect(pass.stoppedBecause).toBeNull();
		expect(pass.embedded).toBe(docs.length);

		// Everything from here happens on a plane.
		const queryVectors = new Map(REACHABLE.map((qa) => [qa.q, Float32Array.from(stubEmbed(qa.q))]));
		goOffline();

		const cached = await loadCorpusVectors(docs);
		expect(cached.size).toBe(docs.length);
		const index = buildTfIdfIndex(docs);
		const rankings = REACHABLE.map((qa) => {
			const outcome = rankHybridSearch(docs, {
				queryText: qa.q,
				index,
				queryVector: queryVectors.get(qa.q),
				vectorsByKey: cached,
				limit: 3,
			});
			expect(outcome.mode).toBe('hybrid');
			expect(outcome.vectorCoverage).toBe(1);
			return outcome.hits;
		});
		expect(measureHitAtK(rankings, (hit, i) => answers(hit, REACHABLE[i]!.expect)).rate).toBe(
			DERISK_UNION_HIT3,
		);
	}, 30_000);

	it('with no backend at all, search says lexical-only and still reaches every answer', async () => {
		goOffline();
		const state = await seededDemoVault();
		const docs = corpusFor(state, DM_ACTOR.id);
		const index = buildTfIdfIndex(docs);

		// A brand-new query cannot be embedded with nothing to embed it — and that is not an error.
		expect(await embedQuery('who leads the cult')).toBeNull();

		const rankings = REACHABLE.map((qa) => {
			const outcome = rankHybridSearch(docs, { queryText: qa.q, index, limit: 3 });
			expect(outcome.mode).toBe('lexical-only');
			expect(outcome.skipped).toBe('no-query-vector');
			return outcome.hits;
		});
		expect(measureHitAtK(rankings, (hit, i) => answers(hit, REACHABLE[i]!.expect)).rate).toBe(
			DERISK_UNION_HIT3,
		);
	}, 30_000);
});
