import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh } from './_helpers';

for (const textSize of [16, 32]) {
	test(`companion labelled navigation and 48dp targets at 390 with ${textSize}px text`, async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await markOnboarded(page);
		await gotoRoute(page, '/session');
		await seedFresh(page);
		await page.goto('/#/play');
		await page.waitForFunction(() => window.__rt?.loaded === true);
		// Journal controls belong to the seeded character, not the unassigned generic preview.
		await page.evaluate(() =>
			window.__rt!.enterPreview({ role: 'player', playerActorId: 'actor-player' }),
		);
		const cdp = await page.context().newCDPSession(page);
		await cdp.send('Page.setFontSizes', { fontSizes: { standard: textSize, fixed: textSize } });
		const nav = page.locator('.player-view-bottom-tabs nav');
		await expect(nav.getByRole('button')).toHaveText([
			'Now playing',
			'Sheet',
			'Dice',
			'Party',
			'More',
		]);
		await page.evaluate(() => {
			(document.activeElement as HTMLElement)?.blur();
		});
		await page.keyboard.press('Tab');
		await expect(page.locator('header [data-skip-link]')).toBeFocused();
		await page.keyboard.press('Tab');
		await expect(page.locator('header button')).toBeFocused();
		for (const section of ['Now playing', 'More']) {
			await nav.getByRole('button', { name: section, exact: true }).click();
			const results = await new AxeBuilder({ page })
				.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
				.analyze();
			expect(results.violations).toEqual([]);
			const undersized = await page
				.locator('.player-view-shell button, .player-view-shell summary')
				.evaluateAll((els) =>
					els
						.filter((el) => {
							const r = el.getBoundingClientRect();
							return r.width > 0 && r.height > 0 && (r.width < 47.5 || r.height < 47.5);
						})
						.map((el) => el.textContent),
				);
			expect(undersized).toEqual([]);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
				true,
			);
		}
		await expect(page.getByRole('button', { name: /Maps.*Co-DM/ })).toHaveAttribute(
			'aria-disabled',
			'true',
		);
		await page.getByRole('button', { name: 'Handouts', exact: true }).click();
		const tree = await page.locator('#player-main').ariaSnapshot();
		expect(tree).not.toMatch(/\b(?:object|not e)\b/);
		await expect(page).toHaveTitle(/Handouts/);
		await nav.getByRole('button', { name: 'More', exact: true }).click();
		await page.getByRole('button', { name: 'Journal', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Write a note', exact: true })).toBeVisible();
		await expect(page.getByTestId('private-note-form')).not.toBeVisible();
		await expect(page.getByTestId('private-bookmark-form')).not.toBeVisible();
		await expect(page.getByTestId('private-impression-form')).not.toBeVisible();
	});
}

test('display keeps help and a route title; player subtitles name their characters', async ({
	page,
}) => {
	await markOnboarded(page);
	await page.addInitScript(() => localStorage.setItem('dndtools:react:tier', 'advanced'));
	await gotoRoute(page, '/session');
	await seedFresh(page);
	await page.goto('/#/settings?tab=players');
	await expect(page.getByText('Playing Sera Duskwhisper', { exact: true })).toBeVisible();
	await page.goto('/#/display');
	await expect(page.locator('.scene-display-help')).toHaveText(
		'Your DM controls this display from Session → Scene cards.',
	);
	await expect(page).toHaveTitle(/No scene on display/);
});
