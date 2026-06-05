import { expect, test, type Page } from '@playwright/test';

/**
 * MAP-008 / MAP-009 / MAP-017 — map nesting and spatial transitions.
 *
 * The demo seed embeds a DM-ONLY child map ("Hidden Outpost") inside the player-visible region map
 * "Western Reaches". Because the embed is a typed reference (not a copy), the child keeps its own
 * independent visibility, so:
 *   - the DM sees the nested area NAMED, with a zoom-into-child transition control (MAP-008/MAP-009),
 *   - a player/observer sees the SAME embed as one generic "unavailable area" placeholder that leaks
 *     no child name or content — indistinguishable from a missing/deleted child (MAP-008 AC2 /
 *     MAP-017 AC3).
 *
 * The nested-areas surface renders from the actor-filtered Processing-Core model
 * (`resolveEmbedsForActor` / `computeTransitionIntoChild`), so this is a live proof that nesting never
 * widens a hidden child's access. The same flow runs on BOTH projects (desktop + mobile); the surface
 * is presentation-equivalent across profiles, so nothing here is profile-scoped.
 */

async function openWesternReaches(page: Page) {
	await page.goto('/atlas/');
	await page.getByTestId('atlas-view').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.goto('/atlas/?map=map-western-reaches');
	await page.getByTestId('map-viewport').waitFor({ state: 'visible' });
	await page.getByTestId('map-nested-areas').waitFor({ state: 'visible' });
}

async function viewAs(page: Page, value: string) {
	await page.getByTestId('view-as-select').selectOption(value);
}

test.describe('MAP-008 AC2 a DM-only child stays hidden under a player-visible parent', () => {
	test('the DM sees the named nested child; a player/observer sees a generic unavailable placeholder', async ({
		page,
	}) => {
		await openWesternReaches(page);

		// DM: the nested child appears NAMED with its transform and a zoom control.
		await expect(page.getByTestId('nested-name-embed-hidden-outpost')).toContainText(
			'Hidden Outpost',
		);
		await expect(page.getByTestId('nested-zoom-embed-hidden-outpost')).toBeVisible();
		await expect(page.getByTestId('nested-unavailable-embed-hidden-outpost')).toHaveCount(0);

		// Player: the SAME embed collapses to a generic unavailable placeholder. The child name never
		// appears anywhere on the page (hard non-leak assertion, MAP-017 AC3).
		await viewAs(page, 'actor-player');
		await expect(page.getByTestId('nested-unavailable-embed-hidden-outpost')).toBeVisible();
		await expect(page.getByTestId('nested-name-embed-hidden-outpost')).toHaveCount(0);
		await expect(page.getByTestId('nested-zoom-embed-hidden-outpost')).toHaveCount(0);
		await expect(page.locator('body')).not.toContainText('Hidden Outpost');

		// Observer: same — no name, only the generic placeholder.
		await viewAs(page, 'actor-observer');
		await expect(page.getByTestId('nested-unavailable-embed-hidden-outpost')).toBeVisible();
		await expect(page.locator('body')).not.toContainText('Hidden Outpost');
	});
});

test.describe('MAP-009 spatial transition is gated by visibility', () => {
	test('the DM can transition into the visible child; the child viewport is computed', async ({
		page,
	}) => {
		await openWesternReaches(page);
		await page.getByTestId('nested-zoom-embed-hidden-outpost').click();
		// The logical transition result surfaces the child map id + computed child viewport (no animation
		// per ADR-014). The DM can transition because the child is visible to them.
		await expect(page.getByTestId('transition-target')).toContainText('map-hidden-outpost');
	});

	test('a player cannot transition into the hidden child (the control is absent, fail closed)', async ({
		page,
	}) => {
		await openWesternReaches(page);
		await viewAs(page, 'actor-player');
		// There is no zoom control for a hidden child — the transition cannot even be initiated, and the
		// generic placeholder is all the player ever sees.
		await expect(page.getByTestId('nested-zoom-embed-hidden-outpost')).toHaveCount(0);
		await expect(page.getByTestId('nested-unavailable-embed-hidden-outpost')).toBeVisible();
	});
});
