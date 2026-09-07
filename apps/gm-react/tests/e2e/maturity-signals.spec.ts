import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-UX-3.5 — MATURITY-SIGNAL DISCLOSURE. Graph is gated behind real vault usage (three
// [[wikilinks]]) rather than the manually-chosen tier: a genuinely fresh vault hides it from every
// nav surface — desktop sidebar's More group, the phone More sheet, and the command palette — and
// reveals it (with a "New" badge on desktop) the moment the DM's own notes cross the declared
// threshold (`packages/core/src/state/onboarding.ts`). The route itself is never blocked, so this
// is progressive disclosure, not a dead end.

/** Bypass onboarding AND explicitly choose the empty-vault path so demo content never seeds — the
 * signal must start at zero, not at whatever the sample campaign's wikilinks happen to total. */
async function openEmptyFreshVault(page: Page): Promise<void> {
	await markOnboarded(page);
	await page.addInitScript(() => {
		try {
			window.localStorage.setItem('dndtools:react:vault-choice', 'fresh');
		} catch {
			/* storage may be unavailable in some contexts; best-effort like markOnboarded */
		}
	});
	await gotoRoute(page, '/');
	await seedFresh(page);
}

/** The nav surface that lists platform sections beyond the hot destinations: the desktop sidebar's
 * disclosed "More" group, or the phone's "More" sheet. Returns the container to search rows in. */
async function openMoreSurface(page: Page, isMobile: boolean) {
	if (isMobile) {
		await page.getByRole('button', { name: 'More' }).click();
		const sheet = page.getByRole('dialog', { name: 'All sections' });
		await expect(sheet).toBeVisible();
		return sheet;
	}
	const toggle = page.getByRole('button', { name: /More/ });
	if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
		await toggle.click();
	}
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	return page.locator('#nav-more-panel');
}

test.describe('maturity-signal disclosure: Graph at 3 links', () => {
	test.beforeEach(async ({ page }) => {
		await openEmptyFreshVault(page);
	});

	test('a fresh vault hides Graph from the nav and the command palette', async ({
		page,
	}, testInfo) => {
		const isMobile = testInfo.project.name === 'mobile-chromium';
		const more = await openMoreSurface(page, isMobile);
		await expect(more.getByRole('button', { name: /Graph/ })).toHaveCount(0);
		// A platform surface with no maturity signal stays visible.
		await expect(more.getByRole('button', { name: /Audio/ })).not.toHaveCount(0);
		if (isMobile) await page.keyboard.press('Escape'); // close the sheet before the palette opens

		await page.keyboard.press('Meta+k');
		await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
		await page.getByRole('combobox').fill('Graph & Search');
		await expect(page.getByRole('dialog')).toHaveText(/No matches/);
	});

	test('three linked notes reveal Graph; two do not', async ({ page }, testInfo) => {
		const isMobile = testInfo.project.name === 'mobile-chromium';
		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
		const createLinkedNote = (n: number) =>
			dispatch(page, {
				type: 'content.create-item',
				actorId,
				payload: { kind: 'note', title: `Rumor ${n}`, body: `See [[Target ${n}]].` },
			});

		await createLinkedNote(0);
		await createLinkedNote(1);
		let more = await openMoreSurface(page, isMobile);
		await expect(more.getByRole('button', { name: /Graph/ })).toHaveCount(0);
		if (isMobile) await page.keyboard.press('Escape');

		const third = await createLinkedNote(2);
		expect(third.status).toBe('accepted');

		more = await openMoreSurface(page, isMobile);
		const graphRow = more.getByRole('button', { name: /Graph/ });
		await expect(graphRow).not.toHaveCount(0);
		if (!isMobile) await expect(graphRow.getByText('New')).not.toHaveCount(0);

		// The route itself was never blocked — direct navigation always worked, this is disclosure.
		await graphRow.click();
		await page.waitForURL(/#\/graph/);
		await waitReady(page);
	});
});
