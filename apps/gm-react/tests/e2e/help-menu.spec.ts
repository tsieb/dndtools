import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh } from './_helpers';

// RC-UX-6.1 — every Help trigger (top bar on desktop and rail, footer on phone) opens the shell's
// one Help dialog at full size, on both projects, even from inside a transformed launcher.
const TRIGGER_TIERS = [
	{ tier: 'desktop top bar', size: { width: 1280, height: 800 } },
	{ tier: 'rail top bar', size: { width: 834, height: 1112 } },
	{ tier: 'phone footer', size: { width: 393, height: 851 } },
] as const;

const GUIDE_TITLES = [
	'Getting started',
	'Running a session',
	'Maps',
	'Widgets & builders',
	'Systems',
	'Remote play',
	'Privacy modes',
	'Android/desktop install',
];

test.describe('help menu', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/');
		await seedFresh(page);
	});

	for (const { tier, size } of TRIGGER_TIERS) {
		test(`opens full-size from the ${tier} Help trigger with Getting started, guides and What's new`, async ({
			page,
		}) => {
			await page.setViewportSize(size);
			const trigger = page.getByRole('button', { name: 'Help' });
			await expect(trigger).toHaveCount(1);
			// Reproduce the ONB-1 trap: a transformed ancestor becomes the fixed scrim's containing block.
			await trigger.evaluate((el) => {
				const chrome = el.closest('header') ?? el.parentElement!.parentElement!;
				chrome.style.transform = 'translateZ(0)';
			});
			await trigger.click();

			const dialog = page.getByRole('dialog', { name: 'Help' });
			await expect(dialog).toBeVisible();
			await expect(page.getByRole('dialog')).toHaveCount(1);
			await expect
				.poll(async () => (await dialog.boundingBox())?.height ?? 0)
				.toBeGreaterThanOrEqual(320);
			const scrim = await dialog.evaluate((panel) => {
				const rect = panel.parentElement!.getBoundingClientRect();
				return {
					height: rect.height,
					width: rect.width,
					parent: panel.parentElement!.parentElement!.tagName,
				};
			});
			expect(scrim.parent).toBe('BODY');
			expect(scrim).toMatchObject(size);

			await expect(dialog.getByRole('heading', { name: 'Getting started' })).toBeVisible();
			await expect(dialog.getByText(/of \d+ set up/)).toBeVisible();
			for (const title of GUIDE_TITLES) {
				const guide = dialog.getByRole('button', { name: title, exact: true });
				await guide.scrollIntoViewIfNeeded();
				await expect(guide).toBeVisible();
			}
			const whatsNew = dialog.getByRole('heading', { name: "What's new" });
			await whatsNew.scrollIntoViewIfNeeded();
			await expect(whatsNew).toBeVisible();

			// Let the DS entry animation settle so axe samples the resting dialog, not the fading scrim.
			await dialog.evaluate((panel) =>
				Promise.all(
					panel
						.parentElement!.getAnimations({ subtree: true })
						.filter((animation) => Number.isFinite(animation.effect?.getTiming().iterations ?? 1))
						.map((animation) => animation.finished),
				),
			);
			const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
			expect(results.violations).toEqual([]);
		});
	}

	test('opens the keyboard shortcuts overlay from within the Help menu', async ({ page }) => {
		await page.getByRole('button', { name: 'Help' }).click();
		const dialog = page.getByRole('dialog', { name: 'Help' });
		await dialog.getByRole('button', { name: 'Keyboard shortcuts' }).click();

		await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
	});

	test("the What's new badge clears once the menu has been opened", async ({ page }) => {
		const trigger = page.getByRole('button', { name: 'Help' });
		const badge = page.getByTestId('whats-new-badge');
		// A fresh profile has never opened the menu, so the unseen-release dot is present.
		await expect(badge).toBeVisible();
		await trigger.click();
		await page.getByRole('dialog', { name: 'Help' }).getByRole('button', { name: 'Close' }).click();
		await expect(badge).toHaveCount(0);
	});
});
