/**
 * embeddings — RC-AI-3.2. The SHELL half of local semantic search: it turns the Processing Core's
 * actor-visible retrieval corpus into float32 vectors, caches them, and hands them back to the core's
 * hybrid ranker. It owns the model, the endpoint and the cache; it owns NO scoring — every similarity
 * and every ordering is computed by `@dndtools/core`'s `rankHybridSearch` (Architecture Contract 1).
 *
 * WHERE THE VECTORS COME FROM. The embeddings task is routed by `providerConfig.routeAiTask`
 * (RC-AI-3.1), so the user chooses per task whether embeddings run on the local Ollama daemon, on
 * their configured provider, or not at all. The local route is the intended one and the default the
 * story targets: it speaks Ollama's native `POST /api/embeddings`, which needs no key and never leaves
 * the device. A provider route speaks the OpenAI-compatible `POST {baseUrl}/embeddings`.
 *
 * OFFLINE IS THE NORMAL CASE. Embedding happens once per note REVISION, in {@link embedCorpus}. Every
 * search afterwards runs {@link loadCorpusVectors}, which touches only the device-local cache — no
 * daemon, no network, no key. A vault that has been embedded once keeps searching semantically on a
 * plane. The one thing a search cannot do offline is embed a NEW query string, so
 * {@link embedQuery} returns null rather than throwing when no backend is reachable, and the core
 * ranker degrades to its deterministic lexical half and says so.
 *
 * NOTHING HERE IS DURABLE STATE. Vectors are a rebuildable cache in the asset-byte store; they never
 * enter CoreStateSlice, a command payload or the operation log, so an embedding can never sync to
 * another device or into a cloud backup (Contract 2). The corpus text itself is only ever the
 * ACTOR-VISIBLE text the core handed us — a hidden note is not in the corpus, so it is never sent to
 * any endpoint, local or not.
 */

import type { SearchCorpusDocument } from '@dndtools/core';
import {
	MAX_MODEL_CHARS,
	authorizeAiProviderNetworkAccess,
	routeAiTask,
	type AiBackendId,
	type AiRouteUnavailableReason,
	type ResolvedAiProviderConfig,
} from './providerConfig';
import {
	getEmbeddingVector,
	loadEmbeddingVectors,
	pruneEmbeddingVectors,
	putEmbeddingVector,
} from '../platform/storage/assetStore';

/**
 * The embedding model the local route uses unless the user names another. `nomic-embed-text` is the
 * model the RAG de-risk measurement was run against (`docs/development/COPILOT_RAG_DERISK.md`), so the
 * shipped default is the one whose hit rate we actually measured.
 */
export const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text';

/** Ollama's native embeddings route, relative to the daemon root. */
const OLLAMA_EMBEDDINGS_PATH = '/api/embeddings';

/** Non-secret setting, same localStorage split as the rest of the AI settings (no credential here). */
const EMBEDDING_MODEL_KEY = 'dndtools.ai.embedding-model';

/** How much text is sent per document. Long sheets are truncated, not dropped. */
export const MAX_EMBEDDING_INPUT_CHARS = 8000;

export function getEmbeddingModel(): string {
	try {
		const raw = localStorage.getItem(EMBEDDING_MODEL_KEY);
		const model = typeof raw === 'string' ? raw.trim() : '';
		return model !== '' && model.length <= MAX_MODEL_CHARS ? model : DEFAULT_EMBEDDING_MODEL;
	} catch {
		return DEFAULT_EMBEDDING_MODEL;
	}
}

export function saveEmbeddingModel(model: string): string {
	const next = model.trim().slice(0, MAX_MODEL_CHARS) || DEFAULT_EMBEDDING_MODEL;
	try {
		localStorage.setItem(EMBEDDING_MODEL_KEY, next);
	} catch {
		/* settings persistence is best-effort; the in-session value still applies via the caller */
	}
	return next;
}

/** Why embeddings cannot be produced right now. Every value is something the UI can state plainly. */
export type EmbeddingUnavailableReason =
	| AiRouteUnavailableReason
	| 'network'
	| 'bad-response'
	| 'cancelled';

export class EmbeddingError extends Error {
	readonly reason: EmbeddingUnavailableReason;
	constructor(reason: EmbeddingUnavailableReason, message: string) {
		super(message);
		this.name = 'EmbeddingError';
		this.reason = reason;
	}
}

/** What the embeddings task would do right now, and if it cannot run, the one reason why. */
export interface EmbeddingBackendStatus {
	available: boolean;
	backendId: AiBackendId | null;
	/** The model that would be sent, or null when no backend is routed. */
	model: string | null;
	/** The URL requests would go to, or null when no backend is routed. */
	endpoint: string | null;
	reason: EmbeddingUnavailableReason | null;
}

/** Ollama's daemon root: the routed base URL with the OpenAI-compat `/v1` suffix removed. */
function ollamaRoot(baseUrl: string): string {
	return baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
}

/** The embeddings URL for a routed backend: Ollama's native route locally, OpenAI-compatible remotely. */
function embeddingsUrl(backendId: AiBackendId, config: ResolvedAiProviderConfig): string {
	if (backendId === 'local') return `${ollamaRoot(config.baseUrl)}${OLLAMA_EMBEDDINGS_PATH}`;
	return `${config.baseUrl.replace(/\/+$/, '')}/embeddings`;
}

/**
 * The model actually sent. The local route uses the dedicated embedding model — the local backend's
 * `model` setting names the GENERATION model (`qwen2.5:7b`), which cannot embed. A provider route uses
 * whatever the provider is configured with, because there is no second setting to name there.
 */
function modelFor(backendId: AiBackendId, config: ResolvedAiProviderConfig): string {
	return backendId === 'local' ? getEmbeddingModel() : config.model;
}

export function describeEmbeddingBackend(): EmbeddingBackendStatus {
	const route = routeAiTask('embeddings');
	if (!route.available) {
		return {
			available: false,
			backendId: route.backendId,
			model: null,
			endpoint: null,
			reason: route.reason,
		};
	}
	return {
		available: true,
		backendId: route.backendId,
		model: modelFor(route.backendId, route.config),
		endpoint: embeddingsUrl(route.backendId, route.config),
		reason: null,
	};
}

/** Trim one document's text to the per-request budget on a word boundary where possible. */
function boundInput(text: string): string {
	if (text.length <= MAX_EMBEDDING_INPUT_CHARS) return text;
	const cut = text.slice(0, MAX_EMBEDDING_INPUT_CHARS);
	const lastSpace = cut.lastIndexOf(' ');
	return lastSpace > MAX_EMBEDDING_INPUT_CHARS / 2 ? cut.slice(0, lastSpace) : cut;
}

function toVector(values: unknown): Float32Array | null {
	if (!Array.isArray(values) || values.length === 0) return null;
	const vector = new Float32Array(values.length);
	for (let i = 0; i < values.length; i += 1) {
		const value = values[i];
		if (typeof value !== 'number' || !Number.isFinite(value)) return null;
		vector[i] = value;
	}
	return vector;
}

async function postJson(
	url: string,
	body: unknown,
	apiKey: string,
	signal: AbortSignal | undefined,
): Promise<unknown> {
	let response: Response;
	try {
		response = await fetch(url, {
			method: 'POST',
			// A redirect must never carry a credential beyond its confirmed origin.
			redirect: 'error',
			signal,
			headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
			body: JSON.stringify(body),
		});
	} catch {
		throw new EmbeddingError(
			'network',
			'Could not reach the embedding backend — check that it is running and reachable.',
		);
	}
	if (!response.ok) {
		if (response.status === 401 || response.status === 403) {
			throw new EmbeddingError('no-key', 'The embedding backend rejected the API key.');
		}
		throw new EmbeddingError(
			'bad-response',
			`The embedding backend returned ${response.status}. Check the model name and the endpoint.`,
		);
	}
	try {
		return (await response.json()) as unknown;
	} catch {
		throw new EmbeddingError('bad-response', 'The embedding backend returned an unreadable reply.');
	}
}

/**
 * Embed one batch of texts through the routed backend. Fail closed and honest: no route, no consent or
 * no key throws BEFORE any network I/O, and a malformed reply is an error rather than a zero vector
 * that would silently rank everything the same.
 *
 * Ollama's `/api/embeddings` takes one `prompt` per call, so the local route issues one request per
 * text in order; the OpenAI-compatible route sends the whole batch and reads `data[].embedding`.
 */
export async function embedTexts(
	texts: readonly string[],
	options?: { signal?: AbortSignal },
): Promise<Float32Array[]> {
	if (texts.length === 0) return [];
	const route = routeAiTask('embeddings');
	if (!route.available) {
		throw new EmbeddingError(
			route.reason,
			'Embeddings are not set up. Choose a backend for them in Settings → AI & tools.',
		);
	}
	if (!(await authorizeAiProviderNetworkAccess(route.config))) {
		throw new EmbeddingError(
			'network',
			'This embedding address is not allowed by the application network policy.',
		);
	}
	const url = embeddingsUrl(route.backendId, route.config);
	const model = modelFor(route.backendId, route.config);
	const inputs = texts.map(boundInput);

	if (route.backendId === 'local') {
		const vectors: Float32Array[] = [];
		for (const prompt of inputs) {
			const payload = (await postJson(
				url,
				{ model, prompt },
				route.config.apiKey,
				options?.signal,
			)) as {
				embedding?: unknown;
			};
			const vector = toVector(payload?.embedding);
			if (!vector) {
				throw new EmbeddingError('bad-response', 'The local daemon returned no embedding vector.');
			}
			vectors.push(vector);
		}
		return vectors;
	}

	const payload = (await postJson(
		url,
		{ model, input: inputs },
		route.config.apiKey,
		options?.signal,
	)) as { data?: Array<{ embedding?: unknown }> };
	const rows = Array.isArray(payload?.data) ? payload.data : [];
	if (rows.length !== inputs.length) {
		throw new EmbeddingError(
			'bad-response',
			'The embedding backend returned a different number of vectors than texts sent.',
		);
	}
	return rows.map((row) => {
		const vector = toVector(row?.embedding);
		if (!vector)
			throw new EmbeddingError('bad-response', 'The embedding backend returned no vector.');
		return vector;
	});
}

/**
 * Embed a search QUERY. Returns null — never throws — when no backend is reachable, because a search
 * must still return its deterministic results when the daemon is off; the core ranker then reports
 * `lexical-only` rather than pretending a semantic contribution happened.
 */
export async function embedQuery(
	text: string,
	options?: { signal?: AbortSignal },
): Promise<Float32Array | null> {
	const query = text.trim();
	if (query === '') return null;
	try {
		const [vector] = await embedTexts([query], options);
		return vector ?? null;
	} catch {
		return null;
	}
}

export interface EmbedCorpusProgress {
	/** Documents in the corpus. */
	total: number;
	/** Documents whose vector was already cached at this revision. */
	cached: number;
	/** Documents embedded during this pass. */
	embedded: number;
}

export interface EmbedCorpusResult extends EmbedCorpusProgress {
	/** The model the vectors were produced with — the cache is addressed per model. */
	model: string;
	/** Set when the pass stopped early; the vectors it did cache are still usable. */
	stoppedBecause: EmbeddingUnavailableReason | null;
}

/** How many documents are embedded per network round trip on the batching (provider) route. */
const EMBED_BATCH_SIZE = 16;

/**
 * Bring the embedding cache up to date for an actor-visible corpus, then return what it did.
 *
 * Only documents whose per-REVISION key is not already cached are sent, so a second pass over an
 * unchanged vault is pure cache hits and costs nothing. A backend failure part way through is NOT
 * fatal: the pass stops, reports why, and leaves every vector it did cache in place, so an
 * interrupted first run resumes instead of restarting.
 */
export async function embedCorpus(
	docs: readonly SearchCorpusDocument[],
	options?: { signal?: AbortSignal; onProgress?: (progress: EmbedCorpusProgress) => void },
): Promise<EmbedCorpusResult> {
	const model = describeEmbeddingBackend().model ?? getEmbeddingModel();
	const cachedKeys = await loadEmbeddingVectors(
		docs.map((doc) => doc.key),
		model,
	);
	const pending = docs.filter((doc) => !cachedKeys.has(doc.key));
	const progress: EmbedCorpusProgress = {
		total: docs.length,
		cached: cachedKeys.size,
		embedded: 0,
	};
	options?.onProgress?.({ ...progress });

	for (let offset = 0; offset < pending.length; offset += EMBED_BATCH_SIZE) {
		if (options?.signal?.aborted) {
			return { ...progress, model, stoppedBecause: 'cancelled' };
		}
		const batch = pending.slice(offset, offset + EMBED_BATCH_SIZE);
		let vectors: Float32Array[];
		try {
			vectors = await embedTexts(
				batch.map((doc) => doc.text),
				options,
			);
		} catch (error) {
			const reason = error instanceof EmbeddingError ? error.reason : 'network';
			return { ...progress, model, stoppedBecause: reason };
		}
		for (let i = 0; i < batch.length; i += 1) {
			const doc = batch[i];
			const vector = vectors[i];
			if (!doc || !vector) continue;
			await putEmbeddingVector(doc.key, model, vector);
			progress.embedded += 1;
		}
		options?.onProgress?.({ ...progress });
	}
	return { ...progress, model, stoppedBecause: null };
}

/**
 * Load the cached vectors for a corpus. OFFLINE: this reads the device-local asset store only and
 * never contacts a backend, so a search over an already-embedded vault works on a plane. Documents
 * with no cached vector are simply absent; the core ranker scores those on their lexical half.
 */
export async function loadCorpusVectors(
	docs: readonly SearchCorpusDocument[],
	model = describeEmbeddingBackend().model ?? getEmbeddingModel(),
): Promise<Map<string, Float32Array>> {
	return loadEmbeddingVectors(
		docs.map((doc) => doc.key),
		model,
	);
}

/** Whether one document's vector is cached at its current revision (the per-note freshness readout). */
export async function hasCorpusVector(
	doc: SearchCorpusDocument,
	model = describeEmbeddingBackend().model ?? getEmbeddingModel(),
): Promise<boolean> {
	return (await getEmbeddingVector(doc.key, model)) !== null;
}

/**
 * Reclaim vectors that no longer describe a live document — superseded note revisions and documents
 * that have been deleted. Safe to run after any edit: a pruned vector is recomputed on the next pass.
 */
export async function pruneCorpusVectors(
	docs: readonly SearchCorpusDocument[],
	model = describeEmbeddingBackend().model ?? getEmbeddingModel(),
): Promise<{ removed: number; freedBytes: number }> {
	return pruneEmbeddingVectors(
		docs.map((doc) => doc.key),
		model,
	);
}

export const __testing = { EMBEDDING_MODEL_KEY, OLLAMA_EMBEDDINGS_PATH, ollamaRoot };
