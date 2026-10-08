import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh } from '../e2e/_helpers';

for (const theme of ['tavern', 'parchment', 'high-contrast', 'scholar', 'dungeon']) {
	test(`Full builder disclosure ${theme}`, async ({ page }) => {
		await page.clock.setFixedTime(new Date('2026-03-14T15:30:00Z'));
		await page.addInitScript((applied) => {
			localStorage.setItem('dndtools:react:theme', applied);
		}, theme);
		await markOnboarded(page);
		await gotoRoute(page, '/extensions');
		await seedFresh(page);
		await page.getByRole('button', { name: 'Build a widget' }).click();
		const builder = page.getByRole('dialog', { name: /Widget builder/ });
		await builder.getByLabel('Name', { exact: true }).fill('Party status');
		await page.evaluate(() => document.fonts.ready);
		const steps = [
			'identity',
			'layout',
			'data',
			'config',
			'commands',
			'style',
			'advanced',
			'review',
		];
		for (const step of steps) {
			if (step === 'identity' || step === 'review')
				await expect(builder).toHaveScreenshot(`full-builder--${step}--${theme}.png`);
			if (step !== 'review')
				await builder
					.getByTestId('builder-footer')
					.getByRole('button', { name: 'Next', exact: true })
					.click();
		}
	});
}
