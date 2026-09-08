import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * RC-PLT-2.1 — installability, asserted against the real files.
 *
 * The story's acceptance criterion is a Lighthouse PWA pass. Lighthouse is not installed on the
 * build machines and would need a served production build plus a headless Chrome to say anything,
 * so its INSTALLABILITY requirements are asserted here instead, one by one, against the manifest
 * and document that ship: a name, a start URL, a standalone display, 192px and 512px icons, a
 * maskable icon, a theme colour, and a document that actually links the manifest.
 */

const read = (relative: string) =>
	readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
const readBytes = (relative: string) =>
	readFileSync(fileURLToPath(new URL(relative, import.meta.url)));

const manifest = JSON.parse(read('../../public/manifest.webmanifest')) as {
	name: string;
	short_name: string;
	start_url: string;
	scope: string;
	display: string;
	theme_color: string;
	background_color: string;
	icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
};
const indexHtml = read('../../index.html');

/** Width and height straight out of the PNG IHDR chunk, so a mislabelled `sizes` cannot pass. */
function pngDimensions(relative: string): { width: number; height: number } {
	const bytes = readBytes(relative);
	expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
	return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('web app manifest', () => {
	it('names the app for the installer and the home screen', () => {
		expect(manifest.name).toBe('Lamplight');
		expect(manifest.short_name.length).toBeGreaterThan(0);
		expect(manifest.short_name.length).toBeLessThanOrEqual(12);
	});

	it('starts inside its own scope in a standalone window', () => {
		expect(manifest.start_url).toBe('.');
		expect(manifest.scope).toBe('.');
		expect(manifest.display).toBe('standalone');
	});

	it('declares the colours the splash screen and title bar are painted with', () => {
		expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/);
		expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/);
		expect(indexHtml).toContain(`content="${manifest.theme_color}"`);
	});

	it('ships a 192px icon, a 512px icon and a maskable icon that are really those sizes', () => {
		const byPurpose = (purpose: string) =>
			manifest.icons.filter((icon) => icon.purpose.split(/\s+/).includes(purpose));
		const png = byPurpose('any').filter((icon) => icon.type === 'image/png');
		expect(png.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
		expect(byPurpose('maskable').length).toBeGreaterThan(0);

		for (const icon of manifest.icons.filter((i) => i.type === 'image/png')) {
			const [width, height] = icon.sizes.split('x').map(Number);
			expect(pngDimensions(`../../public/${icon.src}`)).toEqual({ width, height });
		}
	});

	it('is linked from the document, with an apple-touch-icon for iOS', () => {
		expect(indexHtml).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
		expect(indexHtml).toContain('rel="apple-touch-icon"');
		expect(indexHtml).toContain('name="mobile-web-app-capable"');
	});
});

describe('service worker source', () => {
	const sw = read('../sw/service-worker.js');

	it('serves a cached shell rather than a blank success when a navigation has none', () => {
		expect(sw).toContain('503');
		expect(sw).toContain("statusText: 'Offline'");
	});

	it('never takes over on its own — the DM accepts the update', () => {
		expect(sw).toContain('LAMPLIGHT_SKIP_WAITING');
		// The only `skipWaiting()` call is the one inside the message handler.
		expect(sw.match(/self\.skipWaiting\(\)/g)).toHaveLength(1);
	});

	it('leaves cross-origin traffic alone', () => {
		expect(sw).toContain('url.origin !== self.location.origin');
	});
});
