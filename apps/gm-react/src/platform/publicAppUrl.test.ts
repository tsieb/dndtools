import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicAppBaseUrl, publicAppHashUrl } from './publicAppUrl';

afterEach(() => vi.unstubAllEnvs());

describe('public app URLs', () => {
	it('uses a validated HTTPS release URL for packaged app locations', () => {
		vi.stubEnv('VITE_PUBLIC_APP_URL', 'https://play.example.test/app/');
		expect(
			publicAppHashUrl(
				'/join',
				{ token: 'a b' },
				{ protocol: 'dndtools:', href: 'dndtools://app/index.html' },
			),
		).toBe('https://play.example.test/app/#/join?token=a+b');
	});

	it('uses the current document for an unconfigured web build', () => {
		expect(
			publicAppHashUrl(
				'/wiki',
				{ id: 'wiki-1' },
				{
					protocol: 'https:',
					href: 'https://preview.example.test/index.html?old=1#/settings',
				},
			),
		).toBe('https://preview.example.test/index.html#/wiki?id=wiki-1');
	});

	it('fails closed for packaged builds without a public URL and malformed configured URLs', () => {
		expect(
			publicAppBaseUrl({ protocol: 'dndtools:', href: 'dndtools://app/index.html' }),
		).toBeNull();
		expect(publicAppBaseUrl({ protocol: 'file:', href: 'file:///app/index.html' })).toBeNull();
		vi.stubEnv('VITE_PUBLIC_APP_URL', 'http://insecure.example.test/');
		expect(
			publicAppBaseUrl({ protocol: 'https:', href: 'https://fallback.example.test/' }),
		).toBeNull();
		vi.stubEnv('VITE_PUBLIC_APP_URL', 'https://user:secret@example.test/');
		expect(
			publicAppBaseUrl({ protocol: 'https:', href: 'https://fallback.example.test/' }),
		).toBeNull();
	});
});
