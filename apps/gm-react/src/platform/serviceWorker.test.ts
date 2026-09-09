// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { shouldRegisterServiceWorker, type ServiceWorkerEnvironment } from './serviceWorker';

// RC-PLT-2.1 — the registration rule is the part of the PWA that can break another shell, so it is
// asserted directly. Electron (`dndtools://app`) and the Android WebView already ship their assets
// in the package; putting a fetch-intercepting worker in front of them buys nothing and risks the
// shell serving a stale copy of itself.

const BROWSER: ServiceWorkerEnvironment = {
	runtimeKind: 'web',
	supported: true,
	secureContext: true,
	protocol: 'https:',
	search: '',
	dev: false,
};

const env = (patch: Partial<ServiceWorkerEnvironment>): ServiceWorkerEnvironment => ({
	...BROWSER,
	...patch,
});

describe('shouldRegisterServiceWorker', () => {
	it('registers in a production browser over https', () => {
		expect(shouldRegisterServiceWorker(BROWSER)).toBe(true);
	});

	it('registers on iOS, where the installed web app is the only shell there is', () => {
		expect(shouldRegisterServiceWorker(env({ runtimeKind: 'ios' }))).toBe(true);
	});

	it('registers on http localhost, which is a secure context', () => {
		expect(shouldRegisterServiceWorker(env({ protocol: 'http:' }))).toBe(true);
	});

	it('skips the Electron desktop shell', () => {
		expect(shouldRegisterServiceWorker(env({ runtimeKind: 'electron' }))).toBe(false);
	});

	it('skips the Android WebView', () => {
		expect(shouldRegisterServiceWorker(env({ runtimeKind: 'android' }))).toBe(false);
	});

	it('skips a browser with no service worker support', () => {
		expect(shouldRegisterServiceWorker(env({ supported: false }))).toBe(false);
	});

	it('skips an insecure context', () => {
		expect(shouldRegisterServiceWorker(env({ secureContext: false }))).toBe(false);
	});

	it('skips a custom app protocol even if it claims to be secure', () => {
		expect(shouldRegisterServiceWorker(env({ protocol: 'dndtools:' }))).toBe(false);
	});

	it('stays out of the way of the dev server unless asked', () => {
		expect(shouldRegisterServiceWorker(env({ dev: true }))).toBe(false);
		expect(shouldRegisterServiceWorker(env({ dev: true, search: '?other=1' }))).toBe(false);
	});

	it('opts in on the dev server with ?sw=dev, which the offline e2e uses', () => {
		expect(shouldRegisterServiceWorker(env({ dev: true, search: '?sw=dev' }))).toBe(true);
	});
});
