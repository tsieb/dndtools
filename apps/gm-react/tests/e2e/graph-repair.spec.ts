import { expect, test } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, ops, seedFresh, waitReady } from './_helpers';

// RC-KNW-4.2 — the /graph/repair link-repair screen. Every row comes from the actor-filtered
// GRAPH-010 preview (`previewBulkLinkRepairForActor`), and "Fix" dispatches the existing
// `content.update-item` command through `authorizeLinkRepairForActor` — no parallel mutation path.

const TARGET_TITLE = 'Repair Target Note';
const SOURCE_TITLE = 'Note With A Typo';
// One character short of the real title — inside buildLinkPickerSuggestions' edit-distance budget,
// so it resolves to exactly one unambiguous candidate.
const BROKEN_LINK_TEXT = 'Repair Target Not';

test.describe('graph: link repair', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/graph');
		await seedFresh(page);
		await page.goto('/#/graph', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });

		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
		const target = await dispatch(page, {
			type: 'content.create-item',
			actorId,
			payload: { kind: 'note', title: TARGET_TITLE, body: 'The repair target.' },
		});
		expect(target.status, target.rejection?.message ?? '').toBe('accepted');
		const source = await dispatch(page, {
			type: 'content.create-item',
			actorId,
			payload: {
				kind: 'note',
				title: SOURCE_TITLE,
				body: `See [[${BROKEN_LINK_TEXT}]] for details.`,
			},
		});
		expect(source.status, source.rejection?.message ?? '').toBe('accepted');
	});

	test('opens from the graph, shows the broken link, and fixes it one click', async ({ page }) => {
		await page.getByRole('button', { name: 'Repair broken links' }).click();
		await page.waitForURL(/#\/graph\/repair/, { timeout: 10_000 });

		await expect(page.getByText(SOURCE_TITLE)).not.toHaveCount(0);
		await expect(
			page.getByText(`Broken link: “${BROKEN_LINK_TEXT.toLowerCase()}”`),
		).not.toHaveCount(0);

		const fixButton = page.getByRole('button', { name: `Fix to “${TARGET_TITLE}”` });
		await expect(fixButton).toBeVisible();
		const before = await ops(page);
		await fixButton.click();

		// The row disappears (the preview recomputes over post-fix content) and a toast confirms it.
		await expect(page.getByText(`Fixed the link in “${SOURCE_TITLE}”.`)).not.toHaveCount(0);
		await expect(page.getByText(`Broken link: “${BROKEN_LINK_TEXT.toLowerCase()}”`)).toHaveCount(0);
		expect(await ops(page)).toBeGreaterThan(before);

		// The rewrite really landed in the source note's body.
		const body: string = await page.evaluate(
			(title) =>
				Object.values(
					(window.__rt!.state.content as { items: Record<string, { title: string; body: string }> })
						.items,
				).find((i) => i.title === title)?.body ?? '',
			SOURCE_TITLE,
		);
		expect(body).toContain(`[[${TARGET_TITLE}]]`);
	});

	test('back navigates to the graph', async ({ page }) => {
		await page.goto('/#/graph/repair', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page
			.getByRole('navigation', { name: 'Breadcrumb' })
			.getByRole('button', { name: 'Graph' })
			.click();
		await page.waitForURL(/#\/graph$/, { timeout: 10_000 });
	});

	test('the fixed row is gone once the vault note is clean', async ({ page }) => {
		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
		// Fix the seeded typo directly so the screen is exercised with nothing left to repair for it.
		const source = await page.evaluate(
			(title) =>
				Object.values(
					(window.__rt!.state.content as { items: Record<string, { id: string; title: string }> })
						.items,
				).find((i) => i.title === title)?.id ?? null,
			SOURCE_TITLE,
		);
		expect(source).toBeTruthy();
		const result = await dispatch(page, {
			type: 'content.update-item',
			actorId,
			payload: { itemId: source, body: `See [[${TARGET_TITLE}]] for details.` },
		});
		expect(result.status, result.rejection?.message ?? '').toBe('accepted');

		await page.goto('/#/graph/repair', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await expect(page.getByText(`Broken link: “${BROKEN_LINK_TEXT.toLowerCase()}”`)).toHaveCount(0);
	});
});
