import type { Page } from '@playwright/test';

/**
 * UX-SHELL — navigate to a global section through the primary nav on any platform profile.
 *
 * On Desktop the section is a directly-clickable sidebar item; on the compact Mobile tab bar the
 * overflow sections (Campaign, Knowledge, Settings) live behind the "More" sheet (UX-NAV-006).
 * This helper clicks the direct item when it is visible, otherwise opens the More sheet and clicks
 * the item inside it — so a spec can reach any section without knowing the active profile.
 */
export async function openSection(page: Page, id: string): Promise<void> {
	const direct = page.getByTestId(`nav-${id}`);
	if ((await direct.count()) > 0 && (await direct.isVisible())) {
		await direct.click();
		return;
	}
	await page.getByTestId('nav-more').click();
	const sheet = page.getByTestId('nav-more-sheet');
	await sheet.waitFor({ state: 'visible' });
	await sheet.getByTestId(`nav-${id}`).click();
}
