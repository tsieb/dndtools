import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded } from './_helpers';
import { communityAxe } from './_communityAxe';

test('community: keyboard tabs, all local states and large text stay accessible', async ({
	page,
}) => {
	await markOnboarded(page);
	await gotoRoute(page, '/community');
	const discover = page.getByRole('tab', { name: 'Discover', exact: true });
	await discover.focus();
	await page.keyboard.press('ArrowRight');
	await expect(page.getByRole('tab', { name: 'Export', exact: true })).toBeFocused();
	await expect(page.getByRole('tabpanel')).toBeVisible();
	for (const tab of ['Discover', 'Export', 'Publish', 'Campaign wiki']) {
		await page.getByRole('tab', { name: tab, exact: true }).click();
		await communityAxe(page);
	}
	await page.evaluate(() => {
		document.documentElement.style.fontSize = '200%';
	});
	for (const tab of ['Discover', 'Export', 'Publish', 'Campaign wiki']) {
		await page.getByRole('tab', { name: tab, exact: true }).click();
		await expect(page.getByRole('tabpanel')).toBeVisible();
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
		).toBe(true);
	}
});

test('community: player preview hides writes and runtime rejects attempted export', async ({
	page,
}) => {
	await markOnboarded(page);
	await gotoRoute(page, '/community');
	await page.getByRole('tab', { name: 'Export', exact: true }).click();
	await page.evaluate(() =>
		window.__rt!.enterPreview({ role: 'player', playerActorId: 'actor-player' }),
	);
	await expect(
		page.getByText('Community is paused in player preview', { exact: true }),
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Save .dndmodule', exact: true })).toHaveCount(0);
	const status = await page.evaluate(async () => {
		const rt = window.__rt!;
		return (
			await rt.dispatch({
				type: 'content.export',
				actorId: rt.defaultActorId,
				payload: { mode: 'portable', portableViewerActorId: 'actor-player' },
			})
		).status;
	});
	expect(status).toBe('rejected');
	await communityAxe(page);
	await page.evaluate(() => window.__rt!.exitPreview());
	await expect(page.getByRole('tab', { name: 'Export', exact: true })).toBeVisible();
});
