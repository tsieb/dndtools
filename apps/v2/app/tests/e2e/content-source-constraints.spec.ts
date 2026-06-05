import { expect, test, type Page } from '@playwright/test';

// CONTENT-012 — source-specific constraints.
//
// Before a note is written back to a target SOURCE (local markdown / Obsidian / Google Docs), the DM sees
// a PURE, read-only pre-write DIAGNOSTIC computed in the Processing Core: exactly which formatting,
// properties, links, or unsupported embedded structures would be LOST or DOWNGRADED. The write is
// FAIL-CLOSED — a lossy write is blocked behind an explicit acknowledgment and re-validated in the core;
// the local draft is never lost. Authoring is DM-only — a player sees no source-constraints affordances.
// This is a stacked form/list surface that renders identically on desktop and compact profiles, so it
// runs on BOTH Playwright projects. The "view as" header control switches the rendered actor.

// A note that exercises Obsidian-only structures: frontmatter properties, an alias, a tag, an inline
// #tag, a [[wikilink]], and namespaced dndtools metadata.
const NOTE_BODY = [
	'---',
	'title: Highmoor',
	'cssclass: lore',
	'aliases: [The Keep]',
	'tags: [location]',
	'dndtools.visibility: dm-only',
	'---',
	'An ancient keep #fortress near [[Bane]].',
].join('\n');

test.describe('CONTENT-012 source-specific constraints', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/knowledge/');
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
	});

	// Seed a note with source-specific structures so the constraint surface has something to diagnose.
	async function seedNote(page: Page): Promise<void> {
		await page.getByTestId('note-new-title').fill('Highmoor');
		await page.getByTestId('note-new-visibility').selectOption('dm-only');
		await page.getByTestId('note-create').click();
		await expect(page.getByTestId('note-editor')).toContainText('Editing: Highmoor');
		await page.getByTestId('note-body').fill(NOTE_BODY);
		await page.getByTestId('note-save').click();
		await expect(page.getByTestId('note-save-status-value')).toHaveText('success');
	}

	test('AC: the source-capability reference table declares all three sources', async ({ page }) => {
		const table = page.getByTestId('source-capability-table');
		await expect(table).toBeVisible();
		// The reference table is a collapsible <details>; expand it to reveal the per-source rows.
		await table.locator('summary').click();
		await expect(page.getByTestId('source-capability-local-markdown')).toBeVisible();
		await expect(page.getByTestId('source-capability-obsidian')).toBeVisible();
		await expect(page.getByTestId('source-capability-google-docs')).toBeVisible();
	});

	test('AC1: a Google Docs write reports formatting-loss BEFORE any write and is fail-closed', async ({
		page,
	}) => {
		await seedNote(page);

		// Target Google Docs: the wikilink/properties/aliases are dropped — surfaced BEFORE write.
		await page.getByTestId('constraints-source-select').selectOption('google-docs');
		await expect(page.getByTestId('constraint-lossy')).toBeVisible();
		await expect(page.getByTestId('constraint-diagnostic-wikilinks')).toBeVisible();
		await expect(page.getByTestId('constraint-diagnostic-frontmatter-properties')).toBeVisible();

		// FAIL CLOSED: the write button is disabled until the loss is acknowledged.
		await expect(page.getByTestId('write-submit')).toBeDisabled();
		await page.getByTestId('constraint-ack').check();
		await expect(page.getByTestId('write-submit')).toBeEnabled();

		// Acknowledged write commits and the audit reports the loss (never silent).
		await page.getByTestId('write-submit').click();
		await expect(page.getByTestId('write-summary')).toContainText('acknowledged loss');
	});

	test('AC: an Obsidian write is faithful — nothing flagged, no acknowledgment required', async ({
		page,
	}) => {
		await seedNote(page);

		await page.getByTestId('constraints-source-select').selectOption('obsidian');
		await expect(page.getByTestId('constraint-faithful')).toBeVisible();
		// No acknowledgment checkbox is shown and the write is immediately allowed.
		await expect(page.getByTestId('constraint-ack')).toHaveCount(0);
		await expect(page.getByTestId('write-submit')).toBeEnabled();

		await page.getByTestId('write-submit').click();
		await expect(page.getByTestId('write-summary')).toContainText('no loss');
	});

	test('AC: switching the target source re-derives the diagnostic and resets the acknowledgment', async ({
		page,
	}) => {
		await seedNote(page);

		// Acknowledge a Google Docs loss...
		await page.getByTestId('constraints-source-select').selectOption('google-docs');
		await page.getByTestId('constraint-ack').check();
		await expect(page.getByTestId('write-submit')).toBeEnabled();

		// ...then switch to Obsidian: the lossy diagnostic disappears (faithful) and no stale ack lingers.
		await page.getByTestId('constraints-source-select').selectOption('obsidian');
		await expect(page.getByTestId('constraint-faithful')).toBeVisible();
		await expect(page.getByTestId('constraint-ack')).toHaveCount(0);

		// Back to Google Docs: the acknowledgment was reset, so the write is blocked again (fail closed).
		await page.getByTestId('constraints-source-select').selectOption('google-docs');
		await expect(page.getByTestId('constraint-ack')).not.toBeChecked();
		await expect(page.getByTestId('write-submit')).toBeDisabled();
	});

	test('AC3: a player has no source-constraints affordances (fail closed)', async ({ page }) => {
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('content-source-constraints')).toHaveCount(0);
		await expect(page.getByTestId('write-submit')).toHaveCount(0);
	});
});
