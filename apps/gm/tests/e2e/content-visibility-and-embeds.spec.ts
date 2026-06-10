import { expect, test, type Page } from '@playwright/test';

// CONTENT-009 / CONTENT-010 — granular visibility + embeds by reference.
//
// CONTENT-009: an authorized editor (the DM) authors visibility at SECTION and FIELD granularity on a
// host note. The actor-filtered detail view omits the sections/fields a player may not see, with
// field > section > entity precedence enforced in the Processing Core (the GUI never filters).
//
// CONTENT-010: the DM embeds a REFERENCE to a dm-only target object into a player-visible host note. The
// host stores ONLY the reference; the embed resolves the LIVE target through the actor-filtered query.
// The DM sees the embedded card; a player sees a non-leaking "unavailable" placeholder — no target title
// or field leaks. This is a stacked list/card surface that renders identically on desktop and compact
// profiles, so it runs on BOTH Playwright projects. The "view as" header control switches the actor.

test.describe('CONTENT-009/010 granular visibility and embeds', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/knowledge/');
		await page.getByTestId('visibility-embeds').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('visibility-embeds').waitFor({ state: 'visible' });
	});

	// The DM seeds the demo briefing (idempotent: the seed button only shows when unseeded). The seed
	// creates a dm-only target object + a player-visible host note, makes the host's `gm-secrets` section
	// and `dmHook` field dm-only, and embeds the target as an object card.
	async function seed(page: Page): Promise<void> {
		await page.getByTestId('ve-seed').click();
		await expect(page.getByTestId('ve-host')).toBeVisible();
		await expect(page.getByTestId('ve-host-title')).toHaveText('Region Briefing');
		// The seed dispatches the section/field visibility and the embed AFTER the host create. Wait for
		// the full seeded state (the dm-only section + the embed) so a following reload does not race an
		// in-flight durable write.
		await expect(page.getByTestId('ve-section-gm-secrets')).toBeVisible();
		await expect(page.getByTestId('ve-embeds').locator('li')).toHaveCount(1);
	}

	test('AC: the DM sees every section, field, and the embedded target card', async ({ page }) => {
		await seed(page);
		// Granular: the DM sees BOTH the public and the dm-only section + field.
		await expect(page.getByTestId('ve-section-overview')).toBeVisible();
		await expect(page.getByTestId('ve-section-gm-secrets')).toBeVisible();
		await expect(page.getByTestId('ve-field-summary')).toBeVisible();
		await expect(page.getByTestId('ve-field-dmHook')).toBeVisible();
		// Embed: the DM resolves the LIVE dm-only target — title + secret field are rendered.
		const embed = page.getByTestId('ve-embeds').locator('li').first();
		await expect(embed).toContainText('Lich Phylactery');
		await expect(embed).toContainText('Azalin');
		await expect(page.locator('[data-testid^="ve-embed-unavailable-"]')).toHaveCount(0);
	});

	test('CONTENT-009: a player sees only the player-visible section/field, never the dm-only ones', async ({
		page,
	}) => {
		await seed(page);
		await page.getByTestId('view-as-select').selectOption('actor-player');

		// The host note is player-visible, so the player sees it — but only the inherited public section
		// and field. The dm-only section + field are OMITTED ENTIRELY (no testid, no value).
		await expect(page.getByTestId('ve-host')).toBeVisible();
		await expect(page.getByTestId('ve-section-overview')).toBeVisible();
		await expect(page.getByTestId('ve-section-gm-secrets')).toHaveCount(0);
		await expect(page.getByTestId('ve-field-summary')).toBeVisible();
		await expect(page.getByTestId('ve-field-dmHook')).toHaveCount(0);
		// HARD: the dm-only field VALUE never appears anywhere in the player's DOM.
		await expect(page.getByText('The lich stirs.')).toHaveCount(0);
	});

	test('CONTENT-010: a player viewing the host sees the embed as unavailable — no target leak', async ({
		page,
	}) => {
		await seed(page);
		await page.getByTestId('view-as-select').selectOption('actor-player');

		// The embed resolves against the LIVE dm-only target through the VIEWER's permission, NOT the
		// host's visibility, so the player gets the generic unavailable placeholder.
		await expect(page.locator('[data-testid^="ve-embed-unavailable-"]')).toHaveCount(1);
		// HARD: zero target leak — neither the target title nor any secret field value appears.
		await expect(page.getByTestId('ve-embeds')).not.toContainText('Lich Phylactery');
		await expect(page.getByTestId('ve-embeds')).not.toContainText('Azalin');
		await expect(page.getByTestId('ve-embeds')).not.toContainText('Highmoor');
	});

	test('fail closed: a player has no authoring affordance (seed is DM-only)', async ({ page }) => {
		// Before any seed, switch to a player: the DM-only seed button is absent.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('ve-seed')).toHaveCount(0);
		await expect(page.getByTestId('ve-unseeded')).toBeVisible();
	});

	test('granular visibility + embeds persist across reload (durable)', async ({ page }) => {
		await seed(page);
		await page.reload();
		await page.getByTestId('visibility-embeds').waitFor({ state: 'visible' });
		// The host, its sections, and the embed survive a reload (durable IndexedDB write, no re-seed).
		await expect(page.getByTestId('ve-host-title')).toHaveText('Region Briefing');
		await expect(page.getByTestId('ve-section-gm-secrets')).toBeVisible();
		await expect(page.getByTestId('ve-embeds').locator('li')).toHaveCount(1);
	});
});
