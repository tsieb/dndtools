import { expect, test, type Page } from '@playwright/test';

// CONTENT-007 / CONTENT-008 — import/export.
//
// The DM imports an Obsidian-style markdown archive (pasted as text per ADR-014: no real filesystem
// picker). A PURE, read-only PREVIEW lists each file's title, conflict action, and preserved metadata
// before any write. Committing imports the items transactionally; a dm-only item stays hidden from a
// player. Export produces portable markdown + a validation report: PORTABLE omits dm-only/hidden
// content and is reported clean (no secret/path leak); DM-BACKUP includes hidden content but still
// scrubs secrets/paths. Authoring is DM-only — a player sees no import/export affordances. This is a
// stacked form/list surface that renders identically on desktop and compact profiles, so it runs on
// BOTH Playwright projects. The "view as" header control switches the rendered actor.

const ARCHIVE = [
	'===== lore/Highmoor.md =====',
	'---',
	'title: Highmoor',
	'aliases: [The Keep]',
	'tags: [location, ruins]',
	'cssclass: lore',
	'---',
	'An ancient keep #fortress near [[Bane]].',
	'===== lore/Bane.md =====',
	'---',
	'title: Bane',
	'dndtools.visibility: player-visible',
	'---',
	'The god of tyranny. Bearer secret-xyz unlocks /Users/dm/vault/notes.md.',
].join('\n');

test.describe('CONTENT-007/008 import and export', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/knowledge/');
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
	});

	// The content-items list renders once a campaign calendar exists, so define the demo calendar first
	// (it surfaces ALL visible items, dated or not). Import/export themselves do not require a calendar.
	async function defineCalendar(page: Page): Promise<void> {
		await page.getByTestId('content-define-calendar').click();
		await expect(page.getByTestId('content-calendar-name')).toContainText('Calendar of Harptos');
	}

	async function pasteArchive(page: Page): Promise<void> {
		await page.getByTestId('import-archive').fill(ARCHIVE);
	}

	test('CONTENT-007 AC1: preview lists collisions and preserved metadata before any write', async ({
		page,
	}) => {
		await pasteArchive(page);
		const preview = page.getByTestId('import-preview');
		await expect(preview).toBeVisible();
		// Both files are listed with their resolved title and preserved-metadata counts.
		await expect(preview.getByText('Highmoor')).toBeVisible();
		await expect(preview.getByText('Bane')).toBeVisible();
		// The unsupported-but-preserved `cssclass` property is reported (never silently lost).
		await expect(preview.getByText(/cssclass/)).toBeVisible();
		// Nothing was written yet: the content item list does not contain the imported items.
		await expect(page.getByTestId('content-items')).toHaveCount(0);
	});

	test('CONTENT-007: committing imports items; a dm-only import stays hidden from a player', async ({
		page,
	}) => {
		await defineCalendar(page);
		await pasteArchive(page);
		await page.getByTestId('import-submit').click();
		await expect(page.getByTestId('import-summary')).toContainText('Imported');

		// As the DM both items appear (Highmoor defaults to dm-only; Bane is player-visible).
		const items = page.getByTestId('content-items');
		await expect(items.getByText('Highmoor')).toBeVisible();
		await expect(items.getByText('Bane')).toBeVisible();

		// As a player only the player-visible import is visible; the dm-only one is omitted entirely.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('content-items').getByText('Bane')).toBeVisible();
		await expect(page.getByTestId('content-items').getByText('Highmoor')).toHaveCount(0);
	});

	test('CONTENT-007: a player has no import/export affordances (fail closed)', async ({ page }) => {
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('content-import-export')).toHaveCount(0);
		await expect(page.getByTestId('import-archive')).toHaveCount(0);
		await expect(page.getByTestId('export-submit')).toHaveCount(0);
	});

	test('CONTENT-008 AC1: a portable export omits dm-only content and is reported clean', async ({
		page,
	}) => {
		await pasteArchive(page);
		await page.getByTestId('import-submit').click();
		await expect(page.getByTestId('import-summary')).toContainText('Imported');

		await page.getByTestId('export-mode').selectOption('portable');
		await page.getByTestId('export-submit').click();

		const report = page.getByTestId('export-report');
		await expect(report).toBeVisible();
		await expect(page.getByTestId('export-report-clean')).toHaveText('clean');
		// The portable export contains the player-visible item file but NOT the dm-only one (omitted).
		await expect(page.getByTestId('export-file-bane.md')).toBeVisible();
		await expect(page.getByTestId('export-file-highmoor.md')).toHaveCount(0);
		// HARD non-leak: neither the bearer secret nor the absolute path appears anywhere in the export.
		await expect(report.getByText('secret-xyz', { exact: false })).toHaveCount(0);
		await expect(report.getByText('/Users/dm/vault/notes.md', { exact: false })).toHaveCount(0);
	});

	test('CONTENT-008 AC2: a DM backup includes hidden content but still scrubs secrets/paths', async ({
		page,
	}) => {
		await pasteArchive(page);
		await page.getByTestId('import-submit').click();
		await expect(page.getByTestId('import-summary')).toContainText('Imported');

		await page.getByTestId('export-mode').selectOption('dm-backup');
		await page.getByTestId('export-submit').click();

		const report = page.getByTestId('export-report');
		await expect(report).toBeVisible();
		await expect(page.getByTestId('export-report-clean')).toHaveText('clean');
		// DM backup INCLUDES the dm-only item file.
		await expect(page.getByTestId('export-file-highmoor.md')).toBeVisible();
		// But secrets/absolute paths are STILL scrubbed.
		await expect(report.getByText('secret-xyz', { exact: false })).toHaveCount(0);
		await expect(report.getByText('/Users/dm/vault/notes.md', { exact: false })).toHaveCount(0);
		await expect(report.getByText('[redacted-path]', { exact: false }).first()).toBeVisible();
	});
});
