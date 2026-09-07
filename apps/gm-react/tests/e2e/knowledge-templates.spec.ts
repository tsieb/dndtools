import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-KNW-1.3 — templates and snippets, driven through the REAL UI on /knowledge. Every assertion
// checks the live core state (`__rt.state.content`) rather than the rendered text alone, so a
// control that looked like it worked but wrote nothing fails here.

/** Loose content-item shape read off `__rt.state.content.items` (raw, NOT actor-filtered). */
interface ItemLite {
	id: string;
	title: string;
	body: string;
	visibility: string;
	deletedAt: string | null;
}

function findItem(page: Page, title: string): Promise<ItemLite | null> {
	return page.evaluate((t) => {
		const items = (window.__rt!.state.content as { items: Record<string, ItemLite> }).items;
		return Object.values(items).find((i) => i.title === t) ?? null;
	}, title);
}

function userTemplateIds(page: Page): Promise<string[]> {
	return page.evaluate(() =>
		Object.keys(
			(window.__rt!.state.content as { userTemplates: Record<string, unknown> }).userTemplates,
		),
	);
}

// Returning to the list is a same-document hash navigation, so the Knowledge screen keeps its
// disclosure state: only click when the toggle actually reports itself collapsed.
async function openTemplates(page: Page) {
	const toggle = page.getByTestId('knowledge-templates-toggle');
	await toggle.waitFor({ state: 'visible' });
	if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
	await expect(page.getByTestId('templates-panel')).toBeVisible();
}

test.describe('knowledge: templates and snippets', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/knowledge');
		await seedFresh(page);
		await page.goto('/#/knowledge', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('a starter template creates a real note with its variables filled in', async ({ page }) => {
		await openTemplates(page);
		// Quest outline is one of the five starting points the roadmap names.
		await page.getByTestId('template-pick').selectOption('quest-outline');

		// Create is refused while a required variable is empty — the control says so rather than
		// firing a command the core would reject.
		await expect(page.getByTestId('template-create')).toBeDisabled();

		await page.getByLabel('Quest name').fill('The Drowned Bell');
		await page.getByLabel('The hook').fill('A bell tolls under the lake.');
		await page.getByTestId('template-create').click();

		// It navigated to the created note, and the note is real in the core.
		await expect(page.getByRole('heading', { name: 'The Drowned Bell' }).first()).toBeVisible();
		const note = await findItem(page, 'The Drowned Bell');
		expect(note).not.toBeNull();
		expect(note!.body).toContain('A bell tolls under the lake.');
		// The optional variable fell back to its declared default…
		expect(note!.body).toContain('To be decided');
		// …and the template's visibility never widened.
		expect(note!.visibility).toBe('dm-only');
	});

	test('a DM saves their own template, creates from it, then deletes it', async ({ page }) => {
		await openTemplates(page);
		await page.getByRole('tab', { name: 'Your templates' }).click();

		await page.getByTestId('template-name').fill('Tavern');
		await page.getByTestId('template-title').fill('{{tavern}}');
		await page.getByTestId('template-body').fill('# {{tavern}}\n\nA tavern with a rumour table.\n');
		await page.getByTestId('template-add-variable').click();
		await page.getByLabel('Variable', { exact: true }).fill('tavern');
		await page.getByLabel('Label', { exact: true }).fill('Tavern name');
		await page.getByTestId('template-save').click();

		await expect.poll(() => userTemplateIds(page)).toEqual(['user:tavern']);

		// It is offered alongside the built-in starting points and creates a real note.
		await page.getByRole('tab', { name: 'New from template' }).click();
		await page.getByTestId('template-pick').selectOption('user:tavern');
		await page.getByLabel('Tavern name').fill('The Bent Nail');
		await page.getByTestId('template-create').click();
		await expect(page.getByRole('heading', { name: 'The Bent Nail' }).first()).toBeVisible();
		const note = await findItem(page, 'The Bent Nail');
		expect(note!.body).toContain('A tavern with a rumour table.');

		// Back on the list, deleting the template removes it from the core.
		await page.goto('/#/knowledge', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
		await openTemplates(page);
		await page.getByRole('tab', { name: 'Your templates' }).click();
		await page.getByRole('button', { name: 'Delete' }).first().click();
		await expect.poll(() => userTemplateIds(page)).toEqual([]);
	});

	test('an invalid template is refused with the reason, and nothing is stored', async ({
		page,
	}) => {
		await openTemplates(page);
		await page.getByRole('tab', { name: 'Your templates' }).click();
		await page.getByTestId('template-name').fill('Broken');
		await page.getByTestId('template-title').fill('Broken');
		// A placeholder with no variable declared for it is a silent hole; the core refuses it.
		await page.getByTestId('template-body').fill('Run by {{owner}}.');
		await page.getByTestId('template-save').click();

		await expect(page.getByText('{{owner}}', { exact: false }).first()).toBeVisible();
		expect(await userTemplateIds(page)).toEqual([]);
	});

	test('a snippet is added to a chosen note and keeps that note visibility', async ({ page }) => {
		await openTemplates(page);
		await page.getByRole('tab', { name: 'Snippets' }).click();

		const before = await findItem(page, 'Campaign Primer');
		expect(before).not.toBeNull();
		await page.getByTestId('snippet-pick').selectOption('stat-line');
		await page.getByTestId('snippet-note').selectOption(before!.id);
		await page.getByTestId('snippet-insert').click();

		await expect
			.poll(async () => (await findItem(page, 'Campaign Primer'))!.body)
			.toContain('**STR** 10');
		const after = await findItem(page, 'Campaign Primer');
		expect(after!.visibility).toBe(before!.visibility);
	});
});
