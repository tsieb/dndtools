import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh } from './_helpers';

/**
 * RC-PLT-2.2 — the review a file shared into Lamplight from another Android app must pass.
 *
 * Android's share sheet cannot be driven from a desktop browser, so the spec delivers the share
 * exactly where the native plugin would: the platform layer's pending-share queue. Everything
 * after that is the real thing — the real plan, the real `widget.package.install`, the real vault.
 *
 * What is being proved: a shared file NEVER lands on its own. It always waits for the DM, it says
 * honestly what it is, and a file that is not a module offers no import button to press.
 */

const PACKAGE_ID = 'workspace.shared-lantern';

function sharedPackage() {
	const base = 'widgets/sharedlantern';
	return {
		id: PACKAGE_ID,
		version: '1.0.0',
		displayName: 'Shared lantern',
		widgets: [
			{
				type: 'sharedlantern',
				version: '1.0.0',
				displayName: 'Shared lantern',
				author: 'workspace',
				description: 'A widget package that arrived through the Android share sheet.',
				placement: { surfaces: ['scene'], libraryListed: true },
				renderEntrypoint: {
					runtime: 'custom-html-js',
					sandbox: 'iframe',
					assetPath: `${base}/index.html`,
					hostApiVersion: 1,
				},
				style: {
					isolation: 'iframe-document',
					stylesheetAssetPaths: [`${base}/styles.css`],
					capabilities: ['css-variables', 'host-theme-tokens'],
					tokens: [{ name: 'flame', value: '#e0b06f' }],
				},
				supportedProfiles: ['desktop', 'tablet', 'mobile', 'web'],
				defaultSize: { width: 320, height: 200 },
				minSize: { width: 200, height: 120 },
				resizePolicy: 'free',
				requiredBindings: [],
				optionalBindings: [],
				configurationSchema: { type: 'object', additionalProperties: true },
				capabilitySets: ['manager', 'operator', 'viewer'],
				commands: [],
				events: [],
				hostPermissions: [],
			},
		],
		migrations: [],
		assets: [
			{
				path: `${base}/index.html`,
				kind: 'html',
				entrypoint: true,
				content:
					'<!doctype html><html><head><link rel="stylesheet" href="./styles.css" /></head><body><p>Lantern</p></body></html>',
			},
			{ path: `${base}/styles.css`, kind: 'css', content: 'p { margin: 0; }' },
		],
		portabilityWarnings: [],
	};
}

/** Deliver a share the way `DndtoolsAppIntentPlugin` does — filename, type and raw text. */
async function share(page: Page, filename: string, mimeType: string, text: string): Promise<void> {
	await page.evaluate(
		([name, type, body]) => {
			(
				globalThis as typeof globalThis & {
					__dndtoolsOfferShare__?: (payload: {
						filename: string;
						mimeType: string;
						text: string;
					}) => void;
				}
			).__dndtoolsOfferShare__?.({ filename: name!, mimeType: type!, text: body! });
		},
		[filename, mimeType, text],
	);
}

async function openApp(page: Page): Promise<void> {
	await markOnboarded(page);
	await gotoRoute(page, '/');
	await seedFresh(page);
	await gotoRoute(page, '/');
}

test.describe('Android share target', () => {
	test('a shared module waits for the DM, then installs through the real command', async ({
		page,
	}) => {
		await openApp(page);

		const dialog = page.getByRole('dialog');
		await expect(dialog).toHaveCount(0);

		await share(
			page,
			'shared-lantern.dndmodule',
			'application/json',
			JSON.stringify(sharedPackage()),
		);

		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText('shared-lantern.dndmodule');
		await expect(dialog).toContainText('Widget package');
		// Nothing has entered the vault yet.
		expect(
			await page.evaluate(
				(id) => Object.keys(window.__rt!.state.widgets.packages).includes(id),
				PACKAGE_ID,
			),
		).toBe(false);

		await dialog.getByRole('button', { name: 'Import', exact: true }).click();

		await expect(dialog).toHaveCount(0);
		await expect
			.poll(() =>
				page.evaluate(
					(id) => Object.keys(window.__rt!.state.widgets.packages).includes(id),
					PACKAGE_ID,
				),
			)
			.toBe(true);
	});

	test('a file that is not a module says so and offers nothing to import', async ({ page }) => {
		await openApp(page);

		await share(page, 'shopping-list.txt', 'application/octet-stream', '# Eggs, milk, torches');

		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText('Not a module');
		await expect(dialog).toContainText('not JSON');
		await expect(dialog.getByRole('button', { name: 'Import', exact: true })).toHaveCount(0);

		// The dialog's dismiss affordance is also labelled Close; the footer control is the last one.
		await dialog.getByRole('button', { name: 'Close' }).last().click();
		await expect(dialog).toHaveCount(0);
	});
});
