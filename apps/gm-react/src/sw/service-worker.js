/**
 * RC-PLT-2.1 — the Lamplight service worker.
 *
 * Source of truth for the worker that ships at `<base>/sw.js`. It is never imported by the app
 * bundle: `lamplightServiceWorker()` in `vite.config.ts` reads this file, prepends a generated
 * header defining `self.__LAMPLIGHT_*`, and emits it as a standalone asset. Left unprepended (the
 * dev-server variant) the defaults below make it a pure runtime cache, which is what a Vite dev
 * server — whose module URLs are neither hashed nor knowable ahead of time — can honestly offer.
 *
 * Two strategies, chosen by whether a URL is in the build's precache:
 *   • precached (content-hashed assets, the offline shell) → cache-first, never revalidated;
 *     the file name changes when the bytes change, so a stale hit is impossible.
 *   • everything else, and every navigation → network-first, falling back to the cache; a
 *     navigation that finds nothing falls back to the offline shell so a reload with no network
 *     still boots the app, which then runs entirely from IndexedDB.
 *
 * The worker never calls `skipWaiting()` on its own. A new version waits until the DM accepts the
 * update toast (`src/platform/serviceWorker.ts`), so a session is never swapped out mid-encounter.
 */

const PRECACHE = self.__LAMPLIGHT_PRECACHE__ ?? [];
const VERSION = self.__LAMPLIGHT_VERSION__ ?? 'dev';
const SHELL = self.__LAMPLIGHT_SHELL__ ?? './';

const CACHE_NAME = `lamplight-${VERSION}`;
const CACHE_PREFIX = 'lamplight-';

/** Absolute URLs of the precached assets, resolved against this worker's own scope. */
const precachedUrls = new Set(PRECACHE.map((path) => new URL(path, self.registration.scope).href));
const shellUrl = new URL(SHELL, self.registration.scope).href;

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			if (precachedUrls.size === 0) return;
			const cache = await caches.open(CACHE_NAME);
			// `reload` so a precache never inherits a stale entry from the HTTP cache.
			await cache.addAll([...precachedUrls].map((url) => new Request(url, { cache: 'reload' })));
		})(),
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const names = await caches.keys();
			await Promise.all(
				names
					.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
					.map((name) => caches.delete(name)),
			);
			await self.clients.claim();
		})(),
	);
});

// The page asks for the swap only after the DM accepts it; see `applyServiceWorkerUpdate`.
self.addEventListener('message', (event) => {
	if (event.data && event.data.type === 'LAMPLIGHT_SKIP_WAITING') self.skipWaiting();
});

/** Only a plain, complete, same-origin GET response is worth keeping. */
function isCacheable(request, response) {
	return (
		request.method === 'GET' &&
		response &&
		response.ok &&
		response.type === 'basic' &&
		response.status === 200
	);
}

/**
 * `ignoreVary` matters: a static host (Vite's preview server, CloudFront) answers with
 * `Vary: Origin`, and Vite marks its module scripts and stylesheet `crossorigin`, so the browser's
 * request carries an `Origin` header the precache's own request did not. Honouring Vary would miss
 * every hashed asset in the precache and the offline shell would load into a blank page.
 */
async function fromCache(request) {
	const cache = await caches.open(CACHE_NAME);
	return cache.match(request, { ignoreVary: true });
}

async function networkFirst(request) {
	try {
		const response = await fetch(request);
		if (isCacheable(request, response)) {
			const copy = response.clone();
			const cache = await caches.open(CACHE_NAME);
			await cache.put(request, copy);
		}
		return response;
	} catch (error) {
		const cached = await fromCache(request);
		if (cached) return cached;
		throw error;
	}
}

async function handleNavigation(request) {
	try {
		return await networkFirst(request);
	} catch {
		const cache = await caches.open(CACHE_NAME);
		const shell =
			(await cache.match(shellUrl, { ignoreSearch: true, ignoreVary: true })) ??
			(await cache.match(request, { ignoreSearch: true, ignoreVary: true }));
		if (shell) return shell;
		// Fail closed and say so, rather than handing the browser a blank success.
		return new Response('Lamplight is offline and has no cached copy of this page yet.', {
			status: 503,
			statusText: 'Offline',
			headers: { 'content-type': 'text/plain; charset=utf-8' },
		});
	}
}

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	// Cross-origin traffic (cloud sync, signalling, AI providers) is never cached or replayed.
	if (url.origin !== self.location.origin) return;

	if (request.mode === 'navigate') {
		event.respondWith(handleNavigation(request));
		return;
	}

	if (precachedUrls.has(url.href)) {
		event.respondWith(fromCache(request).then((cached) => cached ?? networkFirst(request)));
		return;
	}

	event.respondWith(networkFirst(request));
});
