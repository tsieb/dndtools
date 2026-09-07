import type { PermissionState } from '../state/permission-state';
import type { VaultContentState } from '../state/content';
import type { MapState } from '../state/map-state';
import type { SessionState } from '../state/session-state';
import type { CalendarDateFormat } from '../state/calendar';
import { parseMarkdownNote } from '../state/markdown';
import type { SearchContentType } from '../state/saved-search';
import { getContentItemsForActor } from './content-query';
import { getMapViewForActor, deliveredMapIdsForActor } from './map-query';
import { getHandoutsForActor } from './handout-query';
import { getDiceHistoryForActor } from './dice-history';

/**
 * SRCH-011 / RC-AI-3.2 — the HYBRID (lexical + semantic) RANKING math behind local, offline semantic
 * search, and the actor-filtered CORPUS it scores.
 *
 * Two halves, deliberately split across the boundary:
 *
 *   - THIS FILE (the Processing Core) owns ALL SCORING. It is pure, synchronous and framework-free:
 *     a BM25-family TF-IDF retriever over the actor-visible text, a cosine retriever over vectors the
 *     SHELL supplies, and a weighted reciprocal-rank fusion of the two. No model, no network, no
 *     storage — the core never learns what an embedding endpoint is.
 *   - THE SHELL (`apps/gm-react/src/ai/embeddings.ts`) owns the VECTORS: it embeds
 *     {@link SearchCorpusDocument.text} through the routed backend (a local Ollama daemon by default),
 *     caches the float32 result per {@link SearchCorpusDocument.key}, and hands the cached vectors back
 *     here. Because the cache is keyed by the document's REVISION, a re-ranked search runs entirely
 *     from cache — i.e. OFFLINE — once a vault has been embedded, and a stale vector can never be
 *     served for an edited note.
 *
 * NO-LEAK: {@link buildSearchCorpusForActor} composes exactly the SAME actor-filtered reads as
 * {@link import('./search-query').searchVaultForActor} — content, map, handout and dice reads that
 * already decided visibility. A hidden note, a hidden POI, a withheld handout section and a `dm-only`
 * secret roll are never candidates, so they are never embedded, never scored and never returned
 * (Cross-Contract Non-Negotiable 2). An unknown actor gets an empty corpus (fail closed).
 *
 * FAIL SOFT, NEVER FAKE: when there is no query vector, or no document has one, ranking degrades to
 * the deterministic lexical half and says so (`mode: 'lexical-only'`) rather than silently pretending
 * a semantic contribution happened.
 *
 * The scoring bulk lives in this module rather than in `search-query.ts` because that file is already
 * past the repo's file-size budget; `search-query.ts` keeps the seam that binds the two together
 * ({@link import('./search-query').createHybridSemanticAssist}).
 */

/** The deterministic order content types are emitted + tie-broken in (mirrors search-query's). */
const TYPE_ORDER: Readonly<Record<SearchContentType, number>> = {
	note: 0,
	object: 1,
	poi: 2,
	handout: 3,
	'session-artifact': 4,
};

/**
 * One actor-visible retrieval document: the text that gets both lexically scored AND embedded, plus
 * the identity needed to address its cached vector.
 */
export interface SearchCorpusDocument {
	/**
	 * The CACHE ADDRESS of this document's embedding: stable across runs, and DIFFERENT the moment the
	 * underlying artifact changes. Built from the type, the owning map (POIs), the id and the artifact
	 * REVISION, so a vector cached for revision 3 is never served for revision 4.
	 */
	key: string;
	/** Stable id of the artifact WITHIN its kind (matches the corresponding search hit id). */
	id: string;
	type: SearchContentType;
	/** The map a POI document belongs to (else `null`). */
	mapId: string | null;
	/** The visible title/label. */
	title: string;
	/** The visible body text (frontmatter stripped; only the sections the actor may see). */
	body: string;
	/** The document's tags (lowercased), empty for domains that carry none. */
	tags: string[];
	/** The artifact revision the text was read at (0 for domains that carry no revision). */
	revision: number;
	/** The artifact's last-update timestamp, when it has one. */
	updatedAt: string | null;
	/** The single normalized string that is BOTH lexically indexed and sent to the embedding backend. */
	text: string;
}

/** Collapse whitespace so the embedded text (and therefore the cache key) is stable across formatting. */
function normalizeText(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

/** The one text representation of a document: title, then tags, then body, then structured fields. */
function documentText(
	title: string,
	tags: readonly string[],
	body: string,
	fieldText = '',
): string {
	const tagText = tags.length > 0 ? tags.join(' ') : '';
	return normalizeText(`${title}. ${tagText} ${body} ${fieldText}`);
}

/** Field keys the app uses for its own bookkeeping — routing metadata, not campaign text. */
const INTERNAL_FIELD_PREFIX = 'dndtools.';

/**
 * The retrievable text of a structured object's FIELDS. A faction sheet keeps its goal, its assets and
 * its secret in fields rather than in the body, and those are exactly the facts a DM asks about
 * mid-session, so a corpus that indexed only the body would miss them (the de-risk measurement's
 * conclusion 3, "sub-chunk long structured sheets", applied at the field level).
 *
 * The fields come from the SAME actor-filtered read as the item, so a field is exactly as visible as
 * the item carrying it. Internal `dndtools.*` routing metadata is skipped: it is bookkeeping, and
 * indexing it would let a folder name outrank a real answer.
 */
function fieldsText(fields: Readonly<Record<string, unknown>>): string {
	const parts: string[] = [];
	for (const key of Object.keys(fields).sort()) {
		if (key.startsWith(INTERNAL_FIELD_PREFIX)) continue;
		const value = fields[key];
		if (typeof value === 'string') {
			if (value.trim() === '') continue;
			parts.push(`${key}: ${value}`);
		} else if (typeof value === 'number' || typeof value === 'boolean') {
			parts.push(`${key}: ${String(value)}`);
		} else if (Array.isArray(value)) {
			const items = value.filter((entry): entry is string => typeof entry === 'string');
			if (items.length > 0) parts.push(`${key}: ${items.join(', ')}`);
		}
	}
	return parts.join('. ');
}

/** Build the per-revision cache address for a document. */
function documentKey(
	type: SearchContentType,
	mapId: string | null,
	id: string,
	revision: number,
): string {
	return `${type}:${mapId ?? ''}:${id}@${revision}`;
}

/**
 * SRCH-001 / RC-AI-3.2 — the ACTOR-VISIBLE retrieval corpus: every artifact the actor may see, as one
 * embeddable/indexable document. Composed ENTIRELY from the existing actor-filtered reads, so it
 * inherits their visibility decisions verbatim and adds no second policy.
 *
 * Deterministic: the same (state, actor) always yields the same documents in the same order (type
 * order → map id → id), so an embedding pass and a ranking pass agree, run to run and device to device.
 *
 * An unknown/unauthenticated actor receives an EMPTY corpus (fail closed) — nothing is embeddable.
 */
export function buildSearchCorpusForActor(
	content: VaultContentState,
	maps: MapState,
	permissions: PermissionState,
	session: SessionState | undefined,
	actorId: string,
	dateFormat: CalendarDateFormat = 'medium',
): SearchCorpusDocument[] {
	if (!permissions.actors[actorId]) return [];
	const docs: SearchCorpusDocument[] = [];

	// Notes + structured objects — a `dm-only`/undelivered item is already absent from this read.
	for (const item of getContentItemsForActor(content, permissions, actorId, dateFormat)) {
		const type: SearchContentType = item.kind === 'object' ? 'object' : 'note';
		const parsed = parseMarkdownNote(item.body);
		const tags = parsed.tags.map((tag) => tag.toLowerCase());
		const body = normalizeText(parsed.body);
		const fields = fieldsText(item.fields);
		docs.push({
			key: documentKey(type, null, item.id, item.revision),
			id: item.id,
			type,
			mapId: null,
			title: item.title,
			body,
			tags,
			revision: item.revision,
			updatedAt: item.updatedAt,
			text: documentText(item.title, tags, body, fields),
		});
	}

	// Map POIs — drawn from the single filtered map projection, so a hidden POI / layer / map is absent.
	const deliveredMapIds = deliveredMapIdsForActor(session, actorId);
	for (const mapId of Object.keys(maps.maps).sort()) {
		const view = getMapViewForActor(maps, permissions, actorId, mapId, { deliveredMapIds });
		if (view.kind !== 'available') continue;
		for (const poi of view.pois) {
			const body = normalizeText(poi.notes);
			// A POI carries no revision in this model; 0 keeps the key shape uniform and stable.
			docs.push({
				key: documentKey('poi', mapId, poi.id, 0),
				id: poi.id,
				type: 'poi',
				mapId,
				title: poi.label,
				body,
				tags: [],
				revision: 0,
				updatedAt: null,
				text: documentText(poi.label, [], body),
			});
		}
	}

	// Handouts — only the SECTIONS this actor may see contribute text, so a withheld section is never
	// embedded and can never surface through a semantic hit.
	if (session) {
		for (const handout of getHandoutsForActor(session, permissions, actorId)) {
			const body = normalizeText(
				handout.sections.map((section) => `${section.heading} ${section.body}`).join(' '),
			);
			docs.push({
				key: documentKey('handout', null, handout.id, handout.revision),
				id: handout.id,
				type: 'handout',
				mapId: null,
				title: handout.title,
				body,
				tags: [],
				revision: handout.revision,
				updatedAt: handout.updatedAt,
				text: documentText(handout.title, [], body),
			});
		}

		// Session artifacts (recorded rolls) — a `dm-only` secret roll is already absent for a non-DM.
		for (const roll of getDiceHistoryForActor(session, permissions, actorId).rolls) {
			const title = roll.label && roll.label.trim() !== '' ? roll.label : roll.expression;
			const body = normalizeText(roll.tableRowText ?? '');
			docs.push({
				key: documentKey('session-artifact', null, roll.id, 0),
				id: roll.id,
				type: 'session-artifact',
				mapId: null,
				title,
				body,
				tags: [],
				revision: 0,
				updatedAt: roll.rolledAt,
				text: documentText(title, [], body),
			});
		}
	}

	docs.sort((a, b) => {
		const byType = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
		if (byType !== 0) return byType;
		const byMap = (a.mapId ?? '').localeCompare(b.mapId ?? '');
		if (byMap !== 0) return byMap;
		return a.id.localeCompare(b.id);
	});
	return docs;
}

/**
 * Split text into ranking terms: lowercase, alphanumeric-plus-apostrophe runs, single characters
 * dropped. Deliberately the same tokenizer the RAG de-risk measurement used
 * (`docs/development/COPILOT_RAG_DERISK.md`), so the hit@3 figures stay comparable.
 */
export function tokenizeSearchText(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^a-z0-9']+/)
		.filter((term) => term.length > 1);
}

/** BM25 term-saturation and length-normalization constants (the standard defaults). */
const BM25_K1 = 1.2;
const BM25_B = 0.75;

/**
 * The lexical side of hybrid ranking: a BM25-weighted TF-IDF index over a corpus. Serializable and
 * rebuildable from the corpus alone — it holds only counts, never content, so it is safe to keep in a
 * device-local cache.
 */
export interface TfIdfIndex {
	documentCount: number;
	averageLength: number;
	/** term → how many documents contain it. */
	documentFrequency: Map<string, number>;
	/** document key → term → in-document frequency. */
	termFrequency: Map<string, Map<string, number>>;
	/** document key → token count. */
	length: Map<string, number>;
}

/** Build the TF-IDF/BM25 index for a corpus. Pure; the same corpus always yields the same index. */
export function buildTfIdfIndex(docs: readonly SearchCorpusDocument[]): TfIdfIndex {
	const documentFrequency = new Map<string, number>();
	const termFrequency = new Map<string, Map<string, number>>();
	const length = new Map<string, number>();
	let totalLength = 0;
	for (const doc of docs) {
		const terms = tokenizeSearchText(doc.text);
		const tf = new Map<string, number>();
		for (const term of terms) tf.set(term, (tf.get(term) ?? 0) + 1);
		for (const term of tf.keys()) {
			documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
		}
		termFrequency.set(doc.key, tf);
		length.set(doc.key, terms.length);
		totalLength += terms.length;
	}
	return {
		documentCount: docs.length,
		averageLength: docs.length === 0 ? 0 : totalLength / docs.length,
		documentFrequency,
		termFrequency,
		length,
	};
}

/**
 * Score every indexed document against a free-text query with BM25. Returns a key → score map; a
 * document no query term touches is simply absent (score 0), never a negative or NaN score.
 */
export function scoreTfIdfQuery(index: TfIdfIndex, queryText: string): Map<string, number> {
	const scores = new Map<string, number>();
	const terms = tokenizeSearchText(queryText);
	if (terms.length === 0 || index.documentCount === 0) return scores;
	const avgLen = index.averageLength > 0 ? index.averageLength : 1;
	for (const [key, tf] of index.termFrequency) {
		const docLength = index.length.get(key) ?? 0;
		let score = 0;
		for (const term of terms) {
			const frequency = tf.get(term) ?? 0;
			if (frequency === 0) continue;
			const df = index.documentFrequency.get(term) ?? 0;
			const idf = Math.log(1 + (index.documentCount - df + 0.5) / (df + 0.5));
			const denominator = frequency + BM25_K1 * (1 - BM25_B + BM25_B * (docLength / avgLen));
			score += (idf * frequency * (BM25_K1 + 1)) / denominator;
		}
		if (score > 0) scores.set(key, score);
	}
	return scores;
}

/**
 * Cosine similarity of two dense vectors, clamped to [-1, 1]. Returns 0 — never NaN — for a length
 * mismatch or a zero vector, so a malformed/absent embedding degrades to "no semantic opinion"
 * instead of poisoning the ranking.
 */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
	if (a.length === 0 || a.length !== b.length) return 0;
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i += 1) {
		const x = a[i] as number;
		const y = b[i] as number;
		if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
		dot += x * y;
		normA += x * x;
		normB += y * y;
	}
	if (normA === 0 || normB === 0) return 0;
	const value = dot / (Math.sqrt(normA) * Math.sqrt(normB));
	return Math.min(1, Math.max(-1, value));
}

/**
 * How the two retrievers are combined. Fusion is by RECIPROCAL RANK, not by raw score: BM25 scores and
 * cosine similarities live on incomparable scales, and rank fusion is what the de-risk measurement's
 * "take the union of both retrievers" conclusion actually describes.
 *
 * `lexical` is weighted above `semantic` by default because the deterministic retriever is the primary
 * one (Vision "Algorithms are primary") and measured the higher hit@3; the semantic half promotes
 * documents the words missed rather than replacing the ordering.
 */
export interface HybridRankingWeights {
	lexical: number;
	semantic: number;
	/** The RRF rank constant: larger flattens the contribution of the top ranks. */
	rankConstant: number;
}

export const DEFAULT_HYBRID_WEIGHTS: Readonly<HybridRankingWeights> = Object.freeze({
	lexical: 1,
	semantic: 0.6,
	rankConstant: 60,
});

/** One ranked document, with both component scores exposed so the ordering is always explainable. */
export interface HybridSearchHit {
	key: string;
	id: string;
	type: SearchContentType;
	mapId: string | null;
	title: string;
	/** The BM25 score (0 when no query term matched). */
	lexicalScore: number;
	/** 1-based rank in the lexical retriever, or `null` when it did not match at all. */
	lexicalRank: number | null;
	/** The cosine similarity against the query vector (0 when either vector is missing). */
	semanticScore: number;
	/** 1-based rank in the semantic retriever, or `null` when this document has no usable vector. */
	semanticRank: number | null;
	/** The fused reciprocal-rank score the hits are ordered by. Higher sorts first. */
	score: number;
}

/** Why a run could not use its semantic half. `null` when it did. */
export type HybridSemanticSkip = 'no-query-vector' | 'no-document-vectors' | 'dimension-mismatch';

export interface HybridSearchInput {
	/** The user's free-text query. May be blank when searching purely by vector. */
	queryText: string;
	/** The embedded query, supplied by the shell. Absent ⇒ lexical-only. */
	queryVector?: ArrayLike<number> | null;
	/** Cached document vectors, keyed by {@link SearchCorpusDocument.key}. */
	vectorsByKey?: ReadonlyMap<string, ArrayLike<number>>;
	/** Prebuilt index; rebuilt from `docs` when omitted. */
	index?: TfIdfIndex;
	/** How many hits to return. Defaults to every scored document. */
	limit?: number;
	weights?: Partial<HybridRankingWeights>;
}

export interface HybridSearchOutcome {
	/** The fused ranking, best first. Only documents at least one retriever scored appear. */
	hits: HybridSearchHit[];
	/** `hybrid` when both retrievers contributed; `lexical-only` when the semantic half was skipped. */
	mode: 'hybrid' | 'lexical-only';
	/** Why the semantic half was skipped, or `null` when it ran. */
	skipped: HybridSemanticSkip | null;
	/** Fraction (0–1) of corpus documents that had a usable, correctly-dimensioned vector. */
	vectorCoverage: number;
}

/**
 * RC-AI-3.2 — rank a corpus by the HYBRID of TF-IDF/BM25 and embedding cosine, fusing the two by
 * weighted reciprocal rank.
 *
 * Pure and deterministic: the same (docs, query, vectors, weights) always produces the same order.
 * Ties fall back to the lexical score, then the semantic score, then type order, then key, so equal
 * scores never reorder between runs.
 *
 * FAIL SOFT: an absent query vector, an empty vector cache, or vectors of the wrong dimension all
 * degrade to the deterministic lexical ranking with `mode: 'lexical-only'` and a stated reason. A
 * document whose vector is missing still ranks — on its lexical score alone — so a half-embedded
 * vault searches correctly rather than dropping its un-embedded half.
 */
export function rankHybridSearch(
	docs: readonly SearchCorpusDocument[],
	input: HybridSearchInput,
): HybridSearchOutcome {
	const weights: HybridRankingWeights = { ...DEFAULT_HYBRID_WEIGHTS, ...input.weights };
	const index = input.index ?? buildTfIdfIndex(docs);
	const lexicalScores = scoreTfIdfQuery(index, input.queryText);

	// --- semantic half: cosine against the query vector, only for correctly-dimensioned cached vectors.
	const queryVector = input.queryVector ?? null;
	const vectors = input.vectorsByKey;
	const semanticScores = new Map<string, number>();
	let usableVectors = 0;
	let dimensionMismatch = false;
	if (queryVector && queryVector.length > 0 && vectors && vectors.size > 0) {
		for (const doc of docs) {
			const vector = vectors.get(doc.key);
			if (!vector) continue;
			if (vector.length !== queryVector.length) {
				// A vector embedded by a DIFFERENT model is not comparable; refuse it rather than
				// scoring nonsense. The document keeps its lexical score.
				dimensionMismatch = true;
				continue;
			}
			usableVectors += 1;
			const similarity = cosineSimilarity(queryVector, vector);
			if (similarity > 0) semanticScores.set(doc.key, similarity);
		}
	}

	let skipped: HybridSemanticSkip | null = null;
	if (!queryVector || queryVector.length === 0) skipped = 'no-query-vector';
	else if (usableVectors === 0) {
		skipped = dimensionMismatch ? 'dimension-mismatch' : 'no-document-vectors';
	}
	const semanticActive = skipped === null;

	const lexicalRanks = rankMap(lexicalScores);
	const semanticRanks = semanticActive ? rankMap(semanticScores) : new Map<string, number>();

	const hits: HybridSearchHit[] = [];
	for (const doc of docs) {
		const lexicalScore = lexicalScores.get(doc.key) ?? 0;
		const semanticScore = semanticActive ? (semanticScores.get(doc.key) ?? 0) : 0;
		const lexicalRank = lexicalRanks.get(doc.key) ?? null;
		const semanticRank = semanticRanks.get(doc.key) ?? null;
		if (lexicalRank === null && semanticRank === null) continue;
		const score =
			(lexicalRank === null ? 0 : weights.lexical / (weights.rankConstant + lexicalRank)) +
			(semanticRank === null ? 0 : weights.semantic / (weights.rankConstant + semanticRank));
		hits.push({
			key: doc.key,
			id: doc.id,
			type: doc.type,
			mapId: doc.mapId,
			title: doc.title,
			lexicalScore,
			lexicalRank,
			semanticScore,
			semanticRank,
			score,
		});
	}

	hits.sort(compareHybridHits);
	const limited = typeof input.limit === 'number' ? hits.slice(0, Math.max(0, input.limit)) : hits;
	return {
		hits: limited,
		mode: semanticActive ? 'hybrid' : 'lexical-only',
		skipped,
		vectorCoverage: docs.length === 0 ? 0 : usableVectors / docs.length,
	};
}

/** Turn a key → score map into 1-based ranks, best score first, ties broken by key for determinism. */
function rankMap(scores: ReadonlyMap<string, number>): Map<string, number> {
	const ordered = [...scores.entries()].sort((a, b) => {
		if (b[1] !== a[1]) return b[1] - a[1];
		return a[0].localeCompare(b[0]);
	});
	const ranks = new Map<string, number>();
	ordered.forEach(([key], position) => ranks.set(key, position + 1));
	return ranks;
}

/** Deterministic hit ordering: fused score → lexical → semantic → type order → key. */
function compareHybridHits(a: HybridSearchHit, b: HybridSearchHit): number {
	if (b.score !== a.score) return b.score - a.score;
	if (b.lexicalScore !== a.lexicalScore) return b.lexicalScore - a.lexicalScore;
	if (b.semanticScore !== a.semanticScore) return b.semanticScore - a.semanticScore;
	const byType = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
	if (byType !== 0) return byType;
	return a.key.localeCompare(b.key);
}

/**
 * Measure hit@k for a set of graded questions — the acceptance metric the RAG de-risk measurement
 * reports (`docs/development/COPILOT_RAG_DERISK.md`). Lives here, next to the ranker, so the figure
 * is produced by the SAME code path the app ranks with rather than by a parallel test-only scorer.
 *
 * `isExpected` decides whether a returned document is the one that holds the answer.
 */
export function measureHitAtK(
	rankings: ReadonlyArray<readonly HybridSearchHit[]>,
	isExpected: (hit: HybridSearchHit, questionIndex: number) => boolean,
	k = 3,
): { hits: number; total: number; rate: number } {
	let found = 0;
	rankings.forEach((ranking, questionIndex) => {
		if (ranking.slice(0, k).some((hit) => isExpected(hit, questionIndex))) found += 1;
	});
	const total = rankings.length;
	return { hits: found, total, rate: total === 0 ? 0 : found / total };
}
