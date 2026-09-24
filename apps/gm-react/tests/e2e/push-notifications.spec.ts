import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, waitReady } from './_helpers';

test('device opts in and sees a calendar reminder queued in the fake, then revokes', async ({
	page,
}) => {
	await markOnboarded(page);
	await gotoRoute(page, '/settings?tab=account');
	await waitReady(page);
	const optIn = page.getByRole('switch', { name: 'Opt in to reminder previews on this device' });
	await expect(optIn).toBeVisible();
	await expect(optIn).not.toBeChecked();
	await expect(page.getByText(/Push reminders can’t be delivered yet/)).toBeVisible();
	// Feed the same metadata seam as a successful Calendar creation; no credentials or Google calls.
	await page.evaluate(async () => {
		const { pushClient } = await import('/src/cloud/push.ts');
		pushClient.recordSession({
			id: 'calendar-e2e',
			summary: 'Friday game',
			startIso: '2099-01-01T12:00:00Z',
			reminderMinutes: 60,
		});
	});
	await expect(
		page.getByRole('status').filter({ hasText: '0 queued reminders in local preview' }),
	).toBeVisible();
	await optIn.click();
	await expect(optIn).toBeChecked();
	await expect(page.getByRole('list', { name: 'Queued reminder previews' })).toContainText(
		'Friday game',
	);
	await expect(
		page.getByRole('status').filter({ hasText: '1 queued reminder in local preview' }),
	).toBeVisible();
	await optIn.click();
	await expect(
		page.getByRole('list', { name: 'Queued reminder previews' }).getByRole('listitem'),
	).toHaveCount(0);
	await page.reload();
	await expect(optIn).not.toBeChecked();
});
