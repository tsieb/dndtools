import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// CHARACTER SHEET — /characters/:id. This file exists for one reason: the sheet holds a dozen pieces
// of PER-CHARACTER draft state (editMode, shareDraft, attackRows, acDraft, xpInput, error) and used
// to be mounted WITHOUT a `key`, with no effect keyed on `id` either. React therefore reused the same
// component instance across a sheet -> sheet navigation — which the command palette performs directly
// — and carried character A's drafts onto character B's sheet. `applySharing` and `saveAttacks` are
// both full replacements addressed by `characterId: id`, so the very next Apply/Save wrote A's
// sharing list, or A's entire attack list, onto B. Silently, durably, with no undo.

/** Ids of two distinct seeded characters, in roster order. */
async function twoCharacterIds(page: import('@playwright/test').Page): Promise<[string, string]> {
	const ids = await page.evaluate(() =>
		Object.values(
			(
				window.__rt!.state.characters as {
					characters: Record<string, { id: string; name: string }>;
				}
			).characters,
		).map((c) => c.id),
	);
	expect(ids.length, 'the seeded vault must have at least two characters').toBeGreaterThan(1);
	return [ids[0]!, ids[1]!];
}

test.describe('character sheet: per-character state is not shared between characters', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/characters');
		await seedFresh(page);
		await page.goto('/#/characters', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('navigating sheet to sheet remounts, dropping the previous character’s drafts', async ({
		page,
	}) => {
		const [first, second] = await twoCharacterIds(page);

		// Put character A into edit mode — the entry point for every draft this sheet holds.
		await page.goto(`/#/characters/${first}`, { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		const edit = page.getByRole('button', { name: 'Edit', exact: true });
		await expect(edit).toBeVisible();
		await edit.click();
		await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible();

		// Straight to character B's sheet, without passing back through the roster — exactly what
		// the command palette's character results do.
		await page.goto(`/#/characters/${second}`, { waitUntil: 'domcontentloaded' });
		await waitReady(page);

		// B opens read-only. Before the fix the shared instance survived and B opened mid-edit,
		// holding A's drafts and one Apply away from writing them to B.
		await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0);
	});

	test('each sheet renders its own character, not the one opened before it', async ({ page }) => {
		const [first, second] = await twoCharacterIds(page);
		const names = await page.evaluate(
			(ids) =>
				ids.map(
					(id) =>
						(
							window.__rt!.state.characters as {
								characters: Record<string, { id: string; name: string }>;
							}
						).characters[id]!.name,
				),
			[first, second],
		);
		expect(names[0]).not.toBe(names[1]);

		await page.goto(`/#/characters/${first}`, { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await expect(page.locator('#main-content').getByText(names[0]!).first()).toBeVisible();

		await page.goto(`/#/characters/${second}`, { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await expect(page.locator('#main-content').getByText(names[1]!).first()).toBeVisible();
	});
});
