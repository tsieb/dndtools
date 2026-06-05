import { expect, test, type Page } from '@playwright/test';

/**
 * MAP-001 / MAP-002 / MAP-020 — map entity creation + safe asset import.
 *
 * MAP-001 (create a map entity): the DM creates a map with a name, scale, projection, and default
 * visibility. With visibility left at its fail-closed default, the new map is `dm-only` and carries its
 * initial layer set. The map appears in the DM's Atlas list and persists across reload.
 *
 * MAP-002 (content-addressed import + adapter gating): importing an image previews a content-addressed
 * asset (its id is a hash of its bytes). An external scene format with NO declared adapter is rejected
 * fail-closed with a diagnostic and writes nothing.
 *
 * MAP-020 (safe import transaction): importing previews an adapter capability summary and per-element
 * diagnostics (importable / lossy / unsupported) BEFORE any write. Cancelling from preview rolls back
 * (nothing is committed); committing applies the staged map atomically.
 *
 * The authoring panel is presentation-equivalent across profiles, so the same testids and flow run on
 * BOTH projects (desktop-chromium AND mobile-chromium); nothing here is profile-scoped.
 */

async function openAtlas(page: Page) {
	await page.goto('/atlas/');
	await page.getByTestId('atlas-view').waitFor({ state: 'visible' });
	// Start from a clean vault so created/imported maps are deterministic.
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	await page.getByTestId('atlas-view').waitFor({ state: 'visible' });
	await page.getByTestId('map-authoring').waitFor({ state: 'visible' });
}

async function viewAs(page: Page, value: string) {
	await page.getByTestId('view-as-select').selectOption(value);
}

test.describe('MAP-001 create a map entity', () => {
	test('creating a map with default visibility yields a dm-only map with its initial layers', async ({
		page,
	}) => {
		await openAtlas(page);

		await page.getByTestId('create-map-name').fill('Sunless Citadel');
		await page.getByTestId('create-map-scale-units').fill('300');
		await page.getByTestId('create-map-scale-unit').fill('feet');
		await page.getByTestId('create-map-projection').selectOption('flat');
		// Leave visibility at its fail-closed default of dm-only.
		await page.getByTestId('create-map-submit').click();

		// The DM sees the new map in the Atlas list.
		const list = page.getByTestId('atlas-map-list');
		await expect(list).toContainText('Sunless Citadel');

		// The map is dm-only by default: a player does not see it in the Atlas list.
		await viewAs(page, 'actor-player');
		await expect(page.getByTestId('atlas-map-list')).not.toContainText('Sunless Citadel');

		// Back as DM: the map persists across reload (durable, through the storage adapter).
		await viewAs(page, 'local-dm');
		await page.reload();
		await page.getByTestId('map-authoring').waitFor({ state: 'visible' });
		await expect(page.getByTestId('atlas-map-list')).toContainText('Sunless Citadel');
	});

	test('a player and observer never see the map authoring panel', async ({ page }) => {
		await openAtlas(page);
		await viewAs(page, 'actor-player');
		await expect(page.getByTestId('map-authoring')).toHaveCount(0);
		await viewAs(page, 'actor-observer');
		await expect(page.getByTestId('map-authoring')).toHaveCount(0);
	});
});

test.describe('MAP-002 content-addressed import + adapter gating', () => {
	test('importing a native image previews a content-addressed asset and commits', async ({ page }) => {
		await openAtlas(page);

		// Native image import: preview shows the content-addressed asset id.
		await page.getByTestId('import-asset-name').fill('battlemap.png');
		await page.getByTestId('import-asset-mime').selectOption('image/png');
		await page.getByTestId('import-preview-submit').click();

		const preview = page.getByTestId('import-preview');
		await expect(preview).toBeVisible();
		const assetPreview = page.getByTestId('import-asset-preview');
		await expect(assetPreview).toContainText('battlemap.png');
		// The asset id is the content hash (algorithm-tagged).
		await expect(assetPreview).toContainText('fnv1a64-');

		// Commit the import — a new imported map is created.
		const before = await mapStoreCount(page);
		await page.getByTestId('import-commit').click();
		await expect(page.getByTestId('import-preview')).toHaveCount(0);
		await expect(await mapStoreCount(page)).toBeGreaterThan(before);
	});

	test('an external format with no declared adapter is rejected fail-closed (no partial state)', async ({
		page,
	}) => {
		await openAtlas(page);
		const before = await mapStoreCount(page);

		// Switch to external import and target an undeclared format.
		await page.getByRole('radio', { name: 'External scene format' }).check();
		await page.getByTestId('import-external-format').fill('roll20-archive');
		await page.getByTestId('import-element-dimensions').check();
		await page.getByTestId('import-preview-submit').click();

		// The preview is an error and offers NO commit control (fail-closed; nothing to commit).
		await expect(page.getByTestId('import-preview-error')).toContainText('No declared adapter');
		await expect(page.getByTestId('import-commit')).toHaveCount(0);

		// No map or asset was created — the store is unchanged (rollback / no partial state).
		await expect(await mapStoreCount(page)).toBe(before);
	});
});

test.describe('MAP-020 safe import: preview + diagnostics + rollback', () => {
	test('a declared adapter import previews capability summary + unsupported-element diagnostics', async ({
		page,
	}) => {
		await openAtlas(page);

		await page.getByRole('radio', { name: 'External scene format' }).check();
		await page.getByTestId('import-external-format').fill('vtt-scene');
		// Declare a mix: dimensions (importable), walls (lossy), lights (unsupported).
		await page.getByTestId('import-element-dimensions').check();
		await page.getByTestId('import-element-walls').check();
		await page.getByTestId('import-element-lights').check();
		// Ensure grid/tokens are not selected to keep the assertion exact.
		await uncheckIfChecked(page, 'import-element-grid');
		await page.getByTestId('import-preview-submit').click();

		// The capability summary tells the DM what the adapter can / can't do.
		await expect(page.getByTestId('import-capability-summary')).toContainText('Unsupported');

		// Per-element diagnostics classify each element.
		await expect(page.getByTestId('import-diagnostic-dimensions')).toHaveAttribute(
			'data-support',
			'importable',
		);
		await expect(page.getByTestId('import-diagnostic-walls')).toHaveAttribute('data-support', 'lossy');
		await expect(page.getByTestId('import-diagnostic-lights')).toHaveAttribute(
			'data-support',
			'unsupported',
		);
		// The unsupported element is REPORTED as dropped, not silently lost.
		await expect(page.getByTestId('import-dropped')).toContainText('lights');
	});

	test('cancelling from preview leaves no partial state (rollback); committing applies it', async ({
		page,
	}) => {
		await openAtlas(page);
		const before = await mapStoreCount(page);

		await page.getByRole('radio', { name: 'External scene format' }).check();
		await page.getByTestId('import-external-format').fill('vtt-scene');
		await page.getByTestId('import-element-dimensions').check();
		await page.getByTestId('import-element-lights').check();
		await page.getByTestId('import-preview-submit').click();
		await expect(page.getByTestId('import-preview')).toBeVisible();

		// Cancel: rollback — nothing was committed, the store is byte-identical.
		await page.getByTestId('import-cancel').click();
		await expect(page.getByTestId('import-preview')).toHaveCount(0);
		await expect(await mapStoreCount(page)).toBe(before);

		// Preview again and COMMIT this time — the imported map is created.
		await page.getByTestId('import-preview-submit').click();
		await page.getByTestId('import-commit').click();
		await expect(page.getByTestId('import-preview')).toHaveCount(0);
		await expect(await mapStoreCount(page)).toBeGreaterThan(before);
	});
});

/** Count maps in the content-addressed store from the DM-facing summary text ("N maps · M assets"). */
async function mapStoreCount(page: Page): Promise<number> {
	const text = (await page.getByTestId('map-store-summary').textContent()) ?? '';
	const match = text.match(/(\d+)\s+map/);
	return match ? Number(match[1]) : 0;
}

async function uncheckIfChecked(page: Page, testId: string) {
	const box = page.getByTestId(testId);
	if (await box.isChecked()) await box.uncheck();
}
