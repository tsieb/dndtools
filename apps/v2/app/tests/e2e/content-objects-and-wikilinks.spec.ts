import { expect, test, type Page } from '@playwright/test';

// CONTENT-005 / CONTENT-006 / CONTENT-013 — structured Vault Objects + the wikilink lifecycle.
//
// CONTENT-013: the DM browses the typed SUBTYPE SCHEMA REGISTRY (ten subtypes; Scene is absent — it stays in
// SceneState, Contract 4).
// CONTENT-005: the DM creates a note-backed structured object; its frontmatter is SCHEMA-VALIDATED in the
// Processing Core BEFORE the durable write, so an invalid object never commits (fail closed).
// CONTENT-006: the DM RENAMES a wikilink target (propagating to referring notes) and REPAIRS a broken
// wikilink, both actor-filtered + fail-closed.
//
// This is a stacked form/list surface that renders identically on desktop and compact profiles, so it runs on
// BOTH Playwright projects. Authoring is DM-only; a player sees no structured-object affordances. The
// "view as" header control switches the rendered actor.

test.describe('CONTENT-005/006/013 structured objects and wikilinks', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/knowledge/');
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
	});

	// Seed a player-visible note with the given title + body via the NotesWorkbench.
	async function seedNote(page: Page, title: string, body: string): Promise<void> {
		await page.getByTestId('note-new-title').fill(title);
		await page.getByTestId('note-new-visibility').selectOption('player-visible');
		await page.getByTestId('note-create').click();
		await expect(page.getByTestId('note-editor')).toContainText(`Editing: ${title}`);
		await page.getByTestId('note-body').fill(body);
		await page.getByTestId('note-save').click();
		await expect(page.getByTestId('note-save-status-value')).toHaveText('success');
	}

	test('CONTENT-013: the subtype registry lists the ten subtypes and never a Scene', async ({ page }) => {
		const registry = page.getByTestId('object-schema-registry');
		await expect(registry).toBeVisible();
		await registry.locator('summary').click();
		// A representative sample of the ten subtypes is present.
		await expect(page.getByTestId('object-subtype-note')).toBeVisible();
		await expect(page.getByTestId('object-subtype-character')).toBeVisible();
		await expect(page.getByTestId('object-subtype-handout')).toBeVisible();
		await expect(page.getByTestId('object-subtype-widget-package-ref')).toBeVisible();
		// Scene is NOT a subtype (Contract 4).
		await expect(page.getByTestId('object-subtype-scene')).toHaveCount(0);
		// The character subtype references the existing model.
		await expect(page.getByTestId('object-subtype-character')).toContainText('references');
	});

	test('CONTENT-005: a valid object is created; an invalid one is rejected fail-closed', async ({
		page,
	}) => {
		// Valid handout object (title + format required).
		await page.getByTestId('object-subtype-select').selectOption('handout');
		await page.getByTestId('object-title-input').fill('Sealed Letter');
		await page
			.getByTestId('object-fields-input')
			.fill('{ "title": "Sealed Letter", "format": "letter" }');
		await expect(page.getByTestId('object-valid')).toBeVisible();
		await page.getByTestId('object-create-submit').click();
		await expect(page.getByTestId('object-create-summary')).toContainText('handout');

		// Invalid: drop the required `format`. The client preview flags it AND the core rejects on submit.
		await page.getByTestId('object-fields-input').fill('{ "title": "Broken" }');
		await expect(page.getByTestId('object-invalid')).toBeVisible();
		await page.getByTestId('object-create-submit').click();
		await expect(page.getByTestId('object-create-error')).toContainText('schema validation');
	});

	test('CONTENT-006: renaming a wikilink target propagates to referring notes', async ({ page }) => {
		await seedNote(page, 'Highmoor', '# Highmoor\n\nAn ancient keep.');
		await seedNote(page, 'Travel Log', 'We marched to [[Highmoor]] at dawn.');

		// Rename the Highmoor note; the referring [[Highmoor]] link is rewritten across the visible graph.
		await page.getByTestId('rename-note-select').selectOption({ label: 'Highmoor' });
		await page.getByTestId('rename-new-title').fill('Castle Highmoor');
		await page.getByTestId('rename-submit').click();
		await expect(page.getByTestId('rename-summary')).toContainText('Castle Highmoor');
		// The summary reports the deterministic propagation: 1 link across 1 note updated.
		await expect(page.getByTestId('rename-summary')).toContainText('1 link');
		await expect(page.getByTestId('rename-summary')).toContainText('1 note');

		// The renamed note now appears under its new title in the rename target list (the target was renamed).
		await expect(page.getByTestId('rename-note-select')).toContainText('Castle Highmoor');
	});

	test('CONTENT-006: repairing a broken wikilink rewrites it to a visible fix; bad fix is refused', async ({
		page,
	}) => {
		await seedNote(page, 'Highmoor', '# Highmoor');
		await seedNote(page, 'Journal', 'Visited [[Higmoor]] (typo).');

		await page.getByTestId('repair-note-select').selectOption({ label: 'Journal' });
		// The broken link is detected in the actor-filtered scan.
		await expect(page.getByTestId('repair-broken-list')).toContainText('Higmoor');

		// A fix that does not resolve is refused fail-closed (no destructive rewrite).
		await page.getByTestId('repair-broken-target').fill('Higmoor');
		await page.getByTestId('repair-fix-title').fill('Phantom');
		await page.getByTestId('repair-submit').click();
		await expect(page.getByTestId('repair-error')).toContainText('does not resolve');

		// A valid fix to a visible note succeeds.
		await page.getByTestId('repair-broken-target').fill('Higmoor');
		await page.getByTestId('repair-fix-title').fill('Highmoor');
		await page.getByTestId('repair-submit').click();
		await expect(page.getByTestId('repair-summary')).toContainText('Repaired 1 link');
	});

	test('CONTENT-005/006: a player has no structured-object/wikilink authoring affordances (fail closed)', async ({
		page,
	}) => {
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('vault-objects')).toHaveCount(0);
		await expect(page.getByTestId('create-object-form')).toHaveCount(0);
		await expect(page.getByTestId('rename-wikilink-form')).toHaveCount(0);
	});
});
