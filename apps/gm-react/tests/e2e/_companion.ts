import type { Page } from '@playwright/test';

/** Reach overflow destinations through the labelled phone bar. Desktop keeps its sidebar. */
export async function openCompanionMore(page: Page) {
	await page.locator('#player-main').waitFor({ state: 'visible' });
	const more = page
		.locator('.player-view-bottom-tabs')
		.getByRole('button', { name: 'More', exact: true });
	if (await more.isVisible()) await more.click();
}

export async function selectCompanionSection(page: Page, name: string) {
	await page.locator('#player-main').waitFor({ state: 'visible' });
	const phone = await page.locator('.player-view-bottom-tabs').isVisible();
	if (phone && !['Now playing', 'My character', 'Sheet', 'Dice', 'Party'].includes(name))
		await openCompanionMore(page);
	await page
		.getByRole('button', { name: phone && name === 'My character' ? 'Sheet' : name, exact: true })
		.click();
}
