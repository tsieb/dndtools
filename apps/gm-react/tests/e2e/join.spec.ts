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

		await expect(page.getByText(/This join link is incomplete\./)).toBeVisible();
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

	// The failure arrives asynchronously and the loading region UNMOUNTS, so with no live region a
	// screen-reader user was never told the invite check had failed — and the message itself says
	// "try again" while offering nothing to press.
	test('an invalid invite is announced and offers a retry', async ({ page }) => {
		await page.goto('/#/join?token=e2e-fake-invite-token', { waitUntil: 'domcontentloaded' });

		const alert = page.getByRole('alert');
		await expect(alert).toBeVisible({ timeout: 10_000 });
		await expect(alert).toContainText(/not available in this edition|could not be checked/);

		// Retry re-runs the resolve; fail-closed means it lands back on the same honest state rather
		// than a spinner that never resolves.
		const retry = page.getByRole('button', { name: 'Try again' });
		await expect(retry).toBeVisible();
		await retry.click();
		await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
		await expect(page.getByText('Checking your invite…')).toHaveCount(0);
		// NOTE: `Join.tsx` also keeps this button mounted (soft-disabled) through the `loading` phase so
		// it cannot unmount under the user's focus. That is NOT assertable here: offline `resolveInvite`
		// rejects within a microtask, so `loading` never paints and the button never unmounts either way.
	});

	// A standalone route reached from an emailed link needs a document outline; the title was a
	// styled <div>, so the page had no h1 at all.
	test('the invite landing has a real page heading', async ({ page }) => {
		await page.goto('/#/join', { waitUntil: 'domcontentloaded' });
		await expect(page.getByRole('heading', { level: 1, name: /invited/i })).toBeVisible();
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

// RC-CLD-3.1 — the PLAYER-SIDE session panel on `/play`. In e2e there is no account backend and no
// mDNS bridge, so the only working path is the LAN invite code — and the panel has to say where the
// link actually stands rather than showing a bare form. These assert the honest reading, the live
// region on a refusal, and that nothing in the panel claims a connection that does not exist.

test.describe('join: the player-side session panel', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await page.goto('/#/play', { waitUntil: 'domcontentloaded' });
	});

	test('it opens on an honest connection reading, with the LAN invite path live', async ({
		page,
	}) => {
		await page.getByRole('button', { name: 'Join a table' }).click();
		const dialog = page.getByRole('dialog', { name: 'Join a table' });
		await expect(dialog).toBeVisible();

		// The reading is a live region so a later drop is announced, not just repainted.
		const reading = dialog.getByTestId('session-connection');
		await expect(reading).toContainText('Not connected');
		await expect(reading).toHaveAttribute('aria-live', 'polite');

		// No dead controls: Join stays disabled until there is a code to try.
		await expect(dialog.getByLabel('Invite code from your DM')).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Join', exact: true })).toBeDisabled();
	});

	test('an unreadable invite code is refused out loud, and nothing claims a connection', async ({
		page,
	}) => {
		await page.getByRole('button', { name: 'Join a table' }).click();
		const dialog = page.getByRole('dialog', { name: 'Join a table' });

		await dialog.getByLabel('Invite code from your DM').fill('not-a-real-invite-code');
		await dialog.getByRole('button', { name: 'Join', exact: true }).click();

		await expect(dialog.getByRole('alert')).toContainText(/invalid connection code/i);
		await expect(dialog.getByTestId('session-connection')).toContainText('Not connected');
		// The roster only exists once a table is actually live.
		await expect(dialog.getByTestId('session-roster-entry')).toHaveCount(0);
	});
});
