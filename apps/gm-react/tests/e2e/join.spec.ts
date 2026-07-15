import { expect, test } from '@playwright/test';
import { markOnboarded } from './_helpers';

// JOIN — the invite-redeem landing (#/join?token=…). It is chrome-less (outside the DM AppShell:
// no sidebar, no #main-content) because whoever opens an invite link is a PLAYER with no vault and
// must never land in DM onboarding. With cloud FAIL-CLOSED in e2e (no account backend), the token
// resolves to a typed 'not-configured' error, so the page must render its HONEST states — a missing
// token, or a not-configured/invalid invite — and never crash or hang. These specs assert exactly
// that, plus that the escape hatch back into the app is a live affordance.

test.describe('join: the invite-redeem landing (cloud fail-closed)', () => {
	test.beforeEach(async ({ page }) => {
		// Harmless here (Join is outside the onboarding-hosting shell) but keeps parity with the suite.
		await markOnboarded(page);
	});

	test('with no token it renders the honest missing-token state', async ({ page }) => {
		await page.goto('/#/join', { waitUntil: 'domcontentloaded' });

		// The invite card is a labelled landmark — proves the route mounted, chrome-less, no crash.
		const card = page.getByRole('main', { name: 'Campaign invite' });
		await expect(card).toBeVisible();
		await expect(page.getByText('You’re invited')).toBeVisible();

		await expect(page.getByText(/missing its invite token/)).toBeVisible();
		// It never pretends to have a live invite: no player-app CTA in this state.
		await expect(page.getByRole('button', { name: 'Open the player app' })).toHaveCount(0);
		// The honest escape hatch is present.
		await expect(page.getByRole('button', { name: 'Go to the app' })).toBeVisible();
	});

	test('with a token it renders the honest not-configured/invalid state without hanging', async ({
		page,
	}) => {
		await page.goto('/#/join?token=e2e-fake-invite-token', { waitUntil: 'domcontentloaded' });

		await expect(page.getByRole('main', { name: 'Campaign invite' })).toBeVisible();

		// resolveInvite fails closed (no backend) — the loading state MUST resolve to an honest
		// invalid message, not spin forever.
		await expect(
			page.getByText(/Online account services are not available in this edition/),
		).toBeVisible({
			timeout: 10_000,
		});
		await expect(page.getByText('Checking your invite…')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Go to the app' })).toBeVisible();
	});

	test('the escape hatch returns to the app shell', async ({ page }) => {
		await page.goto('/#/join', { waitUntil: 'domcontentloaded' });
		await expect(page.getByRole('button', { name: 'Go to the app' })).toBeVisible();

		await page.getByRole('button', { name: 'Go to the app' }).click();

		// Lands on the DM shell (Command Center) — a real navigation, not a dead button.
		await page.waitForURL((url) => url.hash === '#/', { timeout: 10_000 });
		await page.locator('#main-content').waitFor({ state: 'attached', timeout: 20_000 });
	});
});
