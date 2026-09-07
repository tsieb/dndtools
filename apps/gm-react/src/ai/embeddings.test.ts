import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import type { SearchCorpusDocument } from '@dndtools/core';
import { __testing as coreStoreTesting } from '../platform/storage/coreStore';
import {
	embeddingCacheUsage,
	listAssetBytes,
	collectGarbage,
	putAssetBytes,
} from '../platform/storage/assetStore';
import {
	DEFAULT_EMBEDDING_MODEL,
	EmbeddingError,
	describeEmbeddingBackend,
	embedCorpus,
	embedQuery,
	embedTexts,
	getEmbeddingModel,
	hasCorpusVector,
	loadCorpusVectors,
	pruneCorpusVectors,
	saveEmbeddingModel,
	__testing,
} from './embeddings';

/**
 * RC-AI-3.2 — the SHELL half of local semantic search: the Ollama client and the per-revision vector
 * cache. What these prove:
 *   - embeddings are FAIL CLOSED — with AI consent off, or the task routed nowhere, nothing is sent;
 *   - the local route speaks Ollama's native `POST /api/embeddings`, needs no key, and stays on device;
 *   - a second pass over an unchanged vault issues ZERO requests, which is what makes search OFFLINE;
 *   - editing a note invalidates its vector by revision, and the superseded one is reclaimable;
 *   - the cache never leaks into a backup, and the asset garbage sweep never eats it.
 */

class MemoryStorage {
	private map = new Map<string, string>();
	getItem(k: string): string | null {
		return this.map.has(k) ? (this.map.get(k) as string) : null;
	}
	setItem(k: string, v: string): void {
		this.map.set(k, String(v));
	}
	removeItem(k: string): void {
		this.map.delete(k);
	}
	clear(): void {
		this.map.clear();
	}
}

const AI_USAGE_KEY = 'dndtools.ai.usage-preference';
const TASK_ROUTING_KEY = 'dndtools.ai.task-routing';

let fetchMock: ReturnType<typeof vi.fn>;

function doc(id: string, revision: number, text: string): SearchCorpusDocument {
	return {
		key: `note::${id}@${revision}`,
		id,
		type: 'note',
		mapId: null,
		title: text.split('.')[0] ?? id,
		body: text,
		tags: [],
		revision,
		updatedAt: null,
		text,
	};
}

/** A stubbed Ollama daemon: one `{embedding: number[]}` per `POST /api/embeddings`. */
function ollamaDaemon(dimensions = 8) {
	return vi.fn(async (url: string, init?: RequestInit) => {
		const body = JSON.parse(String(init?.body)) as { prompt?: string };
		const vector = Array.from(
			{ length: dimensions },
			(_, i) => (body.prompt?.charCodeAt(i) ?? 0) / 128,
		);
		return {
			ok: true,
			status: 200,
			json: async () => ({ embedding: vector }),
		} as unknown as Response;
	});
}

/** Route the embeddings task to the local Ollama backend with AI consent granted. */
function enableLocalEmbeddings(): void {
	localStorage.setItem(AI_USAGE_KEY, 'complete');
	localStorage.setItem(
		TASK_ROUTING_KEY,
		JSON.stringify({ assistant: 'local', embeddings: 'local' }),
	);
}

beforeEach(() => {
	const factory = new IDBFactory();
	globalThis.indexedDB = factory;
	Dexie.dependencies.indexedDB = factory;
	Dexie.dependencies.IDBKeyRange = IDBKeyRange;
	globalThis.localStorage = new MemoryStorage() as unknown as Storage;
	fetchMock = ollamaDaemon();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
	await coreStoreTesting.closeDb();
	vi.unstubAllGlobals();
});

describe('the embeddings backend is fail closed', () => {
	it('sends nothing when AI use has not been consented to', async () => {
		const status = describeEmbeddingBackend();
		expect(status.available).toBe(false);
		expect(status.reason).toBe('consent-off');
		await expect(embedTexts(['anything'])).rejects.toBeInstanceOf(EmbeddingError);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('sends nothing when the embeddings task is routed nowhere', async () => {
		localStorage.setItem(AI_USAGE_KEY, 'complete');
		localStorage.setItem(
			TASK_ROUTING_KEY,
			JSON.stringify({ assistant: 'local', embeddings: 'off' }),
		);
		expect(describeEmbeddingBackend().reason).toBe('task-off');
		await expect(embedTexts(['anything'])).rejects.toMatchObject({ reason: 'task-off' });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('returns a null query vector rather than throwing, so search still runs deterministically', async () => {
		expect(await embedQuery('who leads the cult')).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('the local route speaks Ollama', () => {
	it('posts one prompt per text to /api/embeddings on the daemon root', async () => {
		enableLocalEmbeddings();
		const status = describeEmbeddingBackend();
		expect(status.available).toBe(true);
		expect(status.backendId).toBe('local');
		expect(status.endpoint).toBe('http://localhost:11434/api/embeddings');
		expect(status.model).toBe(DEFAULT_EMBEDDING_MODEL);

		const vectors = await embedTexts(['the harbor at dusk', 'the drowned chapel']);
		expect(vectors).toHaveLength(2);
		expect(vectors[0]).toBeInstanceOf(Float32Array);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://localhost:11434/api/embeddings');
		expect(JSON.parse(String(init.body))).toEqual({
			model: DEFAULT_EMBEDDING_MODEL,
			prompt: 'the harbor at dusk',
		});
	});

	it('strips the OpenAI-compat /v1 suffix when deriving the daemon root', () => {
		expect(__testing.ollamaRoot('http://localhost:11434/v1')).toBe('http://localhost:11434');
		expect(__testing.ollamaRoot('http://127.0.0.1:11434/')).toBe('http://127.0.0.1:11434');
	});

	it('rejects a reply with no vector instead of caching a zero vector', async () => {
		enableLocalEmbeddings();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response),
		);
		await expect(embedTexts(['x'])).rejects.toMatchObject({ reason: 'bad-response' });
	});

	it('remembers a user-chosen embedding model', () => {
		expect(getEmbeddingModel()).toBe(DEFAULT_EMBEDDING_MODEL);
		expect(saveEmbeddingModel('  mxbai-embed-large  ')).toBe('mxbai-embed-large');
		expect(getEmbeddingModel()).toBe('mxbai-embed-large');
		expect(saveEmbeddingModel('')).toBe(DEFAULT_EMBEDDING_MODEL);
	});
});

describe('the vector cache makes search offline', () => {
	it('embeds each document once, then serves a second pass entirely from cache', async () => {
		enableLocalEmbeddings();
		const docs = [
			doc('a', 1, 'The Brine Hand meets beneath the harbor.'),
			doc('b', 1, 'Market day.'),
		];

		const first = await embedCorpus(docs);
		expect(first).toMatchObject({ total: 2, cached: 0, embedded: 2, stoppedBecause: null });
		expect(fetchMock).toHaveBeenCalledTimes(2);

		fetchMock.mockClear();
		const second = await embedCorpus(docs);
		expect(second).toMatchObject({ total: 2, cached: 2, embedded: 0 });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('loads cached vectors with the network unreachable — the offline acceptance', async () => {
		enableLocalEmbeddings();
		const docs = [doc('a', 1, 'The Brine Hand meets beneath the harbor.')];
		await embedCorpus(docs);

		// Pull the plug: any request from here on is a failure, not a slow path.
		vi.stubGlobal(
			'fetch',
			vi.fn(() => {
				throw new Error('offline');
			}),
		);
		const vectors = await loadCorpusVectors(docs);
		expect(vectors.get(docs[0]!.key)).toBeInstanceOf(Float32Array);
		expect(vectors.get(docs[0]!.key)!.length).toBe(8);
		expect(await hasCorpusVector(docs[0]!)).toBe(true);
	});

	it('invalidates a vector when the note is edited, and reclaims the superseded one', async () => {
		enableLocalEmbeddings();
		const before = doc('a', 1, 'First draft.');
		await embedCorpus([before]);
		const after = doc('a', 2, 'Second draft, with the leak.');

		// The new revision has no vector yet: the ranker would score it lexically until it is embedded.
		expect(await hasCorpusVector(after)).toBe(false);
		expect((await loadCorpusVectors([after])).size).toBe(0);

		await embedCorpus([after]);
		expect(await hasCorpusVector(after)).toBe(true);
		expect((await embeddingCacheUsage()).count).toBe(2);

		const pruned = await pruneCorpusVectors([after]);
		expect(pruned.removed).toBe(1);
		expect((await embeddingCacheUsage()).count).toBe(1);
		expect(await hasCorpusVector(after)).toBe(true);
	});

	it('keeps a partly-embedded vault usable when the daemon dies mid-pass', async () => {
		enableLocalEmbeddings();
		const docs = [doc('a', 1, 'One.'), doc('b', 1, 'Two.'), doc('c', 1, 'Three.')];
		let calls = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init?: RequestInit) => {
				calls += 1;
				if (calls > 2) throw new Error('daemon gone');
				const body = JSON.parse(String(init?.body)) as { prompt?: string };
				return {
					ok: true,
					status: 200,
					json: async () => ({ embedding: [body.prompt?.length ?? 0, 1, 2, 3] }),
				} as unknown as Response;
			}),
		);
		// The whole corpus is one batch, and the batch failed — so nothing from THAT batch is cached,
		// but the pass reports why instead of pretending it finished.
		const result = await embedCorpus(docs);
		expect(result.stoppedBecause).toBe('network');
		expect(result.embedded).toBe(0);
	});
});

describe('the cache stays out of the asset lifecycle', () => {
	it('is excluded from backup enumeration and survives the asset garbage sweep', async () => {
		enableLocalEmbeddings();
		const imageId = await putAssetBytes(new TextEncoder().encode('a map image'), 'image/png');
		await embedCorpus([doc('a', 1, 'The Brine Hand meets beneath the harbor.')]);
		expect((await embeddingCacheUsage()).count).toBe(1);

		// A backup carries the image, never the derived vectors.
		const exported = await listAssetBytes();
		expect(exported.map((asset) => asset.id)).toEqual([imageId]);

		// The metadata-driven sweep only knows about the image; it must not take the vector with it.
		const swept = await collectGarbage(new Set([imageId]));
		expect(swept.removed).toBe(0);
		expect((await embeddingCacheUsage()).count).toBe(1);
	});
});
