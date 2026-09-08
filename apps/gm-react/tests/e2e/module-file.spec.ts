import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// RC-CLD-4.1 — the marketplace's `.dndmodule` bundle, round-tripped as a FILE (Community → Export →
// Module files). The cloud marketplace itself is unreachable from e2e by design — playwright.config
// blanks every VITE_* cloud coordinate, so Discover/Publish render their fail-closed gate
// (community-publish.spec.ts asserts that) — but the FORMAT, the manifest, the per-kind install plan
// and the install review are the same code either way. This spec is the story's publish/install
// acceptance: a content module is written from the PORTABLE export (no DM-only content in it), then
// installed back through the review dialog and the transactional `content.commit-import`.

interface ModuleBundleFile {
	format: string;
	schemaVersion: number;
	manifest: { kind: string; id: string; name: string; version: string; summary: string };
	payload: {
		format: string;
		version: number;
		mode: string;
		files: { path: string; markdown: string }[];
	};
	assets: unknown[];
}

/** Titles of the seeded vault's DM-only content — none of it may appear in a published module. */
async function dmOnlyTitles(page: import('@playwright/test').Page): Promise<string[]> {
	return page.evaluate(() => {
		const items = (
			window.__rt!.state.content as {
				items: Record<string, { title: string; visibility: string; deletedAt: string | null }>;
			}
		).items;
		return Object.values(items)
			.filter((i) => i.visibility === 'dm-only' && i.deletedAt === null)
			.map((i) => i.title);
	});
}

test.describe('community: .dndmodule content module round trip', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/community');
		await seedFresh(page);
		await page.goto('/#/community', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
		await page.getByRole('tab', { name: 'Export' }).click();
		await expect(page.getByText('Module files')).not.toHaveCount(0);
	});

	test('saves the campaign as a content module and leaves DM only content out', async ({
		page,
	}) => {
		await page.getByLabel('Module name').fill('Harbour Notes');
		await page.getByLabel('Module summary').fill('The player-facing notes for the harbour arc.');

		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Save .dndmodule' }).click();
		const download = await downloadPromise;

		// Named by the manifest itself (`moduleBundleFileName`): <id>-<version>.dndmodule.
		expect(download.suggestedFilename()).toBe('harbour-notes-1.0.0.dndmodule');

		const path = await download.path();
		const bundle = JSON.parse(await fs.readFile(path!, 'utf8')) as ModuleBundleFile;
		expect(bundle.format).toBe('dndmodule');
		expect(bundle.schemaVersion).toBe(1);
		expect(bundle.manifest.kind).toBe('content-module');
		expect(bundle.manifest.id).toBe('harbour-notes');
		expect(bundle.assets).toEqual([]);

		// The payload IS the `content.export` bundle — the format extends content.export rather than
		// forking it — and it is the PORTABLE projection.
		expect(bundle.payload.format).toBe('dndtools-content-export');
		expect(bundle.payload.mode).toBe('portable');
		expect(bundle.payload.files.length).toBeGreaterThan(0);

		// The privacy guarantee the portable export carries: no DM-only note reaches a published module.
		const serialized = JSON.stringify(bundle.payload);
		const hidden = await dmOnlyTitles(page);
		// The seeded vault must actually HAVE DM-only content, or the check below proves nothing.
		expect(hidden.length).toBeGreaterThan(0);
		for (const title of hidden) {
			expect(serialized).not.toContain(title);
		}

		await expect(page.getByText(/Saved harbour-notes-1\.0\.0\.dndmodule/)).not.toHaveCount(0);
	});

	test('installs a module file through a review that names what would land', async ({ page }) => {
		await page.getByLabel('Module name').fill('Harbour Notes');
		await page.getByLabel('Module summary').fill('The player-facing notes for the harbour arc.');
		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Save .dndmodule' }).click();
		const saved = await downloadPromise;
		const bundle = JSON.parse(await fs.readFile((await saved.path())!, 'utf8')) as ModuleBundleFile;

		// Stand in for "a module somebody else made": the same bundle carrying one note this vault does
		// not have, so the install has something visible to add.
		const stamp = `Harbour drop ${Date.now()}`;
		const notePath = 'harbour-drop.md';
		bundle.payload.files = [{ path: notePath, markdown: `# ${stamp}\n\nDock rumours.\n` }];
		const modulePath = join(tmpdir(), `dndtools-module-${Date.now()}.dndmodule`);
		await fs.writeFile(modulePath, JSON.stringify(bundle), 'utf8');

		const chooserPromise = page.waitForEvent('filechooser');
		await page.getByRole('button', { name: 'Install .dndmodule…' }).click();
		(await chooserPromise).setFiles(modulePath);

		// Nothing installs without a review: the dialog names the kind, the count and the paths BEFORE
		// anything enters the vault (ADR-002 — a publisher proposes, the DM disposes).
		const review = page.getByRole('dialog', { name: 'Install this module?' });
		await expect(review).toBeVisible();
		await expect(review.getByText('Content module')).not.toHaveCount(0);
		await expect(review.getByText(notePath)).not.toHaveCount(0);

		await review.getByRole('button', { name: 'Install module' }).click();

		// The note landed through the real `content.commit-import`, so it is in core state.
		await expect
			.poll(
				() =>
					page.evaluate((title) => {
						const items = (
							window.__rt!.state.content as { items: Record<string, { title: string }> }
						).items;
						return Object.values(items).some((i) => i.title === title);
					}, stamp),
				{ timeout: 10_000 },
			)
			.toBe(true);
		await expect(review).toBeHidden();

		await fs.rm(modulePath, { force: true });
	});
});

/**
 * RC-SYS-3.4 — the same file round trip for a SYSTEM PACKAGE. A system is data (vocabulary,
 * attributes, resources, conditions, formulas): it runs no code and asks for no host permission, so
 * it ships in the same `.dndmodule` envelope and installs through the same review, straight into
 * `system.define`. What the import must not do is keep the id it arrived with — built-in packages are
 * re-seeded from the build on every load, so an install lands in the `custom:` namespace instead.
 */
test.describe('community: .dndmodule system package round trip', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/community');
		await seedFresh(page);
		await page.goto('/#/community', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
		await page.getByRole('tab', { name: 'Export' }).click();
		await expect(page.getByText('Module files')).not.toHaveCount(0);
	});

	test('saves the active game system as a module and installs it back as a custom system', async ({
		page,
	}) => {
		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Save system package' }).click();
		const download = await downloadPromise;

		// The manifest is the package's own facts — no form to fill in for a system.
		expect(download.suggestedFilename()).toBe('builtin-dnd5e-1.1.0.dndmodule');
		const bundlePath = (await download.path())!;
		const bundle = JSON.parse(await fs.readFile(bundlePath, 'utf8')) as ModuleBundleFile & {
			payload: { id: string; displayName: string };
		};
		expect(bundle.manifest.kind).toBe('system-package');
		expect(bundle.payload.id).toBe('builtin:dnd5e');

		// Install the very file that was just written, through the review every module goes through.
		const modulePath = join(tmpdir(), `dndtools-system-${Date.now()}.dndmodule`);
		await fs.writeFile(modulePath, JSON.stringify(bundle), 'utf8');
		const chooserPromise = page.waitForEvent('filechooser');
		await page.getByRole('button', { name: 'Install .dndmodule…' }).click();
		(await chooserPromise).setFiles(modulePath);

		const review = page.getByRole('dialog', { name: 'Install this module?' });
		await expect(review).toBeVisible();
		await expect(review.getByText('System package')).not.toHaveCount(0);
		await review.getByRole('button', { name: 'Install module' }).click();

		// It landed through the real `system.define`, re-homed into the custom namespace, and the
		// campaign is still playing the system it was playing before (selecting stays separate).
		await expect
			.poll(
				() =>
					page.evaluate(() => {
						const systems = window.__rt!.state.systems as {
							packages: Record<string, { displayName: string }>;
							activePackageId: string;
						};
						return {
							imported: Object.keys(systems.packages).filter((id) => id.startsWith('custom:')),
							active: systems.activePackageId,
						};
					}),
				{ timeout: 10_000 },
			)
			.toEqual({ imported: ['custom:dnd5e'], active: 'builtin:dnd5e' });
		await expect(review).toBeHidden();

		await fs.rm(modulePath, { force: true });
	});
});
