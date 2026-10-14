import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync('apps/gm-react/src/sw/service-worker.js', 'utf8');
const origin = 'https://app.test';

function harness() {
	const listeners = new Map<string, (event: unknown) => void>();
	const entries = new Map<string, Response>();
	const cache = {
		match: vi.fn(async (request: Request) => entries.get(request.url)),
		put: vi.fn(async (request: Request, response: Response) => entries.set(request.url, response)),
		delete: vi.fn(async (request: Request) => entries.delete(request.url)),
	};
	const caches = {
		open: vi.fn(async () => cache),
		keys: vi.fn(async () => ['lamplight-dev', 'lamplight-old', 'unrelated']),
		delete: vi.fn(async () => true),
	};
	const fetch = vi.fn();
	runInNewContext(source, {
		self: {
			registration: { scope: `${origin}/` },
			location: { origin },
			__LAMPLIGHT_PRECACHE__: ['/asset.js'],
			clients: { claim: vi.fn() },
			addEventListener: (name: string, callback: (event: unknown) => void) =>
				listeners.set(name, callback),
		},
		caches,
		fetch,
		URL,
		Request,
		Response,
	});
	function dispatch(request: Request) {
		let response: Promise<Response> | undefined;
		listeners.get('fetch')!({
			request,
			respondWith: (value: Promise<Response>) => {
				response = value;
			},
		});
		return response;
	}
	return { listeners, entries, cache, caches, fetch, dispatch };
}

function basicResponse(cacheControl: string) {
	const response = new Response('public payload', { headers: { 'cache-control': cacheControl } });
	Object.defineProperty(response, 'type', { value: 'basic' });
	return response;
}

describe('service worker cache confidentiality', () => {
	it.each(['/asset.js', '/account'])('bypasses all caches for Authorization on %s', (path) => {
		const h = harness();
		const request = new Request(`${origin}${path}`, { headers: { Authorization: 'Bearer test' } });
		expect(h.dispatch(request)).toBeUndefined();
		expect(h.caches.open).not.toHaveBeenCalled();
	});

	it('bypasses navigation shell fallback for Authorization requests', () => {
		const h = harness();
		const request = new Request(`${origin}/account`, { headers: { Authorization: 'Bearer test' } });
		Object.defineProperty(request, 'mode', { value: 'navigate' });
		expect(h.dispatch(request)).toBeUndefined();
		expect(h.caches.open).not.toHaveBeenCalled();
	});

	it.each(['no-store', 'PRIVATE', 'private="Set-Cookie"'])(
		'evicts an earlier public response when it becomes %s',
		async (directive) => {
			const h = harness();
			const request = new Request(`${origin}/account`);
			h.entries.set(request.url, new Response('old account'));
			h.fetch.mockResolvedValueOnce(basicResponse(directive));
			await h.dispatch(request);
			expect(h.cache.put).not.toHaveBeenCalled();
			expect(h.entries.has(request.url)).toBe(false);
			h.fetch.mockRejectedValueOnce(new Error('offline'));
			await expect(h.dispatch(request)).rejects.toThrow('offline');
		},
	);

	it('preserves public runtime assets offline', async () => {
		const h = harness();
		const request = new Request(`${origin}/public.js`);
		h.fetch.mockResolvedValueOnce(basicResponse('public, immutable'));
		await h.dispatch(request);
		h.fetch.mockRejectedValueOnce(new Error('offline'));
		expect(await (await h.dispatch(request))!.text()).toBe('public payload');
	});

	it('removes caches created under the former admission policy on activation', async () => {
		const h = harness();
		let finished: Promise<void> | undefined;
		h.listeners.get('activate')!({
			waitUntil: (value: Promise<void>) => {
				finished = value;
			},
		});
		await finished;
		expect(h.caches.delete.mock.calls).toEqual([['lamplight-dev'], ['lamplight-old']]);
	});
});
