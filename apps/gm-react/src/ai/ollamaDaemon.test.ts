import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	OllamaDaemonError,
	deleteOllamaModel,
	formatModelSize,
	listOllamaModels,
	pullOllamaModel,
} from './ollamaDaemon';

/**
 * RC-AI-3.3 — the Ollama daemon client behind Settings › AI › Local models: list what is pulled,
 * pull a new model (streamed NDJSON progress), delete one, and format its disk cost. Every failure
 * mode is a named, user-facing reason (fail closed and honest) rather than a raw fetch rejection.
 */

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

/** A fake streamed body yielding one already-encoded NDJSON chunk per array entry. */
function streamOf(lines: string[]): { getReader: () => ReadableStreamDefaultReader } {
	const encoder = new TextEncoder();
	let i = 0;
	return {
		getReader: () =>
			({
				read: async () => {
					if (i >= lines.length) return { done: true, value: undefined };
					const value = encoder.encode(lines[i]);
					i += 1;
					return { done: false, value };
				},
				releaseLock: () => {},
			}) as unknown as ReadableStreamDefaultReader,
	};
}

describe('listOllamaModels', () => {
	it('parses the daemon tags response into typed models', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				models: [
					{ name: 'qwen2.5:7b', size: 4_700_000_000, digest: 'sha-a', modified_at: '2026-01-01' },
					{ name: 'not-a-model', size: 'nope' },
					'garbage',
				],
			}),
		});
		const models = await listOllamaModels();
		expect(models).toEqual([
			{ name: 'qwen2.5:7b', sizeBytes: 4_700_000_000, digest: 'sha-a', modifiedAt: '2026-01-01' },
			{ name: 'not-a-model', sizeBytes: 0, digest: null, modifiedAt: null },
		]);
		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:11434/api/tags',
			expect.objectContaining({ redirect: 'error' }),
		);
	});

	it('fails closed with a named reason when the daemon is unreachable', async () => {
		fetchMock.mockRejectedValue(new Error('refused'));
		await expect(listOllamaModels()).rejects.toMatchObject({
			reason: 'network',
		} satisfies Partial<OllamaDaemonError>);
	});

	it('fails closed on a non-OK status', async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 500 });
		await expect(listOllamaModels()).rejects.toMatchObject({ reason: 'bad-response' });
	});
});

describe('pullOllamaModel', () => {
	it('reports each streamed progress line and resolves once the stream ends', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			body: streamOf([
				`${JSON.stringify({ status: 'pulling manifest' })}\n`,
				`${JSON.stringify({ status: 'downloading', completed: 50, total: 100 })}\n`,
				`${JSON.stringify({ status: 'success' })}\n`,
			]),
		});
		const progress: Array<{ status: string; percent: number | null }> = [];
		await pullOllamaModel('qwen2.5:7b', (p) => progress.push(p));
		expect(progress).toEqual([
			{ status: 'pulling manifest', percent: null },
			{ status: 'downloading', percent: 50 },
			{ status: 'success', percent: null },
		]);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://localhost:11434/api/pull');
		expect(init.method).toBe('POST');
		expect(JSON.parse(init.body as string)).toEqual({ name: 'qwen2.5:7b' });
	});

	it('throws on an in-stream {error} line instead of reporting it as progress', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			body: streamOf([
				`${JSON.stringify({ error: 'pull model manifest: file does not exist' })}\n`,
			]),
		});
		await expect(pullOllamaModel('does-not-exist')).rejects.toMatchObject({
			reason: 'bad-response',
			message: 'pull model manifest: file does not exist',
		});
	});

	it('reports a 404 as a named not-found reason', async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 404 });
		await expect(pullOllamaModel('nope')).rejects.toMatchObject({ reason: 'not-found' });
	});
});

describe('deleteOllamaModel', () => {
	it('sends a DELETE with the model name', async () => {
		fetchMock.mockResolvedValue({ ok: true, status: 200 });
		await deleteOllamaModel('qwen2.5:7b');
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://localhost:11434/api/delete');
		expect(init.method).toBe('DELETE');
		expect(JSON.parse(init.body as string)).toEqual({ name: 'qwen2.5:7b' });
	});

	it('fails closed on a non-OK status', async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 500 });
		await expect(deleteOllamaModel('qwen2.5:7b')).rejects.toMatchObject({ reason: 'bad-response' });
	});
});

describe('formatModelSize', () => {
	it('formats across the byte/KB/MB/GB range', () => {
		expect(formatModelSize(0)).toBe('0 B');
		expect(formatModelSize(512)).toBe('512 B');
		expect(formatModelSize(274_000_000)).toBe('261.3 MB');
		expect(formatModelSize(4_700_000_000)).toBe('4.4 GB');
	});
});
