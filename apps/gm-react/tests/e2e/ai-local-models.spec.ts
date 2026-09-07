import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-AI-3.3 — Settings › AI › Local models. Desktop-only management of the models pulled onto the
// Ollama daemon the router (RC-AI-3.1) and embeddings (RC-AI-3.2) already speak to: list, pull,
// delete, and a disk-use total. The daemon is stubbed at the wire (`localhost:11434`'s native
// `/api/tags` `/api/pull` `/api/delete` routes) so the whole flow runs without a real Ollama
// install. `runtimeKind` is forced to `electron` via the same dev-only test hook Android e2e uses
// (`android-quick-map.spec.ts`), since no real Electron bridge exists in a Playwright browser.

async function enableElectronRuntime(page: Page): Promise<void> {
	await page.addInitScript(() => {
		(
			globalThis as typeof globalThis & { __DNDTOOLS_TEST_RUNTIME_KIND__?: 'electron' }
		).__DNDTOOLS_TEST_RUNTIME_KIND__ = 'electron';
	});
}

async function gotoAiTab(page: Page): Promise<void> {
	await markOnboarded(page);
	await page.addInitScript(() => {
		localStorage.setItem('dndtools.ai.usage-preference', 'complete');
	});
	await gotoRoute(page, '/settings?tab=ai');
	await seedFresh(page);
	await page.goto('/#/settings?tab=ai', { waitUntil: 'domcontentloaded' });
	await waitReady(page);
	await page.locator('#main-content').waitFor({ state: 'attached' });
}

/** The "Local models" panel section, scoped so its text never collides with the provider/router
 *  panels above it, which also mention Ollama's endpoint and the same default model id. */
function localModelsPanel(page: Page): Locator {
	return page.getByRole('heading', { name: 'Local models' }).locator('xpath=ancestor::section[1]');
}

const MODEL_A = {
	name: 'qwen2.5:7b',
	size: 4_700_000_000,
	digest: 'sha-a',
	modified_at: '2026-01-01',
};
const MODEL_B = {
	name: 'nomic-embed-text',
	size: 274_000_000,
	digest: 'sha-b',
	modified_at: '2026-01-02',
};

/** Stub the daemon's list route with whatever model set the test currently wants returned. */
async function stubTags(page: Page, models: Array<Record<string, unknown>>): Promise<void> {
	await page.route('**/api/tags', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ models }),
		});
	});
}

test.describe('ai settings: local models (RC-AI-3.3)', () => {
	test('is desktop-only — other platforms see why instead of the management UI', async ({
		page,
	}) => {
		let tagsHit = false;
		await page.route('**/api/tags', (route) => {
			tagsHit = true;
			return route.abort();
		});
		await gotoAiTab(page);

		const panel = localModelsPanel(page);
		await expect(panel).toContainText('Local Ollama access is available in the desktop app.');
		await expect(panel.getByRole('button', { name: 'Refresh' })).toHaveCount(0);
		expect(tagsHit).toBe(false);
	});

	test('lists, pulls and deletes a model against a stubbed daemon', async ({ page }) => {
		await enableElectronRuntime(page);
		await stubTags(page, [MODEL_A]);
		await gotoAiTab(page);
		const panel = localModelsPanel(page);

		// Opening Settings never probes the daemon on its own — the list starts unfetched.
		await expect(panel.getByText('No models pulled yet.')).toHaveCount(0);
		await expect(panel.getByText('Check what is pulled and how much disk it uses.')).toBeVisible();

		await panel.getByRole('button', { name: 'Refresh' }).click();
		await expect(panel.getByText('qwen2.5:7b', { exact: true })).toBeVisible();
		await expect(panel.getByText('4.4 GB', { exact: true })).toBeVisible();
		await expect(panel.getByText('4.4 GB on disk', { exact: true })).toBeVisible();

		// Pull a second model — the daemon streams NDJSON progress, then the panel re-lists.
		let pullBody: unknown = null;
		await page.route('**/api/pull', async (route) => {
			pullBody = route.request().postDataJSON();
			const frames = [
				{ status: 'pulling manifest' },
				{ status: 'downloading', completed: 50, total: 100 },
				{ status: 'success' },
			];
			await route.fulfill({
				status: 200,
				contentType: 'application/x-ndjson',
				body: `${frames.map((f) => JSON.stringify(f)).join('\n')}\n`,
			});
		});
		await stubTags(page, [MODEL_A, MODEL_B]);

		await panel.getByLabel('Model name to pull').fill('nomic-embed-text');
		await panel.getByRole('button', { name: 'Pull' }).click();
		await expect(page.getByText('Pulled nomic-embed-text.')).toBeVisible();
		expect(pullBody).toEqual({ name: 'nomic-embed-text' });
		await expect(panel.getByText('nomic-embed-text', { exact: true })).toBeVisible();
		await expect(panel.getByText('4.6 GB on disk', { exact: true })).toBeVisible();

		// Delete the first model — confirm dialog names it, then the daemon call and re-list run.
		let deleteBody: unknown = null;
		await page.route('**/api/delete', async (route) => {
			deleteBody = route.request().postDataJSON();
			await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
		});
		await stubTags(page, [MODEL_B]);

		// The name text sits in a leaf div with no descendants, so `ancestor::div[2]` is the row
		// that also holds the Remove button (its own parent info div is `ancestor::div[1]`).
		const modelRow = panel
			.getByText('qwen2.5:7b', { exact: true })
			.locator('xpath=ancestor::div[2]');
		await modelRow.getByRole('button', { name: 'Remove' }).click();
		const dialog = page.getByRole('dialog', { name: 'Delete this model?' });
		await expect(dialog).toContainText('qwen2.5:7b will be removed from this device.');
		await dialog.getByRole('button', { name: 'Remove' }).click();
		await expect(page.getByText('Deleted qwen2.5:7b.')).toBeVisible();
		expect(deleteBody).toEqual({ name: 'qwen2.5:7b' });
		await expect(panel.getByText('qwen2.5:7b', { exact: true })).toHaveCount(0);
	});

	test('a daemon that is not running fails closed with a plain reason', async ({ page }) => {
		await enableElectronRuntime(page);
		await page.route('**/api/tags', (route) => route.abort('connectionrefused'));
		await gotoAiTab(page);

		const panel = localModelsPanel(page);
		await panel.getByRole('button', { name: 'Refresh' }).click();
		await expect(
			panel.getByText(
				'Could not reach the local Ollama daemon — check that `ollama serve` is running.',
			),
		).toBeVisible();
	});
});
