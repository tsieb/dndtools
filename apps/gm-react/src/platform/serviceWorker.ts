import { Toaster } from '../ds';
import { translate, initialLocale, LOCALE_STORAGE_KEY } from '../i18n';
import { getPlatformCapabilities, type RuntimeKind } from './capabilities';

/**
 * RC-PLT-2.1 — registration and update handling for the Lamplight service worker.
 *
 * The worker itself lives in `src/sw/service-worker.js` and is shipped by `lamplightServiceWorker()`
 * in `vite.config.ts`. This module decides WHETHER to register it, which is the part that has to be
 * careful: the same document also boots inside Electron (`dndtools://app`) and the Android WebView,
 * where a fetch-intercepting worker would sit between the shell and its own packaged assets for no
 * benefit at all. Both are detected through the resolved runtime kind rather than a global sniff.
 *
 * An update is offered, never imposed. A new worker installs and then waits; the DM sees one toast
 * and reloads when the table can spare it, so a session is not swapped out mid-encounter.
 */

/** Everything the decision depends on, gathered once so the rule itself stays testable. */
export interface ServiceWorkerEnvironment {
	runtimeKind: RuntimeKind;
	/** False when the browser has no service worker support at all (older WebViews, private modes). */
	supported: boolean;
	/** Workers require a secure context: https, or http on localhost. */
	secureContext: boolean;
	protocol: string;
	/** `location.search` — carries the dev opt-in. */
	search: string;
	dev: boolean;
}

/**
 * The registration rule.
 *
 * In a production build every capable browser gets the worker. Under the Vite dev server it is
 * opt-in via `?sw=dev`, because a worker that intercepts every module request would otherwise
 * attach itself to every e2e spec in the suite; only `tests/e2e/pwa-offline.spec.ts` asks for it.
 */
export function shouldRegisterServiceWorker(env: ServiceWorkerEnvironment): boolean {
	if (!env.supported || !env.secureContext) return false;
	// `dndtools:` (Electron) and `capacitor:`/`https://localhost` (Android) shells ship their assets
	// in the package; only the two browser-hosted runtime kinds benefit from an offline shell.
	if (env.runtimeKind !== 'web' && env.runtimeKind !== 'ios') return false;
	if (env.protocol !== 'https:' && env.protocol !== 'http:') return false;
	if (env.dev) return new URLSearchParams(env.search).get('sw') === 'dev';
	return true;
}

function readEnvironment(): ServiceWorkerEnvironment {
	return {
		runtimeKind: getPlatformCapabilities().runtimeKind,
		supported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
		secureContext: window.isSecureContext,
		protocol: window.location.protocol,
		search: window.location.search,
		dev: import.meta.env.DEV,
	};
}

function t(key: 'pwa.update.ready' | 'pwa.update.reload'): string {
	const locale = initialLocale(
		window.localStorage.getItem(LOCALE_STORAGE_KEY),
		navigator.languages,
	);
	return translate(locale, key);
}

let reloading = false;

/** Hand the waiting worker the go-ahead, then reload once it has taken control. */
export function applyServiceWorkerUpdate(registration: ServiceWorkerRegistration): void {
	const waiting = registration.waiting;
	if (!waiting) return;
	navigator.serviceWorker.addEventListener('controllerchange', () => {
		if (reloading) return;
		reloading = true;
		window.location.reload();
	});
	waiting.postMessage({ type: 'LAMPLIGHT_SKIP_WAITING' });
}

let updateOffered = false;

function offerUpdate(registration: ServiceWorkerRegistration): void {
	// A worker that is waiting with nothing controlling the page yet is the FIRST install, not an
	// update — there is nothing to reload into, and saying otherwise would be a lie.
	if (!navigator.serviceWorker.controller || updateOffered) return;
	updateOffered = true;
	Toaster.info(t('pwa.update.ready'), {
		action: t('pwa.update.reload'),
		onAction: () => applyServiceWorkerUpdate(registration),
	});
}

function watchForUpdates(registration: ServiceWorkerRegistration): void {
	if (registration.waiting) offerUpdate(registration);
	registration.addEventListener('updatefound', () => {
		const installing = registration.installing;
		if (!installing) return;
		installing.addEventListener('statechange', () => {
			if (installing.state === 'installed') offerUpdate(registration);
		});
	});
}

/**
 * Register the worker if this runtime should have one. Resolves to the registration, or null when
 * the runtime is out of scope or the browser refused — a failed registration is a missing offline
 * shell, never a broken app, so it is logged and swallowed rather than surfaced to the DM.
 */
export async function registerServiceWorker(
	env: ServiceWorkerEnvironment = readEnvironment(),
): Promise<ServiceWorkerRegistration | null> {
	if (!shouldRegisterServiceWorker(env)) return null;
	try {
		// Resolved against the document, so the app works from a sub-path as well as an origin root.
		// The app is a HashRouter (src/App.tsx:11), so `document.baseURI` never carries a route.
		const url = new URL('sw.js', document.baseURI);
		const registration = await navigator.serviceWorker.register(url, { type: 'classic' });
		watchForUpdates(registration);
		return registration;
	} catch (error) {
		console.warn('Service worker registration failed; the app runs online only.', error);
		return null;
	}
}
