import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// WIKI — the campaign-wiki publish surface (Community → Campaign wiki) and the public, account-less
// reader route (`#/wiki?id=…`, WikiReader). Both are CLOUD-gated; the e2e server blanks every VITE_*
// cloud coordinate, so `isAccountApiConfigured` is false and `getPublicWiki` has no API URL to call.
// These specs assert the HONEST fail-closed states — the compose surface renders its real, actor-
// filtered eligibility with NO dead publish button, and the reader renders honest missing/invalid
// notices instead of a crash or a blank page. No real network/publish call is ever made.

/** Seeded canary titles from demo-seed.ts (see knowledge.spec.ts). */
const SEEDED_DM_ONLY = 'The Sunken Crypt — DM notes';

test.describe('wiki: publish surface fail-closed (Community → Campaign wiki)', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/community');
		await seedFresh(page);
		await page.goto('/#/community', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('the compose surface is honestly local-only with no dead publish button', async ({
		page,
	}) => {
		await page.getByRole('tab', { name: 'Campaign wiki' }).click();

		// Fail closed: the publish column states plainly there is no cloud backend to host a wiki.
		await expect(page.getByText('Local-only build')).not.toHaveCount(0);
		await expect(
			page.getByText(/Public wiki hosting is not available in this edition/),
		).not.toHaveCount(0);

		// No dead publish/unpublish affordances that would throw against an unconfigured backend.
		await expect(page.getByRole('button', { name: 'Publish wiki' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Re-publish current notes' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Unpublish' })).toHaveCount(0);

		// The LOCAL page-selection compose surface still renders: the eligibility stat (real,
		// actor-filtered) and the parchment reading preview of the player-visible pages.
		await expect(page.getByText('Eligible pages')).not.toHaveCount(0);
		await expect(page.getByText('Reading preview')).not.toHaveCount(0);
		await expect(page.getByText('Player-visible pages')).not.toHaveCount(0);

		// The preview is the actor-filtered projection: a DM-only note is NEVER eligible and never
		// leaks into what would publish.
		await expect(page.locator('#main-content').getByText(SEEDED_DM_ONLY)).toHaveCount(0);
	});
});

test.describe('wiki: public reader route (#/wiki)', () => {
	// The reader is chrome-less (no vault, no `__rt` seam) — it must NOT wait on the app shell.
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
	});

	test('with no id it renders the honest "no wiki link" notice, not a blank page', async ({
		page,
	}) => {
		await page.goto('/#/wiki', { waitUntil: 'domcontentloaded' });

		// The reader mounts standalone and shows an honest missing-link notice (its card is the page main).
		await expect(page.getByRole('main')).not.toHaveCount(0);
		await expect(page.getByText('No wiki link')).not.toHaveCount(0);
		await expect(page.getByText(/This link is incomplete\./)).not.toHaveCount(0);
	});

	test('with an id and no backend it renders the honest invalid-link message, not a crash', async ({
		page,
	}) => {
		await page.goto('/#/wiki?id=not-a-real-wiki-id', { waitUntil: 'domcontentloaded' });

		// getPublicWiki has no API URL configured on the e2e server, so the fetch fails closed and the
		// reader resolves to its honest invalid state (after the brief loading phase) — never blank.
		await expect(page.getByText('Wiki unavailable')).not.toHaveCount(0);
		await expect(
			page.getByText(/Online account services are not available in this edition/),
		).not.toHaveCount(0);

		// The failure replaces the loading phase's polite live region, so it needs a live region of its
		// own — otherwise a screen-reader user is left on "Fetching the published pages…" forever.
		await expect(
			page.getByRole('alert').filter({
				hasText: /Online account services are not available in this edition/,
			}),
		).not.toHaveCount(0);
	});
});
