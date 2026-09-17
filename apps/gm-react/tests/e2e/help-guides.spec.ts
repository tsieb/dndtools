import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh } from './_helpers';

// RC-DOC-1.3 — the eight user guides ship inside the app and are read from the Help menu, so the
// acceptance ("every page reachable from the Help menu") is a navigation claim, not a file claim.
// `help-menu.spec.ts` covers the menu itself at phone width; this spec covers the part that width
// cannot see: the Help trigger on the tiers that never mount `Footer.tsx`, and the guide dialog's
// own open/read/return path.

const GUIDES = [
	'Getting started',
	'Running a session',
	'Maps',
	'Widgets & builders',
	'Systems',
	'Remote play',
	'Privacy modes',
	'Android/desktop install',
];

// The `useViewport` tiers (useViewport.ts): ≤640 phone, 641–1024 rail, ≥1025 desktop. Help must be
// reachable on all three, from whichever chrome that tier actually renders.
const TIERS = [
	{ name: 'desktop', width: 1280, height: 900 },
	{ name: 'rail', width: 900, height: 800 },
	{ name: 'phone', width: 390, height: 844 },
];

for (const tier of TIERS) {
	test.describe(`user guides (${tier.name})`, () => {
		test.beforeEach(async ({ page }) => {
			await page.setViewportSize({ width: tier.width, height: tier.height });
			await markOnboarded(page);
			await gotoRoute(page, '/');
			await seedFresh(page);
		});

		test('every guide opens from the Help menu and returns to it', async ({ page }) => {
			const trigger = page.getByRole('button', { name: 'Help', exact: true });
			// One trigger per tier, never two: the phone's footer row and the top bar's launcher are
			// mutually exclusive, and a duplicated Help control would break the consistent location.
			await expect(trigger).toHaveCount(1);

			for (const title of GUIDES) {
				await trigger.click();
				const menu = page.getByRole('dialog', { name: 'Help' });
				await expect(menu).toBeVisible();

				await menu.getByRole('button', { name: title, exact: true }).click();

				const guide = page.getByRole('dialog', { name: title });
				await expect(guide).toBeVisible();
				// Real prose, not an empty shell — and the maintainer-facing source list is stripped.
				const body = guide.locator('article');
				await expect(body).toBeVisible();
				expect((await body.innerText()).length).toBeGreaterThan(400);
				await expect(guide.getByText('Implementation references')).toHaveCount(0);

				// The footer button goes back to the menu the guide was opened from, so a DM reading
				// several guides never has to re-find the trigger.
				await guide.getByRole('button', { name: 'Help', exact: true }).click();
				await expect(page.getByRole('dialog', { name: 'Help' })).toBeVisible();
				await page
					.getByRole('dialog', { name: 'Help' })
					.getByRole('button', { name: 'Close' })
					.click();
			}
		});
	});
}
